// The "Invite a friend" section of Settings (CORE-134): what the reader's
// Invite is, and a new one (src/lib/server/reader-invite.ts). The server keeps
// the limit; this only tells it.
import { pageLanguage, t } from '../i18n/i18n';
import { errorMessage } from './session';

type Fetch = (input: string, init?: RequestInit) => Promise<Response>;

// ReaderInvite in src/lib/server/invites.ts.
export type InviteState = { state: 'none' } | { state: 'open'; expiresAt: number } | { state: 'used' };

const url = '/api/account/invite';

const answerMessage = (status: number): string => (status === 401 ? t('auth.session-ended') : t('invite.failed'));

export async function readInvite(fetch: Fetch): Promise<InviteState | { message: string }> {
  try {
    const response = await fetch(url, { credentials: 'same-origin', cache: 'no-store' });
    return response.ok ? ((await response.json()) as InviteState) : { message: answerMessage(response.status) };
  } catch (error) {
    return { message: errorMessage(error) };
  }
}

// A new Invite, which cancels the open one. `origin`: this server, as the
// reader opens it. The link is shown once: the server keeps no token. The
// reader has used their Invite (403, in another tab maybe): that state.
export async function makeInviteLink(
  fetch: Fetch,
  origin: string,
): Promise<{ link: string; expiresAt: number } | { state: 'used' } | { message: string }> {
  try {
    const response = await fetch(url, { method: 'POST', credentials: 'same-origin' });
    if (response.status === 403) return { state: 'used' };
    if (!response.ok) return { message: answerMessage(response.status) };
    const { token, expiresAt } = (await response.json()) as { token: string; expiresAt: number };
    return { link: `${origin}/sign-in#invite=${token}`, expiresAt };
  } catch (error) {
    return { message: errorMessage(error) };
  }
}

export const inviteDate = (expiresAt: number): string => new Intl.DateTimeFormat(pageLanguage(), { dateStyle: 'long' }).format(new Date(expiresAt));

export function inviteStatus(invite: InviteState): string {
  if (invite.state === 'used') return t('invite.used');
  if (invite.state === 'open') return t('invite.open', inviteDate(invite.expiresAt));
  return t('invite.none');
}
