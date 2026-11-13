// The device side of the sharing API (src/lib/server/sharing-api.ts).
import { isNetworkFailure } from '../network';
import type { Category, SharingState } from './categories';

export type SharingAnswer =
  | { state: SharingState }
  // The session may not write Shared records: the reader signs in again first.
  | { needsConsent: true }
  | { signedOut: true }
  // No network, or the server could not reach the PDS: nothing changed.
  | { unreachable: true }
  | { failed: true };

export interface SharingClient {
  load(): Promise<SharingAnswer>;
  setShared(category: Category, shared: boolean): Promise<SharingAnswer>;
  setPrivate(work: string, kept: boolean): Promise<SharingAnswer>;
  // Tries the PDS again.
  sync(): Promise<SharingAnswer>;
}

type Fetch = (input: string, init?: RequestInit) => Promise<Response>;

export function sharingClient(fetcher: Fetch = (input, init) => fetch(input, init)): SharingClient {
  async function ask(path: string, init?: RequestInit): Promise<SharingAnswer> {
    let response: Response;
    try {
      response = await fetcher(`/api/sharing${path}`, { cache: 'no-store', credentials: 'same-origin', ...init });
    } catch (error) {
      if (isNetworkFailure(error)) return { unreachable: true };
      throw error;
    }
    if (response.ok) return { state: (await response.json()) as SharingState };
    if (response.status === 401) return { signedOut: true };
    const { error } = (await response.json().catch(() => ({}))) as { error?: string };
    if (response.status === 403 && error === 'NeedsConsent') return { needsConsent: true };
    if (response.status === 503) return { unreachable: true };
    return { failed: true };
  }

  const put = (path: string, body: object) =>
    ask(path, { method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });

  return {
    load: () => ask(''),
    setShared: (category, shared) => put(`/categories/${category}`, { shared }),
    setPrivate: (work, kept) => put(`/private-works/${encodeURIComponent(work)}`, { private: kept }),
    sync: () => ask('/sync', { method: 'POST' }),
  };
}
