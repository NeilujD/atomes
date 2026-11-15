// @vitest-environment happy-dom
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/preact';
import { afterEach, describe, expect, test } from 'vitest';
import type { Correction, Edition, SeriesFound } from '../lib/catalog/catalog';
import type { CorrectionAnswer } from '../lib/catalog/client';
import { SeriesCorrection, type Sources } from './SeriesCorrection';

const dragonBall41 = '9782723456739';
const dragonBall = { id: 'atomes:catalog.test:01DRAGONBALL', title: 'Dragon Ball', sameAs: [] };
const edition = {
  isbn: dragonBall41,
  title: 'Dragon Ball 41',
  publisher: 'Glénat',
  language: 'fre',
  format: '18 cm',
  series: dragonBall,
  volume: 41,
  volumes: [41],
  sources: ['BnF'],
} as unknown as Edition;
const found: SeriesFound[] = [
  {
    series: dragonBall,
    lines: [
      { anchor: '9782876952065', publisher: 'Glénat', first: 1993, last: 2008 },
      { anchor: '9782723448376', publisher: 'Glénat', first: 2003, last: 2008 },
    ],
  },
];

function screenFor(shown: Edition = edition, answer: CorrectionAnswer = { found: { ...edition, corrected: true } }) {
  const searched: string[] = [];
  const corrections: [string, Correction][] = [];
  const uncorrected: string[] = [];
  const result = { corrected: undefined as Edition | undefined };
  const sources: Sources = {
    find: (title) => {
      searched.push(title);
      return Promise.resolve({ found });
    },
    correct: (isbn, correction) => {
      corrections.push([isbn, correction]);
      return Promise.resolve(answer);
    },
    uncorrect: (isbn) => {
      uncorrected.push(isbn);
      return Promise.resolve({ found: edition });
    },
  };
  render(<SeriesCorrection editions={[shown]} onCorrected={([next]) => (result.corrected = next)} sources={sources} />);
  return { searched, corrections, uncorrected, result };
}

const sheet = () => within(screen.getByRole('dialog'));

async function openAndSearch() {
  fireEvent.click(screen.getByRole('button', { name: 'Change the Series of this book' }));
  fireEvent.click(sheet().getByRole('button', { name: 'Search' }));
  return sheet().findByRole('button', { name: 'Dragon Ball' });
}

afterEach(cleanup);

describe('Series Correction sheet (Book page)', () => {
  test('the reader moves Dragon Ball 41 to the 2003–2008 Edition Line: Series, then Edition Line, then Volume', async () => {
    const { searched, corrections, result } = screenFor();

    fireEvent.click(await openAndSearch());
    fireEvent.click(sheet().getByRole('radio', { name: 'Glénat · 2003–2008' }));
    fireEvent.click(sheet().getByRole('button', { name: 'Save' }));

    // The search starts from the Series the book is in; the Volume number is the one the Catalog knows.
    expect(searched).toEqual(['Dragon Ball']);
    await waitFor(() => expect(result.corrected?.corrected).toBe(true));
    expect(corrections).toEqual([[dragonBall41, { anchor: '9782723448376', volume: 41 }]]);
  });

  test('a book with no Series gets a new one, from its title, publisher, language and size', async () => {
    const novel = { ...edition, title: 'La Horde du Contrevent', series: null, volume: null, volumes: [], publisher: 'Folio', format: '18 x 11 cm' };
    const { corrections } = screenFor(novel);

    fireEvent.click(screen.getByRole('button', { name: 'Add to a Series' }));
    fireEvent.click(sheet().getByRole('button', { name: 'New Series' }));
    fireEvent.input(sheet().getByLabelText('Title of the Series'), { target: { value: ' La Horde ' } });
    fireEvent.input(sheet().getByLabelText('Volume number'), { target: { value: '1' } });
    fireEvent.click(sheet().getByRole('button', { name: 'Save' }));

    await waitFor(() =>
      expect(corrections).toEqual([
        [dragonBall41, { newSeries: { title: 'La Horde', publisher: 'Folio', language: 'fre', height: 18 }, volume: 1 }],
      ]),
    );
  });

  test('a wrong Volume number or size is not sent; an empty Volume is no Volume', async () => {
    const { corrections } = screenFor();
    fireEvent.click(await openAndSearch());

    fireEvent.input(sheet().getByLabelText('Volume number'), { target: { value: 'dix' } });
    fireEvent.click(sheet().getByRole('button', { name: 'Save' }));
    expect(await sheet().findByText('Type the Volume number, for example 10.')).toBeTruthy();
    fireEvent.input(sheet().getByLabelText('Volume number'), { target: { value: '' } });
    fireEvent.click(sheet().getByRole('button', { name: 'Save' }));

    await waitFor(() => expect(corrections).toEqual([[dragonBall41, { anchor: '9782876952065', volume: null }]]));
  });

  test('"Back to the sources" shows only on a corrected book, and deletes the Correction', async () => {
    screenFor();
    fireEvent.click(screen.getByRole('button', { name: 'Change the Series of this book' }));
    expect(sheet().queryByRole('button', { name: 'Back to the sources' })).toBeNull();
    cleanup();

    const { uncorrected, result } = screenFor({ ...edition, corrected: true });
    fireEvent.click(screen.getByRole('button', { name: 'Change the Series of this book' }));
    fireEvent.click(sheet().getByRole('button', { name: 'Back to the sources' }));

    await waitFor(() => expect(result.corrected).toBe(edition));
    expect(uncorrected).toEqual([dragonBall41]);
  });

  test.each([
    [{ signedOut: true } as const, 'Your session has ended. Sign in again.'],
    [{ tooMany: true } as const, 'Too many Series Corrections for now. Try again in an hour.'],
    [{ failed: true } as const, 'Could not save the correction. Try again.'],
  ])('a refused Correction says why: %j', async (answer, text) => {
    const { result } = screenFor(edition, answer);
    fireEvent.click(await openAndSearch());

    fireEvent.click(sheet().getByRole('button', { name: 'Save' }));

    expect(await sheet().findByText(text)).toBeTruthy();
    expect(result.corrected).toBeUndefined();
  });
});

