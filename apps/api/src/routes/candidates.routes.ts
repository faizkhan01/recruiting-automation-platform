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
import { outreachQueue } from '../queues/queues.js';
import { aiApiLimiter } from '../lib/rate-limit.js';
import { getAiProvider } from '../services/ai/index.js';
import { scoreCandidate } from '../services/scoring.service.js';

const router = Router();

router.get(
  '/',
  asyncHandler(async (req, res) => {
    const filter =
      typeof req.query.jobId === 'string' && Types.ObjectId.isValid(req.query.jobId)
        ? { jobIds: req.query.jobId }
        : {};
    const candidates = await CandidateModel.find(filter).sort({ createdAt: -1 }).limit(200).lean();
    const scores = await ScoreModel.find({
      candidateId: { $in: candidates.map((candidate) => candidate._id) }
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

router.get(
  '/:id',
  asyncHandler(async (req, res) => {
    const candidateId = String(req.params.id);
    if (!Types.ObjectId.isValid(candidateId)) throw new AppError(400, 'Invalid candidate id');
    const candidate = await CandidateModel.findById(candidateId).lean();
    if (!candidate) throw new AppError(404, 'Candidate not found');
    const [jobs, scores, messages, responses] = await Promise.all([
      JobModel.find({ _id: { $in: candidate.jobIds } }).lean(),
      ScoreModel.find({ candidateId: candidate._id }).sort({ createdAt: -1 }).lean(),
      MessageModel.find({ candidateId: candidate._id }).sort({ createdAt: -1 }).lean(),
      ResponseModel.find({ candidateId: candidate._id }).sort({ createdAt: -1 }).lean()
    ]);
    res.json(success({ ...candidate, jobs, scores, messages, responses }));
  })
);

router.post(
  '/:id/scores',
  aiApiLimiter,
  asyncHandler(async (req, res) => {
    const candidateId = String(req.params.id);
    if (!Types.ObjectId.isValid(candidateId)) throw new AppError(400, 'Invalid candidate id');
    const input = z.object({ jobId: z.string() }).parse(req.body ?? {});
    if (!Types.ObjectId.isValid(input.jobId)) throw new AppError(400, 'Invalid job id');
    const scored = await scoreCandidate(candidateId, input.jobId);
    if (!scored) throw new AppError(404, 'Candidate or job association not found');
    res.json(success(scored));
  })
);

router.post(
  '/:id/outreach',
  asyncHandler(async (req, res) => {
    const candidateId = String(req.params.id);
    if (!Types.ObjectId.isValid(candidateId)) throw new AppError(400, 'Invalid candidate id');
    const input = z.object({ jobId: z.string() }).parse(req.body ?? {});
    if (!Types.ObjectId.isValid(input.jobId)) throw new AppError(400, 'Invalid job id');
    const candidate = await CandidateModel.findOne({ _id: candidateId, jobIds: input.jobId });
    if (!candidate) throw new AppError(404, 'Candidate or job association not found');

    const taskId = `task_${randomUUID().replaceAll('-', '')}`;
    await TaskModel.create({
      taskId,
      type: 'outreach',
      status: 'queued',
      candidateId: candidate._id,
      jobId: input.jobId
    });
    await MessageModel.create({
      taskId,
      candidateId: candidate._id,
      jobId: input.jobId,
      body: 'Generating personalized outreach…',
      status: 'pending',
      provider: 'gemini-outreach',
      attempts: 0
    });
    await outreachQueue.add(
      'send-outreach',
      { taskId, candidateId: candidate.id, jobId: input.jobId },
      { jobId: taskId }
    );
    res.status(202).json(success({ taskId, status: 'queued' }));
  })
);

router.post(
  '/:id/responses',
  aiApiLimiter,
  asyncHandler(async (req, res) => {
    const candidateId = String(req.params.id);
    if (!Types.ObjectId.isValid(candidateId)) throw new AppError(400, 'Invalid candidate id');
    const input = z.object({ message: z.string().trim().min(1).max(5000) }).parse(req.body ?? {});
    const candidate = await CandidateModel.findById(candidateId);
    if (!candidate) throw new AppError(404, 'Candidate not found');

    const result = await getAiProvider().classifyIntent(input.message);
    const schedulingLink =
      result.intent === 'interested'
        ? `https://cal.example.test/interview/${candidate.id}/${randomUUID().slice(0, 8)}`
        : undefined;
    candidate.status = result.intent;
    await candidate.save();
    const response = await ResponseModel.create({
      candidateId: candidate._id,
      message: input.message,
      ...result,
      schedulingLink
    });
    res.status(201).json(success(response));
  })
);

export const candidatesRouter = router;
