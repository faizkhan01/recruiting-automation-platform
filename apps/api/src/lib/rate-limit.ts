import type { Request } from 'express';
import { ipKeyGenerator, rateLimit, type Options } from 'express-rate-limit';
import { RedisStore, type RedisReply } from 'rate-limit-redis';
import { config } from '../config.js';
import { redis } from './redis.js';

type RateLimitOverrides = Partial<Options> & {
  name: string;
  windowMs: number;
  limit: number;
};

function clientKey(request: Request): string {
  return ipKeyGenerator(request.ip || request.socket.remoteAddress || 'unknown');
}

export function createDistributedRateLimiter({
  name,
  windowMs,
  limit,
  ...overrides
}: RateLimitOverrides) {
  return rateLimit({
    windowMs,
    limit,
    standardHeaders: 'draft-8',
    legacyHeaders: false,
    identifier: name,
    keyGenerator: clientKey,
    passOnStoreError: false,
    store: new RedisStore({
      prefix: `rate-limit:${name}:`,
      sendCommand: async (...args: string[]): Promise<RedisReply> => {
        const [command, ...commandArgs] = args;
        return redis.call(command!, ...commandArgs) as Promise<RedisReply>;
      }
    }),
    handler: (request, response, _next, options) => {
      const retryAfter = response.getHeader('Retry-After');
      response.status(options.statusCode).json({
        success: false,
        error: {
          code: 'RATE_LIMIT_EXCEEDED',
          message: 'Too many requests. Please retry after the indicated delay.',
          retryAfterSeconds: retryAfter ? Number(retryAfter) : undefined
        }
      });
    },
    ...overrides
  });
}

export const generalApiLimiter = createDistributedRateLimiter({
  name: 'general',
  windowMs: config.API_RATE_LIMIT_WINDOW_MS,
  limit: config.API_RATE_LIMIT_MAX
});

export const writeApiLimiter = createDistributedRateLimiter({
  name: 'write',
  windowMs: config.API_RATE_LIMIT_WINDOW_MS,
  limit: config.API_WRITE_RATE_LIMIT_MAX,
  skip: (request) => !['POST', 'PUT', 'PATCH', 'DELETE'].includes(request.method)
});

export const aiApiLimiter = createDistributedRateLimiter({
  name: 'ai',
  windowMs: config.AI_RATE_LIMIT_WINDOW_MS,
  limit: config.AI_RATE_LIMIT_MAX
});

export const externalSearchApiLimiter = createDistributedRateLimiter({
  name: 'external-search',
  windowMs: config.EXTERNAL_SEARCH_RATE_LIMIT_WINDOW_MS,
  limit: config.EXTERNAL_SEARCH_RATE_LIMIT_MAX
});
