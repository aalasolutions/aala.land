import { Logger } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Repository } from 'typeorm';
import { Server, Socket } from 'socket.io';
import { User } from '../users/entities/user.entity';
import { NotificationsGateway } from './notifications.gateway';

type Middleware = (socket: Socket, next: (err?: Error) => void) => void;

describe('NotificationsGateway', () => {
  let jwtService: { verifyAsync: jest.Mock };
  let usersRepository: { findOne: jest.Mock };
  let gateway: NotificationsGateway;

  beforeAll(() => {
    jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
    jest.spyOn(Logger.prototype, 'log').mockImplementation(() => undefined);
  });

  afterAll(() => jest.restoreAllMocks());

  beforeEach(() => {
    jwtService = {
      verifyAsync: jest
        .fn()
        .mockResolvedValue({ sub: 'user-1', companyId: 'co-1', exp: 1900000000 }),
    };
    usersRepository = {
      findOne: jest
        .fn()
        .mockResolvedValue({ id: 'user-1', companyId: 'co-1', isActive: true }),
    };
    gateway = new NotificationsGateway(
      jwtService as unknown as JwtService,
      usersRepository as unknown as Repository<User>,
    );
  });

  function socketStub(token: unknown = 'jwt') {
    return {
      id: 'sock-1',
      data: {} as Record<string, unknown>,
      handshake: { auth: { token } },
      join: jest.fn(),
      disconnect: jest.fn(),
    };
  }

  function initMiddleware(): { use: jest.Mock; middleware: Middleware } {
    const use = jest.fn();
    gateway.afterInit({ use } as unknown as Server);
    return { use, middleware: use.mock.calls[0][0] as Middleware };
  }

  async function runMiddleware(socket: ReturnType<typeof socketStub>) {
    const { middleware } = initMiddleware();
    return new Promise<Error | undefined>((resolve) =>
      middleware(socket as unknown as Socket, resolve),
    );
  }

  it('afterInit registers exactly one middleware on the server', () => {
    const { use } = initMiddleware();

    expect(use).toHaveBeenCalledTimes(1);
    expect(typeof use.mock.calls[0][0]).toBe('function');
  });

  it('middleware stores identity, joins its rooms and calls next() without error', async () => {
    const socket = socketStub();

    const err = await runMiddleware(socket);

    expect(err).toBeUndefined();
    expect(socket.data).toEqual({
      userId: 'user-1',
      companyId: 'co-1',
      tokenExp: 1900000000,
    });
    expect(socket.join).toHaveBeenCalledWith('user_user-1');
    expect(socket.join).toHaveBeenCalledWith('company_co-1');
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
    ['inactive user', () => usersRepository.findOne.mockResolvedValue(null)],
  ])(
    'middleware rejects with a generic error on %s',
    async (_label, arrange) => {
      const socket = socketStub();
      arrange(socket);

      const err = await runMiddleware(socket);

      expect(err).toBeInstanceOf(Error);
      expect(err?.message).toBe('Unauthorized');
      expect(socket.data).toEqual({});
      expect(socket.join).not.toHaveBeenCalled();
    },
  );

  it('disconnectUser force-closes every socket in the user room', () => {
    const disconnectSockets = jest.fn();
    const inRoom = jest.fn().mockReturnValue({ disconnectSockets });
    gateway.server = { in: inRoom } as never;

    gateway.disconnectUser('user-1');

    expect(inRoom).toHaveBeenCalledWith('user_user-1');
    expect(disconnectSockets).toHaveBeenCalledWith(true);
  });

  it('disconnectCompany force-closes every socket in the company room', () => {
    const disconnectSockets = jest.fn();
    const inRoom = jest.fn().mockReturnValue({ disconnectSockets });
    gateway.server = { in: inRoom } as never;

    gateway.disconnectCompany('co-1');

    expect(inRoom).toHaveBeenCalledWith('company_co-1');
    expect(disconnectSockets).toHaveBeenCalledWith(true);
  });
});
