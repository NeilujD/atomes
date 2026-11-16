// `app.atomes.label`: a Label and the Works and Series that carry it (ADR 0010).
// A Label on a Series applies to every Work of that Series (glossary: Label). Keyed by
// a TID, so a rename keeps the key. Also the rules of the Labels on the Book
// page (src/islands/BookLabels.tsx): pure, they say what to save.
import { compareText, type Language } from '../i18n/i18n';
import { newRecordKey, type Space, type WriteState } from '../space/queued-store';
import { isSeries, isSeriesId, isWorkId } from './ids';
import { listRecords, putRecord, type Saved } from './records';

export const labelCollection = 'app.atomes.label';

export interface Label {
  name: string;
  works: string[];
  // Catalog identifiers of Series; absent in Labels saved before Series Labels.
  series?: string[];
  createdAt: string;
}

// A Catalog Series, by its best identifier and its `sameAs` ones (isSeries, ids.ts).
export type SeriesIds = { id: string; sameAs?: readonly string[] };

// A new Label gets a new key; pass the key of an existing Label to change it.
export async function saveLabel(space: Space, label: Label, rkey = newRecordKey()): Promise<{ rkey: string; state: WriteState }> {
  const name = label.name.trim();
  if (!name) throw new Error('A Label needs a name.');
  const badWork = label.works.find((work) => !isWorkId(work));
  if (badWork !== undefined) throw new Error(`Not a Work identifier: ${badWork}`);
  const badSeries = label.series?.find((series) => !isSeriesId(series));
  if (badSeries !== undefined) throw new Error(`Not a Series identifier: ${badSeries}`);
  const record: Label = { ...label, name, works: [...new Set(label.works)] };
  if (label.series) record.series = [...new Set(label.series)];
  const state = await putRecord(space, labelCollection, rkey, record);
  return { rkey, state };
}

// Every Work loses the Label: it was listed only here (ADR 0010).
export function deleteLabel(space: Space, rkey: string): Promise<WriteState> {
  return space.delete(labelCollection, rkey);
}

export function listLabels(space: Space) {
  return listRecords<Label>(space, labelCollection);
}

// The reader's Labels in the one order every screen shows them: A to Z by name.
export function labelsAtoZ(labels: Saved<Label>[], language: Language): Saved<Label>[] {
  const compare = compareText(language);
  return [...labels].sort((a, b) => compare(a.value.name, b.value.name));
}

// The Label is on this Series, under any of its identifiers: a Label may keep
// an older one.
export function onSeries(label: Label, series: SeriesIds | null | undefined): boolean {
  return label.series?.some((id) => isSeries(series, id)) ?? false;
}

// The Labels of one Work: the ones it carries, the ones it gets from its
// Series (`series`, when the Catalog knows it), then the reader's others to
// pick from, and all of them (to rename or delete), each A to Z.
export function workLabels(
  work: string,
  labels: Saved<Label>[],
  language: Language,
  series?: SeriesIds | null,
): { carried: Saved<Label>[]; fromSeries: Saved<Label>[]; others: Saved<Label>[]; all: Saved<Label>[] } {
  const all = labelsAtoZ(labels, language);
  const carried = all.filter(({ value }) => value.works.includes(work));
  const fromSeries = all.filter(({ value }) => !value.works.includes(work) && onSeries(value, series));
  return { carried, fromSeries, others: all.filter((label) => !carried.includes(label) && !fromSeries.includes(label)), all };
}

// The Labels of one Series (the Series page): the ones on it, then the
// reader's others to pick from, each A to Z.
export function seriesLabels(series: SeriesIds, labels: Saved<Label>[], language: Language): { carried: Saved<Label>[]; others: Saved<Label>[] } {
  const all = labelsAtoZ(labels, language);
  return { carried: all.filter(({ value }) => onSeries(value, series)), others: all.filter(({ value }) => !onSeries(value, series)) };
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

// The same, for a Series: the Label of that name with the Series added, else
// a new Label on the Series alone.
export function seriesLabelFor(typed: string, series: SeriesIds, labels: Saved<Label>[], now: Date, language: Language): { label: Label; rkey?: string } | { problem: 'empty' } {
  const name = typed.trim();
  if (!name) return { problem: 'empty' };
  const existing = labelNamed(name, labels, language);
  if (existing) return { label: attachSeries(existing.value, series), rkey: existing.rkey };
  return { label: { name, works: [], series: [series.id], createdAt: now.toISOString() } };
}

export function attach(label: Label, work: string): Label {
  return { ...label, works: [...label.works.filter((each) => each !== work), work] };
}

// The Label stays, with its other Works: only `deleteLabel` removes it.
export function detach(label: Label, work: string): Label {
  return { ...label, works: label.works.filter((each) => each !== work) };
}

// The Series once, under its best identifier.
export function attachSeries(label: Label, series: SeriesIds): Label {
  const rest = detachSeries(label, series);
  return { ...rest, series: [...(rest.series ?? []), series.id] };
}

// Every identifier of the Series goes; the Label stays, with its Works.
export function detachSeries(label: Label, series: SeriesIds): Label {
  return { ...label, series: (label.series ?? []).filter((id) => !isSeries(series, id)) };
}

// What to save when the reader renames a Label. Two Labels never share a name.
export function renamed(label: Saved<Label>, typed: string, labels: Saved<Label>[], language: Language): { label: Label } | { problem: 'empty' | 'taken' } {
  const name = typed.trim();
  if (!name) return { problem: 'empty' };
  const other = labelNamed(name, labels.filter(({ rkey }) => rkey !== label.rkey), language);
  if (other) return { problem: 'taken' };
  return { label: { ...label.value, name } };
}
