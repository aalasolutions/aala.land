import { Logger } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Repository } from 'typeorm';
import { Socket } from 'socket.io';
import { User } from '../users/entities/user.entity';
import { Company } from '../companies/entities/company.entity';
import { WhatsappGateway } from './whatsapp.gateway';

describe('WhatsappGateway.handleConnection', () => {
  let jwtService: { verifyAsync: jest.Mock };
  let usersRepo: { findOne: jest.Mock };
  let companiesRepo: { findOne: jest.Mock };
  let gateway: WhatsappGateway;

  beforeAll(() => {
    jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
    jest.spyOn(Logger.prototype, 'debug').mockImplementation(() => undefined);
  });

  afterAll(() => jest.restoreAllMocks());

  beforeEach(() => {
    jwtService = {
      verifyAsync: jest.fn().mockResolvedValue({ sub: 'user-1', exp: 1900000000 }),
    };
    usersRepo = {
      findOne: jest
        .fn()
        .mockResolvedValue({ id: 'user-1', isActive: true, companyId: 'co-1' }),
    };
    companiesRepo = {
      findOne: jest.fn().mockResolvedValue({ id: 'co-1', isActive: true }),
    };
    gateway = new WhatsappGateway(
      jwtService as unknown as JwtService,
      usersRepo as unknown as Repository<User>,
      companiesRepo as unknown as Repository<Company>,
    );
  });

  function socketStub(recovered: boolean, token: unknown = 'jwt') {
    const calls: string[] = [];
    const socket = {
      id: 'sock-1',
      recovered,
      data: {} as Record<string, unknown>,
      handshake: { auth: { token } },
      join: jest.fn(() => {
        calls.push('join');
      }),
      emit: jest.fn(() => {
        calls.push('emit');
        return true;
      }),
      disconnect: jest.fn(),
    };
    return { socket, calls };
  }

  it.each([false, true])(
    'emits whatsapp:ready after joining the user room (recovered=%s)',
    async (recovered) => {
      const { socket, calls } = socketStub(recovered);

      await gateway.handleConnection(socket as unknown as Socket);

      expect(socket.join).toHaveBeenCalledWith('user:user-1');
      expect(socket.emit).toHaveBeenCalledWith('whatsapp:ready', { recovered });
      expect(calls).toEqual(['join', 'emit']);
      expect(socket.disconnect).not.toHaveBeenCalled();
    },
  );

  it('stores the verified identity in socket.data for session restore checks', async () => {
    const { socket } = socketStub(false);

    await gateway.handleConnection(socket as unknown as Socket);

    expect(socket.data).toEqual({
      userId: 'user-1',
      companyId: 'co-1',
      tokenExp: 1900000000,
    });
  });

  it('does not store identity when the company is inactive', async () => {
    companiesRepo.findOne.mockResolvedValue({ id: 'co-1', isActive: false });
    const { socket } = socketStub(false);

    await gateway.handleConnection(socket as unknown as Socket);

    expect(socket.data).toEqual({});
    expect(socket.disconnect).toHaveBeenCalled();
  });

  it('disconnectUser force-closes every socket in the user room', () => {
    const disconnectSockets = jest.fn();
    const inRoom = jest.fn().mockReturnValue({ disconnectSockets });
    gateway.server = { in: inRoom } as never;

    gateway.disconnectUser('user-1');

    expect(inRoom).toHaveBeenCalledWith('user:user-1');
    expect(disconnectSockets).toHaveBeenCalledWith(true);
  });

  it('does not emit whatsapp:ready when authentication fails', async () => {
    jwtService.verifyAsync.mockRejectedValue(new Error('jwt expired'));
    const { socket } = socketStub(true);

    await gateway.handleConnection(socket as unknown as Socket);

    expect(socket.join).not.toHaveBeenCalled();
    expect(socket.emit).not.toHaveBeenCalled();
    expect(socket.disconnect).toHaveBeenCalled();
  });

  it('does not emit whatsapp:ready when the token is missing', async () => {
    const { socket } = socketStub(false, '');

    await gateway.handleConnection(socket as unknown as Socket);

    expect(socket.emit).not.toHaveBeenCalled();
    expect(socket.disconnect).toHaveBeenCalled();
  });
});
