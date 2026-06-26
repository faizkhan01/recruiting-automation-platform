interface SourcingJobInput {
  title: string;
  location: string;
  skills: string[];
}

function cleanTitle(value: string): string {
  return value
    .replace(/\s+\d{10,}$/g, '')
    .replace(/\s*\[(remote|hybrid|onsite)\]\s*/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function cleanLocation(value: string): string {
  const cleaned = value.replace(/\.{2,}$/g, '').trim();
  return /not specified/i.test(cleaned) ? '' : cleaned;
}

export function buildCandidateSearchQueries(job: SourcingJobInput): string[] {
  const title = cleanTitle(job.title);
  const location = cleanLocation(job.location);
  const skills = Array.from(
    new Set(job.skills.map((skill) => skill.trim()).filter(Boolean))
  ).slice(0, 3);

  return Array.from(
    new Set([
      [`"${title}"`, ...skills, location].filter(Boolean).join(' '),
      [`"${title}"`, location].filter(Boolean).join(' '),
      [title, skills[0], location].filter(Boolean).join(' ')
    ])
  ).filter(Boolean);
}

