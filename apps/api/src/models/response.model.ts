import { Schema, model, type Types } from 'mongoose';

export interface CandidateResponse {
  candidateId: Types.ObjectId;
  message: string;
  intent: 'interested' | 'not_interested';
  confidence: number;
  reasoning: string;
  schedulingLink?: string;
  createdAt: Date;
  updatedAt: Date;
}

const responseSchema = new Schema<CandidateResponse>(
  {
    candidateId: { type: Schema.Types.ObjectId, ref: 'Candidate', required: true, index: true },
    message: { type: String, required: true },
    intent: { type: String, enum: ['interested', 'not_interested'], required: true },
    confidence: { type: Number, required: true, min: 0, max: 1 },
    reasoning: { type: String, required: true },
    schedulingLink: String
  },
  { timestamps: true }
);

export const ResponseModel = model<CandidateResponse>('CandidateResponse', responseSchema);

