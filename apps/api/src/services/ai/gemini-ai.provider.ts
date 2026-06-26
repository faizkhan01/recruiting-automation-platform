import { GoogleGenAI } from '@google/genai';
import { z } from 'zod';
import { config } from '../../config.js';
import { AppError } from '../../lib/http.js';
import { logger } from '../../lib/logger.js';
import { boundedRetryDelay, parseGoogleRetryDelay } from '../../lib/provider-retry.js';
import type {
  AiProvider,
  IntentResult,
  OutreachInput,
  ScoringInput,
  ScoringResult
} from './ai.types.js';

const scoreSchema = z.object({
  score: z.number().min(0).max(100),
  reasoning: z.string().min(1),
  strengths: z.array(z.string()).max(8),
  gaps: z.array(z.string()).max(8),
  recommendation: z.enum(['strong_match', 'potential_match', 'weak_match'])
});

const intentSchema = z.object({
  intent: z.enum(['interested', 'not_interested']),
  confidence: z.number().min(0).max(1),
  reasoning: z.string().min(1)
});

function parseJson(text: string): unknown {
  const cleaned = text.replace(/^```json\s*/i, '').replace(/\s*```$/i, '').trim();
  return JSON.parse(cleaned);
}

function providerStatus(error: unknown): number | undefined {
  if (typeof error === 'object' && error && 'status' in error) {
    const status = Number((error as { status?: unknown }).status);
    if (Number.isInteger(status)) return status;
  }
  const message = error instanceof Error ? error.message : String(error);
  const match = message.match(/"code"\s*:\s*(\d{3})/);
  return match ? Number(match[1]) : undefined;
}

const sleep = (milliseconds: number) =>
  new Promise((resolve) => setTimeout(resolve, milliseconds));

export class GeminiAiProvider implements AiProvider {
  readonly name = 'gemini';
  readonly model = config.GEMINI_MODEL;
  private readonly client = new GoogleGenAI({ apiKey: config.GEMINI_API_KEY! });

  private async generate(prompt: string): Promise<string> {
    let lastError: unknown;
    for (let attempt = 1; attempt <= 3; attempt += 1) {
      try {
        const response = await this.client.models.generateContent({
          model: this.model,
          contents: prompt,
          config: {
            temperature: 0.2
          }
        });
        const text = response.text;
        if (!text) throw new Error('Gemini returned an empty response');
        return text;
      } catch (error) {
        lastError = error;
        const status = providerStatus(error);
        const requestedDelay = parseGoogleRetryDelay(error);
        const retryable = status === 503 || (status === 429 && requestedDelay !== undefined);
        if (!retryable || attempt === 3) break;
        const delayMs = boundedRetryDelay(requestedDelay, 500, attempt);
        logger.warn(
          { provider: this.name, model: this.model, attempt, status, delayMs },
          'Retrying Gemini after provider backoff'
        );
        await sleep(delayMs);
      }
    }

    const status = providerStatus(lastError);
    if (status === 429) {
      const retryAfterMs = parseGoogleRetryDelay(lastError);
      throw new AppError(
        503,
        'Gemini quota is currently exhausted. Please wait for the quota window to reset or enable billing.',
        {
          code: 'AI_QUOTA_EXHAUSTED',
          retryAfterSeconds: retryAfterMs ? Math.ceil(retryAfterMs / 1000) : undefined
        }
      );
    }
    if (status === 503) {
      throw new AppError(503, 'Gemini is temporarily unavailable after multiple retries.');
    }
    throw new AppError(502, 'Gemini could not complete the request.');
  }

  async scoreCandidate(input: ScoringInput): Promise<ScoringResult> {
    const text = await this.generate(
      `Act as a senior technical recruiter. Compare this candidate to the job. Return only valid JSON with keys score (0-100), reasoning, strengths (string array), gaps (string array), recommendation ("strong_match", "potential_match", or "weak_match"). Be evidence-based and do not infer protected traits.\n\n${JSON.stringify(input)}`
    );
    return scoreSchema.parse(parseJson(text));
  }

  async generateOutreach(input: OutreachInput): Promise<string> {
    return this.generate(
      `Write a concise, warm recruiting outreach message under 110 words. Personalize it using only supplied professional facts. Mention the role and end with a low-pressure call to action. Return only the message text.\n\n${JSON.stringify(input)}`
    );
  }

  async classifyIntent(message: string): Promise<IntentResult> {
    const text = await this.generate(
      `Classify this candidate's recruiting response. Return only valid JSON with intent ("interested" or "not_interested"), confidence (0-1), and brief reasoning. If ambiguous, choose the most likely intent and use lower confidence.\n\nResponse: ${JSON.stringify(message)}`
    );
    return intentSchema.parse(parseJson(text));
  }
}
