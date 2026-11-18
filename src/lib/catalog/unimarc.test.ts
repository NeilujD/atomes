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
    ['One Piece - Édition originale - Tome 113', 'One Piece', [113]],
    ['Spy x Family - Tome 16', 'Spy x Family', [16]],
    ['Dragon Ball Super - Tomes 1-2', 'Dragon Ball Super', [1, 2]],
  ])('a title ending in a Volume, before publication: "%s"', (title, series, volumes) => {
    expect(unimarcFacts(record(title), 'BnF')).toMatchObject({ title, series: { title: series }, volumes });
  });

  test('a title with no Volume is no Series ("One Piece 113 : coffre au trésor" is a box set)', () => {
    const facts = unimarcFacts(record('One Piece 113'), 'BnF');

    expect([facts.series, facts.volumes]).toEqual([undefined, undefined]);
  });

  test('200 $h stays the Volume of the Series named in 200 $a', () => {
    expect(unimarcFacts(record('One Piece', '112'), 'BnF')).toMatchObject({ series: { title: 'One Piece' }, volumes: [112] });
  });

  test('200 $h "Tomes 1-2" is an omnibus of Volumes 1 and 2 of the Series named in 200 $a', () => {
    expect(unimarcFacts(record('Dragon ball super', 'Tomes 1-2'), 'BnF')).toMatchObject({ series: { title: 'Dragon ball super' }, volumes: [1, 2] });
  });

  test('the year of publication comes from 214 $d', () => {
    expect(publishedYear(record('One Piece'))).toBe(2026);
  });
});

// 215 `$a` as the recorded BnF and SUDOC answers hold it (CORE-152).
const described = (extent: string) =>
  unimarcRecords(`<mxc:record>
    <mxc:datafield tag="200" ind1="1" ind2=" "><mxc:subfield code="a">One Piece</mxc:subfield></mxc:datafield>
    <mxc:datafield tag="215" ind1=" " ind2=" "><mxc:subfield code="a">${extent}</mxc:subfield><mxc:subfield code="d">18 cm</mxc:subfield></mxc:datafield>
  </mxc:record>`)[0];

describe('UNIMARC page count (215 $a)', () => {
  test.each([
    ['1 vol. (192 p.)', 192],
    ['192 p.', 192],
    ['1 vol. (non paginé [ca 200] p.)', 200],
    ['1 vol. (12, 180 p.)', 192],
    ['1 vol. (180 p.-[4] dépl.)', 180],
    ['1 vol. (non paginé [208 p.])', 208],
    ['1 volume 210 p', 210],
    ['1 volume (700 pages)', 700],
    ['1 vol. [46 p.]', 46],
    ['2 vol. (176, 181p.)', 357],
    ['1 vol. (48 p.-[16] p. de pl.)', 48],
    ['1 vol.', undefined],
    ['1 vol. (non paginé)', undefined],
    ['Shonen manga', undefined],
    ['3 DVD vidéo monofaces simple couche zone 2 (6 h 51 min)', undefined],
  ])('"%s" gives %s pages', (extent, pages) => {
    expect(unimarcFacts(described(extent), 'BnF').pages).toBe(pages);
  });

  test('a record with no 215 has no page count', () => {
    expect(unimarcFacts(record('One Piece'), 'BnF').pages).toBeUndefined();
  });
});
