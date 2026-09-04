const mockMulti = {
  rpush: jest.fn().mockReturnThis(),
  sadd: jest.fn().mockReturnThis(),
  incr: jest.fn().mockReturnThis(),
  pexpire: jest.fn().mockReturnThis(),
  exec: jest.fn(),
};

const mockClient = {
  on: jest.fn(),
  get: jest.fn(),
  set: jest.fn(),
  del: jest.fn().mockResolvedValue(1),
  eval: jest.fn(),
  rename: jest.fn(),
  rpush: jest.fn().mockResolvedValue(1),
  lrange: jest.fn(),
  llen: jest.fn(),
  incr: jest.fn(),
  sadd: jest.fn().mockResolvedValue(1),
  srem: jest.fn().mockResolvedValue(1),
  smembers: jest.fn(),
  pexpire: jest.fn().mockResolvedValue(1),
  scan: jest.fn(),
  quit: jest.fn().mockResolvedValue('OK'),
  multi: jest.fn(() => mockMulti),
};

jest.mock('ioredis', () => ({
  __esModule: true,
  default: jest.fn(() => mockClient),
}));

import { RedisService } from './redis.service';

describe('RedisService', () => {
  let service: RedisService;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new RedisService();
  });

  describe('lock primitives', () => {
    it('tryLock takes the key only when it does not exist', async () => {
      mockClient.set.mockResolvedValueOnce('OK');
      expect(await service.tryLock('k', 'tok', 30000)).toBe(true);
      expect(mockClient.set).toHaveBeenCalledWith('k', 'tok', 'PX', 30000, 'NX');

      mockClient.set.mockResolvedValueOnce(null);
      expect(await service.tryLock('k', 'tok', 30000)).toBe(false);
    });

    it('releaseLock compares the token inside the script, not in JS', async () => {
      await service.releaseLock('k', 'tok');
      const [script, numKeys, key, token] = mockClient.eval.mock.calls[0];
      expect(script).toContain('redis.call("get", KEYS[1]) == ARGV[1]');
      expect(script).toContain('redis.call("del", KEYS[1])');
      expect([numKeys, key, token]).toEqual([1, 'k', 'tok']);
    });

    it('renewLock reports failure when the script refuses (someone else holds it)', async () => {
      mockClient.eval.mockResolvedValueOnce(0);
      expect(await service.renewLock('k', 'tok', 30000)).toBe(false);

      mockClient.eval.mockResolvedValueOnce(1);
      expect(await service.renewLock('k', 'tok', 30000)).toBe(true);
      const [script, , , , ttl] = mockClient.eval.mock.calls[1];
      expect(script).toContain('pexpire');
      expect(ttl).toBe('30000');
    });
  });

  describe('renameKey', () => {
    it('returns true when the claim succeeds', async () => {
      mockClient.rename.mockResolvedValueOnce('OK');
      expect(await service.renameKey('a', 'b')).toBe(true);
    });

    it('returns false only for a missing source key', async () => {
      mockClient.rename.mockRejectedValueOnce(new Error('ERR no such key'));
      expect(await service.renameKey('a', 'b')).toBe(false);
    });

    it('rethrows any other Redis failure instead of reporting an empty buffer', async () => {
      mockClient.rename.mockRejectedValueOnce(new Error('CONNECTION_BROKEN'));
      await expect(service.renameKey('a', 'b')).rejects.toThrow(
        'CONNECTION_BROKEN',
      );
    });
  });

  describe('getJson', () => {
    it('returns null without touching the key when it is absent', async () => {
      mockClient.get.mockResolvedValueOnce(null);
      expect(await service.getJson('k')).toBeNull();
      expect(mockClient.del).not.toHaveBeenCalled();
    });

    it('drops a corrupt value and says so', async () => {
      mockClient.get.mockResolvedValueOnce('{not json');
      const warn = jest
        .spyOn((service as any).logger, 'warn')
        .mockImplementation(() => undefined);

      expect(await service.getJson('k')).toBeNull();
      expect(mockClient.del).toHaveBeenCalledWith('k');
      expect(warn).toHaveBeenCalled();
    });
  });

  describe('TTL-bearing writes', () => {
    it('pushList, incrCounter and setAdd write and expire in one MULTI', async () => {
      mockMulti.exec
        .mockResolvedValueOnce([
          [null, 1],
          [null, 1],
        ])
        .mockResolvedValueOnce([
          [null, 4],
          [null, 1],
        ])
        .mockResolvedValueOnce([
          [null, 1],
          [null, 1],
        ]);

      await service.pushList('l', 'v', 1000);
      expect(await service.incrCounter('c', 2000)).toBe(4);
      await service.setAdd('s', 'm', 3000);

      expect(mockClient.multi).toHaveBeenCalledTimes(3);
      expect(mockMulti.rpush).toHaveBeenCalledWith('l', 'v');
      expect(mockMulti.incr).toHaveBeenCalledWith('c');
      expect(mockMulti.sadd).toHaveBeenCalledWith('s', 'm');
      expect(mockMulti.pexpire.mock.calls).toEqual([
        ['l', 1000],
        ['c', 2000],
        ['s', 3000],
      ]);
    });

    it('surfaces a per-command error instead of reporting a successful write', async () => {
      const wrongType = new Error(
        'WRONGTYPE Operation against a key holding the wrong kind of value',
      );

      mockMulti.exec.mockResolvedValueOnce([
        [wrongType, null],
        [null, 1],
      ]);
      await expect(service.pushList('l', 'v', 1000)).rejects.toThrow(
        'WRONGTYPE',
      );

      mockMulti.exec.mockResolvedValueOnce([
        [wrongType, null],
        [null, 1],
      ]);
      await expect(service.setAdd('s', 'm', 3000)).rejects.toThrow('WRONGTYPE');
    });

    it('incrCounter throws on a failed INCR rather than returning 0', async () => {
      mockMulti.exec.mockResolvedValueOnce([
        [new Error('OOM command not allowed'), null],
        [null, 1],
      ]);
      await expect(service.incrCounter('c', 2000)).rejects.toThrow('OOM');
    });

    it('treats an aborted MULTI as a failure', async () => {
      mockMulti.exec.mockResolvedValueOnce(null);
      await expect(service.incrCounter('c', 2000)).rejects.toThrow(
        'Redis MULTI aborted',
      );
    });
  });

  describe('delByPattern', () => {
    it('walks the cursor with SCAN and never calls KEYS', async () => {
      mockClient.scan
        .mockResolvedValueOnce(['12', ['a', 'b']])
        .mockResolvedValueOnce(['0', ['c']]);

      expect(await service.delByPattern('wa:*')).toBe(3);
      expect(mockClient.scan).toHaveBeenNthCalledWith(
        1,
        '0',
        'MATCH',
        'wa:*',
        'COUNT',
        200,
      );
      expect(mockClient.scan).toHaveBeenNthCalledWith(
        2,
        '12',
        'MATCH',
        'wa:*',
        'COUNT',
        200,
      );
      expect(mockClient.del.mock.calls).toEqual([['a', 'b'], ['c']]);
      expect((mockClient as any).keys).toBeUndefined();
    });

    it('deletes nothing when a scan page is empty', async () => {
      mockClient.scan.mockResolvedValueOnce(['0', []]);
      expect(await service.delByPattern('wa:*')).toBe(0);
      expect(mockClient.del).not.toHaveBeenCalled();
    });
  });
});
