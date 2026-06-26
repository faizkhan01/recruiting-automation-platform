import { Worker, type Job as QueueJob } from 'bullmq';
import { config } from './config.js';
import { connectDatabase, disconnectDatabase } from './lib/database.js';
import { logger } from './lib/logger.js';
import { bullConnectionOptions } from './lib/redis.js';
import {
  CandidateModel,
  JobModel,
  MessageModel,
  ScoreModel,
  TaskModel
} from './models/index.js';
import { OUTREACH_QUEUE, SOURCING_QUEUE } from './queues/queues.js';
import { normalizeLinkedInUrl } from './services/candidate.service.js';
import { getAiProvider } from './services/ai/index.js';
import {
  getSourcingProvider,
  ProviderRateLimitError,
  type SourcedCandidate
} from './services/sourcing/index.js';

interface SourcingJob {
  taskId: string;
  jobId: string;
  query?: string;
  queries?: string[];
  limit: number;
}

interface OutreachJob {
  taskId: string;
  candidateId: string;
  jobId: string;
}

async function markActive(taskId: string, attempts: number) {
  await TaskModel.updateOne(
    { taskId },
    {
      $set: { status: 'active', startedAt: new Date(), progress: 10, error: null },
      $max: { attempts }
    }
  );
}

async function markCompleted(taskId: string, result: Record<string, unknown>) {
  await TaskModel.updateOne(
    { taskId },
    {
      $set: {
        status: 'completed',
        progress: 100,
        result,
        completedAt: new Date(),
        error: null
      }
    }
  );
}

async function markError(queueJob: QueueJob, taskId: string, error: unknown) {
  const message = error instanceof Error ? error.message : 'Unknown worker error';
  const maxAttempts = queueJob.opts.attempts ?? 1;
  const finalAttempt = queueJob.attemptsMade + 1 >= maxAttempts;
  await TaskModel.updateOne(
    { taskId },
    {
      $set: {
        status: finalAttempt ? 'failed' : 'queued',
        error: message,
        progress: finalAttempt ? 100 : 0,
        ...(finalAttempt ? { completedAt: new Date() } : {})
      },
      $max: { attempts: queueJob.attemptsMade + 1 }
    }
  );
}

await connectDatabase();

const sourcingWorker = new Worker<SourcingJob>(
  SOURCING_QUEUE,
  async (queueJob) => {
    const { taskId, jobId, query, queries, limit } = queueJob.data;
    try {
      await markActive(taskId, queueJob.attemptsMade + 1);
      const job = await JobModel.findById(jobId);
      if (!job) throw new Error('Job no longer exists');

      const provider = getSourcingProvider();
      const searchQueries = queries?.length ? queries : query ? [query] : [];
      if (searchQueries.length === 0) throw new Error('No candidate sourcing query was provided');
      let sourced: SourcedCandidate[] = [];
      let queryUsed = searchQueries[0]!;
      for (const candidateQuery of searchQueries) {
        queryUsed = candidateQuery;
        sourced = await provider.search(candidateQuery, limit);
        if (sourced.length > 0) break;
      }
      await TaskModel.updateOne({ taskId }, { $set: { progress: 55 } });

      let created = 0;
      let linked = 0;
      for (const item of sourced) {
        const linkedinKey = normalizeLinkedInUrl(item.linkedinUrl);
        const existing = await CandidateModel.findOne({ linkedinKey }).select('_id jobIds');
        await CandidateModel.findOneAndUpdate(
          { linkedinKey },
          {
            $set: {
              name: item.name,
              headline: item.headline,
              location: item.location,
              linkedinUrl: item.linkedinUrl,
              profileUrl: item.profileUrl,
              summary: item.summary,
              skills: item.skills,
              experienceYears: item.experienceYears,
              source: provider.name,
              sourceData: item.sourceData
            },
            $addToSet: { jobIds: job._id },
            $setOnInsert: { status: 'sourced' }
          },
          { upsert: true, new: true, setDefaultsOnInsert: true }
        );
        if (existing) {
          if (!existing.jobIds.some((id) => id.equals(job._id))) linked += 1;
        } else {
          created += 1;
        }
      }

      const result = {
        provider: provider.name,
        queryUsed,
        attemptedQueries: searchQueries.length,
        discovered: sourced.length,
        created,
        linkedExisting: linked
      };
      await markCompleted(taskId, result);
      return result;
    } catch (error) {
      if (error instanceof ProviderRateLimitError) {
        const delayMs = Math.min(
          error.retryAfterSeconds * 1000,
          config.PROVIDER_MAX_RETRY_DELAY_MS
        );
        await TaskModel.updateOne(
          { taskId },
          {
            $set: {
              status: 'queued',
              progress: 0,
              error: `Provider rate limited. Retrying in ${Math.ceil(delayMs / 1000)} seconds.`
            }
          }
        );
        logger.warn(
          { taskId, retryAfterSeconds: error.retryAfterSeconds, delayMs },
          'Sourcing provider rate limited; pausing queue'
        );
        await sourcingWorker.rateLimit(delayMs);
        throw Worker.RateLimitError();
      }
      await markError(queueJob, taskId, error);
      throw error;
    }
  },
  {
    connection: bullConnectionOptions(),
    concurrency: 3,
    limiter: { max: 8, duration: 1000 }
  }
);

