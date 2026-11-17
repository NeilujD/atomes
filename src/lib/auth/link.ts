// The Account group of Settings (ADR 0016, "Accounts"): add an email address
// with a Sign-in Code (src/lib/server/link-email.ts), and what the server
// tells after linking an AT Protocol Account (`?link=`, linkAtproto in
// src/lib/server/auth.ts).
import { t } from '../i18n/i18n';
import { errorMessage, type Account } from './session';

type Fetch = (input: string, init?: RequestInit) => Promise<Response>;

const postJson = (fetch: Fetch, url: string, body: unknown) =>
  fetch(url, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body), credentials: 'same-origin' });

const errorOf = async (response: Response) => ((await response.json().catch(() => ({}))) as { error?: string }).error;

// The email address, or the handle when the Account has none.
export const accountName = (account: Account): string => account.email ?? (account.handle ? `@${account.handle}` : '');

function answerMessage(status: number, error: string | undefined): string {
  if (status === 429) return t('auth.too-many');
  if (status === 401) return t('auth.session-ended');
  if (error === 'Taken') return t('link.email-taken');
  if (error === 'HasEmail') return t('link.has-email');
  if (error === 'WrongCode') return t('auth.wrong-code');
  if (error === 'BadAddress') return t('auth.type-email');
  return t('auth.failed');
}

// Gives the address as the server compares it, or what the screen tells.
export async function askLinkCode(fetch: Fetch, input: string): Promise<{ email: string } | { message: string }> {
  const email = input.trim().toLowerCase();
  if (!email.includes('@')) return { message: t('auth.type-email') };
  try {
    const response = await postJson(fetch, '/api/link/code', { email });
    return response.ok ? { email } : { message: answerMessage(response.status, await errorOf(response)) };
  } catch (error) {
    return { message: errorMessage(error) };
  }
}

// Sends the code typed or pasted (digits only). Undefined when the address is
// added; else what the screen tells.
export async function addAddress(fetch: Fetch, email: string, input: string): Promise<string | undefined> {
  const code = input.replace(/\D/g, '');
  if (code.length !== 6) return t('auth.type-code');
  try {
    const response = await postJson(fetch, '/api/link/check', { email, code });
    return response.ok ? undefined : answerMessage(response.status, await errorOf(response));
  } catch (error) {
    return errorMessage(error);
  }
}

// LinkOutcome in src/lib/server/auth.ts. Undefined for an unknown value.
const results: Partial<Record<string, () => string>> = {
  linked: () => t('link.linked'),
  taken: () => t('link.atproto-taken'),
  'has-one': () => t('link.has-atproto'),
  'other-session': () => t('link.other-session'),
  cancelled: () => t('auth.cancelled'),
  'no-account': () => t('auth.no-account'),
  unreachable: () => t('auth.pds-unreachable'),
  failed: () => t('auth.failed'),
};

export function linkResultMessage(result: string | null): { text: string; error: boolean } | undefined {
  const text = result === null ? undefined : results[result]?.();
  return text === undefined ? undefined : { text, error: result !== 'linked' };
}
