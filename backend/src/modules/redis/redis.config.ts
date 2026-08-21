export interface RedisConnectionOptions {
  host: string;
  port: number;
  password?: string;
}

// Single source for every Redis consumer (BullMQ, the state store, the socket.io adapter).
export function getRedisConnection(): RedisConnectionOptions {
  const port = Number.parseInt(process.env.REDIS_PORT || '6470', 10);
  if (!Number.isInteger(port)) {
    throw new Error(
      `REDIS_PORT must be an integer, got "${process.env.REDIS_PORT}"`,
    );
  }
  return {
    host: process.env.REDIS_HOST || 'localhost',
    port,
    ...(process.env.REDIS_PASSWORD
      ? { password: process.env.REDIS_PASSWORD }
      : {}),
  };
}
