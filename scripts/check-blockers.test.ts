import { describe, expect, test } from 'vitest';
import { blockedNotice, openBlockers, ticketOf, type InverseRelation } from './check-blockers';

// Linear's answer for CORE-33 on 2026-11-10: blocked by CORE-32, in Backlog.
const blockedBy = (identifier: string, type: string, name: string): InverseRelation => ({
  type: 'blocks',
  issue: { identifier, title: 'Series page: follow, switch Edition Line, drop', state: { name, type } },
});

describe('the ticket of a branch', () => {
  test.each([
    ['linear-core-33-to-buy-list', 'CORE-33'],
    ['feature/core-32-series-page', 'CORE-32'],
    ['CORE-12', 'CORE-12'],
    ['blocker-check', undefined],
    ['main', undefined],
    ['docs/coolify-host-builds', undefined],
  ])('%s → %s', (branch, ticket) => {
    expect(ticketOf(branch)).toBe(ticket);
  });
});

describe('blockers', () => {
  test('a blocker not Done stops the work, and the notice names it', () => {
    const blockers = openBlockers([blockedBy('CORE-32', 'backlog', 'Backlog')]);

    expect(blockers.map(({ identifier }) => identifier)).toEqual(['CORE-32']);
    expect(blockedNotice('CORE-33', blockers)).toMatch(/^STOP: CORE-33 is blocked by CORE-32 .*\(Backlog\)\. Do not start work on CORE-33\./);
  });

  test('Done and Canceled blockers, and other relations, do not block', () => {
    const relations = [
      blockedBy('CORE-31', 'completed', 'Done'),
      blockedBy('CORE-30', 'canceled', 'Canceled'),
      { ...blockedBy('CORE-42', 'backlog', 'Backlog'), type: 'related' },
    ];

    expect(openBlockers(relations)).toEqual([]);
    expect(blockedNotice('CORE-33', [])).toBeUndefined();
  });
});
