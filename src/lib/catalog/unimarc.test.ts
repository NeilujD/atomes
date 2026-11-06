import { describe, expect, test } from 'vitest';
import { publishedYear, unimarcFacts, unimarcRecords } from './unimarc';

// One BnF record with only a title in 200 $a and a date, as BnF SRU serves it.
const record = (title: string, h = '') =>
  unimarcRecords(`<mxc:record>
    <mxc:datafield tag="200" ind1="1" ind2=" "><mxc:subfield code="a">${title}</mxc:subfield>${h && `<mxc:subfield code="h">${h}</mxc:subfield>`}</mxc:datafield>
    <mxc:datafield tag="214" ind1=" " ind2="1"><mxc:subfield code="c">Glénat</mxc:subfield><mxc:subfield code="d">DL 2026</mxc:subfield></mxc:datafield>
  </mxc:record>`)[0];

describe('UNIMARC Series and Volume', () => {
  test.each([
    ['One Piece - Édition originale - Tome 113', 'One Piece', 113],
    ['Spy x Family - Tome 16', 'Spy x Family', 16],
  ])('a title ending in a Volume, before publication: "%s"', (title, series, volume) => {
    expect(unimarcFacts(record(title), 'BnF')).toMatchObject({ title, series: { title: series }, volume });
  });

  test('a title with no Volume is no Series ("One Piece 113 : coffre au trésor" is a box set)', () => {
    const facts = unimarcFacts(record('One Piece 113'), 'BnF');

    expect([facts.series, facts.volume]).toEqual([undefined, undefined]);
  });

  test('200 $h stays the Volume of the Series named in 200 $a', () => {
    expect(unimarcFacts(record('One Piece', '112'), 'BnF')).toMatchObject({ series: { title: 'One Piece' }, volume: 112 });
  });

  test('the year of publication comes from 214 $d', () => {
    expect(publishedYear(record('One Piece'))).toBe(2026);
  });
});
