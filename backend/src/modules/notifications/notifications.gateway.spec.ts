import { Logger } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Repository } from 'typeorm';
import { Socket } from 'socket.io';
import { User } from '../users/entities/user.entity';
import { NotificationsGateway } from './notifications.gateway';

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

  it('stores the verified identity in socket.data and joins its rooms', async () => {
    const socket = socketStub();

    await gateway.handleConnection(socket as unknown as Socket);

    expect(socket.data).toEqual({
      userId: 'user-1',
      companyId: 'co-1',
      tokenExp: 1900000000,
    });
    expect(socket.join).toHaveBeenCalledWith('user_user-1');
    expect(socket.join).toHaveBeenCalledWith('company_co-1');
    expect(socket.disconnect).not.toHaveBeenCalled();
  });

  it('does not store identity and disconnects when the user is inactive', async () => {
    usersRepository.findOne.mockResolvedValue(null);
    const socket = socketStub();

    await gateway.handleConnection(socket as unknown as Socket);

    expect(socket.data).toEqual({});
    expect(socket.join).not.toHaveBeenCalled();
    expect(socket.disconnect).toHaveBeenCalled();
  });

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
