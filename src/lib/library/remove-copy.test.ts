import { describe, expect, test } from 'vitest';
import { copyCollection, saveCopy, type Copy } from './copy';
import { loadLibrary } from './library';
import { loanCollection, saveLoan, type Loan } from './loan';
import { memorySpace } from './memory-space.fake';
import { removeCopy } from './remove-copy';

const onePiece56: Copy = { isbn: '9782723478991', works: ['wd:Q673'], acquiredAt: '2026-10-01T00:00:00.000Z', createdAt: '2026-11-05T10:00:00.000Z' };
const loan = (copy: string, borrower: string, returnedAt?: string): Loan => ({
  copy,
  borrower,
  lentAt: '2026-11-06T10:00:00.000Z',
  ...(returnedAt ? { returnedAt } : {}),
  createdAt: '2026-11-06T10:00:00.000Z',
});

// Two Copies of One Piece 56; the first lent to Camille now, and to Léo before.
async function twoCopies() {
  const { space, stored } = memorySpace();
  const { rkey: first } = await saveCopy(space, onePiece56);
  const { rkey: second } = await saveCopy(space, { ...onePiece56, createdAt: '2026-11-07T10:00:00.000Z' });
  await saveLoan(space, loan(first, 'Camille'));
  await saveLoan(space, loan(first, 'Léo', '2026-11-08T10:00:00.000Z'));
  await saveLoan(space, loan(second, 'Inès'));
  const { library } = await loadLibrary(space, () => undefined);
  const records = () => ({ copies: stored(copyCollection), loans: stored(loanCollection) });
  return { space, library, first, second, records };
}

describe('Remove a Copy', () => {
  test('a removed Copy takes its Loans with it, and leaves the other Copies and their Loans', async () => {
    const { space, library, first, second, records } = await twoCopies();

    const { state } = await removeCopy(space, first, library);

    expect(state).toBe('sent');
    expect(records().copies.map(({ rkey }) => rkey)).toEqual([second]);
    expect(records().loans.map(({ value }) => (value as Loan).borrower)).toEqual(['Inès']);
  });

  test('Undo puts back the same Copy and its Loans, under the same keys and with the same content', async () => {
    const { space, library, first, records } = await twoCopies();
    const before = records();

    const { undo } = await removeCopy(space, first, library);
    const state = await undo(space);

    expect(state).toBe('sent');
    const sorted = <T extends { rkey: string }>(list: T[]) => [...list].sort((a, b) => a.rkey.localeCompare(b.rkey));
    expect(sorted(records().copies)).toEqual(sorted(before.copies));
    expect(sorted(records().loans)).toEqual(sorted(before.loans));
  });

  test('a removal kept on this device says it waits, and so does its Undo', async () => {
    const { space, stored } = memorySpace('waiting');
    const { rkey } = await saveCopy(space, onePiece56);
    const { library } = await loadLibrary(space, () => undefined);

    const { state, undo } = await removeCopy(space, rkey, library);

    expect(state).toBe('waiting');
    expect(stored(copyCollection)).toEqual([]);
    expect(await undo(space)).toBe('waiting');
    expect(stored(copyCollection).map((each) => each.rkey)).toEqual([rkey]);
  });
});
