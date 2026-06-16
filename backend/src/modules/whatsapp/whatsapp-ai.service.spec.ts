import { WhatsappAiService } from './whatsapp-ai.service';
import { DIRECT_CONTACT_RESPONSE } from './whatsapp-ai-filter';

const makeMockRepo = (customPrompt: string | null = null) => ({
  getCompanyAndListings: jest.fn().mockResolvedValue({ company: null, listings: [] }),
  getAvailableUnits: jest.fn().mockResolvedValue([]),
  getCompanyPrompt: jest.fn().mockResolvedValue(customPrompt),
  persistAiEnabled: jest.fn().mockResolvedValue(undefined),
  loadAiEnabled: jest.fn().mockResolvedValue(null),
  clearContextCache: jest.fn(),
  clearPromptCache: jest.fn(),
});

const makeMockBuilder = (fullPrompt = 'default system prompt for AALA.LAND') => ({
  buildContextBlock: jest.fn().mockReturnValue(''),
  buildFullPrompt: jest.fn().mockReturnValue(fullPrompt),
});

const baseEvt = (overrides: Partial<{ chatId: string; body: string; fromMe: boolean; isGroup: boolean; timestamp: number }> = {}) => ({
  chatId: 'c1', body: 'hello', fromMe: false,
  isGroup: false, timestamp: Math.floor(Date.now() / 1000), senderId: 's1',
  ...overrides,
});

