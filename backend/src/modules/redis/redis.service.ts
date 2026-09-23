import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import Redis from 'ioredis';
import { errorMessage } from '@shared/utils/error.util';
import { getRedisConnection } from './redis.config';

// Compare-and-act: a holder can never release or extend a lock already expired and taken by someone else.
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

  // Socket.io adapter needs its own pub/sub pair; a subscriber connection can't run ordinary commands.
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

  async getOrSetJson<T>(
    key: string,
    ttlMs: number,
    load: () => Promise<T>,
  ): Promise<T> {
    try {
      const hit = await this.getJson<T>(key);
      if (hit !== null) return hit;
    } catch (err) {
      this.logger.warn(`Cache read failed for ${key}: ${errorMessage(err)}`);
    }
    const value = await load();
    try {
      await this.setJson(key, value, ttlMs);
    } catch (err) {
      this.logger.warn(`Cache write failed for ${key}: ${errorMessage(err)}`);
    }
    return value;
  }

  async forget(...keys: string[]): Promise<void> {
    try {
      await this.del(...keys);
    } catch (err) {
      this.logger.warn(
        `Cache delete failed for ${keys.join(', ')}: ${errorMessage(err)}`,
      );
    }
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

  async setNumberIfAbsent(
    key: string,
    value: number,
    ttlMs: number,
  ): Promise<boolean> {
    const res = await this.client.set(key, String(value), 'PX', ttlMs, 'NX');
    return res === 'OK';
  }

  async del(...keys: string[]): Promise<void> {
    if (keys.length > 0) await this.client.del(...keys);
  }

  // exec() never rejects per-command; an unchecked exec would read a failed write as a success.
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

  // Keeps newest; returns trimmed count.
  async prependList(
    key: string,
    values: string[],
    maxLen: number,
    ttlMs: number,
  ): Promise<number> {
    const [length] = this.unwrapExec(
      await this.client
        .multi()
        .lpush(key, ...[...values].reverse())
        .ltrim(key, -maxLen, -1)
        .pexpire(key, ttlMs)
        .exec(),
    );
    return Math.max(0, (length as number) - maxLen);
  }

  async getList(key: string): Promise<string[]> {
    return this.client.lrange(key, 0, -1);
  }

  async listLength(key: string): Promise<number> {
    return this.client.llen(key);
  }

  // Only a missing key is benign; anything else must surface, or an outage reads as nothing buffered.
  async renameKey(from: string, to: string): Promise<boolean> {
    try {
      return (await this.client.rename(from, to)) === 'OK';
    } catch (err) {
      if (err instanceof Error && err.message.includes('no such key'))
        return false;
      this.logger.error(`renameKey ${from} failed: ${errorMessage(err)}`);
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
