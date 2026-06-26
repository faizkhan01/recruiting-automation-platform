const API_URL = import.meta.env.VITE_API_URL ?? '';

interface ApiEnvelope<T> {
  success: boolean;
  data: T;
  error?: { message: string };
}

export async function api<T>(path: string, options?: RequestInit): Promise<T> {
  const response = await fetch(`${API_URL}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...options?.headers
    }
  });
  const payload = (await response.json()) as ApiEnvelope<T>;
  if (!response.ok || !payload.success) {
    throw new Error(payload.error?.message ?? `Request failed (${response.status})`);
  }
  return payload.data;
}

