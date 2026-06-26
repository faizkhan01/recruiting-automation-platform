import { config } from '../config.js';

export function parseRetryAfter(value: string | null, now = Date.now()): number | undefined {
  if (!value) return undefined;
  const seconds = Number(value);
  if (Number.isFinite(seconds) && seconds >= 0) return Math.ceil(seconds * 1000);
  const date = Date.parse(value);
  if (Number.isNaN(date)) return undefined;
  return Math.max(0, date - now);
}

export function parseGoogleRetryDelay(error: unknown): number | undefined {
  const message = error instanceof Error ? error.message : String(error);
  try {
    const payload = JSON.parse(message) as {
      error?: {
        details?: Array<{ retryDelay?: string }>;
      };
    };
    const retryDelay = payload.error?.details?.find((detail) => detail.retryDelay)?.retryDelay;
    if (!retryDelay) return undefined;
    const match = retryDelay.match(/^([\d.]+)s$/);
    return match ? Math.ceil(Number(match[1]) * 1000) : undefined;
  } catch {
    const match = message.match(/"retryDelay"\s*:\s*"([\d.]+)s"/);
    return match ? Math.ceil(Number(match[1]) * 1000) : undefined;
  }
}

export function boundedRetryDelay(
  requestedMs: number | undefined,
  fallbackMs: number,
  attempt: number
): number {
  const base = requestedMs ?? fallbackMs * 2 ** Math.max(0, attempt - 1);
  const bounded = Math.min(base, config.PROVIDER_MAX_RETRY_DELAY_MS);
  const jitter = Math.floor(Math.random() * Math.min(500, Math.max(1, bounded * 0.1)));
  return bounded + jitter;
}

