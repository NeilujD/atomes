import { expect, test } from 'vitest';
import { volumeNumber } from './facts';

const cases: [raw: string | undefined, volume: number | undefined][] = [
  ['56', 56],
  ['[5]', 5],
  ['Tome 3', 3],
  ['T. 12', 12],
  ['10,5', 10.5],
  ['I', 1],
  ['IV', 4],
  ['Livre XII', 12],
  ['Shaïgan', undefined],
  ['Civil', undefined],
  [undefined, undefined],
];

test.each(cases)('Volume %s reads as %s', (raw, volume) => {
  expect(volumeNumber(raw)).toBe(volume);
});
