import { describe, expect, test } from 'vitest';
import { latestOnly } from './latest';

describe('latestOnly: answers that come back out of order', () => {
  test('only the latest request is still current: an earlier one that answers late is dropped', async () => {
    const start = latestOnly();
    const shown: string[] = [];
    const ask = async (isbn: string, delay: number) => {
      const current = start();
      await new Promise((resolve) => setTimeout(resolve, delay));
      if (current()) shown.push(isbn);
    };

    await Promise.all([ask('first', 20), ask('second', 0)]);

    expect(shown).toEqual(['second']);
  });

  test('a request alone stays current', () => {
    const current = latestOnly()();

    expect(current()).toBe(true);
  });
});
