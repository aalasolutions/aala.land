// backend/src/modules/whatsapp/message-store.service.spec.ts
import { MessageStoreService } from './message-store.service';
import { WaMessage } from './wa-types';

const makeMsg = (overrides: Partial<WaMessage> = {}): WaMessage => ({
  id: 'msg-1',
  chatId: '971501234567@s.whatsapp.net',
  senderId: '971501234567@s.whatsapp.net',
  senderName: 'Ahmed',
  chatName: 'Ahmed',
  isGroup: false,
  body: 'Hello',
  hasMedia: false,
  mediaType: '',
  mediaUrls: [],
  mentionedIds: [],
  quotedParticipant: '',
  fromMe: false,
  aiGenerated: false,
  timestamp: 1700000000,
  ...overrides,
});

describe('MessageStoreService', () => {
  let service: MessageStoreService;

  beforeEach(() => { service = new MessageStoreService(); });

  it('stores a message and retrieves it', () => {
    service.addMessage(makeMsg());
    expect(service.getAllMessages()).toHaveLength(1);
  });

  it('deduplicates messages by id', () => {
    service.addMessage(makeMsg({ id: 'dup' }));
    service.addMessage(makeMsg({ id: 'dup' }));
    expect(service.getAllMessages()).toHaveLength(1);
  });

  it('getMessagesForChat returns only that chat', () => {
    service.addMessage(makeMsg({ chatId: 'chat-a', id: 'm1' }));
    service.addMessage(makeMsg({ chatId: 'chat-b', id: 'm2' }));
    expect(service.getMessagesForChat('chat-a')).toHaveLength(1);
  });

  it('getChatList returns sorted by lastTs desc', () => {
    service.addMessage(makeMsg({ chatId: 'old', id: 'm1', timestamp: 100 }));
    service.addMessage(makeMsg({ chatId: 'new', id: 'm2', timestamp: 200 }));
    const list = service.getChatList();
    expect(list[0].chatId).toBe('new');
  });

  it('chat lastBody reflects newer message only', () => {
    service.addMessage(makeMsg({ chatId: 'c1', id: 'm1', body: 'first', timestamp: 100 }));
    service.addMessage(makeMsg({ chatId: 'c1', id: 'm2', body: 'second', timestamp: 200 }));
    expect(service.getChatList()[0].lastBody).toBe('second');
  });
});
