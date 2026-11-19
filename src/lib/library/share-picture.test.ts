// The share picture (ADR 0019, R4, R5): the statistics of the screen, a
// format, a language and "Series names" on or off give the drawing steps a
// canvas runs. Text width comes from a measure the painter gives (the canvas);
// here a fixed width per character stands in for it.
import { describe, expect, test } from 'vitest';
import { pictureColours } from './picture-colours';
import { pictureAlt, pictureSize, pictureSteps, type Measure, type PictureInput, type Step } from './share-picture';
import type { Statistics } from './stats';

// Wider than Schibsted Grotesk on average: a cut that fits here fits there.
const measure: Measure = (text, style) => [...text].length * style.size * 0.62 + [...text].length * style.size * style.tracking;

const months = [3, 5, 2, 6, 4, 7, 9, 3, 2, 4, 2, 0];
const numbers = (more: Partial<Statistics> = {}): Statistics => ({
  read: 47,
  added: 61,
  reading: 3,
  ownedUnread: 12,
  libraryToday: [],
  owned: { copies: 80, series: 9, readNotOwned: 2 },
  columns: { scale: 'month', groups: months.map((read, at) => ({ at: `2026-${String(at + 1).padStart(2, '0')}`, read, added: 1 })) },
  mostRead: {
    series: {
      rows: [
        { name: 'One Piece', value: 12 },
        { name: 'Blame!', value: 6 },
        { name: 'Dune', value: 4 },
        { name: 'Fondation', value: 2 },
      ],
      outside: 0,
    },
    authors: { rows: [{ name: 'Eiichiro Oda', value: 12 }], outside: 0 },
    labels: { rows: [], outside: 0 },
    publishers: { rows: [], outside: 0 },
  },
  loans: { lentNow: 0, started: 0, averageDays: null },
  undated: { reads: 0, copies: 0 },
  years: [2026],
  defaultPeriod: 2026,
  followed: 9,
  pagesRead: null,
  ...more,
});

const input = (more: Partial<PictureInput> = {}): PictureInput => ({
  numbers: numbers(),
  period: 2026,
  filters: { label: null, ownedOnly: false },
  format: 'story',
  language: 'en',
  names: true,
  measure,
  ...more,
});
const texts = (steps: Step[]) => steps.flatMap((step) => (step.kind === 'text' ? [step.text] : []));
const bars = (steps: Step[]) => steps.filter((step) => step.kind === 'rect' && step.fill === pictureColours.ink && step.radius[2] === 0 && step.radius[0] > 0);

// Where a text step ends: its anchor, its measured width, and its alignment.
function extent(step: Extract<Step, { kind: 'text' }>): [number, number] {
  const width = Math.min(measure(step.text, step.style), step.maxWidth ?? Infinity);
  if (step.align === 'right') return [step.x - width, step.x];
  if (step.align === 'center') return [step.x - width / 2, step.x + width / 2];
  return [step.x, step.x + width];
}

function expectInside(steps: Step[], width: number, height: number) {
  for (const step of steps) {
    if (step.kind === 'gradient') continue;
    const [left, right] = step.kind === 'text' ? extent(step) : [step.x, step.x + step.width];
    const [top, bottom] = step.kind === 'text' ? [step.y - step.style.size, step.y] : [step.y, step.y + step.height];
    expect({ step, inside: left >= 0 && right <= width && top >= 0 && bottom <= height }).toMatchObject({ inside: true });
  }
}

