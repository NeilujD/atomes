// @vitest-environment happy-dom
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/preact';
import { afterEach, describe, expect, test } from 'vitest';
import type { Edition } from '../lib/catalog/catalog';
import { copyCollection, saveCopy } from '../lib/library/copy';
import { saveFollow } from '../lib/library/follow';
import { memorySpace } from '../lib/library/memory-space.fake';
import { saveToBuy, toBuyCollection } from '../lib/library/to-buy';
import { ToBuy, type Sources } from './ToBuy';

const series = { id: 'wd:Q1000001', title: 'Blacksad', sameAs: [] };
const isbns = ['9791099999016', '9791099999023', '9791099999030', '9791099999047', '9791099999054'];
const volume = (n: number): Edition => ({
  isbn: isbns[n - 1],
  title: 'Blacksad',
  volumeTitle: null,
  authors: ['Juan Díaz Canales'],
  publisher: 'Dargaud',
  language: 'fre',
  format: null,
  cover: null,
  work: { id: `wd:Q200000${n}`, title: `Blacksad ${n}` },
  series,
  volumes: [n],
  volume: n,
  sources: ['BnF'],
  fetchedAt: '2026-11-06T10:00:00.000Z',
});
const line = [1, 2, 3, 4, 5].map(volume);
const dune = '9782266320481';

// The reader follows Blacksad and owns Volumes `owned`: by default 1 and 3, so
// 2, 4 and 5 are to buy. Dune was added by hand.
async function screenWithLibrary(owned = [1, 3]) {
  const { space, stored } = memorySpace();
  await saveFollow(space, { series: series.id, anchorIsbn: isbns[0], status: 'following', updatedAt: '2026-11-06T11:00:00.000Z' });
  for (const n of owned) await saveCopy(space, { isbn: isbns[n - 1], works: [volume(n).work.id], createdAt: '2026-11-06T11:00:00.000Z' });
  await saveToBuy(space, { isbn: dune, createdAt: '2026-11-07T10:00:00.000Z' });
  const sources: Sources = {
    open: () => Promise.resolve(space),
    volumes: (isbn) => Promise.resolve(isbn === isbns[0] ? line : undefined),
    // The Catalog does not know Dune: the screen shows its ISBN.
    editions: () => Promise.resolve(new Map()),
  };
  render(<ToBuy sources={sources} />);
  return { stored };
}

const followed = 'From the Series you follow';
const group = (name: string) => within(screen.getByRole('region', { name }));
// The title of a book the Catalog does not know is its ISBN, as is the line under it: take the first.
const row = (name: string, text: string) => group(name).getAllByText(text)[0].closest('li')!;
// Opens the row of a Series, once the screen shows it.
async function openSeries(name: string) {
  fireEvent.click(await screen.findByRole('button', { name }));
}

afterEach(cleanup);

