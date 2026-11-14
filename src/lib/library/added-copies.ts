// The Copies Series Onboarding just added, handed to the Series page it opens
// next, whose toast offers Undo (`sessionStorage`: this tab, this visit). The
// record keys say exactly which Copies: never the other Copies of the Series.
type Store = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;

export interface AddedCopies {
  rkeys: string[];
  // What the toast says: how many, and whether they are saved or waiting.
  text: string;
}

const key = 'atomes:added-copies';

export function handOverAddedCopies(store: Store, added: AddedCopies): void {
  try {
    store.setItem(key, JSON.stringify(added));
  } catch {
    // Storage blocked: the Series page shows the Copies, with no Undo.
  }
}

// Read once: the toast does not come back on the next visit.
export function takeAddedCopies(store: Store): AddedCopies | undefined {
  try {
    const kept: unknown = JSON.parse(store.getItem(key) ?? 'null');
    store.removeItem(key);
    if (!kept || typeof kept !== 'object') return undefined;
    const { rkeys, text } = kept as Partial<AddedCopies>;
    if (typeof text !== 'string' || !Array.isArray(rkeys) || !rkeys.every((rkey) => typeof rkey === 'string')) return undefined;
    return { rkeys, text };
  } catch {
    return undefined;
  }
}
