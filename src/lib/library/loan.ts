// `app.atomes.loan`: the lending of one Copy, from the day it leaves until it
// comes back (ADR 0010, amendment 2026-11-09). A Loan with no return date is
// open; returned Loans stay as the Copy's history. It holds the name of
// someone who is not a reader, so it goes with the export and delete of ADR 0012.
// Never Shared.
import { newRecordKey, type Space, type WriteState } from '../space/space';
import { listRecords, putRecord } from './records';

export const loanCollection = 'app.atomes.loan';

export interface Loan {
  // Record key of the Copy.
  copy: string;
  borrower: string;
  lentAt: string;
  returnedAt?: string;
  createdAt: string;
}

// A new Loan gets a new key; pass the key of a Loan to change it (mark it returned).
export async function saveLoan(space: Space, loan: Loan, rkey = newRecordKey()): Promise<{ rkey: string; state: WriteState }> {
  if (!loan.borrower.trim()) throw new Error('A Loan needs a borrower');
  const state = await putRecord(space, loanCollection, rkey, loan);
  return { rkey, state };
}

export function deleteLoan(space: Space, rkey: string): Promise<WriteState> {
  return space.delete(loanCollection, rkey);
}

export function listLoans(space: Space) {
  return listRecords<Loan>(space, loanCollection);
}
