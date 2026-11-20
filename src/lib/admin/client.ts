// The page side of the admin API (src/lib/server/admin.ts): JSON in and out,
// same origin, never cached.
export interface AdminAnswer {
  ok: boolean;
  status: number;
  error?: string;
  body: Record<string, unknown>;
}

export async function postAdmin(path: string, body: unknown): Promise<AdminAnswer> {
  try {
    const response = await fetch(path, {
      method: 'POST',
      credentials: 'same-origin',
      cache: 'no-store',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    });
    const answer = (await response.json().catch(() => ({}))) as Record<string, unknown>;
    return { ok: response.ok, status: response.status, error: typeof answer.error === 'string' ? answer.error : undefined, body: answer };
  } catch {
    return { ok: false, status: 0, error: 'Network', body: {} };
  }
}
