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

// Returns the previous value; the key only ever moves forward.
const SET_IF_GREATER = `
  local prev = redis.call("get", KEYS[1])
  if not prev or tonumber(prev) == nil or tonumber(prev) < tonumber(ARGV[1]) then
    redis.call("set", KEYS[1], ARGV[1], "PX", ARGV[2])
  end
  return prev
`;

const APPEND_AND_DELETE = `
  local items = redis.call("lrange", KEYS[1], 0, -1)
  if #items == 0 then return 0 end
  for i = 1, #items, 1000 do
    redis.call("rpush", KEYS[2], unpack(items, i, math.min(i + 999, #items)))
  end
  redis.call("del", KEYS[1])
  redis.call("pexpire", KEYS[2], ARGV[1])
  return #items
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

  // MULTI, not two awaits: a crash between the write and PEXPIRE leaks a TTL-less key. With maxLen, keeps the newest and returns how many were trimmed.
  async pushList(
    key: string,
    value: string,
    ttlMs: number,
    maxLen?: number,
  ): Promise<number> {
    const multi = this.client.multi().rpush(key, value);
    if (maxLen !== undefined) multi.ltrim(key, -maxLen, -1);
    const [length] = this.unwrapExec(await multi.pexpire(key, ttlMs).exec());
    return maxLen === undefined ? 0 : Math.max(0, (length as number) - maxLen);
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

  async removeListValues(key: string, values: string[]): Promise<void> {
    const unique = [...new Set(values)];
    if (unique.length === 0) return;
    const tx = this.client.multi();
    for (const value of unique) tx.lrem(key, 0, value);
    this.unwrapExec(await tx.exec());
  }

  async setNumberIfGreater(
    key: string,
    value: number,
    ttlMs: number,
  ): Promise<number | null> {
    const prev = await this.client.eval(
      SET_IF_GREATER,
      1,
      key,
      String(value),
      String(ttlMs),
    );
    if (prev === null || prev === undefined) return null;
    const parsed = Number(prev);
    return Number.isFinite(parsed) ? parsed : null;
  }

  async getList(key: string): Promise<string[]> {
    return this.client.lrange(key, 0, -1);
  }

  async listLength(key: string): Promise<number> {
    return this.client.llen(key);
  }

  // Moves every entry to the end of the target list in one script; entries already there stay.
  async appendListAndDelete(
    from: string,
    to: string,
    ttlMs: number,
  ): Promise<number> {
    return Number(
      await this.client.eval(APPEND_AND_DELETE, 2, from, to, String(ttlMs)),
    );
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

  async sortedSetAdd(
    key: string,
    member: string,
    score: number,
    ttlMs: number,
  ): Promise<void> {
    this.unwrapExec(
      await this.client
        .multi()
        .zadd(key, score, member)
        .pexpire(key, ttlMs)
        .exec(),
    );
  }

  async sortedSetRemove(key: string, member: string): Promise<void> {
    await this.client.zrem(key, member);
  }

  async sortedSetMembers(
    key: string,
    maxScore = Number.POSITIVE_INFINITY,
  ): Promise<string[]> {
    return this.client.zrangebyscore(
      key,
      '-inf',
      Number.isFinite(maxScore) ? String(maxScore) : '+inf',
    );
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
