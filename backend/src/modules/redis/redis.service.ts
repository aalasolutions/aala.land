import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import Redis from 'ioredis';
import { getRedisConnection } from './redis.config';

// Compare-and-act, so a holder can never release or extend a lock that has
// already expired and been taken by someone else.
const RELEASE_IF_MINE = `
  if redis.call("get", KEYS[1]) == ARGV[1] then
    return redis.call("del", KEYS[1])
  end
  return 0
`;

const RENEW_IF_MINE = `
  if redis.call("get", KEYS[1]) == ARGV[1] then
    return redis.call("pexpire", KEYS[1], ARGV[2])
  end
  return 0
`;

@Injectable()
export class RedisService implements OnModuleDestroy {
  private readonly logger = new Logger(RedisService.name);
  private readonly duplicates: Redis[] = [];
  readonly client: Redis;

  constructor() {
    this.client = this.create('primary');
  }

  async onModuleDestroy(): Promise<void> {
    await Promise.all(
      [this.client, ...this.duplicates].map((c) =>
        c.quit().catch(() => undefined),
      ),
    );
  }

  // The socket.io adapter needs its own pub/sub pair: a subscriber connection
  // cannot run ordinary commands.
  duplicate(label: string): Redis {
    const client = this.create(label);
    this.duplicates.push(client);
    return client;
  }

  private create(label: string): Redis {
    const client = new Redis(getRedisConnection());
    client.on('error', (err: Error) =>
      this.logger.error(`Redis (${label}) error: ${err.message}`),
    );
    return client;
  }

  async getJson<T>(key: string): Promise<T | null> {
    const raw = await this.client.get(key);
    if (raw === null) return null;
    try {
      return JSON.parse(raw) as T;
    } catch {
      this.logger.warn(`Corrupt JSON at ${key}, deleting`);
      await this.client.del(key);
      return null;
    }
  }

  async setJson(key: string, value: unknown, ttlMs: number): Promise<void> {
    await this.client.set(key, JSON.stringify(value), 'PX', ttlMs);
  }

  async getNumber(key: string): Promise<number | null> {
    const raw = await this.client.get(key);
    if (raw === null) return null;
    const parsed = Number(raw);
    return Number.isFinite(parsed) ? parsed : null;
  }

  async setNumber(key: string, value: number, ttlMs: number): Promise<void> {
    await this.client.set(key, String(value), 'PX', ttlMs);
  }

  async del(...keys: string[]): Promise<void> {
    if (keys.length > 0) await this.client.del(...keys);
  }

  // exec() resolves with [err, result] pairs and never rejects per command, so an
  // unchecked exec reads a failed write as a success.
  private unwrapExec(res: [Error | null, unknown][] | null): unknown[] {
    if (!res) throw new Error('Redis MULTI aborted');
    for (const [err] of res) if (err) throw err;
    return res.map(([, value]) => value);
  }

  // MULTI, not two awaits: a crash between the write and PEXPIRE leaks a TTL-less key.
  async pushList(key: string, value: string, ttlMs: number): Promise<void> {
    this.unwrapExec(
      await this.client.multi().rpush(key, value).pexpire(key, ttlMs).exec(),
    );
  }

  async getList(key: string): Promise<string[]> {
    return this.client.lrange(key, 0, -1);
  }

  async listLength(key: string): Promise<number> {
    return this.client.llen(key);
  }

  // Only a missing source key is a benign false. Anything else must surface, or a
  // Redis outage reads as "nothing buffered" and the messages stay stranded.
  async renameKey(from: string, to: string): Promise<boolean> {
    try {
      return (await this.client.rename(from, to)) === 'OK';
    } catch (err) {
      if (err instanceof Error && err.message.includes('no such key'))
        return false;
      this.logger.error(
        `renameKey ${from} failed: ${err instanceof Error ? err.message : String(err)}`,
      );
      throw err;
    }
  }

  async incrCounter(key: string, ttlMs: number): Promise<number> {
    const [count] = this.unwrapExec(
      await this.client.multi().incr(key).pexpire(key, ttlMs).exec(),
    );
    return Number(count);
  }

  async setAdd(key: string, member: string, ttlMs: number): Promise<void> {
    this.unwrapExec(
      await this.client.multi().sadd(key, member).pexpire(key, ttlMs).exec(),
    );
  }

  async setRemove(key: string, member: string): Promise<void> {
    await this.client.srem(key, member);
  }

  async setMembers(key: string): Promise<string[]> {
    return this.client.smembers(key);
  }

  async tryLock(key: string, token: string, ttlMs: number): Promise<boolean> {
    const res = await this.client.set(key, token, 'PX', ttlMs, 'NX');
    return res === 'OK';
  }

  async renewLock(key: string, token: string, ttlMs: number): Promise<boolean> {
    const res = await this.client.eval(
      RENEW_IF_MINE,
      1,
      key,
      token,
      String(ttlMs),
    );
    return res === 1;
  }

  async releaseLock(key: string, token: string): Promise<void> {
    await this.client.eval(RELEASE_IF_MINE, 1, key, token);
  }

  // SCAN, never KEYS: KEYS blocks the server for the whole keyspace.
  async delByPattern(pattern: string): Promise<number> {
    let deleted = 0;
    let cursor = '0';
    do {
      const [next, keys] = await this.client.scan(
        cursor,
        'MATCH',
        pattern,
        'COUNT',
        200,
      );
      cursor = next;
      if (keys.length > 0) {
        await this.client.del(...keys);
        deleted += keys.length;
      }
    } while (cursor !== '0');
    return deleted;
  }
}
