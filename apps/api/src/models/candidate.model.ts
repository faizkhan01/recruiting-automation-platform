import { Schema, model, type Types } from 'mongoose';

export type CandidateStatus =
  | 'sourced'
  | 'contacted'
  | 'interested'
  | 'not_interested';

export interface Candidate {
  jobIds: Types.ObjectId[];
  name: string;
  headline?: string;
  location?: string;
  linkedinUrl: string;
  linkedinKey: string;
  profileUrl?: string;
  summary?: string;
  skills: string[];
  experienceYears?: number;
  source: string;
  sourceData?: Record<string, unknown>;
  status: CandidateStatus;
  createdAt: Date;
  updatedAt: Date;
}

const candidateSchema = new Schema<Candidate>(
  {
    jobIds: [{ type: Schema.Types.ObjectId, ref: 'Job', required: true, index: true }],
    name: { type: String, required: true, trim: true },
    headline: { type: String, trim: true },
    location: { type: String, trim: true },
    linkedinUrl: { type: String, required: true, trim: true },
    linkedinKey: { type: String, required: true, unique: true, index: true },
    profileUrl: { type: String, trim: true },
    summary: { type: String, trim: true },
    skills: [{ type: String, trim: true }],
    experienceYears: { type: Number, min: 0, max: 80 },
    source: { type: String, required: true },
    sourceData: { type: Schema.Types.Mixed },
    status: {
      type: String,
      enum: ['sourced', 'contacted', 'interested', 'not_interested'],
      default: 'sourced',
      index: true
    }
  },
  { timestamps: true }
);

export const CandidateModel = model<Candidate>('Candidate', candidateSchema);

