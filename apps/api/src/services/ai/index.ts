import { config } from '../../config.js';
import type { AiProvider } from './ai.types.js';
import { GeminiAiProvider } from './gemini-ai.provider.js';
import { MockAiProvider } from './mock-ai.provider.js';

let instance: AiProvider | undefined;

export function getAiProvider(): AiProvider {
  instance ??= config.AI_PROVIDER === 'gemini' ? new GeminiAiProvider() : new MockAiProvider();
  return instance;
}

export * from './ai.types.js';

