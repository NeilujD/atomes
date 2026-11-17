import { describe, expect, test } from 'vitest';
import { inviteStatus, makeInviteLink, readInvite } from './invite';

// /api/account/invite as the device sees it: one answer per call.
const answering = (status: number, body?: unknown) => {
  const asked: { url: string; method: string }[] = [];
  const fetch = (url: string, init?: RequestInit) => {
    asked.push({ url, method: init?.method ?? 'GET' });
    return Promise.resolve(body === undefined ? new Response(null, { status }) : Response.json(body, { status }));
  };
  return { fetch, asked };
};
const offline = () => Promise.reject(new TypeError('Failed to fetch'));

const expiresAt = Date.parse('2026-12-01T10:00:00Z');
const token = 'A'.repeat(43);

describe('the Invite section of Settings', () => {
  test('reads the state of the reader’s Invite', async () => {
    const server = answering(200, { state: 'open', expiresAt });

    expect(await readInvite(server.fetch)).toEqual({ state: 'open', expiresAt });
    expect(server.asked).toEqual([{ url: '/api/account/invite', method: 'GET' }]);
  });

  test('makes an Invite and gives its link on this server', async () => {
    const server = answering(201, { token, expiresAt });

    expect(await makeInviteLink(server.fetch, 'https://atomes.example')).toEqual({ link: `https://atomes.example/sign-in#invite=${token}`, expiresAt });
    expect(server.asked).toEqual([{ url: '/api/account/invite', method: 'POST' }]);
  });

  test('a reader who has used their Invite gets that state', async () => {
    expect(await makeInviteLink(answering(403, { error: 'InviteUsed' }).fetch, 'https://atomes.example')).toEqual({ state: 'used' });
  });

  test.each([
    [401, 'SignedOut', 'Your session has ended. Sign in again.'],
    [500, 'Oops', 'The Invite could not be made. Try again.'],
  ])('%i %s says so in plain words', async (status, error, message) => {
    expect(await makeInviteLink(answering(status, { error }).fetch, 'https://atomes.example')).toEqual({ message });
  });

  test('offline, it says the server cannot be reached', async () => {
    const message = 'Could not reach this Atomes server. Check your connection and try again.';
    expect(await readInvite(offline)).toEqual({ message });
    expect(await makeInviteLink(offline, 'https://atomes.example')).toEqual({ message });
  });

  test.each([
    [{ state: 'none' } as const, 'One person can make an Atomes account with your Invite. The link works one time, for 14 days.'],
    [{ state: 'open', expiresAt } as const, 'Your link works until December 1, 2026. Atomes shows a link only once: if you lost it, make a new one, and the old one stops working.'],
    [{ state: 'used' } as const, 'You have used your Invite: a person made an account with it.'],
  ])('tells the state %o', (state, text) => {
    expect(inviteStatus(state)).toBe(text);
  });
});
