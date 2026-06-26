import { config } from '../../config.js';
import { AppError } from '../../lib/http.js';
import { parseRetryAfter } from '../../lib/provider-retry.js';
import { ProviderRateLimitError } from '../sourcing/sourcing.types.js';

interface SerperOrganicResult {
  title?: string;
  link?: string;
  snippet?: string;
  date?: string;
}

export interface ExternalJobResult {
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

export function normalizeExternalJobUrl(value: string): string {
  const url = new URL(value);
  const originalHost = url.hostname.toLowerCase().replace(/^www\./, '');
  const host = originalHost.endsWith('linkedin.com') ? 'linkedin.com' : originalHost;
  return `${host}${url.pathname.replace(/\/+$/, '')}`;
}

function sourceName(value: string): string {
  const hostname = new URL(value).hostname.replace(/^www\./, '');
  if (hostname.includes('linkedin.com')) return 'LinkedIn';
  if (hostname.includes('indeed.com')) return 'Indeed';
  if (hostname.includes('glassdoor.com')) return 'Glassdoor';
  return hostname;
}

export function parseExternalJobTitle(value: string): {
  title: string;
  company?: string;
  location?: string;
} {
  const hiringMatch = value.match(/^(.+?)\s+hiring\s+(.+?)\s+in\s+(.+?)(?:\s*[-|]\s*LinkedIn)?$/i);
  if (hiringMatch) {
    return {
      company: hiringMatch[1]?.trim(),
      title: hiringMatch[2]?.trim() || 'Imported job',
      location: hiringMatch[3]?.trim()
    };
  }
  const cleaned = value
    .replace(/\s*[|–—-]\s*LinkedIn$/i, '')
    .replace(/\s*[|–—-]\s*Indeed.*$/i, '')
    .trim();
  const parts = cleaned
    .split(/\s+[|–—]\s+|\s+-\s+/)
    .map((part) => part.trim())
    .filter(Boolean);
  return {
    title: parts[0] || cleaned || 'Imported job',
    company: parts[1],
    location: parts[2]
  };
}

export class SerperJobSearchService {
  async search(
    query: string,
    location: string | undefined,
    limit: number
  ): Promise<ExternalJobResult[]> {
    if (!config.SERPER_API_KEY) {
      throw new AppError(503, 'SERPER_API_KEY is required to search external jobs.');
    }

    const response = await fetch('https://google.serper.dev/search', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-API-KEY': config.SERPER_API_KEY
      },
      body: JSON.stringify({
        q: ['site:linkedin.com/jobs/view', query, location].filter(Boolean).join(' '),
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
      throw new AppError(502, `Serper job search failed with status ${response.status}.`);
    }

    const payload = (await response.json()) as { organic?: SerperOrganicResult[] };
    const seen = new Set<string>();
    return (payload.organic ?? [])
      .filter((result): result is SerperOrganicResult & { title: string; link: string } =>
        Boolean(result.title && result.link && /linkedin\.com\/jobs\/view\//i.test(result.link))
      )
      .flatMap((result) => {
        const externalId = normalizeExternalJobUrl(result.link);
        if (seen.has(externalId)) return [];
        seen.add(externalId);
        const parsed = parseExternalJobTitle(result.title);
        return [{
          externalId,
          title: parsed.title,
          company: parsed.company,
          location: parsed.location || location,
          description:
            result.snippet?.trim() ||
            `Imported public job listing for ${parsed.title}${parsed.company ? ` at ${parsed.company}` : ''}.`,
          source: 'serper' as const,
          sourceName: sourceName(result.link),
          sourceUrl: result.link,
          postedAt: result.date
        }];
      })
      .slice(0, limit);
  }
}
