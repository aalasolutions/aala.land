import { EventEmitter } from 'events';
import { WhatsappService } from './whatsapp.service';
import { WaMessage } from './wa-types';

// Drives the private wireInstance message handler through the public getConnection()
// path to assert AI-echo suppression: a fromMe re-emission of an AI-sent message must
// NOT be treated as a human reply, whether matched by messageId or by content fingerprint
// (Baileys sendMessage can return without a key.id).

const baseMsg = (overrides: Partial<WaMessage> = {}): WaMessage => ({
  id: 'm1',
  chatId: 'c1',
  senderId: 's1',
  senderName: 'Them',
  chatName: 'Chat',
  isGroup: false,
  body: 'hi',
  hasMedia: false,
  mediaType: '',
  mediaUrls: [],
  mentionedIds: [],
  quotedParticipant: '',
  fromMe: false,
  aiGenerated: false,
  timestamp: Math.floor(Date.now() / 1000),
  ...overrides,
});

describe('WhatsappService echo suppression', () => {
  let service: WhatsappService;
  let emitter: EventEmitter;
  let sendMessage: jest.Mock;
  let ai: any;
  let manager: any;
  let store: any;
  let gateway: any;

  const wire = async (userId = 'u1', companyId = 'co1') => {
    await service.getConnection(userId, companyId);
  };

  beforeEach(() => {
    emitter = new EventEmitter();
    sendMessage = jest
      .fn()
      .mockResolvedValue({ success: true, messageId: 'ai-msg-1' });

    const inst = {
      emitter,
      sendMessage,
      getStatus: () => ({
        connection: 'connected',
        hasCredentials: true,
        me: { id: 'me', name: 'Me' },
        qr: null,
      }),
    };

    manager = {
      getAll: () => new Map(),
      getOrCreate: jest.fn().mockResolvedValue(inst),
      get: jest.fn().mockReturnValue(inst),
      remove: jest.fn(),
    };
    store = {
      addMessage: jest.fn(),
      clearAll: jest.fn(),
      getChatList: jest.fn(),
      getAllMessages: jest.fn(),
      getMessagesForChat: jest.fn(),
    };
    gateway = {
      emitStatus: jest.fn(),
      emitQR: jest.fn(),
      emitMessage: jest.fn(),
      emitAi: jest.fn(),
    };
    ai = {
      loadEnabledState: jest.fn(),
      recordHumanReply: jest.fn(),
      handleIncomingMessage: jest.fn(),
      getWeeklyCount: jest.fn().mockResolvedValue(null),
    };

    service = new WhatsappService(manager, store, ai, gateway);
    // Avoid touching the filesystem for company_id persistence.
    jest.spyOn(service as any, 'persistCompanyId').mockImplementation(() => {});
  });

  it('treats a genuine human fromMe message as a human reply', async () => {
    await wire();
    emitter.emit(
      'message',
      baseMsg({ fromMe: true, body: 'human typed this' }),
    );
    expect(ai.recordHumanReply).toHaveBeenCalledWith('u1', 'c1');
  });

  it('does NOT record a human reply when the fromMe echo matches by messageId', async () => {
    await wire();

    // AI sends a message (records id ai-msg-1 + fingerprint).
    let capturedSend: any;
    ai.handleIncomingMessage.mockImplementation(
      (_msg: any, _co: string, _u: string, send: any) => {
        capturedSend = send;
        return Promise.resolve();
      },
    );
    emitter.emit('message', baseMsg({ fromMe: false, body: 'question' }));
    await capturedSend('c1', 'ai answer');

    // Baileys re-emits the AI message as fromMe with the same id.
    emitter.emit(
      'message',
      baseMsg({ id: 'ai-msg-1', fromMe: true, body: 'ai answer' }),
    );
    expect(ai.recordHumanReply).not.toHaveBeenCalled();
  });

  it('does NOT record a human reply when the fromMe echo has no messageId but matches by content', async () => {
    // sendMessage returns WITHOUT a messageId — id-based tracking cannot match.
    sendMessage.mockResolvedValue({ success: true, messageId: undefined });
    await wire();

    let capturedSend: any;
    ai.handleIncomingMessage.mockImplementation(
      (_msg: any, _co: string, _u: string, send: any) => {
        capturedSend = send;
        return Promise.resolve();
      },
    );
    emitter.emit('message', baseMsg({ fromMe: false, body: 'question' }));
    await capturedSend('c1', 'ai answer no id');

    // Echo comes back with a DIFFERENT id (assigned late by Baileys) but same content.
    emitter.emit(
      'message',
      baseMsg({ id: 'late-id', fromMe: true, body: 'ai answer no id' }),
    );
    expect(ai.recordHumanReply).not.toHaveBeenCalled();
  });

  it('consumes the fingerprint so a later identical human message IS recorded', async () => {
    sendMessage.mockResolvedValue({ success: true, messageId: undefined });
    await wire();

    let capturedSend: any;
    ai.handleIncomingMessage.mockImplementation(
      (_msg: any, _co: string, _u: string, send: any) => {
        capturedSend = send;
        return Promise.resolve();
      },
    );
    emitter.emit('message', baseMsg({ fromMe: false, body: 'question' }));
    await capturedSend('c1', 'duplicate text');

    // First fromMe with that text = the AI echo, suppressed.
    emitter.emit(
      'message',
      baseMsg({ id: 'e1', fromMe: true, body: 'duplicate text' }),
    );
    expect(ai.recordHumanReply).not.toHaveBeenCalled();

    // A later human message with the SAME text must be treated as a human reply.
    emitter.emit(
      'message',
      baseMsg({ id: 'e2', fromMe: true, body: 'duplicate text' }),
    );
    expect(ai.recordHumanReply).toHaveBeenCalledWith('u1', 'c1');
  });

  it('matches N identical AI sends with N echoes (counter, not a collapsing Set)', async () => {
    // Both sends return without a messageId — only the content fingerprint can match, so
    // this is exactly the collapse case a Set would get wrong.
    sendMessage.mockResolvedValue({ success: true, messageId: undefined });
    await wire();

    let capturedSend: any;
    ai.handleIncomingMessage.mockImplementation(
      (_msg: any, _co: string, _u: string, send: any) => {
        capturedSend = send;
        return Promise.resolve();
      },
    );
    emitter.emit('message', baseMsg({ fromMe: false, body: 'question' }));

    // AI sends the SAME canned line twice within the window (counter → 2).
    await capturedSend('c1', 'Hello! How can I help?');
    await capturedSend('c1', 'Hello! How can I help?');

    // Two fromMe echoes of that identical line: BOTH are AI echoes, neither is a takeover.
    emitter.emit(
      'message',
      baseMsg({ id: 'echo-1', fromMe: true, body: 'Hello! How can I help?' }),
    );
    emitter.emit(
      'message',
      baseMsg({ id: 'echo-2', fromMe: true, body: 'Hello! How can I help?' }),
    );
    expect(ai.recordHumanReply).not.toHaveBeenCalled();

    // A THIRD identical fromMe (counter drained to 0) is a genuine human takeover.
    emitter.emit(
      'message',
      baseMsg({ id: 'echo-3', fromMe: true, body: 'Hello! How can I help?' }),
    );
    expect(ai.recordHumanReply).toHaveBeenCalledTimes(1);
    expect(ai.recordHumanReply).toHaveBeenCalledWith('u1', 'c1');
  });

  it('does not throw when a fromMe echo has an undefined body', async () => {
    await wire();
    // A fromMe media re-emission with no text body must not crash the fingerprint build.
    expect(() =>
      emitter.emit(
        'message',
        baseMsg({ fromMe: true, body: undefined as any }),
      ),
    ).not.toThrow();
    // With no matching AI send, an undefined-body human message is still a human reply.
    expect(ai.recordHumanReply).toHaveBeenCalledWith('u1', 'c1');
  });
});
