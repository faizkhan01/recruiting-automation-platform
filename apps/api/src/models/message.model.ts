import { Schema, model, type Types } from 'mongoose';

export interface OutreachMessage {
  candidateId: Types.ObjectId;
  jobId: Types.ObjectId;
  taskId: string;
  body: string;
  status: 'pending' | 'sent' | 'failed';
  provider: string;
  attempts: number;
  error?: string;
  sentAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

const messageSchema = new Schema<OutreachMessage>(
  {
    candidateId: { type: Schema.Types.ObjectId, ref: 'Candidate', required: true, index: true },
    jobId: { type: Schema.Types.ObjectId, ref: 'Job', required: true, index: true },
    taskId: { type: String, required: true, index: true },
    body: { type: String, required: true },
    status: { type: String, enum: ['pending', 'sent', 'failed'], default: 'pending' },
    provider: { type: String, default: 'mock-email' },
    attempts: { type: Number, default: 0 },
    error: String,
    sentAt: Date
  },
  { timestamps: true }
);

export const MessageModel = model<OutreachMessage>('OutreachMessage', messageSchema);

