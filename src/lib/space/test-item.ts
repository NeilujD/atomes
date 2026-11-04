// Throwaway test record (`app.atomes.testItem`, CORE-17) that proves the
// private Space works end to end. Not a product record type: delete it when
// the first Library record exists.
import { newRecordKey, type Space } from './space';

export const testItemCollection = 'app.atomes.testItem';

export interface TestItem {
  text: string;
  createdAt: string;
}

export async function saveTestItem(space: Space, input: string, now = new Date()): Promise<void> {
  const text = input.trim();
  if (!text) throw new Error('Type a short text.');
  const item: TestItem = { text, createdAt: now.toISOString() };
  await space.put(testItemCollection, newRecordKey(), { ...item });
}

export async function listTestItems(space: Space): Promise<TestItem[]> {
  const records = await space.list(testItemCollection);
  return records
    .map((record) => record.value)
    .filter(isTestItem)
    .map(({ text, createdAt }) => ({ text, createdAt }))
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

function isTestItem(value: unknown): value is TestItem {
  if (typeof value !== 'object' || value === null) return false;
  const { text, createdAt } = value as Record<string, unknown>;
  return typeof text === 'string' && typeof createdAt === 'string';
}
