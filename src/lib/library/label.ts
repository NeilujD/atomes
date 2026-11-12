// `app.atomes.label`: a Label and the Works that carry it (ADR 0010). Keyed by
// a TID, so a rename keeps the key. Also the rules of the Labels on the Book
// page (src/islands/BookLabels.tsx): pure, they say what to save.
import { compareText, type Language } from '../i18n/i18n';
import { newRecordKey, type Space, type WriteState } from '../space/space';
import { isWorkId } from './ids';
import { listRecords, putRecord, type Saved } from './records';

export const labelCollection = 'app.atomes.label';

export interface Label {
  name: string;
  works: string[];
  createdAt: string;
}

// A new Label gets a new key; pass the key of an existing Label to change it.
export async function saveLabel(space: Space, label: Label, rkey = newRecordKey()): Promise<{ rkey: string; state: WriteState }> {
  const name = label.name.trim();
  if (!name) throw new Error('A Label needs a name.');
  const badWork = label.works.find((work) => !isWorkId(work));
  if (badWork !== undefined) throw new Error(`Not a Work identifier: ${badWork}`);
  const state = await putRecord(space, labelCollection, rkey, { ...label, name, works: [...new Set(label.works)] });
  return { rkey, state };
}

// Every Work loses the Label: it was listed only here (ADR 0010).
export function deleteLabel(space: Space, rkey: string): Promise<WriteState> {
  return space.delete(labelCollection, rkey);
}

export function listLabels(space: Space) {
  return listRecords<Label>(space, labelCollection);
}

// The Labels of one Work: the ones it carries, then the reader's others to pick from, each A to Z.
export function workLabels(work: string, labels: Saved<Label>[], language: Language): { carried: Saved<Label>[]; others: Saved<Label>[] } {
  const compare = compareText(language);
  const sorted = [...labels].sort((a, b) => compare(a.value.name, b.value.name));
  return {
    carried: sorted.filter(({ value }) => value.works.includes(work)),
    others: sorted.filter(({ value }) => !value.works.includes(work)),
  };
}

// The reader's Label of this name: "manga" is "Manga" and "ete" is "Été", so
// a name typed again never makes a second Label.
export function labelNamed(name: string, labels: Saved<Label>[], language: Language): Saved<Label> | undefined {
  const same = new Intl.Collator(language, { sensitivity: 'base' });
  return labels.find(({ value }) => same.compare(value.name, name.trim()) === 0);
}

// What to save when the reader adds the name they typed to a Work: their Label
// of that name with the Work added, else a new Label that the Work carries.
export function labelFor(typed: string, work: string, labels: Saved<Label>[], now: Date, language: Language): { label: Label; rkey?: string } | { problem: 'empty' } {
  const name = typed.trim();
  if (!name) return { problem: 'empty' };
  const existing = labelNamed(name, labels, language);
  if (existing) return { label: attach(existing.value, work), rkey: existing.rkey };
  return { label: { name, works: [work], createdAt: now.toISOString() } };
}

export function attach(label: Label, work: string): Label {
  return { ...label, works: [...label.works.filter((each) => each !== work), work] };
}

// The Label stays, with its other Works: only `deleteLabel` removes it.
export function detach(label: Label, work: string): Label {
  return { ...label, works: label.works.filter((each) => each !== work) };
}

// What to save when the reader renames a Label. Two Labels never share a name.
export function renamed(label: Saved<Label>, typed: string, labels: Saved<Label>[], language: Language): { label: Label } | { problem: 'empty' | 'taken' } {
  const name = typed.trim();
  if (!name) return { problem: 'empty' };
  const other = labelNamed(name, labels.filter(({ rkey }) => rkey !== label.rkey), language);
  if (other) return { problem: 'taken' };
  return { label: { ...label.value, name } };
}
