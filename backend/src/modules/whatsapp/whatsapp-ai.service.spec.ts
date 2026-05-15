// backend/src/modules/whatsapp/whatsapp-ai.service.spec.ts
import { WhatsappAiService } from './whatsapp-ai.service';

describe('WhatsappAiService', () => {
  let service: WhatsappAiService;

  beforeEach(() => {
    delete process.env.OLLAMA_API_KEY;
    delete process.env.AI_ENABLED;
    service = new WhatsappAiService();
  });

  it('is enabled by default', () => {
    expect(service.isEnabled()).toBe(true);
  });

  it('setEnabled toggles state', () => {
    service.setEnabled(false);
    expect(service.isEnabled()).toBe(false);
    service.setEnabled(true);
    expect(service.isEnabled()).toBe(true);
  });

  it('getConfig returns keyConfigured false when no API key', () => {
    expect(service.getConfig().keyConfigured).toBe(false);
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
      mockSend,
    );
    expect(mockSend).not.toHaveBeenCalled();
  });

  it('handleIncomingMessage skips fromMe messages', async () => {
    process.env.OLLAMA_API_KEY = 'test-key';
    service = new WhatsappAiService();
    const mockSend = jest.fn();
    await service.handleIncomingMessage(
      { chatId: 'c1', body: 'hi', fromMe: true, isGroup: false, timestamp: Math.floor(Date.now() / 1000), senderId: 's1' },
      mockSend,
    );
    expect(mockSend).not.toHaveBeenCalled();
  });

  it('handleIncomingMessage skips group messages', async () => {
    process.env.OLLAMA_API_KEY = 'test-key';
    service = new WhatsappAiService();
    const mockSend = jest.fn();
    await service.handleIncomingMessage(
      { chatId: 'c1@g.us', body: 'hi', fromMe: false, isGroup: true, timestamp: Math.floor(Date.now() / 1000), senderId: 's1' },
      mockSend,
    );
    expect(mockSend).not.toHaveBeenCalled();
  });
});
