import { fileURLToPath } from 'node:url';
import { config as loadEnv } from 'dotenv';
import { z } from 'zod';

loadEnv({
  path: fileURLToPath(new URL('../../../.env', import.meta.url)),
  quiet: true
});

const schema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  API_PORT: z.coerce.number().int().positive().default(4000),
  WEB_ORIGIN: z.string().default('http://localhost:5173'),
  MONGODB_URI: z.string().default('mongodb://localhost:27017/recruiting_automation'),
  REDIS_URL: z.string().default('redis://localhost:6379'),
  AI_PROVIDER: z.enum(['gemini', 'mock']).default('mock'),
  GEMINI_API_KEY: z.string().optional(),
  GEMINI_MODEL: z.string().default('gemini-3.1-flash-lite'),
  SOURCING_PROVIDER: z.enum(['demo', 'serper']).default('demo'),
  SERPER_API_KEY: z.string().optional(),
  SCORE_CACHE_TTL_SECONDS: z.coerce.number().int().positive().default(86400),
  TASK_RETENTION_DAYS: z.coerce.number().int().positive().default(7),
  TRUST_PROXY_HOPS: z.coerce.number().int().min(0).default(0),
  API_RATE_LIMIT_WINDOW_MS: z.coerce.number().int().positive().default(900000),
  API_RATE_LIMIT_MAX: z.coerce.number().int().positive().default(300),
  API_WRITE_RATE_LIMIT_MAX: z.coerce.number().int().positive().default(80),
  AI_RATE_LIMIT_WINDOW_MS: z.coerce.number().int().positive().default(60000),
  AI_RATE_LIMIT_MAX: z.coerce.number().int().positive().default(12),
  EXTERNAL_SEARCH_RATE_LIMIT_WINDOW_MS: z.coerce.number().int().positive().default(60000),
  EXTERNAL_SEARCH_RATE_LIMIT_MAX: z.coerce.number().int().positive().default(20),
  PROVIDER_MAX_RETRY_DELAY_MS: z.coerce.number().int().positive().default(60000)
});

export const config = schema.parse(process.env);

if (config.AI_PROVIDER === 'gemini' && !config.GEMINI_API_KEY) {
  throw new Error('GEMINI_API_KEY is required when AI_PROVIDER=gemini');
}

if (config.SOURCING_PROVIDER === 'serper' && !config.SERPER_API_KEY) {
  throw new Error('SERPER_API_KEY is required when SOURCING_PROVIDER=serper');
}
