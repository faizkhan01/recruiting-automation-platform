import { describe, expect, it } from 'vitest';
import { MockAiProvider } from '../src/services/ai/mock-ai.provider.js';
import { normalizeLinkedInUrl } from '../src/services/candidate.service.js';
import {
  boundedRetryDelay,
  parseGoogleRetryDelay,
  parseRetryAfter
} from '../src/lib/provider-retry.js';
import {
  normalizeExternalJobUrl,
  parseExternalJobTitle
} from '../src/services/external-jobs/serper-job-search.service.js';
import { DemoSourcingProvider } from '../src/services/sourcing/demo.provider.js';
import { buildCandidateSearchQueries } from '../src/services/sourcing/query-builder.js';

describe('candidate normalization', () => {
  it('deduplicates LinkedIn URL variants', () => {
    expect(normalizeLinkedInUrl('https://www.linkedin.com/in/Jane-Doe/')).toBe(
      'linkedin.com/in/jane-doe'
    );
    expect(normalizeLinkedInUrl('https://linkedin.com/in/jane-doe?trk=public')).toBe(
      'linkedin.com/in/jane-doe'
    );
    expect(normalizeLinkedInUrl('https://uk.linkedin.com/in/Jane-Doe/')).toBe(
      'linkedin.com/in/jane-doe'
    );
  });
});

describe('provider retry metadata', () => {
  it('parses Retry-After seconds and HTTP dates', () => {
    expect(parseRetryAfter('12', 0)).toBe(12000);
    expect(parseRetryAfter('Thu, 01 Jan 1970 00:00:20 GMT', 5000)).toBe(15000);
  });

  it('extracts Google RetryInfo delay metadata', () => {
    const error = new Error(
      JSON.stringify({
        error: {
          code: 429,
          details: [{ '@type': 'google.rpc.RetryInfo', retryDelay: '49.5s' }]
        }
      })
    );
    expect(parseGoogleRetryDelay(error)).toBe(49500);
  });

  it('caps provider-requested delays at the configured safety boundary', () => {
    expect(boundedRetryDelay(300000, 500, 1)).toBeGreaterThanOrEqual(60000);
    expect(boundedRetryDelay(300000, 500, 1)).toBeLessThan(60500);
  });
});

describe('external job normalization', () => {
  it('removes tracking parameters for duplicate detection', () => {
    expect(
      normalizeExternalJobUrl('https://www.linkedin.com/jobs/view/12345/?trackingId=abc')
    ).toBe('linkedin.com/jobs/view/12345');
    expect(
      normalizeExternalJobUrl('https://ie.linkedin.com/jobs/view/12345?trackingId=abc')
    ).toBe('linkedin.com/jobs/view/12345');
  });

  it('extracts common title, company, and location segments', () => {
    expect(parseExternalJobTitle('Senior Node.js Engineer - Acme Labs - Remote | LinkedIn'))
      .toEqual({
        title: 'Senior Node.js Engineer',
        company: 'Acme Labs',
        location: 'Remote'
      });
  });

  it('parses LinkedIn hiring-style titles', () => {
    expect(parseExternalJobTitle('Acme Labs hiring Senior Node.js Engineer in Remote'))
      .toEqual({
        title: 'Senior Node.js Engineer',
        company: 'Acme Labs',
        location: 'Remote'
      });
  });
});

describe('demo sourcing provider', () => {
  it('returns deterministic unique candidates within the requested limit', async () => {
    const provider = new DemoSourcingProvider();
    const first = await provider.search('Lead Node Engineer', 5);
    const second = await provider.search('Lead Node Engineer', 5);
    expect(first).toEqual(second);
    expect(first).toHaveLength(5);
    expect(new Set(first.map((candidate) => candidate.linkedinUrl)).size).toBe(5);
  });
});

describe('candidate sourcing query builder', () => {
  it('uses only a focused subset of manual-job skills and creates broad fallbacks', () => {
    const queries = buildCandidateSearchQueries({
      title: 'Tech Lead',
      location: 'Remote',
      skills: [
        'JavaScript',
        'TypeScript',
        'Node.js',
        'NestJS',
        'MongoDB',
        'Redis',
        'Docker'
      ]
    });

    expect(queries[0]).toBe('"Tech Lead" JavaScript TypeScript Node.js Remote');
    expect(queries).toContain('"Tech Lead" Remote');
    expect(queries[0]).not.toContain('MongoDB');
  });

  it('removes test timestamps and noisy location ellipses', () => {
    expect(
      buildCandidateSearchQueries({
        title: 'Senior Node.js Engineer 1782373676867',
        location: 'Dhaka ...',
        skills: ['Node.js']
      })[0]
    ).toBe('"Senior Node.js Engineer" Node.js Dhaka');
  });
});

describe('mock AI provider', () => {
  const provider = new MockAiProvider();

  it('scores a relevant candidate with explainable output', async () => {
    const result = await provider.scoreCandidate({
      job: {
        title: 'Lead Engineer',
        description: 'Build a MERN platform',
        requirements: ['Node.js', 'React'],
        skills: ['TypeScript', 'MongoDB']
      },
      candidate: {
        name: 'Jane Doe',
        headline: 'Lead Node.js Engineer',
        summary: 'Builds React and MongoDB systems',
        skills: ['TypeScript'],
        experienceYears: 8
      }
    });
    expect(result.score).toBeGreaterThanOrEqual(80);
    expect(result.reasoning).toBeTruthy();
    expect(result.recommendation).toBe('strong_match');
  });

  it('classifies positive and negative intent', async () => {
    await expect(provider.classifyIntent('Yes, I am interested!')).resolves.toMatchObject({
      intent: 'interested'
    });
    await expect(provider.classifyIntent('No thanks, please stop.')).resolves.toMatchObject({
      intent: 'not_interested'
    });
  });
});
