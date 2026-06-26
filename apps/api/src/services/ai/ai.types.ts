export interface ScoringInput {
  job: {
    title: string;
    description: string;
    requirements: string[];
    skills: string[];
  };
  candidate: {
    name: string;
    headline?: string;
    summary?: string;
    skills: string[];
    experienceYears?: number;
  };
}

export interface ScoringResult {
  score: number;
  reasoning: string;
  strengths: string[];
  gaps: string[];
  recommendation: 'strong_match' | 'potential_match' | 'weak_match';
}

export interface OutreachInput extends ScoringInput {
  score?: number;
}

export interface IntentResult {
  intent: 'interested' | 'not_interested';
  confidence: number;
  reasoning: string;
}

export interface AiProvider {
  readonly name: string;
  readonly model: string;
  scoreCandidate(input: ScoringInput): Promise<ScoringResult>;
  generateOutreach(input: OutreachInput): Promise<string>;
  classifyIntent(message: string): Promise<IntentResult>;
}