describe('the Story picture', () => {
  test('is 1080 × 1920, on the dark ground, with the mark, the period, the lead number, Added, Series followed, the months, Most read and "Made with Atomes"', () => {
    const steps = pictureSteps(input());

    expect(pictureSize('story')).toEqual({ width: 1080, height: 1920 });
    expect(steps[0]).toMatchObject({ kind: 'rect', x: 0, y: 0, width: 1080, height: 1920, fill: pictureColours.ground });
    expect(texts(steps)).toEqual([
      'Atomes',
      'MY READING · 2026',
      '47',
      'read',
      '61',
      // The stand-in measure is wide: the label takes two lines here.
      'added to my',
      'Library',
      '9',
      'Series followed',
      ...['J', 'F', 'M', 'A', 'M', 'J', 'J', 'A', 'S', 'O', 'N', 'D'],
      'MOST READ',
      'One Piece',
      '12',
      'Blame!',
      '6',
      'Dune',
      '4',
      'Made with Atomes',
    ]);
  });

  test('draws one column per month with reads, the tallest for the most read month', () => {
    const drawn = bars(pictureSteps(input()));

    expect(drawn).toHaveLength(11);
    const heights = drawn.map((step) => (step.kind === 'rect' ? step.height : 0));
    expect(Math.max(...heights)).toBe(heights[6]);
    expect(heights[6] / heights[0]).toBeCloseTo(9 / 3);
  });

  test('every step stays inside the picture', () => {
    expectInside(pictureSteps(input()), 1080, 1920);
  });
});

describe('Series names', () => {
  test('off: no step holds a Series name, and "Most read" goes', () => {
    const steps = pictureSteps(input({ names: false }));
    const names = numbers().mostRead.series.rows.map(({ name }) => name);

    expect(texts(steps).filter((text) => names.some((name) => text.includes(name)) || text === 'MOST READ')).toEqual([]);
    expect(texts(steps)).toContain('Made with Atomes');
  });

  test('a long Series name is cut with an ellipsis and stays inside the picture', () => {
    const long = 'The Extraordinarily Long and Winding Chronicles of a Series Whose Name Never Seems to End, Volume Edition';
    const steps = pictureSteps(input({ numbers: numbers({ mostRead: { ...numbers().mostRead, series: { rows: [{ name: long, value: 120 }], outside: 0 } } }) }));
    const cut = texts(steps).find((text) => text.startsWith('The Extra'));

    expect(cut).toMatch(/…$/);
    expect(long.startsWith(cut!.slice(0, -1).trimEnd())).toBe(true);
    expect(cut!.length).toBeLessThan(long.length);
    expectInside(steps, 1080, 1920);
  });

  test('no read in the period: no "Most read"', () => {
    const steps = pictureSteps(input({ numbers: numbers({ mostRead: { ...numbers().mostRead, series: { rows: [], outside: 3 } } }) }));

    expect(texts(steps)).not.toContain('MOST READ');
  });
});

describe('the Square picture', () => {
  test('is 1080 × 1080, with no month names and no Series names', () => {
    const steps = pictureSteps(input({ format: 'square' }));

    expect(pictureSize('square')).toEqual({ width: 1080, height: 1080 });
    expect(steps[0]).toMatchObject({ kind: 'rect', width: 1080, height: 1080 });
    expect(texts(steps)).toEqual(['Atomes', 'MY READING · 2026', '47', 'read', '61', 'added to my Library', '9', 'Series followed', 'Made with Atomes']);
    expect(bars(steps)).toHaveLength(11);
    expectInside(steps, 1080, 1080);
  });
});

describe('All time', () => {
  test('the period says All time, and the columns are the years: the first and the last are named', () => {
    const years = { scale: 'year' as const, groups: ['2022', '2023', '2024', '2025', '2026'].map((at, index) => ({ at, read: index, added: 0 })) };
    const steps = pictureSteps(input({ period: 'all', numbers: numbers({ columns: years }) }));

    expect(texts(steps)).toContain('MY READING · ALL TIME');
    expect(texts(steps)).toContain('2022');
    expect(texts(steps)).toContain('2026');
    expect(texts(steps)).not.toContain('2024');
    expect(bars(steps)).toHaveLength(4);
    expectInside(steps, 1080, 1920);
  });

  test('no column at all (no dated read nor Copy): the picture keeps its numbers', () => {
    const steps = pictureSteps(input({ period: 'all', numbers: numbers({ read: 0, columns: { scale: 'year', groups: [] } }) }));

    expect(texts(steps)).toContain('0');
    expect(bars(steps)).toHaveLength(0);
    expectInside(steps, 1080, 1920);
  });
});

