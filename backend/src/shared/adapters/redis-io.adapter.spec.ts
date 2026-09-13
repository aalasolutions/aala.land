import { INestApplicationContext, Logger } from '@nestjs/common';
import { IoAdapter } from '@nestjs/platform-socket.io';
import { createAdapter } from '@socket.io/redis-streams-adapter';
import { Server } from 'socket.io';
import { DataSource } from 'typeorm';
import { RedisService } from '@modules/redis/redis.service';
import { User } from '@modules/users/entities/user.entity';
import { RedisIoAdapter } from './redis-io.adapter';

jest.mock('@socket.io/redis-streams-adapter', () => ({
  createAdapter: jest.fn(),
}));

describe('RedisIoAdapter', () => {
  const adapterConstructor = jest.fn();
  const duplicateClient = { label: 'dup' };
  let redis: { duplicate: jest.Mock };
  let server: { adapter: jest.Mock };
  let superCreate: jest.SpyInstance;
  let qb: Record<string, jest.Mock>;
  let dataSource: { getRepository: jest.Mock };
  let app: { get: jest.Mock };
  let warn: jest.SpyInstance;

  beforeEach(() => {
    (createAdapter as jest.Mock).mockReset().mockReturnValue(adapterConstructor);
    adapterConstructor.mockReset();
    redis = { duplicate: jest.fn().mockReturnValue(duplicateClient) };
    server = { adapter: jest.fn() };
    superCreate = jest
      .spyOn(IoAdapter.prototype, 'createIOServer')
      .mockReturnValue(server as unknown as Server);
    qb = {
      innerJoin: jest.fn(),
      where: jest.fn(),
      andWhere: jest.fn(),
      getCount: jest.fn().mockResolvedValue(1),
    };
    qb.innerJoin.mockReturnValue(qb);
    qb.where.mockReturnValue(qb);
    qb.andWhere.mockReturnValue(qb);
    dataSource = {
      getRepository: jest
        .fn()
        .mockReturnValue({ createQueryBuilder: jest.fn().mockReturnValue(qb) }),
    };
    app = { get: jest.fn().mockReturnValue(dataSource) };
    warn = jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
  });

  afterEach(() => {
    superCreate.mockRestore();
    warn.mockRestore();
  });

  function build(): RedisIoAdapter {
    return new RedisIoAdapter(
      app as unknown as INestApplicationContext,
      redis as unknown as RedisService,
    );
  }

  it('builds the streams adapter from a dedicated duplicate client', () => {
    build().connect();

    expect(redis.duplicate).toHaveBeenCalledTimes(1);
    expect(createAdapter).toHaveBeenCalledWith(duplicateClient);
  });

  it('enables a 2 minute connection state recovery window and attaches the adapter', () => {
    const adapter = build();
    adapter.connect();
    const inner = { restoreSession: jest.fn() };
    adapterConstructor.mockReturnValue(inner);

    const result = adapter.createIOServer(0, {
      cors: { origin: ['http://localhost:4200'] },
    } as never);

    expect(superCreate).toHaveBeenCalledWith(0, {
      cors: { origin: ['http://localhost:4200'] },
      connectionStateRecovery: { maxDisconnectionDuration: 120000 },
    });
    const Factory = server.adapter.mock.calls[0][0] as new (nsp: unknown) => unknown;
    const nsp = { name: '/whatsapp' };
    // Namespace._initAdapter constructs the adapter with `new`.
    expect(new Factory(nsp)).toBe(inner);
    expect(adapterConstructor).toHaveBeenCalledWith(nsp);
    expect(result).toBe(server);
  });

  describe('restoreSession guard', () => {
    const futureExp = () => Math.floor(Date.now() / 1000) + 600;
    const session = (data: unknown) => ({
      sid: 's1',
      pid: 'p1',
      rooms: ['user:u1'],
      data,
      missedPackets: [['evt', 'x', '1-0']],
    });

    function restoreWith(saved: unknown) {
      const inner = {
        restoreSession: jest.fn().mockImplementation(() =>
          saved instanceof Error ? Promise.reject(saved) : Promise.resolve(saved),
        ),
      };
      adapterConstructor.mockReturnValue(inner);
      const adapter = build();
      adapter.connect();
      adapter.createIOServer(0);
      const innerRestore = inner.restoreSession;
      const Factory = server.adapter.mock.calls[0][0] as new (nsp: unknown) => {
        restoreSession: (pid: string, offset: string) => Promise<unknown>;
      };
      return {
        wrapped: new Factory({ name: '/' }),
        inner: { restoreSession: innerRestore },
      };
    }

    it('restores the session for an active user and company with a future exp', async () => {
      const saved = session({ userId: 'u1', companyId: 'c1', tokenExp: futureExp() });
      const { wrapped, inner } = restoreWith(saved);

      await expect(wrapped.restoreSession('p1', '1-0')).resolves.toBe(saved);
      expect(inner.restoreSession).toHaveBeenCalledWith('p1', '1-0');
      expect(app.get).toHaveBeenCalledWith(DataSource);
      expect(dataSource.getRepository).toHaveBeenCalledWith(User);
      expect(qb.where).toHaveBeenCalledWith('u.id = :userId', { userId: 'u1' });
      expect(qb.andWhere).toHaveBeenCalledWith('u.companyId = :companyId', {
        companyId: 'c1',
      });
      expect(qb.andWhere).toHaveBeenCalledWith('u.isActive = true');
      expect(qb.andWhere).toHaveBeenCalledWith('c.isActive = true');
      expect(qb.getCount).toHaveBeenCalledTimes(1);
    });

    it('refuses an expired token without querying the database', async () => {
      const { wrapped } = restoreWith(
        session({
          userId: 'u1',
          companyId: 'c1',
          tokenExp: Math.floor(Date.now() / 1000) - 1,
        }),
      );

      await expect(wrapped.restoreSession('p1', '1-0')).rejects.toThrow(
        'session restore refused',
      );
      expect(qb.getCount).not.toHaveBeenCalled();
    });

    it('refuses when the user or company is no longer active', async () => {
      qb.getCount.mockResolvedValue(0);
      const { wrapped } = restoreWith(
        session({ userId: 'u1', companyId: 'c1', tokenExp: futureExp() }),
      );

      await expect(wrapped.restoreSession('p1', '1-0')).rejects.toThrow(
        'session restore refused',
      );
    });

    it.each([
      ['no data', undefined],
      ['empty data', {}],
      ['missing userId', { companyId: 'c1', tokenExp: 9999999999 }],
      ['missing companyId', { userId: 'u1', tokenExp: 9999999999 }],
      ['missing tokenExp', { userId: 'u1', companyId: 'c1' }],
    ])('refuses a session with %s', async (_label, data) => {
      const { wrapped } = restoreWith(session(data));

      await expect(wrapped.restoreSession('p1', '1-0')).rejects.toThrow(
        'session restore refused',
      );
      expect(qb.getCount).not.toHaveBeenCalled();
    });

    it('fails closed and warns without identity when the lookup errors', async () => {
      qb.getCount.mockRejectedValue(new Error('connection terminated'));
      const { wrapped } = restoreWith(
        session({ userId: 'u1', companyId: 'c1', tokenExp: futureExp() }),
      );

      await expect(wrapped.restoreSession('p1', '1-0')).rejects.toThrow(
        'session restore refused',
      );
      expect(warn).toHaveBeenCalledTimes(1);
      expect(String(warn.mock.calls[0][0])).not.toContain('u1');
    });

    it('propagates the inner rejection when no session exists', async () => {
      const { wrapped } = restoreWith(new Error('session or offset not found'));

      await expect(wrapped.restoreSession('p1', '1-0')).rejects.toThrow(
        'session or offset not found',
      );
      expect(qb.getCount).not.toHaveBeenCalled();
    });
  });
});