const outreachWorker = new Worker<OutreachJob>(
  OUTREACH_QUEUE,
  async (queueJob) => {
    const { taskId, candidateId, jobId } = queueJob.data;
    try {
      await markActive(taskId, queueJob.attemptsMade + 1);
      const [candidate, job, latestScore] = await Promise.all([
        CandidateModel.findById(candidateId),
        JobModel.findById(jobId),
        ScoreModel.findOne({ candidateId, jobId }).sort({ createdAt: -1 })
      ]);
      if (!candidate || !job) throw new Error('Candidate or job no longer exists');
      if (!candidate.jobIds.some((id) => id.equals(job._id))) {
        throw new Error('Candidate is not associated with this job');
      }

      const ai = getAiProvider();
      const body = await ai.generateOutreach({
        job: {
          title: job.title,
          description: job.description,
          requirements: job.requirements,
          skills: job.skills
        },
        candidate: {
          name: candidate.name,
          headline: candidate.headline,
          summary: candidate.summary,
          skills: candidate.skills,
          experienceYears: candidate.experienceYears
        },
        score: latestScore?.score
      });

      const message = await MessageModel.findOneAndUpdate(
        { taskId },
        {
          $set: {
            candidateId: candidate._id,
            jobId: job._id,
            body,
            status: 'sent',
            provider: 'gemini-outreach',
            attempts: queueJob.attemptsMade + 1,
            sentAt: new Date(),
            error: null
          }
        },
        { upsert: true, new: true, setDefaultsOnInsert: true }
      );
      candidate.status = 'contacted';
      await candidate.save();

      const result = { messageId: message.id, status: message.status };
      await markCompleted(taskId, result);
      return result;
    } catch (error) {
      await MessageModel.updateOne(
        { taskId },
        {
          $set: {
            status: 'failed',
            error: error instanceof Error ? error.message : 'Unknown worker error',
            attempts: queueJob.attemptsMade + 1
          }
        }
      );
      await markError(queueJob, taskId, error);
      throw error;
    }
  },
  {
    connection: bullConnectionOptions(),
    concurrency: 5,
    limiter: { max: 10, duration: 1000 }
  }
);

sourcingWorker.on('completed', (job) => logger.info({ jobId: job.id }, 'Sourcing job completed'));
sourcingWorker.on('failed', (job, error) =>
  logger.error({ jobId: job?.id, err: error }, 'Sourcing job failed')
);
outreachWorker.on('completed', (job) => logger.info({ jobId: job.id }, 'Outreach job completed'));
outreachWorker.on('failed', (job, error) =>
  logger.error({ jobId: job?.id, err: error }, 'Outreach job failed')
);

logger.info('Background workers started');

async function shutdown(signal: string) {
  logger.info({ signal }, 'Shutting down workers');
  await Promise.all([sourcingWorker.close(), outreachWorker.close()]);
  await disconnectDatabase();
  process.exit(0);
}

process.on('SIGTERM', () => void shutdown('SIGTERM'));
process.on('SIGINT', () => void shutdown('SIGINT'));