describe('To Buy screen', () => {
  test('shows the Volumes the reader does not own in a Followed Series, and the Edition added by hand', async () => {
    await screenWithLibrary();
    await openSeries('Blacksad · 3 Volumes (2, 4–5)');

    expect(group(followed).getAllByRole('listitem').map((each) => within(each).getByText(/^Volume /).textContent)).toEqual([
      'Volume 2',
      'Volume 4',
      'Volume 5',
    ]);
    expect(group('Added by hand').getByText(`ISBN ${dune}`, { selector: '.to-buy-title' })).toBeTruthy();
    // A Volume of a Followed Series is computed: it can be bought, not removed.
    expect(within(row(followed, 'Volume 2')).queryByRole('button', { name: 'Remove' })).toBeNull();
  });

  test('a Series group shows its count and range, and opens to its Volumes', async () => {
    await screenWithLibrary();
    const toggle = await screen.findByRole('button', { name: 'Blacksad · 3 Volumes (2, 4–5)' });

    expect(toggle.getAttribute('aria-expanded')).toBe('false');
    expect(group(followed).queryAllByRole('listitem')).toHaveLength(0);

    fireEvent.click(toggle);

    expect(toggle.getAttribute('aria-expanded')).toBe('true');
    expect(group(followed).getAllByRole('listitem')).toHaveLength(3);
    expect(group(followed).getByRole('link', { name: 'Open the Series page' }).getAttribute('href')).toBe(`/series?isbn=${isbns[1]}`);
  });

  test('"I bought it" on a Volume adds the Copy, and the Volume leaves the list', async () => {
    const { stored } = await screenWithLibrary();
    await openSeries('Blacksad · 3 Volumes (2, 4–5)');

    fireEvent.click(within(row(followed, 'Volume 2')).getByRole('button', { name: 'I bought it' }));

    expect(await screen.findByRole('button', { name: 'Blacksad · 2 Volumes (4–5)' })).toBeTruthy();
    expect(stored(copyCollection).map(({ value }) => (value as { isbn: string }).isbn)).toContain(isbns[1]);
  });

  test('a reader who owns every Volume of the Series they follow is told the rule', async () => {
    await screenWithLibrary([1, 2, 3, 4, 5]);

    expect(await screen.findByText(/^Nothing to buy in the Series you follow\./)).toBeTruthy();
  });

  test('an Edition added by hand appears, and Remove takes it off', async () => {
    const { stored } = await screenWithLibrary();
    await screen.findByRole('button', { name: /^Blacksad/ });

    // A book of no Followed Series.
    const other = '9782505000013';
    fireEvent.input(screen.getByLabelText('Add a book by its ISBN'), { target: { value: '978-2-505-00001-3' } });
    fireEvent.submit(screen.getByRole('button', { name: 'Add' }).closest('form')!);
    expect(await group('Added by hand').findAllByText(`ISBN ${other}`)).not.toHaveLength(0);
    expect(screen.getByLabelText('Add a book by its ISBN')).toHaveProperty('value', '');

    fireEvent.click(within(row('Added by hand', `ISBN ${dune}`)).getByRole('button', { name: 'Remove' }));

    await waitFor(() => expect(group('Added by hand').queryAllByText(`ISBN ${dune}`)).toHaveLength(0));
    expect(stored(toBuyCollection).map(({ rkey }) => rkey)).toEqual([other]);
  });

  test('a book the reader owns is refused next to the field, and nothing is saved', async () => {
    const { stored } = await screenWithLibrary();
    await screen.findByRole('button', { name: /^Blacksad/ });

    fireEvent.input(screen.getByLabelText('Add a book by its ISBN'), { target: { value: isbns[0] } });
    fireEvent.submit(screen.getByRole('button', { name: 'Add' }).closest('form')!);

    expect(screen.getByText('You already have this book.')).toBeTruthy();
    expect(screen.getByLabelText('Add a book by its ISBN').getAttribute('aria-invalid')).toBe('true');
    expect(stored(toBuyCollection).map(({ rkey }) => rkey)).toEqual([dune]);
  });

  test('a long Series shows 10 Volumes, then the next ones on demand', async () => {
    // Volumes 1 to 15, valid ISBN-13s; the reader owns 1 and 15, so 2 to 14 are to buy.
    const isbnOf = (n: number) => {
      const first12 = `979109998${String(n).padStart(3, '0')}`;
      const sum = [...first12].reduce((total, digit, i) => total + Number(digit) * (i % 2 === 0 ? 1 : 3), 0);
      return `${first12}${(10 - (sum % 10)) % 10}`;
    };
    const long = Array.from({ length: 15 }, (_, i) => ({ ...volume(1), isbn: isbnOf(i + 1), volumes: [i + 1], volume: i + 1, work: { id: `wd:Q30000${i + 1}`, title: '' } }));
    const { space } = memorySpace();
    await saveFollow(space, { series: series.id, anchorIsbn: long[0].isbn, status: 'following', updatedAt: '2026-11-06T11:00:00.000Z' });
    for (const each of [long[0], long[14]]) await saveCopy(space, { isbn: each.isbn, works: [each.work.id], createdAt: '2026-11-06T11:00:00.000Z' });
    render(<ToBuy sources={{ open: () => Promise.resolve(space), volumes: () => Promise.resolve(long), editions: () => Promise.resolve(new Map()) }} />);

    await openSeries('Blacksad · 13 Volumes (2–14)');
    expect(group(followed).getAllByRole('listitem')).toHaveLength(10);

    fireEvent.click(screen.getByRole('button', { name: 'Show 3 more (3 left)' }));

    expect(group(followed).getAllByRole('listitem')).toHaveLength(13);
    expect(screen.queryByRole('button', { name: /^Show/ })).toBeNull();
  });

  test('a cover pulses until its image has loaded, and keeps the placeholder if it fails', async () => {
    const { space } = memorySpace();
    await saveToBuy(space, { isbn: isbns[0], createdAt: '2026-11-07T10:00:00.000Z' });
    await saveToBuy(space, { isbn: isbns[1], createdAt: '2026-11-06T10:00:00.000Z' });
    const withCover = (n: number) => ({ ...volume(n), cover: 'https://inventaire.io/img/x' });
    render(
      <ToBuy
        sources={{
          open: () => Promise.resolve(space),
          volumes: () => Promise.resolve(undefined),
          editions: () => Promise.resolve(new Map([[isbns[0], withCover(1)], [isbns[1], withCover(2)]])),
        }}
      />,
    );
    await screen.findByText('Volume 1');
    const [first, second] = document.querySelectorAll<HTMLImageElement>('.to-buy-cover img');
    expect(first.closest('[data-loading]')).toBeTruthy();
    expect(first.loading).toBe('lazy');

    fireEvent.load(first);
    fireEvent.error(second);

    await waitFor(() => expect(first.hasAttribute('data-loaded')).toBe(true));
    expect(first.closest('[data-loading]')).toBeNull();
    expect(document.querySelectorAll('.to-buy-cover img')).toHaveLength(1);
  });

  test('signed out: says to sign in', async () => {
    render(<ToBuy sources={{ open: () => Promise.resolve(undefined), volumes: () => Promise.resolve(undefined), editions: () => Promise.resolve(new Map()) }} />);

    expect(await screen.findByText('Sign in to see what to buy.', { exact: false })).toBeTruthy();
  });
});
