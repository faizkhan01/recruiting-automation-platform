import { Schema, model } from 'mongoose';

export type JobStatus = 'open' | 'closed';

export interface Job {
  title: string;
  department?: string;
  company?: string;
  location: string;
  employmentType: 'full-time' | 'part-time' | 'contract' | 'internship';
  description: string;
  requirements: string[];
  skills: string[];
  status: JobStatus;
  source: 'manual' | 'serper';
  sourceUrl?: string;
  sourceKey?: string;
  importedAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

const jobSchema = new Schema<Job>(
  {
    title: { type: String, required: true, trim: true, index: true },
    department: { type: String, trim: true },
    company: { type: String, trim: true },
    location: { type: String, required: true, trim: true },
    employmentType: {
      type: String,
      enum: ['full-time', 'part-time', 'contract', 'internship'],
      default: 'full-time'
    },
    description: { type: String, required: true, trim: true },
    requirements: [{ type: String, trim: true }],
    skills: [{ type: String, trim: true }],
    status: { type: String, enum: ['open', 'closed'], default: 'open', index: true },
    source: { type: String, enum: ['manual', 'serper'], default: 'manual', index: true },
    sourceUrl: { type: String, trim: true },
    sourceKey: { type: String, trim: true },
    importedAt: Date
  },
  { timestamps: true }
);

jobSchema.index({ sourceKey: 1 }, { unique: true, sparse: true });

export const JobModel = model<Job>('Job', jobSchema);
