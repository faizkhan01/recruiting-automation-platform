import { createHash } from 'node:crypto';
import type { HydratedDocument } from 'mongoose';
import { config } from '../config.js';
import { redis } from '../lib/redis.js';
import {
  CandidateModel,
  JobModel,
  ScoreModel,
  type Candidate,
  type Job
} from '../models/index.js';
import { getAiProvider, type ScoringResult } from './ai/index.js';

function inputFor(job: HydratedDocument<Job>, candidate: HydratedDocument<Candidate>) {
  return {
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
    }
  };
}

export async function scoreCandidate(candidateId: string, jobId: string) {
  const [candidate, job] = await Promise.all([
    CandidateModel.findById(candidateId),
    JobModel.findById(jobId)
  ]);
  if (!candidate || !job) return null;
  if (!candidate.jobIds.some((id) => id.equals(job._id))) return null;

  const ai = getAiProvider();
  const input = inputFor(job, candidate);
  const promptHash = createHash('sha256')
    .update(JSON.stringify({ input, provider: ai.name, model: ai.model }))
    .digest('hex');
  const cacheKey = `score:${candidate.id}:${job.id}:${promptHash}`;

  const cachedValue = await redis.get(cacheKey);
  if (cachedValue) {
    const result = JSON.parse(cachedValue) as ScoringResult;
    const record = await ScoreModel.findOneAndUpdate(
      { candidateId: candidate._id, jobId: job._id, promptHash },
      {
        $set: {
          ...result,
          model: ai.model,
          cached: true
        }
      },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );
    return { ...record.toObject(), cacheHit: true };
  }

  const result = await ai.scoreCandidate(input);
  await redis.set(cacheKey, JSON.stringify(result), 'EX', config.SCORE_CACHE_TTL_SECONDS);
  const record = await ScoreModel.findOneAndUpdate(
    { candidateId: candidate._id, jobId: job._id, promptHash },
    {
      $set: {
        ...result,
        model: ai.model,
        cached: false
      }
    },
    { upsert: true, new: true, setDefaultsOnInsert: true }
  );
  return { ...record.toObject(), cacheHit: false };
}

