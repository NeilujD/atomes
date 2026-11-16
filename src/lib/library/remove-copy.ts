// Remove a Copy (Book page). Its Loans go with it: they hold names of people
// who are not readers. Remove asks nothing first; its toast offers Undo, which
// puts back the same records under the same keys (ui-direction: colour roles).
import type { Space, WriteState } from '../space/queued-store';
import { deleteCopy, saveCopy } from './copy';
import { worstState } from './library';
import { deleteLoan, saveLoan } from './loan';
import { loansOf, type Library } from './model';

export interface Removed {
  state: WriteState;
  undo: (space: Space) => Promise<WriteState>;
}

export async function removeCopy(space: Space, copy: string, library: Library): Promise<Removed> {
  const record = library.copies.find(({ rkey }) => rkey === copy);
  if (!record) throw new Error(`No Copy ${copy} in the Library`);
  const loans = loansOf(copy, library);
  const states = await Promise.all(loans.map(({ rkey }) => deleteLoan(space, rkey)));
  states.push(await deleteCopy(space, copy));
  return {
    state: worstState(states),
    // The Copy first, then the Loans that point at it.
    undo: async (again) => {
      const copyBack = await saveCopy(again, record.value, copy);
      const loansBack = await Promise.all(loans.map(async ({ rkey, value }) => (await saveLoan(again, value, rkey)).state));
      return worstState([copyBack.state, ...loansBack]);
    },
  };
}
