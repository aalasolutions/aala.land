import { WhatsappAiService } from './whatsapp-ai.service';
import { DIRECT_CONTACT_RESPONSE } from './whatsapp-ai-filter';
import { SubscriptionTier } from '../companies/entities/company.entity';

function sseStream(chunks: object[]): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();
  const lines = chunks.map(c => `data: ${JSON.stringify(c)}\n\n`).join('') + 'data: [DONE]\n\n';
  return new ReadableStream({ start(ctrl) { ctrl.enqueue(encoder.encode(lines)); ctrl.close(); } });
}

function mockTextResponse(content: string) {
  return {
    ok: true,
    body: sseStream([{ choices: [{ delta: { role: 'assistant', content } }] }]),
  };
}

function mockToolCallResponse(id: string, name: string, args = '{}') {
  return {
    ok: true,
    body: sseStream([
      { choices: [{ delta: { role: 'assistant', content: null, tool_calls: [{ index: 0, id, type: 'function', function: { name, arguments: '' } }] } }] },
      { choices: [{ delta: { tool_calls: [{ index: 0, function: { arguments: args } }] } }] },
    ]),
  };
}

const makeMockRepo = (customPrompt: string | null = null, tier: SubscriptionTier = SubscriptionTier.FREE) => ({
  getCompanyAndUnits: jest.fn().mockResolvedValue({ company: { subscriptionTier: tier }, units: [] }),
  getCompanyPrompt: jest.fn().mockResolvedValue(customPrompt),
  persistAiEnabled: jest.fn().mockResolvedValue(undefined),
  loadAiEnabled: jest.fn().mockResolvedValue(null),
  clearContextCache: jest.fn(),
  clearPromptCache: jest.fn(),
  checkLimitAndIncrement: jest.fn().mockResolvedValue({ allowed: true }),
  decrementWeeklyCount: jest.fn().mockResolvedValue(undefined),
  getWeeklyUsage: jest.fn().mockResolvedValue({ count: 0, windowStart: null }),
  searchProperties: jest.fn().mockResolvedValue([]),
});

