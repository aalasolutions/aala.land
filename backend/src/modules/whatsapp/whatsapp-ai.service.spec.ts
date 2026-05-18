import { WhatsappAiService } from './whatsapp-ai.service';

const makeMockRepo = (aiPrompt: string | null = null) => ({
  findOne: jest.fn().mockResolvedValue(aiPrompt !== null ? { aiPrompt } : null),
});

describe('WhatsappAiService', () => {
  let service: WhatsappAiService;

  beforeEach(() => {
    delete process.env.OLLAMA_API_KEY;
    delete process.env.AI_ENABLED;
    service = new WhatsappAiService(makeMockRepo() as any);
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

  it('recordAssistantTurn stores turn in history', () => {
    service.recordAssistantTurn('chat-1', 'Hello');
    const history = service.getHistoryFor('chat-1');
    expect(history).toHaveLength(1);
    expect(history[0]).toEqual({ role: 'assistant', content: 'Hello' });
  });

  it('clearHistory by chatId removes only that chat', () => {
    service.recordAssistantTurn('chat-1', 'A');
    service.recordAssistantTurn('chat-2', 'B');
    service.clearHistory('chat-1');
    expect(service.getHistoryFor('chat-1')).toHaveLength(0);
    expect(service.getHistoryFor('chat-2')).toHaveLength(1);
  });

  it('clearHistory with no arg clears all', () => {
    service.recordAssistantTurn('chat-1', 'A');
    service.recordAssistantTurn('chat-2', 'B');
    service.clearHistory();
    expect(service.getHistoryFor('chat-1')).toHaveLength(0);
    expect(service.getHistoryFor('chat-2')).toHaveLength(0);
  });

  it('handleIncomingMessage skips when no API key', async () => {
    const mockSend = jest.fn();
    await service.handleIncomingMessage(
      { chatId: 'c1', body: 'hi', fromMe: false, isGroup: false, timestamp: Math.floor(Date.now() / 1000), senderId: 's1' },
      'company-1', 'user-1',
      mockSend,
    );
    expect(mockSend).not.toHaveBeenCalled();
  });

  it('handleIncomingMessage skips fromMe messages', async () => {
    process.env.OLLAMA_API_KEY = 'test-key';
    service = new WhatsappAiService(makeMockRepo() as any);
    const mockSend = jest.fn();
    await service.handleIncomingMessage(
      { chatId: 'c1', body: 'hi', fromMe: true, isGroup: false, timestamp: Math.floor(Date.now() / 1000), senderId: 's1' },
      'company-1', 'user-1',
      mockSend,
    );
    expect(mockSend).not.toHaveBeenCalled();
  });

  it('handleIncomingMessage skips group messages', async () => {
    process.env.OLLAMA_API_KEY = 'test-key';
    service = new WhatsappAiService(makeMockRepo() as any);
    const mockSend = jest.fn();
    await service.handleIncomingMessage(
      { chatId: 'c1@g.us', body: 'hi', fromMe: false, isGroup: true, timestamp: Math.floor(Date.now() / 1000), senderId: 's1' },
      'company-1', 'user-1',
      mockSend,
    );
    expect(mockSend).not.toHaveBeenCalled();
  });

  describe('getCompanyPrompt (via handleIncomingMessage)', () => {
    const baseEvt = {
      chatId: 'c1',
      body: 'hello',
      fromMe: false,
      isGroup: false,
      timestamp: Math.floor(Date.now() / 1000),
      senderId: 's1',
    };

    beforeEach(() => {
      process.env.OLLAMA_API_KEY = 'test-key';
      process.env.OLLAMA_HOST = 'http://localhost:11434';
      process.env.OLLAMA_MODEL = 'test-model';
    });

    afterEach(() => {
      delete process.env.OLLAMA_API_KEY;
      delete process.env.OLLAMA_HOST;
      delete process.env.OLLAMA_MODEL;
    });

    it('fetches prompt from DB when settings row exists', async () => {
      const mockRepo = { findOne: jest.fn().mockResolvedValue({ aiPrompt: 'DB prompt' }) };
      service = new WhatsappAiService(mockRepo as any);

      // Mock fetch to capture the system prompt used
      let capturedMessages: any[] = [];
      global.fetch = jest.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ choices: [{ message: { content: 'reply' } }] }),
      }) as any;

      const mockSend = jest.fn().mockResolvedValue({ messageId: 'msg-1' });
      await service.handleIncomingMessage(baseEvt, 'company-1', 'user-1', mockSend);

      const fetchCall = (global.fetch as jest.Mock).mock.calls[0];
      const body = JSON.parse(fetchCall[1].body);
      capturedMessages = body.messages;

      expect(capturedMessages[0]).toEqual({ role: 'system', content: 'DB prompt' });
      expect(mockRepo.findOne).toHaveBeenCalledWith({ where: { companyId: 'company-1' } });
    });

    it('uses defaultPrompt when no settings row exists', async () => {
      const mockRepo = { findOne: jest.fn().mockResolvedValue(null) };
      service = new WhatsappAiService(mockRepo as any);

      global.fetch = jest.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ choices: [{ message: { content: 'reply' } }] }),
      }) as any;

      const mockSend = jest.fn().mockResolvedValue({ messageId: 'msg-1' });
      await service.handleIncomingMessage(baseEvt, 'company-1', 'user-1', mockSend);

      const fetchCall = (global.fetch as jest.Mock).mock.calls[0];
      const body = JSON.parse(fetchCall[1].body);
      expect(body.messages[0].role).toBe('system');
      expect(body.messages[0].content).toContain('AALA.LAND');
    });

    it('uses cached prompt on second call without re-fetching DB', async () => {
      const mockRepo = { findOne: jest.fn().mockResolvedValue({ aiPrompt: 'Cached prompt' }) };
      service = new WhatsappAiService(mockRepo as any);

      global.fetch = jest.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ choices: [{ message: { content: 'reply' } }] }),
      }) as any;

      const mockSend = jest.fn().mockResolvedValue({ messageId: 'msg-1' });

      // First call — populates cache
      await service.handleIncomingMessage(baseEvt, 'company-1', 'user-1', mockSend);
      // Second call — should use cache
      await service.handleIncomingMessage({ ...baseEvt, chatId: 'c2' }, 'company-1', 'user-1', mockSend);

      expect(mockRepo.findOne).toHaveBeenCalledTimes(1);
    });
  });
});
