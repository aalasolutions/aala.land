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

  beforeEach(() => {
    service = new MessageStoreService();
  });

  it('stores a message and retrieves it', () => {
    service.addMessage('user-a', makeMsg());
    expect(service.getAllMessages('user-a')).toHaveLength(1);
  });

  it('deduplicates messages by id', () => {
    service.addMessage('user-a', makeMsg({ id: 'dup' }));
    service.addMessage('user-a', makeMsg({ id: 'dup' }));
    expect(service.getAllMessages('user-a')).toHaveLength(1);
  });

  it('getMessagesForChat returns only that chat', () => {
    service.addMessage('user-a', makeMsg({ chatId: 'chat-a', id: 'm1' }));
    service.addMessage('user-a', makeMsg({ chatId: 'chat-b', id: 'm2' }));
    expect(service.getMessagesForChat('user-a', 'chat-a')).toHaveLength(1);
  });

  it('getChatList returns sorted by lastTs desc', () => {
    service.addMessage(
      'user-a',
      makeMsg({ chatId: 'old', id: 'm1', timestamp: 100 }),
    );
    service.addMessage(
      'user-a',
      makeMsg({ chatId: 'new', id: 'm2', timestamp: 200 }),
    );
    const list = service.getChatList('user-a');
    expect(list[0].chatId).toBe('new');
  });

  it('chat lastBody reflects newer message only', () => {
    service.addMessage(
      'user-a',
      makeMsg({ chatId: 'c1', id: 'm1', body: 'first', timestamp: 100 }),
    );
    service.addMessage(
      'user-a',
      makeMsg({ chatId: 'c1', id: 'm2', body: 'second', timestamp: 200 }),
    );
    expect(service.getChatList('user-a')[0].lastBody).toBe('second');
  });

  it('messages are isolated by userId', () => {
    service.addMessage('user-a', makeMsg({ id: 'm1', chatId: 'chat-x' }));
    service.addMessage('user-b', makeMsg({ id: 'm2', chatId: 'chat-x' }));
    expect(service.getAllMessages('user-a')).toHaveLength(1);
    expect(service.getAllMessages('user-b')).toHaveLength(1);
    expect(service.getAllMessages('user-a')[0].id).toBe('m1');
  });

  it('getChatList is isolated by userId', () => {
    service.addMessage('user-a', makeMsg({ chatId: 'chat-a', id: 'm1' }));
    service.addMessage('user-b', makeMsg({ chatId: 'chat-b', id: 'm2' }));
    expect(service.getChatList('user-a').map((c) => c.chatId)).toEqual([
      'chat-a',
    ]);
    expect(service.getChatList('user-b').map((c) => c.chatId)).toEqual([
      'chat-b',
    ]);
  });
});
