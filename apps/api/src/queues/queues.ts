import { Queue } from 'bullmq';
import { bullConnectionOptions } from '../lib/redis.js';

export const SOURCING_QUEUE = 'candidate-sourcing';
export const OUTREACH_QUEUE = 'candidate-outreach';

const defaultJobOptions = {
  attempts: 4,
  backoff: { type: 'exponential' as const, delay: 5000 },
  removeOnComplete: { age: 60 * 60 * 24 * 7, count: 1000 },
  removeOnFail: { age: 60 * 60 * 24 * 14, count: 2000 }
};

export const sourcingQueue = new Queue(SOURCING_QUEUE, {
  connection: bullConnectionOptions(),
  defaultJobOptions
});

export const outreachQueue = new Queue(OUTREACH_QUEUE, {
  connection: bullConnectionOptions(),
  defaultJobOptions
});
