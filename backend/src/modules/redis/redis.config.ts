import { envString } from '@shared/utils/env.util';

export interface RedisConnectionOptions {
  host: string;
  port: number;
  password?: string;
}

// Single source for every Redis consumer (BullMQ, the state store, the socket.io adapter).
export function getRedisConnection(): RedisConnectionOptions {
  const rawPort = envString('REDIS_PORT', '6470');
  const port = Number.parseInt(rawPort, 10);
  if (!Number.isInteger(port)) {
    throw new Error(`REDIS_PORT must be an integer, got "${rawPort}"`);
  }
  const password = envString('REDIS_PASSWORD');
  return {
    host: envString('REDIS_HOST', 'localhost'),
    port,
    ...(password ? { password } : {}),
  };
}
