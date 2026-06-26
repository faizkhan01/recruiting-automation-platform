export interface SourcedCandidate {
  name: string;
  headline?: string;
  location?: string;
  linkedinUrl: string;
  profileUrl?: string;
  summary?: string;
  skills: string[];
  experienceYears?: number;
  sourceData?: Record<string, unknown>;
}

export interface SourcingProvider {
  readonly name: string;
  search(query: string, limit: number): Promise<SourcedCandidate[]>;
}

export class ProviderRateLimitError extends AppError {
  readonly retryAfterSeconds: number;

  constructor(message: string, retryAfterSeconds = 60) {
    super(429, message, {
      code: 'PROVIDER_RATE_LIMITED',
      retryAfterSeconds
    });
    this.retryAfterSeconds = retryAfterSeconds;
  }
}
import { AppError } from '../../lib/http.js';