describe('WhatsappAiService', () => {
  let service: WhatsappAiService;
  const originalFetch = global.fetch;

  beforeEach(() => {
    jest.useFakeTimers();
    delete process.env.OLLAMA_API_KEY;
    delete process.env.AI_ENABLED;
    delete process.env.AI_DEBOUNCE_MS;
    delete process.env.AI_HUMAN_SILENCE_MINUTES;
    service = new WhatsappAiService(makeMockRepo() as any, makeMockBuilder() as any);
  });

  afterEach(() => {
    jest.useRealTimers();
    global.fetch = originalFetch;
    delete process.env.OLLAMA_API_KEY;
    delete process.env.OLLAMA_HOST;
    delete process.env.OLLAMA_MODEL;
    delete process.env.AI_DEBOUNCE_MS;
    delete process.env.AI_HUMAN_SILENCE_MINUTES;
  });

  it('is enabled by default', () => {
    expect(service.isEnabled('user-1')).toBe(true);
  });

  it('setEnabled toggles state per user', () => {
    service.setEnabled('user-1', false);
    expect(service.isEnabled('user-1')).toBe(false);
    service.setEnabled('user-1', true);
    expect(service.isEnabled('user-1')).toBe(true);
  });

  it('setEnabled on one user does not affect another user', () => {
    service.setEnabled('user-1', false);
    expect(service.isEnabled('user-2')).toBe(true);
  });

  it('getConfig returns keyConfigured false when no API key', () => {
    expect(service.getConfig('user-1').keyConfigured).toBe(false);
  });

  it('getHistoryFor returns empty array for unknown userId+chatId', () => {
    expect(service.getHistoryFor('unknown-user', 'unknown-chat')).toEqual([]);
  });

  it('handleIncomingMessage skips when no API key', async () => {
    const mockSend = jest.fn();
    await service.handleIncomingMessage(baseEvt(), 'company-1', 'user-1', mockSend);
    await jest.runAllTimersAsync();
    expect(mockSend).not.toHaveBeenCalled();
  });

  it('handleIncomingMessage skips fromMe messages', async () => {
    process.env.OLLAMA_API_KEY = 'test-key';
    service = new WhatsappAiService(makeMockRepo() as any, makeMockBuilder() as any);
    const mockSend = jest.fn();
    await service.handleIncomingMessage(baseEvt({ fromMe: true }), 'company-1', 'user-1', mockSend);
    await jest.runAllTimersAsync();
    expect(mockSend).not.toHaveBeenCalled();
  });

  it('handleIncomingMessage skips group messages', async () => {
    process.env.OLLAMA_API_KEY = 'test-key';
    service = new WhatsappAiService(makeMockRepo() as any, makeMockBuilder() as any);
    const mockSend = jest.fn();
    await service.handleIncomingMessage(baseEvt({ chatId: 'c1@g.us', isGroup: true }), 'company-1', 'user-1', mockSend);
    await jest.runAllTimersAsync();
    expect(mockSend).not.toHaveBeenCalled();
  });

  it('sends canned response when message contains only dangerous words', async () => {
    process.env.OLLAMA_API_KEY = 'test-key';
    process.env.AI_DEBOUNCE_MS = '100';
    service = new WhatsappAiService(makeMockRepo() as any, makeMockBuilder() as any);
    const mockSend = jest.fn().mockResolvedValue({});
    await service.handleIncomingMessage(
      baseEvt({ body: 'DROP DELETE REMOVE' }),
      'company-1', 'user-1', mockSend,
    );
    await jest.runAllTimersAsync();
    expect(mockSend).toHaveBeenCalledWith('c1', DIRECT_CONTACT_RESPONSE);
  });

  describe('debouncing', () => {
    beforeEach(() => {
      process.env.OLLAMA_API_KEY = 'test-key';
      process.env.OLLAMA_HOST = 'http://localhost:11434';
      process.env.OLLAMA_MODEL = 'test-model';
      process.env.AI_DEBOUNCE_MS = '5000';
    });

    it('queues messages and flushes combined text after debounce window', async () => {
      const mockRepo = makeMockRepo(null);
      service = new WhatsappAiService(mockRepo as any, makeMockBuilder() as any);

      global.fetch = jest.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ choices: [{ message: { content: 'AI reply' } }] }),
      }) as any;

      const mockSend = jest.fn().mockResolvedValue({});
      const ts = Math.floor(Date.now() / 1000);

      await service.handleIncomingMessage(baseEvt({ body: 'Hello', timestamp: ts }), 'co', 'u1', mockSend);
      await service.handleIncomingMessage(baseEvt({ body: 'I need help', timestamp: ts }), 'co', 'u1', mockSend);

      // No send yet — timer still pending
      expect(mockSend).not.toHaveBeenCalled();

      await jest.runAllTimersAsync();

      expect(mockSend).toHaveBeenCalledTimes(1);

      // Combined text sent to LLM as one user message
      const body = JSON.parse((global.fetch as jest.Mock).mock.calls[0][1].body);
      const userMsg = body.messages.find((m: any) => m.role === 'user');
      // sanitizeInput normalises whitespace so \n becomes a space
      expect(userMsg.content).toBe('Hello I need help');
    });

    it('resets debounce timer when a new message arrives', async () => {
      service = new WhatsappAiService(makeMockRepo() as any, makeMockBuilder() as any);

      global.fetch = jest.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ choices: [{ message: { content: 'reply' } }] }),
      }) as any;

      const mockSend = jest.fn().mockResolvedValue({});
      const ts = Math.floor(Date.now() / 1000);

      await service.handleIncomingMessage(baseEvt({ body: 'msg1', timestamp: ts }), 'co', 'u1', mockSend);
      // Advance only 3 seconds — timer should still be running
      jest.advanceTimersByTime(3000);
      await service.handleIncomingMessage(baseEvt({ body: 'msg2', timestamp: ts }), 'co', 'u1', mockSend);
      // Advance another 3 seconds — only 3s into the new timer, should NOT have fired
      jest.advanceTimersByTime(3000);
      expect(mockSend).not.toHaveBeenCalled();

      // Advance remaining 2 seconds to complete the 5s debounce window
      await jest.advanceTimersByTimeAsync(2000);
      expect(mockSend).toHaveBeenCalledTimes(1);
    });

    it('separate chats debounce independently', async () => {
      service = new WhatsappAiService(makeMockRepo() as any, makeMockBuilder() as any);

      global.fetch = jest.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ choices: [{ message: { content: 'reply' } }] }),
      }) as any;

      const mockSend = jest.fn().mockResolvedValue({});
      const ts = Math.floor(Date.now() / 1000);

      await service.handleIncomingMessage(baseEvt({ chatId: 'chat-a', body: 'Hi', timestamp: ts }), 'co', 'u1', mockSend);
      await service.handleIncomingMessage(baseEvt({ chatId: 'chat-b', body: 'Hey', timestamp: ts }), 'co', 'u1', mockSend);

      await jest.runAllTimersAsync();

      // Each chat should have triggered one LLM call → one send each
      expect(mockSend).toHaveBeenCalledTimes(2);
    });
  });

  describe('human silence (owner replied)', () => {
    beforeEach(() => {
      process.env.OLLAMA_API_KEY = 'test-key';
      process.env.OLLAMA_HOST = 'http://localhost:11434';
      process.env.OLLAMA_MODEL = 'test-model';
      process.env.AI_DEBOUNCE_MS = '100';
      process.env.AI_HUMAN_SILENCE_MINUTES = '20';
    });

    it('does not respond when human replied recently', async () => {
      service = new WhatsappAiService(makeMockRepo() as any, makeMockBuilder() as any);
      global.fetch = jest.fn() as any;

      const mockSend = jest.fn().mockResolvedValue({});

      service.recordHumanReply('u1', 'c1');
      await service.handleIncomingMessage(baseEvt(), 'co', 'u1', mockSend);
      await jest.runAllTimersAsync();

      expect(mockSend).not.toHaveBeenCalled();
      expect(global.fetch).not.toHaveBeenCalled();
    });

    it('responds again after silence window expires', async () => {
      service = new WhatsappAiService(makeMockRepo() as any, makeMockBuilder() as any);
      global.fetch = jest.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ choices: [{ message: { content: 'reply' } }] }),
      }) as any;

      const mockSend = jest.fn().mockResolvedValue({});

      service.recordHumanReply('u1', 'c1');

      // Advance past the 20-minute silence window
      jest.advanceTimersByTime(20 * 60 * 1000 + 1);

      await service.handleIncomingMessage(baseEvt(), 'co', 'u1', mockSend);
      await jest.runAllTimersAsync();

      expect(mockSend).toHaveBeenCalledTimes(1);
    });

    it('cancels pending debounced response when human replies', async () => {
      service = new WhatsappAiService(makeMockRepo() as any, makeMockBuilder() as any);
      global.fetch = jest.fn() as any;

      const mockSend = jest.fn().mockResolvedValue({});
      const ts = Math.floor(Date.now() / 1000);

      // Customer sends a message (queued, debounce timer running)
      await service.handleIncomingMessage(baseEvt({ body: 'Hello?', timestamp: ts }), 'co', 'u1', mockSend);

      // Human manually replies BEFORE debounce timer fires
      service.recordHumanReply('u1', 'c1');

      // Timers fire — but pending was cancelled by recordHumanReply
      await jest.runAllTimersAsync();

      expect(mockSend).not.toHaveBeenCalled();
    });

    it('human silence is per-chat — other chats still respond', async () => {
      service = new WhatsappAiService(makeMockRepo() as any, makeMockBuilder() as any);
      global.fetch = jest.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ choices: [{ message: { content: 'reply' } }] }),
      }) as any;

      const mockSend = jest.fn().mockResolvedValue({});
      const ts = Math.floor(Date.now() / 1000);

      // Human replied in chat-a
      service.recordHumanReply('u1', 'chat-a');

      // Customer messages in chat-a (silenced) and chat-b (not silenced)
      await service.handleIncomingMessage(baseEvt({ chatId: 'chat-a', timestamp: ts }), 'co', 'u1', mockSend);
      await service.handleIncomingMessage(baseEvt({ chatId: 'chat-b', timestamp: ts }), 'co', 'u1', mockSend);

      await jest.runAllTimersAsync();

      // Only chat-b should have gotten a response
      expect(mockSend).toHaveBeenCalledTimes(1);
      expect(mockSend).toHaveBeenCalledWith('chat-b', expect.any(String));
    });
  });

  describe('handleIncomingMessage with LLM', () => {
    beforeEach(() => {
      process.env.OLLAMA_API_KEY = 'test-key';
      process.env.OLLAMA_HOST = 'http://localhost:11434';
      process.env.OLLAMA_MODEL = 'test-model';
      process.env.AI_DEBOUNCE_MS = '100';
    });

    it('calls repo.getCompanyPrompt and passes result to builder', async () => {
      const mockRepo = makeMockRepo('DB prompt');
      const mockBuilder = makeMockBuilder('DB prompt');
      service = new WhatsappAiService(mockRepo as any, mockBuilder as any);

      global.fetch = jest.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ choices: [{ message: { content: 'reply' } }] }),
      }) as any;

      await service.handleIncomingMessage(baseEvt(), 'company-1', 'user-1', jest.fn().mockResolvedValue({}));
      await jest.runAllTimersAsync();

      expect(mockRepo.getCompanyPrompt).toHaveBeenCalledWith('company-1');
      expect(mockBuilder.buildFullPrompt).toHaveBeenCalledWith('DB prompt', '');
    });

    it('passes null customPrompt to builder when no settings row', async () => {
      const mockRepo = makeMockRepo(null);
      const mockBuilder = makeMockBuilder('default system prompt for AALA.LAND');
      service = new WhatsappAiService(mockRepo as any, mockBuilder as any);

      global.fetch = jest.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ choices: [{ message: { content: 'reply' } }] }),
      }) as any;

      await service.handleIncomingMessage(baseEvt(), 'company-1', 'user-1', jest.fn().mockResolvedValue({}));
      await jest.runAllTimersAsync();

      expect(mockBuilder.buildFullPrompt).toHaveBeenCalledWith(null, '');

      const body = JSON.parse((global.fetch as jest.Mock).mock.calls[0][1].body);
      expect(body.messages[0].content).toBe('default system prompt for AALA.LAND');
    });

    it('histories are scoped per user', async () => {
      const mockRepo = makeMockRepo('prompt');
      service = new WhatsappAiService(mockRepo as any, makeMockBuilder() as any);

      global.fetch = jest.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ choices: [{ message: { content: 'AI reply' } }] }),
      }) as any;

      const mockSend = jest.fn().mockResolvedValue({ messageId: 'msg-1' });
      await service.handleIncomingMessage(baseEvt(), 'company-1', 'user-1', mockSend);
      await service.handleIncomingMessage(baseEvt(), 'company-1', 'user-2', mockSend);
      await jest.runAllTimersAsync();

      expect(service.getHistoryFor('user-1', 'c1')).toHaveLength(2);
      expect(service.getHistoryFor('user-2', 'c1')).toHaveLength(2);
      expect(service.getHistoryFor('user-1', 'c1')).not.toBe(service.getHistoryFor('user-2', 'c1'));
    });
  });
});