describe('French', () => {
  test('the words, the month letters and the numbers of the language', () => {
    const steps = pictureSteps(input({ language: 'fr', numbers: numbers({ read: 1234, added: 1, followed: 1 }) }));

    const found = texts(steps);

    expect(found).toEqual(expect.arrayContaining(['MES LECTURES · 2026', '1 234', 'lus', 'ajouté à ma', 'bibliothèque', 'Série suivie', 'LES PLUS LUS', 'Fait avec Atomes']));
    expect(found.slice(found.indexOf('Série suivie') + 1).slice(0, 12)).toEqual(['J', 'F', 'M', 'A', 'M', 'J', 'J', 'A', 'S', 'O', 'N', 'D']);
    expectInside(steps, 1080, 1920);
  });
});

describe('a number is never cut', () => {
  test('a wide lead number gets smaller and stays whole inside the picture', () => {
    const steps = pictureSteps(input({ numbers: numbers({ read: 123456789 }) }));
    const lead = steps.find((step) => step.kind === 'text' && step.text === '123,456,789');

    expect(lead).toBeDefined();
    expect(lead!.kind === 'text' && lead!.style.size).toBeLessThan(84 * 4.5);
    expectInside(steps, 1080, 1920);
  });
});

describe('a filter is on', () => {
  test('the line under the period names the Label and "Owned only", also with Series names off', () => {
    const both = texts(pictureSteps(input({ filters: { label: 'Manga', ownedOnly: true }, names: false })));

    expect(both.slice(1, 3)).toEqual(['MY READING · 2026', 'MANGA · OWNED ONLY']);
    expect(texts(pictureSteps(input({ filters: { label: 'Manga', ownedOnly: false } })))).toContain('MANGA');
    expect(texts(pictureSteps(input({ filters: { label: null, ownedOnly: true }, language: 'fr' })))).toContain('POSSÉDÉS SEULEMENT');
  });

  test('no filter: no line under the period', () => {
    expect(texts(pictureSteps(input())).slice(1, 3)).toEqual(['MY READING · 2026', '47']);
  });

  test('a long Label name is cut with an ellipsis, and every step stays inside both formats', () => {
    const filters = { label: 'Romans de science-fiction lus pendant les vacances d’été', ownedOnly: true };
    const story = pictureSteps(input({ filters }));

    expect(texts(story)[2]).toMatch(/…$/);
    expectInside(story, 1080, 1920);
    expectInside(pictureSteps(input({ filters, format: 'square', language: 'fr' })), 1080, 1080);
  });
});

describe('the text alternative of the preview', () => {
  test('says the numbers of the picture, and the Series names when they are on it', () => {
    expect(pictureAlt(input())).toBe('Picture: 47 read in 2026, 61 added, 9 Series followed. Most read: One Piece, Blame!, Dune.');
    expect(pictureAlt(input({ names: false }))).toBe('Picture: 47 read in 2026, 61 added, 9 Series followed.');
    expect(pictureAlt(input({ format: 'square' }))).toBe('Picture: 47 read in 2026, 61 added, 9 Series followed.');
    expect(pictureAlt(input({ language: 'fr', period: 'all' }))).toBe('Image : 47 lus au total, 61 ajoutés, 9 séries suivies. Les plus lus : One Piece, Blame!, Dune.');
    expect(pictureAlt(input({ filters: { label: 'Manga', ownedOnly: true }, names: false }))).toBe(
      'Picture: 47 read in 2026, 61 added, 9 Series followed. Filters: Manga, Owned only.',
    );
    expect(pictureAlt(input({ filters: { label: null, ownedOnly: true }, language: 'fr', names: false }))).toBe(
      'Image : 47 lus en 2026, 61 ajoutés, 9 séries suivies. Filtres : Possédés seulement.',
    );
  });
});
