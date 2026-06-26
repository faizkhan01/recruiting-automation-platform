import { Schema, model, type Types } from 'mongoose';

export type TaskType = 'sourcing' | 'outreach';
export type TaskStatus = 'queued' | 'active' | 'completed' | 'failed';

export interface AutomationTask {
  taskId: string;
  type: TaskType;
  status: TaskStatus;
  jobId?: Types.ObjectId;
  candidateId?: Types.ObjectId;
  progress: number;
  result?: Record<string, unknown>;
  error?: string;
  attempts: number;
  startedAt?: Date;
  completedAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

const taskSchema = new Schema<AutomationTask>(
  {
    taskId: { type: String, required: true, unique: true, index: true },
    type: { type: String, enum: ['sourcing', 'outreach'], required: true },
    status: {
      type: String,
      enum: ['queued', 'active', 'completed', 'failed'],
      default: 'queued',
      index: true
    },
    jobId: { type: Schema.Types.ObjectId, ref: 'Job', index: true },
    candidateId: { type: Schema.Types.ObjectId, ref: 'Candidate', index: true },
    progress: { type: Number, min: 0, max: 100, default: 0 },
    result: { type: Schema.Types.Mixed },
    error: String,
    attempts: { type: Number, default: 0 },
    startedAt: Date,
    completedAt: Date
  },
  { timestamps: true }
);

export const TaskModel = model<AutomationTask>('AutomationTask', taskSchema);

