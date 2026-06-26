import { Schema, model, type Types } from 'mongoose';

export interface CandidateScore {
  candidateId: Types.ObjectId;
  jobId: Types.ObjectId;
  score: number;
  reasoning: string;
  strengths: string[];
  gaps: string[];
  recommendation: 'strong_match' | 'potential_match' | 'weak_match';
  promptHash: string;
  model: string;
  cached: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const scoreSchema = new Schema<CandidateScore>(
  {
    candidateId: { type: Schema.Types.ObjectId, ref: 'Candidate', required: true, index: true },
    jobId: { type: Schema.Types.ObjectId, ref: 'Job', required: true, index: true },
    score: { type: Number, required: true, min: 0, max: 100 },
    reasoning: { type: String, required: true },
    strengths: [{ type: String }],
    gaps: [{ type: String }],
    recommendation: {
      type: String,
      enum: ['strong_match', 'potential_match', 'weak_match'],
      required: true
    },
    promptHash: { type: String, required: true },
    model: { type: String, required: true },
    cached: { type: Boolean, default: false }
  },
  { timestamps: true }
);

scoreSchema.index({ candidateId: 1, jobId: 1, promptHash: 1 }, { unique: true });

export const ScoreModel = model<CandidateScore>('CandidateScore', scoreSchema);

