import { Router } from 'express';
import { AppError, asyncHandler, success } from '../lib/http.js';
import { TaskModel } from '../models/index.js';

const router = Router();

router.get(
  '/:taskId',
  asyncHandler(async (req, res) => {
    const task = await TaskModel.findOne({ taskId: req.params.taskId }).lean();
    if (!task) throw new AppError(404, 'Task not found');
    res.json(success(task));
  })
);

export const tasksRouter = router;

