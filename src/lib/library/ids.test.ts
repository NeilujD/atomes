import { isValidRecordKey } from '@atproto/syntax';
import { describe, expect, test } from 'vitest';
import { editionWork, isIsbn13, isSeriesId, isWorkId } from './ids';

describe('ISBN-13', () => {
  test.each(['9782723478991', '9791032713662', '9782070348633'])('%s is accepted', (isbn) => {
    expect(isIsbn13(isbn)).toBe(true);
  });

  test.each([
    ['a bad check digit', '9782723478992'],
    ['hyphens', '978-2-7234-7899-1'],
    ['an ISBN-10', '2723478999'],
    ['sheet music (ISMN)', '9790230000001'],
    ['a magazine (ISSN)', '9771234567003'],
  ])('%s is refused', (_, value) => {
    expect(isIsbn13(value)).toBe(false);
  });
});

const seriesIds = ['wd:Q673', 'inv:0123456789abcdef0123456789abcdef', 'ol:OL326110L', 'atomes:catalog.example.org:01JC2X3Y4Z5A6B7C8D9E0F1G2H', 'atomes:127.0.0.1:4321:01JC2X3Y4Z5A6B7C8D9E0F1G2H'];

describe('Catalog identifiers', () => {
  test.each(seriesIds)('%s is a Series and a Work identifier', (id) => {
    expect(isSeriesId(id)).toBe(true);
    expect(isWorkId(id)).toBe(true);
  });

  test('a Work of an unidentified Edition is isbn:<isbn13>, never a Series', () => {
    expect(editionWork('9782723478991')).toBe('isbn:9782723478991');
    expect(isWorkId('isbn:9782723478991')).toBe(true);
    expect(isSeriesId('isbn:9782723478991')).toBe(false);
    expect(isWorkId('isbn:9782723478992')).toBe(false);
  });

  test.each(['Q673', 'wd:673', 'wd:Q0', 'inv:XYZ', 'atomes:catalog.example.org:not-a-ulid', 'one piece', ''])('%s is refused', (id) => {
    expect(isWorkId(id)).toBe(false);
  });

  test.each([...seriesIds, 'isbn:9782723478991', '9782723478991'])('%s is a valid record key', (id) => {
    expect(isValidRecordKey(id)).toBe(true);
  });
});
