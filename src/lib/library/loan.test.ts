import { describe, expect, test } from 'vitest';
import { deleteLoan, listLoans, loanCollection, saveLoan, type Loan } from './loan';
import { memorySpace } from './memory-space.fake';
import { lexicons } from './records';

const toCamille: Loan = {
  copy: '3m2abcdefgh22',
  borrower: 'Camille',
  lentAt: '2026-11-03T10:00:00.000Z',
  createdAt: '2026-11-03T10:00:00.000Z',
};

describe('Loan records', () => {
  test('an open Loan matches its lexicon and reads back with its key', async () => {
    const { space, stored } = memorySpace();

    const { rkey } = await saveLoan(space, toCamille);

    expect(() => lexicons.assertValidRecord(loanCollection, stored(loanCollection)[0].value)).not.toThrow();
    expect((await listLoans(space)).records).toEqual([{ rkey, value: { $type: loanCollection, ...toCamille } }]);
  });

  test('a returned Loan keeps its key and gets its return date', async () => {
    const { space } = memorySpace();
    const { rkey } = await saveLoan(space, toCamille);

    await saveLoan(space, { ...toCamille, returnedAt: '2026-11-12T10:00:00.000Z' }, rkey);

    expect((await listLoans(space)).records).toEqual([
      { rkey, value: { $type: loanCollection, ...toCamille, returnedAt: '2026-11-12T10:00:00.000Z' } },
    ]);
  });

  test('a deleted Loan is gone', async () => {
    const { space } = memorySpace();
    const { rkey } = await saveLoan(space, toCamille);

    await deleteLoan(space, rkey);

    expect((await listLoans(space)).records).toEqual([]);
  });

  test.each<[string, Partial<Loan>]>([
    ['no borrower', { borrower: '' }],
    ['a borrower name over 64 characters', { borrower: 'é'.repeat(65) }],
    ['a Copy key that is not a TID', { copy: 'one piece' }],
    ['a lent date that is not a datetime', { lentAt: 'last week' }],
    ['a return date that is not a datetime', { returnedAt: 'yesterday' }],
  ])('%s is refused and nothing is saved', async (_, change) => {
    const { space, stored } = memorySpace();

    await expect(saveLoan(space, { ...toCamille, ...change })).rejects.toThrow();
    expect(stored(loanCollection)).toEqual([]);
  });

  test('records in another shape are skipped', async () => {
    const { space } = memorySpace();
    await space.put(loanCollection, 'a', { $type: loanCollection, ...toCamille });
    await space.put(loanCollection, 'b', { $type: loanCollection, copy: toCamille.copy });

    expect((await listLoans(space)).records.map(({ rkey }) => rkey)).toEqual(['a']);
  });
});
