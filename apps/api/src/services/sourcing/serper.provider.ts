import { config } from '../../config.js';
import { parseRetryAfter } from '../../lib/provider-retry.js';
import {
  ProviderRateLimitError,
  type SourcedCandidate,
  type SourcingProvider
} from './sourcing.types.js';

interface SerperResult {
  title?: string;
  link?: string;
  snippet?: string;
}

function candidateName(title: string): string {
  return title.split(/[-|•]/)[0]?.trim() || 'LinkedIn Candidate';
}

export class SerperSourcingProvider implements SourcingProvider {
  readonly name = 'serper';

  async search(query: string, limit: number): Promise<SourcedCandidate[]> {
    const response = await fetch('https://google.serper.dev/search', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-API-KEY': config.SERPER_API_KEY!
      },
      body: JSON.stringify({
        q: `site:linkedin.com/in ${query}`,
        num: Math.min(limit, 20)
      })
    });

    if (response.status === 429) {
      const retryAfterMs = parseRetryAfter(response.headers.get('retry-after'));
      throw new ProviderRateLimitError(
        'Serper rate limit reached',
        Math.max(1, Math.ceil((retryAfterMs ?? 60000) / 1000))
      );
    }
    if (!response.ok) {
      throw new Error(`Serper request failed with status ${response.status}`);
    }

    const payload = (await response.json()) as { organic?: SerperResult[] };
    return (payload.organic ?? [])
      .filter((result): result is Required<Pick<SerperResult, 'title' | 'link'>> & SerperResult =>
        Boolean(result.title && result.link?.includes('linkedin.com/in/'))
      )
      .slice(0, limit)
      .map((result) => ({
        name: candidateName(result.title),
        headline: result.title,
        linkedinUrl: result.link,
        profileUrl: result.link,
        summary: result.snippet,
        skills: [],
        sourceData: {
          title: result.title,
          link: result.link,
          snippet: result.snippet
        }
      }));
  }
}
