import { randomUUID } from 'node:crypto';
import { Router } from 'express';
import { Types } from 'mongoose';
import { z } from 'zod';
import { AppError, asyncHandler, success } from '../lib/http.js';
import {
  CandidateModel,
  JobModel,
  MessageModel,
  ResponseModel,
  ScoreModel,
  TaskModel
} from '../models/index.js';
import { sourcingQueue } from '../queues/queues.js';
import { externalSearchApiLimiter } from '../lib/rate-limit.js';
import {
  normalizeExternalJobUrl,
  SerperJobSearchService
} from '../services/external-jobs/serper-job-search.service.js';
import { buildCandidateSearchQueries } from '../services/sourcing/query-builder.js';

const router = Router();
const externalJobSearch = new SerperJobSearchService();

const createJobSchema = z.object({
  title: z.string().trim().min(2).max(120),
  department: z.string().trim().max(100).optional(),
  location: z.string().trim().min(2).max(120),
  employmentType: z
    .enum(['full-time', 'part-time', 'contract', 'internship'])
    .default('full-time'),
  description: z.string().trim().min(20).max(10000),
  requirements: z.array(z.string().trim().min(1)).max(30).default([]),
  skills: z.array(z.string().trim().min(1)).max(30).default([])
});

const updateJobSchema = createJobSchema
  .partial()
  .extend({
    status: z.enum(['open', 'closed']).optional()
  })
  .refine((input) => Object.keys(input).length > 0, {
    message: 'At least one job field is required'
  });

const sourcingSchema = z.object({
  query: z.string().trim().min(2).max(300).optional(),
  limit: z.coerce.number().int().min(1).max(25).default(10)
});

const externalSearchSchema = z.object({
  query: z.string().trim().min(2).max(200),
  location: z.string().trim().max(120).optional(),
  limit: z.coerce.number().int().min(1).max(20).default(10)
});

const importExternalJobSchema = z.object({
  title: z.string().trim().min(2).max(200),
  company: z.string().trim().max(160).optional(),
  location: z.string().trim().max(160).default('Not specified'),
  description: z.string().trim().min(10).max(10000),
  sourceUrl: z.string().url().max(2000),
  employmentType: z
    .enum(['full-time', 'part-time', 'contract', 'internship'])
    .default('full-time'),
  requirements: z.array(z.string().trim().min(1)).max(30).default([]),
  skills: z.array(z.string().trim().min(1)).max(30).default([])
});

router.get(
  '/external/search',
  externalSearchApiLimiter,
  asyncHandler(async (req, res) => {
    const input = externalSearchSchema.parse(req.query);
    const jobs = await externalJobSearch.search(input.query, input.location, input.limit);
    res.json(success(jobs));
  })
);

router.post(
  '/import-external',
  asyncHandler(async (req, res) => {
    const input = importExternalJobSchema.parse(req.body);
    const sourceKey = normalizeExternalJobUrl(input.sourceUrl);
    const existing = await JobModel.findOne({ sourceKey }).lean();
    if (existing) {
      throw new AppError(409, 'This external job has already been imported.', {
        jobId: existing._id
      });
    }

    const job = await JobModel.create({
      title: input.title,
      company: input.company,
      department: input.company,
      location: input.location || 'Not specified',
      employmentType: input.employmentType,
      description:
        input.description.length >= 20
          ? input.description
          : `${input.description} View the original listing for complete role details.`,
      requirements: input.requirements,
      skills: input.skills,
      source: 'serper',
      sourceUrl: input.sourceUrl,
      sourceKey,
      importedAt: new Date()
    });
    res.status(201).json(success(job));
  })
);

router.post(
  '/',
  asyncHandler(async (req, res) => {
    const input = createJobSchema.parse(req.body);
    const job = await JobModel.create(input);
    res.status(201).json(success(job));
  })
);

router.get(
  '/',
  asyncHandler(async (_req, res) => {
    const jobs = await JobModel.find().sort({ createdAt: -1 }).lean();
    res.json(success(jobs));
  })
);

router.get(
  '/:id',
  asyncHandler(async (req, res) => {
    const id = String(req.params.id);
    if (!Types.ObjectId.isValid(id)) throw new AppError(400, 'Invalid job id');
    const job = await JobModel.findById(id).lean();
    if (!job) throw new AppError(404, 'Job not found');
    res.json(success(job));
  })
);

