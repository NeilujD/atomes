// `app.atomes.label`: a Label and the Works that carry it (ADR 0010). Keyed by
// a TID, so a rename keeps the key.
import { newRecordKey, type Space } from '../space/space';
import { isWorkId } from './ids';
import { listRecords, putRecord } from './records';

export const labelCollection = 'app.atomes.label';

export interface Label {
  name: string;
  works: string[];
  createdAt: string;
}

// A new Label gets a new key; pass the key of an existing Label to change it.
export async function saveLabel(space: Space, label: Label, rkey = newRecordKey()): Promise<string> {
  const name = label.name.trim();
  if (!name) throw new Error('A Label needs a name.');
  const badWork = label.works.find((work) => !isWorkId(work));
  if (badWork !== undefined) throw new Error(`Not a Work identifier: ${badWork}`);
  await putRecord(space, labelCollection, rkey, { ...label, name, works: [...new Set(label.works)] });
  return rkey;
}

export function listLabels(space: Space) {
  return listRecords<Label>(space, labelCollection);
}
