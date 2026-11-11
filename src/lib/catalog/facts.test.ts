import { expect, test } from 'vitest';
import { volumeNumber, volumeNumbers } from './facts';

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

// An omnibus Edition holds several Volumes (BnF 200 `$h` "Tomes 1-2", 461 `$v` "1-3").
const ranges: [raw: string | undefined, volumes: number[]][] = [
  ['1-2', [1, 2]],
  ['1 à 3', [1, 2, 3]],
  ['Tomes 1 à 3', [1, 2, 3]],
  ['Tomes 1-2', [1, 2]],
  ['Tome 1 & 2', [1, 2]],
  ['1 et 2', [1, 2]],
  ['T01 à T03', [1, 2, 3]],
  ['56', [56]],
  ['[5]', [5]],
  ['Tome 3', [3]],
  ['I', [1]],
  ['11.5', [11.5]],
  ['Civil', []],
  [undefined, []],
  // A range of years, a range that runs backwards or one too long for an omnibus is no Volume.
  ['2019-2020', []],
  ['3-1', []],
  ['1-80', []],
];

test.each(ranges)('Volumes %s read as %j', (raw, volumes) => {
  expect(volumeNumbers(raw)).toEqual(volumes);
});

test('the Volume of a range is its first Volume', () => {
  expect(volumeNumber('Tomes 1 à 3')).toBe(1);
});
