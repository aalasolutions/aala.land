import { WhatsappAiService } from './whatsapp-ai.service';

const makeMockRepo = (aiPrompt: string | null = null) => ({
  findOne: jest.fn().mockResolvedValue(aiPrompt !== null ? { aiPrompt } : null),
});

const makeMockContextService = () => ({
  getContextBlock: jest.fn().mockResolvedValue(''),
  clearCache: jest.fn(),
});

describe('WhatsappAiService', () => {
  let service: WhatsappAiService;
  const originalFetch = global.fetch;

  beforeEach(() => {
    delete process.env.OLLAMA_API_KEY;
    delete process.env.AI_ENABLED;
    service = new WhatsappAiService(makeMockRepo() as any, makeMockContextService() as any);
  });

  afterEach(() => {
    global.fetch = originalFetch;
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
    await service.handleIncomingMessage(
      { chatId: 'c1', body: 'hi', fromMe: false, isGroup: false, timestamp: Math.floor(Date.now() / 1000), senderId: 's1' },
      'company-1', 'user-1',
      mockSend,
    );
    expect(mockSend).not.toHaveBeenCalled();
  });

  it('handleIncomingMessage skips fromMe messages', async () => {
    process.env.OLLAMA_API_KEY = 'test-key';
    service = new WhatsappAiService(makeMockRepo() as any, makeMockContextService() as any);
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
    service = new WhatsappAiService(makeMockRepo() as any, makeMockContextService() as any);
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
      service = new WhatsappAiService(mockRepo as any, makeMockContextService() as any);

      global.fetch = jest.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ choices: [{ message: { content: 'reply' } }] }),
      }) as any;

      const mockSend = jest.fn().mockResolvedValue({ messageId: 'msg-1' });
      await service.handleIncomingMessage(baseEvt, 'company-1', 'user-1', mockSend);

      const fetchCall = (global.fetch as jest.Mock).mock.calls[0];
      const body = JSON.parse(fetchCall[1].body);

      expect(body.messages[0]).toEqual({ role: 'system', content: 'DB prompt' });
      expect(mockRepo.findOne).toHaveBeenCalledWith({ where: { companyId: 'company-1' } });
    });

    it('uses defaultPrompt when no settings row exists', async () => {
      const mockRepo = { findOne: jest.fn().mockResolvedValue(null) };
      service = new WhatsappAiService(mockRepo as any, makeMockContextService() as any);

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
      service = new WhatsappAiService(mockRepo as any, makeMockContextService() as any);

      global.fetch = jest.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ choices: [{ message: { content: 'reply' } }] }),
      }) as any;

      const mockSend = jest.fn().mockResolvedValue({ messageId: 'msg-1' });

      await service.handleIncomingMessage(baseEvt, 'company-1', 'user-1', mockSend);
      await service.handleIncomingMessage({ ...baseEvt, chatId: 'c2' }, 'company-1', 'user-1', mockSend);

      expect(mockRepo.findOne).toHaveBeenCalledTimes(1);
    });

    it('histories are scoped per user in handleIncomingMessage', async () => {
      const mockRepo = { findOne: jest.fn().mockResolvedValue({ aiPrompt: 'prompt' }) };
      service = new WhatsappAiService(mockRepo as any, makeMockContextService() as any);

      global.fetch = jest.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ choices: [{ message: { content: 'AI reply' } }] }),
      }) as any;

      const mockSend = jest.fn().mockResolvedValue({ messageId: 'msg-1' });

      await service.handleIncomingMessage(baseEvt, 'company-1', 'user-1', mockSend);
      await service.handleIncomingMessage(baseEvt, 'company-1', 'user-2', mockSend);

      // Each user has their own separate history
      expect(service.getHistoryFor('user-1', 'c1')).toHaveLength(2); // user + assistant
      expect(service.getHistoryFor('user-2', 'c1')).toHaveLength(2);
      expect(service.getHistoryFor('user-1', 'c1')).not.toBe(service.getHistoryFor('user-2', 'c1'));
    });
  });
});
