import { Redis } from 'ioredis';
import type { ConnectionOptions } from 'bullmq';
import { config } from '../config.js';

export const redis = new Redis(config.REDIS_URL, {
  maxRetriesPerRequest: null,
  enableReadyCheck: true
});

export function bullConnectionOptions(): ConnectionOptions {
  const url = new URL(config.REDIS_URL);
  return {
    host: url.hostname,
    port: Number(url.port || 6379),
    username: url.username || undefined,
    password: url.password ? decodeURIComponent(url.password) : undefined,
    db: url.pathname.length > 1 ? Number(url.pathname.slice(1)) : 0,
    ...(url.protocol === 'rediss:' ? { tls: {} } : {})
  };
}
