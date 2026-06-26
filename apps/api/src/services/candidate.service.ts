export function normalizeLinkedInUrl(value: string): string {
  const url = new URL(value);
  const originalHost = url.hostname.toLowerCase().replace(/^www\./, '');
  const host = originalHost.endsWith('linkedin.com') ? 'linkedin.com' : originalHost;
  const path = url.pathname.replace(/\/+$/, '').toLowerCase();
  return `${host}${path}`;
}
