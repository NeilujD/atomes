import { isValidRecordKey } from '@atproto/syntax';
import { describe, expect, test } from 'vitest';
import { editionWork, isEditionWork, isIsbn13, isSeriesId, isWorkId, readIsbn } from './ids';

describe('reading an ISBN from a barcode or from what the reader typed', () => {
  test.each([
    ['an EAN-13 with prefix 978', '9782723478991', '9782723478991'],
    ['an EAN-13 with prefix 979-10', '9791032713662', '9791032713662'],
    ['hyphens', '978-2-7234-7899-1', '9782723478991'],
    ['spaces around and inside', ' 978 2 7234 7899 1 ', '9782723478991'],
    ['an ISBN-10', '2723478998', '9782723478991'],
    ['an ISBN-10 with hyphens', '2-7234-7899-8', '9782723478991'],
    ['an ISBN-10 that ends in X', '080442957X', '9780804429573'],
    ['an ISBN-10 that ends in a small x', '080442957x', '9780804429573'],
  ])('%s gives the ISBN-13', (_, text, isbn) => {
    expect(readIsbn(text)).toEqual({ isbn });
  });

  test.each([
    ['an EAN-13 with a wrong check digit', '9782723478992', 'check-digit'],
    ['an ISBN-10 with a wrong check digit', '2723478997', 'check-digit'],
    ['sheet music (ISMN, 979-0)', '9790230000001', 'sheet-music'],
    ['a magazine (ISSN, 977)', '9771234567003', 'magazine'],
    ['an EAN-13 that is not a book', '5901234123457', 'not-isbn'],
    ['a UPC-A', '036000291452', 'not-isbn'],
    ['an X that is not last', '08044295X7', 'not-isbn'],
    ['words', 'one piece', 'not-isbn'],
    ['nothing', '', 'not-isbn'],
  ])('%s is refused', (_, text, problem) => {
    expect(readIsbn(text)).toEqual({ problem });
  });
});

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
    expect(isEditionWork('isbn:9782723478991')).toBe(true);
    expect(isEditionWork('wd:Q673')).toBe(false);
  });

  test.each(['Q673', 'wd:673', 'wd:Q0', 'inv:XYZ', 'atomes:catalog.example.org:not-a-ulid', 'one piece', ''])('%s is refused', (id) => {
    expect(isWorkId(id)).toBe(false);
  });

  test.each([...seriesIds, 'isbn:9782723478991', '9782723478991'])('%s is a valid record key', (id) => {
    expect(isValidRecordKey(id)).toBe(true);
  });
});
