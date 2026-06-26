export interface Job {
  _id: string;
  title: string;
  department?: string;
  company?: string;
  location: string;
  employmentType: string;
  description: string;
  requirements: string[];
  skills: string[];
  status: 'open' | 'closed';
  source?: 'manual' | 'serper';
  sourceUrl?: string;
  createdAt: string;
}

export interface ExternalJob {
  externalId: string;
  title: string;
  company?: string;
  location?: string;
  description: string;
  source: 'serper';
  sourceName: string;
  sourceUrl: string;
  postedAt?: string;
}

export interface Score {
  _id: string;
  jobId: string;
  score: number;
  reasoning: string;
  strengths: string[];
  gaps: string[];
  recommendation: string;
  cacheHit?: boolean;
  createdAt: string;
}

export interface Message {
  _id: string;
  body: string;
  status: string;
  createdAt: string;
}

export interface Candidate {
  _id: string;
  jobIds: string[];
  name: string;
  headline?: string;
  location?: string;
  linkedinUrl: string;
  summary?: string;
  skills: string[];
  experienceYears?: number;
  source: string;
  status: string;
  latestScore?: Score | null;
  jobs?: Job[];
  scores?: Score[];
  messages?: Message[];
  responses?: Array<{
    _id: string;
    message: string;
    intent: string;
    schedulingLink?: string;
    createdAt: string;
  }>;
}

export interface Task {
  taskId: string;
  type: string;
  status: 'queued' | 'active' | 'completed' | 'failed';
  progress: number;
  result?: Record<string, unknown>;
  error?: string;
}