const makeMockBuilder = (fullPrompt = 'default system prompt for AALA.LAND') => ({
  buildContextBlock: jest.fn().mockReturnValue({ block: '', fallbackCurrency: '' }),
  buildFullPrompt: jest.fn().mockReturnValue(fullPrompt),
  formatToolResult: jest.fn().mockReturnValue('Formatted listings'),
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

      global.fetch = jest.fn().mockImplementation(() => Promise.resolve(mockTextResponse('AI reply'))) as any;

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

      global.fetch = jest.fn().mockImplementation(() => Promise.resolve(mockTextResponse('reply'))) as any;

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

      global.fetch = jest.fn().mockImplementation(() => Promise.resolve(mockTextResponse('reply'))) as any;

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
      global.fetch = jest.fn().mockImplementation(() => Promise.resolve(mockTextResponse('reply'))) as any;

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

    it('aborts the send and reverts quota when the human replies mid-stream (after the turn started)', async () => {
      const mockRepo = makeMockRepo();
      service = new WhatsappAiService(mockRepo as any, makeMockBuilder() as any);

      // The human replies WHILE the LLM is streaming: the fetch mock records the human
      // reply before resolving the LLM response, mimicking a phone reply mid-turn.
      global.fetch = jest.fn().mockImplementation(() => {
        service.recordHumanReply('u1', 'c1');
        return Promise.resolve(mockTextResponse('AI reply'));
      }) as any;

      const mockSend = jest.fn().mockResolvedValue({});
      const ts = Math.floor(Date.now() / 1000);

      await service.handleIncomingMessage(baseEvt({ body: 'Hello?', timestamp: ts }), 'co', 'u1', mockSend);
      await jest.runAllTimersAsync();

      // LLM was called (turn started before the human reply), but the send was aborted.
      expect(global.fetch).toHaveBeenCalledTimes(1);
      expect(mockSend).not.toHaveBeenCalled();
      // The FREE-tier quota debit is refunded since no reply was actually sent.
      expect(mockRepo.decrementWeeklyCount).toHaveBeenCalledWith('co');
      // The aborted assistant reply is not retained in history.
      expect(service.getHistoryFor('u1', 'c1')).toEqual([]);
    });

    it('aborts the send when the human replies mid-tool-flow', async () => {
      const mockRepo = makeMockRepo();
      mockRepo.searchProperties.mockResolvedValue([{ id: 'l1', title: 'Test' }]);
      service = new WhatsappAiService(mockRepo as any, makeMockBuilder() as any);

      // First call returns a tool call; the human replies during the SECOND LLM call.
      (global.fetch as jest.Mock) = jest.fn()
        .mockResolvedValueOnce(mockToolCallResponse('call_1', 'search_properties', '{"city":"Karachi"}'))
        .mockImplementationOnce(() => {
          service.recordHumanReply('u1', 'c1');
          return Promise.resolve(mockTextResponse('Here are properties.'));
        });

      const mockSend = jest.fn().mockResolvedValue({});
      const ts = Math.floor(Date.now() / 1000);

      await service.handleIncomingMessage(baseEvt({ body: 'properties in karachi', timestamp: ts }), 'co', 'u1', mockSend);
      await jest.runAllTimersAsync();

      expect(global.fetch).toHaveBeenCalledTimes(2);
      expect(mockSend).not.toHaveBeenCalled();
    });

    it('human silence is per-chat — other chats still respond', async () => {
      service = new WhatsappAiService(makeMockRepo() as any, makeMockBuilder() as any);
      global.fetch = jest.fn().mockImplementation(() => Promise.resolve(mockTextResponse('reply'))) as any;

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

      global.fetch = jest.fn().mockImplementation(() => Promise.resolve(mockTextResponse('reply'))) as any;

      await service.handleIncomingMessage(baseEvt(), 'company-1', 'user-1', jest.fn().mockResolvedValue({}));
      await jest.runAllTimersAsync();

      expect(mockRepo.getCompanyPrompt).toHaveBeenCalledWith('company-1');
      expect(mockBuilder.buildFullPrompt).toHaveBeenCalledWith('DB prompt', '');
    });

    it('passes null customPrompt to builder when no settings row', async () => {
      const mockRepo = makeMockRepo(null);
      const mockBuilder = makeMockBuilder('default system prompt for AALA.LAND');
      service = new WhatsappAiService(mockRepo as any, mockBuilder as any);

      global.fetch = jest.fn().mockImplementation(() => Promise.resolve(mockTextResponse('reply'))) as any;

      await service.handleIncomingMessage(baseEvt(), 'company-1', 'user-1', jest.fn().mockResolvedValue({}));
      await jest.runAllTimersAsync();

      expect(mockBuilder.buildFullPrompt).toHaveBeenCalledWith(null, '');

      const body = JSON.parse((global.fetch as jest.Mock).mock.calls[0][1].body);
      expect(body.messages[0].content).toBe('default system prompt for AALA.LAND');
    });

    it('histories are scoped per user', async () => {
      const mockRepo = makeMockRepo('prompt');
      service = new WhatsappAiService(mockRepo as any, makeMockBuilder() as any);

      global.fetch = jest.fn().mockImplementation(() => Promise.resolve(mockTextResponse('AI reply'))) as any;

      const mockSend = jest.fn().mockResolvedValue({ messageId: 'msg-1' });
      await service.handleIncomingMessage(baseEvt(), 'company-1', 'user-1', mockSend);
      await service.handleIncomingMessage(baseEvt(), 'company-1', 'user-2', mockSend);
      await jest.runAllTimersAsync();

      expect(service.getHistoryFor('user-1', 'c1')).toHaveLength(2);
      expect(service.getHistoryFor('user-2', 'c1')).toHaveLength(2);
      expect(service.getHistoryFor('user-1', 'c1')).not.toBe(service.getHistoryFor('user-2', 'c1'));
    });
  });

  describe('weekly message limit', () => {
    beforeEach(() => {
      process.env.OLLAMA_API_KEY = 'test-key';
      process.env.OLLAMA_HOST = 'http://localhost:11434';
      process.env.OLLAMA_MODEL = 'test-model';
      process.env.AI_DEBOUNCE_MS = '100';
    });

    it('does not send when weekly limit is reached (allowed: false)', async () => {
      const mockRepo = makeMockRepo(null, SubscriptionTier.FREE);
      mockRepo.checkLimitAndIncrement.mockResolvedValue({ allowed: false });
      service = new WhatsappAiService(mockRepo as any, makeMockBuilder() as any);
      global.fetch = jest.fn() as any;

      const mockSend = jest.fn().mockResolvedValue({});
      await service.handleIncomingMessage(baseEvt(), 'company-1', 'user-1', mockSend);
      await jest.runAllTimersAsync();

      expect(mockSend).not.toHaveBeenCalled();
      expect(global.fetch).not.toHaveBeenCalled();
    });

    it('calls checkLimitAndIncrement with correct companyId for FREE tier', async () => {
      const mockRepo = makeMockRepo(null, SubscriptionTier.FREE);
      service = new WhatsappAiService(mockRepo as any, makeMockBuilder() as any);
      global.fetch = jest.fn().mockImplementation(() => Promise.resolve(mockTextResponse('reply'))) as any;

      await service.handleIncomingMessage(baseEvt(), 'company-1', 'user-1', jest.fn().mockResolvedValue({}));
      await jest.runAllTimersAsync();

      expect(mockRepo.checkLimitAndIncrement).toHaveBeenCalledWith('company-1', 10);
    });

    it('skips limit check entirely for ENTERPRISE tier', async () => {
      const mockRepo = makeMockRepo(null, SubscriptionTier.ENTERPRISE);
      service = new WhatsappAiService(mockRepo as any, makeMockBuilder() as any);
      global.fetch = jest.fn().mockImplementation(() => Promise.resolve(mockTextResponse('reply'))) as any;

      const mockSend = jest.fn().mockResolvedValue({});
      await service.handleIncomingMessage(baseEvt(), 'company-1', 'user-1', mockSend);
      await jest.runAllTimersAsync();

      expect(mockRepo.checkLimitAndIncrement).not.toHaveBeenCalled();
    });

    it('skips limit check entirely for PRO tier', async () => {
      const mockRepo = makeMockRepo(null, SubscriptionTier.PRO);
      service = new WhatsappAiService(mockRepo as any, makeMockBuilder() as any);
      global.fetch = jest.fn().mockImplementation(() => Promise.resolve(mockTextResponse('reply'))) as any;

      const mockSend = jest.fn().mockResolvedValue({});
      await service.handleIncomingMessage(baseEvt(), 'company-1', 'user-1', mockSend);
      await jest.runAllTimersAsync();

      expect(mockRepo.checkLimitAndIncrement).not.toHaveBeenCalled();
      expect(mockSend).toHaveBeenCalledTimes(1);
    });

    it('allows message when checkLimitAndIncrement throws (fail-open)', async () => {
      const mockRepo = makeMockRepo(null, SubscriptionTier.FREE);
      mockRepo.checkLimitAndIncrement.mockRejectedValue(new Error('DB error'));
      service = new WhatsappAiService(mockRepo as any, makeMockBuilder() as any);
      global.fetch = jest.fn().mockImplementation(() => Promise.resolve(mockTextResponse('reply'))) as any;

      const mockSend = jest.fn().mockResolvedValue({});
      await service.handleIncomingMessage(baseEvt(), 'company-1', 'user-1', mockSend);
      await jest.runAllTimersAsync();

      expect(mockSend).toHaveBeenCalledTimes(1);
    });
  });

  describe('tool calling', () => {
    beforeEach(() => {
      process.env.OLLAMA_API_KEY = 'test-key';
      process.env.OLLAMA_HOST = 'http://localhost:11434';
      process.env.OLLAMA_MODEL = 'test-model';
      process.env.AI_DEBOUNCE_MS = '100';
    });

    it('sends direct reply when LLM returns no tool_calls', async () => {
      service = new WhatsappAiService(makeMockRepo() as any, makeMockBuilder() as any);
      global.fetch = jest.fn().mockResolvedValue(mockTextResponse('Hello!')) as any;

      const mockSend = jest.fn().mockResolvedValue({});
      await service.handleIncomingMessage(baseEvt({ body: 'hi' }), 'comp1', 'user1', mockSend);
      await jest.runAllTimersAsync();

      expect(global.fetch).toHaveBeenCalledTimes(1);
      expect(mockSend).toHaveBeenCalledWith('c1', 'Hello!');
    });

    it('passes TOOL_DEFINITIONS and stream:true in first LLM call body', async () => {
      service = new WhatsappAiService(makeMockRepo() as any, makeMockBuilder() as any);
      global.fetch = jest.fn().mockImplementation(() => Promise.resolve(mockTextResponse('reply'))) as any;

      await service.handleIncomingMessage(baseEvt({ body: 'hi' }), 'comp1', 'user1', jest.fn().mockResolvedValue({}));
      await jest.runAllTimersAsync();

      const body = JSON.parse((global.fetch as jest.Mock).mock.calls[0][1].body);
      expect(body.tools).toBeDefined();
      expect(Array.isArray(body.tools)).toBe(true);
      expect(body.tools.length).toBeGreaterThan(0);
      expect(body.stream).toBe(true);
    });

    it('executes search_properties and makes second LLM call', async () => {
      const mockRepo = makeMockRepo();
      mockRepo.searchProperties.mockResolvedValue([{ id: 'l1', title: 'Test' }]);
      service = new WhatsappAiService(mockRepo as any, makeMockBuilder() as any);

      (global.fetch as jest.Mock) = jest.fn()
        .mockResolvedValueOnce(mockToolCallResponse('call_1', 'search_properties', '{"city":"Karachi"}'))
        .mockResolvedValueOnce(mockTextResponse('Here are properties in Karachi.'));

      const mockSend = jest.fn().mockResolvedValue({});
      await service.handleIncomingMessage(baseEvt({ body: 'properties in karachi' }), 'comp1', 'user1', mockSend);
      await jest.runAllTimersAsync();

      expect(global.fetch).toHaveBeenCalledTimes(2);
      expect(mockSend).toHaveBeenCalledWith('c1', 'Here are properties in Karachi.');
    });

    it('makes second LLM call with escalate_to_human result and sends AI reply', async () => {
      service = new WhatsappAiService(makeMockRepo() as any, makeMockBuilder() as any);
      (global.fetch as jest.Mock) = jest.fn()
        .mockResolvedValueOnce(mockToolCallResponse('call_2', 'escalate_to_human', '{}'))
        .mockResolvedValueOnce(mockTextResponse('I have escalated your request to a human agent.'));

      const mockSend = jest.fn().mockResolvedValue({});
      await service.handleIncomingMessage(baseEvt({ body: 'talk to human' }), 'comp1', 'user1', mockSend);
      await jest.runAllTimersAsync();

      expect(global.fetch).toHaveBeenCalledTimes(2);
      expect(mockSend).toHaveBeenCalledWith('c1', 'I have escalated your request to a human agent.');
    });

    it('accumulates content correctly when SSE chunks arrive split across multiple reads', async () => {
      service = new WhatsappAiService(makeMockRepo() as any, makeMockBuilder() as any);

      // Split the SSE body across two separate Uint8Array chunks mid-line
      const encoder = new TextEncoder();
      const full = 'data: {"choices":[{"delta":{"role":"assistant","content":"Hello"}}]}\n\ndata: {"choices":[{"delta":{"content":" world"}}]}\n\ndata: [DONE]\n\n';
      const half = Math.floor(full.length / 2);
      const chunk1 = encoder.encode(full.slice(0, half));
      const chunk2 = encoder.encode(full.slice(half));

      const splitStream = new ReadableStream<Uint8Array>({
        start(ctrl) {
          ctrl.enqueue(chunk1);
          ctrl.enqueue(chunk2);
          ctrl.close();
        },
      });

      global.fetch = jest.fn().mockResolvedValue({ ok: true, body: splitStream }) as any;

      const mockSend = jest.fn().mockResolvedValue({});
      await service.handleIncomingMessage(baseEvt({ body: 'hi' }), 'comp1', 'user1', mockSend);
      await jest.runAllTimersAsync();

      expect(mockSend).toHaveBeenCalledWith('c1', 'Hello world');
    });
  });

  describe('per-chat turn serialization', () => {
    beforeEach(() => {
      process.env.OLLAMA_API_KEY = 'test-key';
      process.env.OLLAMA_HOST = 'http://localhost:11434';
      process.env.OLLAMA_MODEL = 'test-model';
      process.env.AI_DEBOUNCE_MS = '100';
    });

    // A follow-up inbound message arriving while the first turn is mid-LLM must NOT spawn
    // a second concurrent processMessage on the same chat. Two overlapping turns would
    // interleave push/pop on the shared history array and double-count the weekly quota.
    it('does not interleave two turns on the same chat — history stays ordered, quota counted once per turn', async () => {
      const mockRepo = makeMockRepo(null, SubscriptionTier.FREE);
      service = new WhatsappAiService(mockRepo as any, makeMockBuilder() as any);

      // Gate every LLM call behind a manually-released resolver so we can hold turn 1
      // open while turn 2's flush timer fires.
      const releases: Array<(v: any) => void> = [];
      const fetchResolvedWith = (content: string) =>
        new Promise(resolve => releases.push(() => resolve(mockTextResponse(content))));

      let call = 0;
      global.fetch = jest.fn().mockImplementation(() => fetchResolvedWith(`reply-${++call}`)) as any;

      const mockSend = jest.fn().mockResolvedValue({});
      const ts = Math.floor(Date.now() / 1000);

      // Turn 1 queued + flushed → processMessage starts, blocks on the gated fetch.
      await service.handleIncomingMessage(baseEvt({ body: 'first', timestamp: ts }), 'co', 'u1', mockSend);
      await jest.advanceTimersByTimeAsync(100);
      // Turn 1's fetch is now pending (blocked); its user message is in history.
      expect(releases.length).toBe(1);
      expect(service.getHistoryFor('u1', 'c1').map(m => m.content)).toEqual(['first']);

      // Turn 2 arrives WHILE turn 1 is mid-LLM (no pending entry exists anymore).
      await service.handleIncomingMessage(baseEvt({ body: 'second', timestamp: ts }), 'co', 'u1', mockSend);
      await jest.advanceTimersByTimeAsync(100);
      // Serialization: turn 2 must be BLOCKED behind turn 1 — no second fetch yet, and
      // 'second' has NOT been pushed into history mid-turn-1.
      expect(releases.length).toBe(1);
      expect(service.getHistoryFor('u1', 'c1').map(m => m.content)).toEqual(['first']);

      // Release turn 1's LLM → it finishes and pushes its assistant reply.
      releases[0]('resolve');
      await jest.advanceTimersByTimeAsync(0);
      // Now turn 2 is unblocked and issues its own fetch.
      expect(releases.length).toBe(2);
      releases[1]('resolve');
      await jest.runAllTimersAsync();

      // Final history is cleanly ordered, no interleaving, no lost/duplicated entries.
      expect(service.getHistoryFor('u1', 'c1').map(m => m.content)).toEqual([
        'first', 'reply-1', 'second', 'reply-2',
      ]);
      expect(mockSend).toHaveBeenCalledTimes(2);
      // Quota incremented exactly once per turn (never interleaved).
      expect(mockRepo.checkLimitAndIncrement).toHaveBeenCalledTimes(2);
    });

    // The error-recovery rollback must remove only what THIS turn appended, by captured
    // index — not a blind "-2"/pop that could strip an adjacent turn's message.
    it('on LLM failure removes only this turn user message, leaving prior turns intact', async () => {
      const mockRepo = makeMockRepo(null, SubscriptionTier.PRO);
      service = new WhatsappAiService(mockRepo as any, makeMockBuilder() as any);

      // Turn 1 succeeds, turn 2 throws inside the LLM call.
      global.fetch = jest.fn()
        .mockImplementationOnce(() => Promise.resolve(mockTextResponse('ok-reply')))
        .mockImplementationOnce(() => Promise.reject(Object.assign(new Error('boom'), { cause: new Error('down') }))) as any;

      const mockSend = jest.fn().mockResolvedValue({});
      const ts = Math.floor(Date.now() / 1000);

      await service.handleIncomingMessage(baseEvt({ body: 'good', timestamp: ts }), 'co', 'u1', mockSend);
      await jest.runAllTimersAsync();
      await service.handleIncomingMessage(baseEvt({ body: 'bad', timestamp: ts }), 'co', 'u1', mockSend);
      await jest.runAllTimersAsync();

      // Turn 1's user+assistant survive; turn 2's user message was rolled back cleanly.
      expect(service.getHistoryFor('u1', 'c1').map(m => m.content)).toEqual(['good', 'ok-reply']);
    });
  });

  describe('input guards', () => {
    beforeEach(() => {
      process.env.OLLAMA_API_KEY = 'test-key';
      process.env.OLLAMA_HOST = 'http://localhost:11434';
      process.env.OLLAMA_MODEL = 'test-model';
      process.env.AI_DEBOUNCE_MS = '100';
      process.env.AI_HUMAN_SILENCE_MINUTES = '20';
    });

    it('does not throw and does not process when body is undefined (media message)', async () => {
      service = new WhatsappAiService(makeMockRepo() as any, makeMockBuilder() as any);
      global.fetch = jest.fn() as any;
      const mockSend = jest.fn().mockResolvedValue({});

      // A media event with no text body must be skipped, not crash on body.trim().
      const evt = { chatId: 'c1', body: undefined as any, fromMe: false, isGroup: false, timestamp: Math.floor(Date.now() / 1000), senderId: 's1' };
      await expect(service.handleIncomingMessage(evt, 'co', 'u1', mockSend)).resolves.toBeUndefined();
      await jest.runAllTimersAsync();

      expect(mockSend).not.toHaveBeenCalled();
      expect(global.fetch).not.toHaveBeenCalled();
    });

    it('sends the direct-contact reply when no human has taken over', async () => {
      service = new WhatsappAiService(makeMockRepo() as any, makeMockBuilder() as any);
      global.fetch = jest.fn() as any;
      const mockSend = jest.fn().mockResolvedValue({});
      const ts = Math.floor(Date.now() / 1000);

      // Baseline: 'DROP DELETE REMOVE' trips needsDirectContact; with no takeover the
      // canned reply is sent (guard does not fire).
      await service.handleIncomingMessage(baseEvt({ body: 'DROP DELETE REMOVE', timestamp: ts }), 'co', 'u1', mockSend);
      await jest.runAllTimersAsync();

      expect(mockSend).toHaveBeenCalledWith('c1', DIRECT_CONTACT_RESPONSE);
    });

    it('skips the direct-contact reply when a human took over after the turn started', async () => {
      service = new WhatsappAiService(makeMockRepo() as any, makeMockBuilder() as any);
      global.fetch = jest.fn() as any;
      const mockSend = jest.fn().mockResolvedValue({});
      const ts = Math.floor(Date.now() / 1000);

      // The needsDirectContact early send is reachable only in the sub-millisecond window
      // between the top isHumanSilenceActive() check and the canned send, so a human
      // takeover in that window is forced here by making the mid-turn guard report true.
      // This asserts the guard is actually consulted before the direct-contact send.
      const guardSpy = jest.spyOn(service as any, 'humanTookOverSince').mockReturnValue(true);

      await service.handleIncomingMessage(baseEvt({ body: 'DROP DELETE REMOVE', timestamp: ts }), 'co', 'u1', mockSend);
      await jest.runAllTimersAsync();

      expect(guardSpy).toHaveBeenCalled();
      expect(mockSend).not.toHaveBeenCalled();
    });
  });
});
