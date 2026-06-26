import type {
  AiProvider,
  IntentResult,
  OutreachInput,
  ScoringInput,
  ScoringResult
} from './ai.types.js';

function normalized(values: string[]): Set<string> {
  return new Set(values.map((value) => value.toLowerCase().trim()));
}

export class MockAiProvider implements AiProvider {
  readonly name = 'mock';
  readonly model = 'deterministic-v1';

  async scoreCandidate(input: ScoringInput): Promise<ScoringResult> {
    const desired = normalized([...input.job.skills, ...input.job.requirements]);
    const candidateText = [
      ...input.candidate.skills,
      input.candidate.headline ?? '',
      input.candidate.summary ?? ''
    ]
      .join(' ')
      .toLowerCase();
    const matches = [...desired].filter((term) => candidateText.includes(term));
    const ratio = desired.size === 0 ? 0.65 : matches.length / desired.size;
    const experienceBonus = Math.min((input.candidate.experienceYears ?? 0) * 2, 15);
    const score = Math.max(20, Math.min(98, Math.round(35 + ratio * 50 + experienceBonus)));
    const gaps = [...desired].filter((term) => !candidateText.includes(term)).slice(0, 4);

    return {
      score,
      reasoning: `${input.candidate.name} matches ${matches.length} of ${desired.size} normalized job criteria, with experience factored into the result.`,
      strengths: matches.slice(0, 5).map((term) => `Demonstrated alignment with ${term}`),
      gaps: gaps.map((term) => `No clear evidence of ${term}`),
      recommendation:
        score >= 80 ? 'strong_match' : score >= 55 ? 'potential_match' : 'weak_match'
    };
  }

  async generateOutreach(input: OutreachInput): Promise<string> {
    const skill = input.candidate.skills[0] ?? input.job.skills[0] ?? 'your background';
    return `Hi ${input.candidate.name}, I came across your profile and was impressed by your experience with ${skill}. We are hiring a ${input.job.title}, and your background looks relevant to the work our team is doing. Would you be open to a brief conversation this week?`;
  }

  async classifyIntent(message: string): Promise<IntentResult> {
    const negative = /\b(no|not interested|decline|stop|unsubscribe|pass)\b/i.test(message);
    const positive = /\b(yes|interested|sure|love to|sounds good|let'?s talk|available)\b/i.test(
      message
    );
    const intent = negative && !positive ? 'not_interested' : 'interested';
    return {
      intent,
      confidence: positive || negative ? 0.94 : 0.65,
      reasoning: `Detected ${intent === 'interested' ? 'positive' : 'negative'} recruiting intent in the response.`
    };
  }
}

