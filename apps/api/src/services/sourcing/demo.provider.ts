import { createHash } from 'node:crypto';
import type { SourcedCandidate, SourcingProvider } from './sourcing.types.js';

const firstNames = ['Maya', 'Arif', 'Sofia', 'Noah', 'Avery', 'Nadia', 'Leo', 'Priya', 'Sam', 'Lina'];
const lastNames = ['Rahman', 'Chen', 'Martinez', 'Williams', 'Patel', 'Kim', 'Ahmed', 'Brown'];
const skillPool = [
  'Node.js',
  'TypeScript',
  'React',
  'MongoDB',
  'Redis',
  'Express',
  'AWS',
  'Docker',
  'GraphQL',
  'PostgreSQL'
];

export class DemoSourcingProvider implements SourcingProvider {
  readonly name = 'demo';

  async search(query: string, limit: number): Promise<SourcedCandidate[]> {
    const seed = createHash('sha256').update(query).digest();
    return Array.from({ length: Math.min(limit, 25) }, (_, index) => {
      const first = firstNames[(seed[index % seed.length]! + index) % firstNames.length]!;
      const last = lastNames[(seed[(index + 5) % seed.length]! + index) % lastNames.length]!;
      const slug = `${first}-${last}-${seed[index % seed.length]!.toString(16)}`
        .toLowerCase()
        .replace(/\s+/g, '-');
      const skills = Array.from(
        new Set([
          skillPool[(seed[(index + 1) % seed.length]! + index) % skillPool.length]!,
          skillPool[(seed[(index + 2) % seed.length]! + index) % skillPool.length]!,
          skillPool[(seed[(index + 3) % seed.length]! + index) % skillPool.length]!
        ])
      );
      return {
        name: `${first} ${last}`,
        headline: `${skills[0]} Engineer`,
        location: index % 2 === 0 ? 'Remote' : 'New York, NY',
        linkedinUrl: `https://www.linkedin.com/in/${slug}`,
        profileUrl: `https://www.linkedin.com/in/${slug}`,
        summary: `${8 - (index % 5)} years building production software with ${skills.join(', ')}. Interested in ${query}.`,
        skills,
        experienceYears: 3 + (seed[(index + 4) % seed.length]! % 9),
        sourceData: { demo: true, query }
      };
    });
  }
}

