import { ArgumentsHost, Logger, PipeTransform } from '@nestjs/common';
import { ROUTE_ARGS_METADATA } from '@nestjs/common/constants';
import { JwtService } from '@nestjs/jwt';
import { WsException } from '@nestjs/websockets';
import { Repository } from 'typeorm';
import { Namespace, Socket } from 'socket.io';
import { User } from '../users/entities/user.entity';
import { Company } from '../companies/entities/company.entity';
import { WsAckExceptionFilter } from '@shared/filters/ws-ack-exception.filter';
import { WhatsappGateway } from './whatsapp.gateway';
import { MessageStoreService } from './message-store.service';
import { MarkWaChatReadDto } from './dto/mark-wa-chat-read.dto';
import { WhatsappHistorySyncStatus } from './entities/whatsapp-connection.entity';

type Middleware = (socket: Socket, next: (err?: Error) => void) => void;

describe('WhatsappGateway', () => {
  let jwtService: { verifyAsync: jest.Mock };
  let usersRepo: { findOne: jest.Mock };
  let companiesRepo: { findOne: jest.Mock };
  let store: { markChatRead: jest.Mock };
  let gateway: WhatsappGateway;

  beforeAll(() => {
    jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
    jest.spyOn(Logger.prototype, 'debug').mockImplementation(() => undefined);
    jest.spyOn(Logger.prototype, 'log').mockImplementation(() => undefined);
  });

  afterAll(() => jest.restoreAllMocks());

  beforeEach(() => {
    jwtService = {
      verifyAsync: jest
        .fn()
        .mockResolvedValue({ sub: 'user-1', exp: 1900000000 }),
    };
    usersRepo = {
      findOne: jest
        .fn()
        .mockResolvedValue({ id: 'user-1', isActive: true, companyId: 'co-1' }),
    };
    companiesRepo = {
      findOne: jest.fn().mockResolvedValue({ id: 'co-1', isActive: true }),
    };
    store = { markChatRead: jest.fn() };
    gateway = new WhatsappGateway(
      jwtService as unknown as JwtService,
      usersRepo as unknown as Repository<User>,
      companiesRepo as unknown as Repository<Company>,
      store as unknown as MessageStoreService,
    );
  });

  function socketStub(recovered = false, token: unknown = 'jwt') {
    return {
      id: 'sock-1',
      recovered,
      data: {} as Record<string, unknown>,
      handshake: { auth: { token } },
      join: jest.fn(),
      emit: jest.fn(),
      disconnect: jest.fn(),
    };
  }

  function initMiddleware(): { use: jest.Mock; middleware: Middleware } {
    const use = jest.fn();
    gateway.afterInit({ use } as unknown as Namespace);
    return { use, middleware: use.mock.calls[0][0] as Middleware };
  }

  async function runMiddleware(socket: ReturnType<typeof socketStub>) {
    const { middleware } = initMiddleware();
    return new Promise<Error | undefined>((resolve) =>
      middleware(socket as unknown as Socket, resolve),
    );
  }

  it('afterInit registers exactly one middleware on the namespace', () => {
    const { use } = initMiddleware();

    expect(use).toHaveBeenCalledTimes(1);
    expect(typeof use.mock.calls[0][0]).toBe('function');
  });

  it('middleware joins the user room, stores identity and calls next() without error', async () => {
    const socket = socketStub();

    const err = await runMiddleware(socket);

    expect(err).toBeUndefined();
    expect(socket.join).toHaveBeenCalledWith('user:user-1');
    expect(socket.data).toEqual({
      userId: 'user-1',
      companyId: 'co-1',
      tokenExp: 1900000000,
    });
    expect(socket.emit).not.toHaveBeenCalled();
    expect(socket.disconnect).not.toHaveBeenCalled();
  });

  it.each([
    [
      'missing token',
      (s: ReturnType<typeof socketStub>) => {
        s.handshake.auth.token = '';
      },
    ],
    [
      'bad JWT',
      () => jwtService.verifyAsync.mockRejectedValue(new Error('jwt expired')),
    ],
    [
      'inactive user',
      () =>
        usersRepo.findOne.mockResolvedValue({
          id: 'user-1',
          isActive: false,
          companyId: 'co-1',
        }),
    ],
    [
      'user without company',
      () =>
        usersRepo.findOne.mockResolvedValue({
          id: 'user-1',
          isActive: true,
          companyId: null,
        }),
    ],
    [
      'inactive company',
      () =>
        companiesRepo.findOne.mockResolvedValue({ id: 'co-1', isActive: false }),
    ],
    ['missing company', () => companiesRepo.findOne.mockResolvedValue(null)],
  ])(
    'middleware rejects with a generic error on %s',
    async (_label, arrange) => {
      const socket = socketStub();
      arrange(socket);

      const err = await runMiddleware(socket);

      expect(err).toBeInstanceOf(Error);
      expect(err?.message).toBe('Unauthorized');
      expect(socket.join).not.toHaveBeenCalled();
      expect(socket.data).toEqual({});
      expect(socket.emit).not.toHaveBeenCalled();
    },
  );

  it.each([false, true])(
    'handleConnection emits whatsapp:ready with the recovered flag (recovered=%s)',
    (recovered) => {
      const socket = socketStub(recovered);

      gateway.handleConnection(socket as unknown as Socket);

      expect(socket.emit).toHaveBeenCalledWith('whatsapp:ready', { recovered });
      expect(jwtService.verifyAsync).not.toHaveBeenCalled();
    },
  );

  it('disconnectUser force-closes every socket in the user room', () => {
    const disconnectSockets = jest.fn();
    const inRoom = jest.fn().mockReturnValue({ disconnectSockets });
    gateway.server = { in: inRoom } as never;

    gateway.disconnectUser('user-1');

    expect(inRoom).toHaveBeenCalledWith('user:user-1');
    expect(disconnectSockets).toHaveBeenCalledWith(true);
  });

  it('emitHistory pushes the sync state to the user room only', () => {
    const emit = jest.fn();
    const to = jest.fn().mockReturnValue({ emit });
    gateway.server = { to } as never;

    gateway.emitHistory('user-1', {
      status: WhatsappHistorySyncStatus.COMPLETE,
      progress: 100,
    });

    expect(to).toHaveBeenCalledWith('user:user-1');
    expect(emit).toHaveBeenCalledWith('whatsapp:history', {
      status: 'complete',
      progress: 100,
    });
  });

  describe('whatsapp:read', () => {
    const state = {
      chatId: '971501234567',
      unreadCount: 2,
      lastReadMessageId: 'wamid.X',
    };
    const readSocket = (data: Record<string, unknown> = {
      userId: 'user-1',
      companyId: 'co-1',
    }) => ({ data }) as unknown as Socket;

    function roomServer() {
      const emit = jest.fn();
      const to = jest.fn().mockReturnValue({ emit });
      gateway.server = { to } as never;
      return { to, emit };
    }

    it('marks read with socket identity, acks the state and emits it to the user room', async () => {
      store.markChatRead.mockResolvedValue(state);
      const { to, emit } = roomServer();

      const ack = await gateway.markRead(readSocket(), {
        chatId: '971501234567',
        messageId: 'wamid.X',
      });

      expect(store.markChatRead).toHaveBeenCalledWith(
        'co-1',
        'user-1',
        '971501234567',
        'wamid.X',
      );
      expect(ack).toEqual(state);
      expect(to).toHaveBeenCalledWith('user:user-1');
      expect(emit).toHaveBeenCalledWith('whatsapp:unread', state);
    });

    it('rejects an unknown message id without emitting', async () => {
      store.markChatRead.mockResolvedValue(null);
      const { emit } = roomServer();

      await expect(
        gateway.markRead(readSocket(), {
          chatId: '971501234567',
          messageId: 'wamid.none',
        }),
      ).rejects.toThrow(new WsException('Unknown message'));
      expect(emit).not.toHaveBeenCalled();
    });

    it('refuses a socket without identity before touching the store', async () => {
      await expect(
        gateway.markRead(readSocket({}), {
          chatId: '971501234567',
          messageId: 'wamid.X',
        }),
      ).rejects.toBeInstanceOf(WsException);
      expect(store.markChatRead).not.toHaveBeenCalled();
    });

    function payloadPipe(): PipeTransform {
      const args = Reflect.getMetadata(
        ROUTE_ARGS_METADATA,
        WhatsappGateway,
        'markRead',
      ) as Record<string, { pipes: PipeTransform[] }>;
      const withPipe = Object.values(args).find((a) => a.pipes.length > 0);
      return withPipe!.pipes[0];
    }
    const validatePayload = (value: unknown) =>
      payloadPipe().transform(value, {
        type: 'body',
        metatype: MarkWaChatReadDto,
      });

    it('accepts a valid payload', async () => {
      await expect(
        validatePayload({ chatId: '971501234567', messageId: 'wamid.HBgM=' }),
      ).resolves.toBeInstanceOf(MarkWaChatReadDto);
    });

    it.each([
      ['a non-E.164 chatId', { chatId: '+971501234567', messageId: 'w' }],
      ['an empty messageId', { chatId: '971501234567', messageId: '' }],
      ['a messageId with a space', { chatId: '971501234567', messageId: 'a b' }],
      ['an over-long messageId', { chatId: '971501234567', messageId: 'x'.repeat(256) }],
      ['an unknown field', { chatId: '971501234567', messageId: 'w', userId: 'u' }],
      ['no payload', undefined],
    ])('turns %s into a WsException', async (_label, value) => {
      await expect(validatePayload(value)).rejects.toBeInstanceOf(WsException);
    });

    it('returns a validation error through the ack instead of crashing', async () => {
      const error = await validatePayload({ chatId: 'x', messageId: '' }).catch(
        (e: unknown) => e,
      );
      const ack = jest.fn();
      const host = {
        getArgByIndex: (i: number) => (i === 2 ? ack : undefined),
      } as unknown as ArgumentsHost;

      new WsAckExceptionFilter().catch(error, host);

      expect(ack).toHaveBeenCalledWith({
        error: expect.stringContaining('chatId must be E.164'),
      });
    });

    it('acks an unexpected error generically', () => {
      jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
      const ack = jest.fn();
      const host = {
        getArgByIndex: (i: number) => (i === 2 ? ack : undefined),
      } as unknown as ArgumentsHost;

      new WsAckExceptionFilter().catch(new Error('db down'), host);

      expect(ack).toHaveBeenCalledWith({ error: 'Internal server error' });
    });

    it('emitUnread targets the user room', () => {
      const { to, emit } = roomServer();

      gateway.emitUnread('user-1', state);

      expect(to).toHaveBeenCalledWith('user:user-1');
      expect(emit).toHaveBeenCalledWith('whatsapp:unread', state);
    });
  });
});