router.patch(
  '/:id',
  asyncHandler(async (req, res) => {
    const id = String(req.params.id);
    if (!Types.ObjectId.isValid(id)) throw new AppError(400, 'Invalid job id');
    const job = await JobModel.findById(id);
    if (!job) throw new AppError(404, 'Job not found');
    if (job.source && job.source !== 'manual') {
      throw new AppError(409, 'Imported jobs are read-only. Create a manual copy to edit it.');
    }

    const input = updateJobSchema.parse(req.body ?? {});
    job.set(input);
    job.source = 'manual';
    await job.save();
    res.json(success(job));
  })
);

router.delete(
  '/:id',
  asyncHandler(async (req, res) => {
    const id = String(req.params.id);
    if (!Types.ObjectId.isValid(id)) throw new AppError(400, 'Invalid job id');
    const job = await JobModel.findById(id);
    if (!job) throw new AppError(404, 'Job not found');
    if (job.source && job.source !== 'manual') {
      throw new AppError(409, 'Imported jobs cannot be deleted from the manual-job controls.');
    }

    const activeTask = await TaskModel.exists({
      jobId: job._id,
      status: { $in: ['queued', 'active'] }
    });
    if (activeTask) {
      throw new AppError(409, 'Wait for active background tasks to finish before deleting this job.');
    }

    const candidates = await CandidateModel.find({ jobIds: job._id }).select('_id jobIds').lean();
    const orphanCandidateIds = candidates
      .filter((candidate) => candidate.jobIds.length === 1)
      .map((candidate) => candidate._id);

    await Promise.all([
      ScoreModel.deleteMany({ jobId: job._id }),
      MessageModel.deleteMany({ jobId: job._id }),
      TaskModel.deleteMany({ jobId: job._id }),
      CandidateModel.updateMany({ jobIds: job._id }, { $pull: { jobIds: job._id } })
    ]);
    if (orphanCandidateIds.length > 0) {
      await Promise.all([
        ResponseModel.deleteMany({ candidateId: { $in: orphanCandidateIds } }),
        CandidateModel.deleteMany({ _id: { $in: orphanCandidateIds } })
      ]);
    }
    await job.deleteOne();

    res.json(
      success({
        deletedJobId: id,
        detachedCandidates: candidates.length - orphanCandidateIds.length,
        deletedOrphanCandidates: orphanCandidateIds.length
      })
    );
  })
);

router.post(
  '/:jobId/sourcing-tasks',
  asyncHandler(async (req, res) => {
    const jobId = String(req.params.jobId);
    if (!Types.ObjectId.isValid(jobId)) throw new AppError(400, 'Invalid job id');
    const job = await JobModel.findById(jobId);
    if (!job) throw new AppError(404, 'Job not found');
    if (job.status !== 'open') throw new AppError(409, 'Cannot source for a closed job');

    const input = sourcingSchema.parse(req.body ?? {});
    const queries = input.query ? [input.query] : buildCandidateSearchQueries(job);
    const taskId = `task_${randomUUID().replaceAll('-', '')}`;
    await TaskModel.create({
      taskId,
      type: 'sourcing',
      status: 'queued',
      jobId: job._id
    });
    await sourcingQueue.add(
      'source-candidates',
      { taskId, jobId: job.id, queries, limit: input.limit },
      { jobId: taskId }
    );
    res.status(202).json(success({ taskId, status: 'queued' }));
  })
);

router.get(
  '/:jobId/candidates',
  asyncHandler(async (req, res) => {
    const jobId = String(req.params.jobId);
    if (!Types.ObjectId.isValid(jobId)) throw new AppError(400, 'Invalid job id');
    const candidates = await CandidateModel.find({ jobIds: jobId })
      .sort({ createdAt: -1 })
      .lean();
    const ids = candidates.map((candidate) => candidate._id);
    const scores = await ScoreModel.find({
      jobId,
      candidateId: { $in: ids }
    })
      .sort({ createdAt: -1 })
      .lean();
    const latestScores = new Map<string, (typeof scores)[number]>();
    for (const score of scores) {
      const key = score.candidateId.toString();
      if (!latestScores.has(key)) latestScores.set(key, score);
    }
    res.json(
      success(
        candidates.map((candidate) => ({
          ...candidate,
          latestScore: latestScores.get(candidate._id.toString()) ?? null
        }))
      )
    );
  })
);

export const jobsRouter = router;