describe('Move to Series (bulk select)', () => {
  const unnumbered = { ...edition, isbn: '9782723456746', title: 'Dragon Ball, hors-série', volume: null, volumes: [] } as Edition;

  function bulkFor(editions: Edition[]) {
    const corrections: [string, Correction][] = [];
    const result = { found: undefined as Edition[] | undefined };
    const sources: Sources = {
      find: () => Promise.resolve({ found }),
      correct: (isbn, correction) => {
        corrections.push([isbn, correction]);
        return Promise.resolve({ found: { ...editions.find((each) => each.isbn === isbn)!, corrected: true } });
      },
      uncorrect: () => Promise.reject(new Error('not asked')),
    };
    render(<SeriesCorrection editions={editions} button="Move to Series" onCorrected={(next) => (result.found = next)} sources={sources} />);
    return { corrections, result };
  }

  test('a known Volume number stays: the sheet asks only for the missing one', async () => {
    const { corrections, result } = bulkFor([edition, unnumbered]);

    fireEvent.click(screen.getByRole('button', { name: 'Move to Series' }));
    fireEvent.click(sheet().getByRole('button', { name: 'Search' }));
    fireEvent.click(await sheet().findByRole('button', { name: 'Dragon Ball' }));
    fireEvent.click(sheet().getByRole('radio', { name: 'Glénat · 2003–2008' }));
    expect(sheet().queryByLabelText('Volume number of Dragon Ball 41')).toBeNull();
    fireEvent.input(sheet().getByLabelText('Volume number of Dragon Ball, hors-série'), { target: { value: '42' } });
    fireEvent.click(sheet().getByRole('button', { name: 'Save' }));

    await waitFor(() => expect(result.found).toHaveLength(2));
    expect(corrections).toEqual([
      [dragonBall41, { anchor: '9782723448376', volume: 41 }],
      ['9782723456746', { anchor: '9782723448376', volume: 42 }],
    ]);
    expect(screen.queryByRole('button', { name: 'Back to the sources' })).toBeNull();
  });

  test('into a New Series: the first book makes it, the others join it', async () => {
    const { corrections } = bulkFor([edition, unnumbered]);

    fireEvent.click(screen.getByRole('button', { name: 'Move to Series' }));
    fireEvent.click(sheet().getByRole('button', { name: 'New Series' }));
    fireEvent.input(sheet().getByLabelText('Title of the Series'), { target: { value: 'Dragon Ball Z' } });
    fireEvent.click(sheet().getByRole('button', { name: 'Save' }));

    await waitFor(() =>
      expect(corrections).toEqual([
        [dragonBall41, { newSeries: { title: 'Dragon Ball Z', publisher: 'Glénat', language: 'fre', height: 18 }, volume: 41 }],
        ['9782723456746', { anchor: dragonBall41, volume: null }],
      ]),
    );
  });
});
