// @vitest-environment happy-dom
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/preact';
import { afterEach, describe, expect, test } from 'vitest';
import type { Edition } from '../lib/catalog/catalog';
import { handOverAddedCopies, takeAddedCopies } from '../lib/library/added-copies';
import { copyCollection, saveCopy, type Copy } from '../lib/library/copy';
import { followCollection, saveFollow, type Follow } from '../lib/library/follow';
import { labelCollection, saveLabel, type Label } from '../lib/library/label';
import { memorySpace } from '../lib/library/memory-space.fake';
import { bookHref } from '../lib/library/model';
import { readingStatusCollection, saveReadingStatus, type ReadingStatus } from '../lib/library/reading-status';
import { toBuyCollection, type ToBuy } from '../lib/library/to-buy';
import { Series, type Sources } from './Series';

const blacksad = { id: 'wd:Q1000001', title: 'Blacksad', sameAs: [] };

// An ISBN-13 from its first 12 digits.
const isbn = (twelve: string) => {
  const sum = [...twelve].reduce((total, digit, i) => total + Number(digit) * (i % 2 === 0 ? 1 : 3), 0);
  return `${twelve}${(10 - (sum % 10)) % 10}`;
};
// Volume n of line A (Dargaud, French) or line B (Dark Horse, English).
const volume = (n: number, line: 'A' | 'B' = 'A', change: Partial<Edition> = {}): Edition => ({
  isbn: isbn(`${line === 'A' ? '979109999' : '978150670'}${String(n).padStart(3, '0')}`),
  title: 'Blacksad',
  volumeTitle: null,
  authors: ['Juan Díaz Canales'],
  publisher: line === 'A' ? 'Dargaud' : 'Dark Horse',
  language: line === 'A' ? 'fre' : 'eng',
  format: null,
  cover: null,
  work: { id: `wd:Q${line === 'A' ? 2 : 3}00000${n}`, title: `Blacksad ${n}` },
  series: blacksad,
  volumes: [n],
  volume: n,
  year: (line === 'A' ? 2000 : 2010) + n,
  sources: ['BnF'],
  fetchedAt: '2026-11-06T10:00:00.000Z',
  ...change,
});
const lineA = [1, 2, 3, 4, 5].map((n) => volume(n, 'A'));
const lineB = [1, 2, 3, 4, 5].map((n) => volume(n, 'B'));
const all = [...lineA, ...lineB];

// The reader owns Volumes 1 and 3 of line A and read Volume 1; `follow` says how they follow Blacksad,
// in a record saved under `followed`. `lines` are the Edition Lines the Catalog answers. The reader has `labels`.
async function seriesPage(follow?: Follow['status'], editions: Edition[] = all, followed = blacksad.id, lines = [lineA, lineB], labels: Label[] = []) {
  const { space, stored } = memorySpace();
  for (const each of labels) await saveLabel(space, each);
  if (follow) await saveFollow(space, { series: followed, anchorIsbn: lineA[0].isbn, status: follow, updatedAt: '2026-11-06T11:00:00.000Z' });
  for (const n of [1, 3]) await saveCopy(space, { isbn: lineA[n - 1].isbn, works: [lineA[n - 1].work.id], createdAt: '2026-11-06T11:00:00.000Z' });
  await saveReadingStatus(space, { work: lineA[0].work.id, isbn: lineA[0].isbn, status: 'read', updatedAt: '2026-11-07T10:00:00.000Z' });
  const sources: Sources = {
    open: () => Promise.resolve(space),
    volumes: (each) => Promise.resolve(lines.find((line) => line.some(({ isbn: one }) => one === each))),
    editions: (isbns) => Promise.resolve(new Map(editions.filter(({ isbn: one }) => isbns.includes(one)).map((each) => [each.isbn, each]))),
    lines: () =>
      Promise.resolve([
        { anchor: lineA[0].isbn, publisher: 'Dargaud', first: 2001, last: 2005 },
        { anchor: lineB[0].isbn, publisher: 'Dark Horse', first: 2011, last: 2015 },
      ]),
  };
  render(<Series isbn={lineA[2].isbn} sources={sources} />);
  await screen.findByRole('heading', { name: 'Blacksad' });
  return {
    follows: () => stored(followCollection).map(({ value }) => value as Follow),
    keys: () => stored(followCollection).map(({ rkey }) => rkey),
    copies: () => stored(copyCollection).map(({ value }) => value as Copy),
    statuses: () => stored(readingStatusCollection).map(({ value }) => value as ReadingStatus),
    toBuy: () => stored(toBuyCollection).map(({ value }) => value as ToBuy),
    labels: () => stored(labelCollection).map(({ value }) => value as Label),
  };
}

const count = (label: string) => screen.getByText(label, { selector: 'dt' }).nextElementSibling?.textContent;
const missingList = () => within(screen.getByRole('region', { name: 'Missing Volumes' })).getAllByRole('listitem').map(({ textContent }) => textContent);

afterEach(cleanup);

describe('Series page', () => {
  test('shows the counts, the Missing Volume and the spine row', async () => {
    await seriesPage('following');

    expect(screen.getByText('Following')).toBeTruthy();
    expect([count('owned'), count('read'), count('missing'), count('next')]).toEqual(['2', '1', '1', '4']);
    expect(missingList()).toEqual(['2']);
    expect(screen.queryByText('not in the Catalog', { selector: 'dt' })).toBeNull();
    expect(screen.getByText('They are on your To Buy list.')).toBeTruthy();
    expect(['Volume 1: read', 'Volume 2: not owned', 'Volume 3: owned, not read', 'Volume 4: not owned'].map((name) => screen.getByText(name))).toHaveLength(4);
  });

  test('"Stop following" drops the Series, and Follow follows it again', async () => {
    const { follows } = await seriesPage('following');

    fireEvent.click(screen.getByRole('button', { name: 'Stop following' }));
    await screen.findByText('Dropped');
    expect(follows()[0]).toMatchObject({ status: 'dropped', anchorIsbn: lineA[0].isbn });
    expect(screen.getByText('Follow the Series to see them on your To Buy list.')).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: 'Follow' }));
    await screen.findByText('Following');
    expect(follows()[0]).toMatchObject({ status: 'following' });
  });

  test('a Series not followed yet is followed in the Edition Line of the linked Volume', async () => {
    const { follows } = await seriesPage();
    expect(screen.getByText('Not followed')).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: 'Follow' }));

    await screen.findByText('Following');
    expect(follows()).toEqual([expect.objectContaining({ series: blacksad.id, anchorIsbn: lineA[2].isbn, status: 'following' })]);
  });

  test('switching Edition Line from a Volume saves the new anchor and fromVolume; the page shows the new line from it on', async () => {
    const { follows } = await seriesPage('following');

    fireEvent.click(screen.getByRole('button', { name: 'Switch Edition Line' }));
    fireEvent.input(screen.getByLabelText('ISBN of the first Volume you collect in the new Edition Line'), { target: { value: lineB[3].isbn } });
    fireEvent.submit(screen.getByRole('button', { name: 'Switch' }).closest('form')!);

    await screen.findByText('From Volume 4');
    expect(follows()[0]).toMatchObject({ anchorIsbn: lineB[3].isbn, fromVolume: '4', status: 'following' });
    expect(screen.getByText('Dark Horse · 2011–2015')).toBeTruthy();
    // Volumes 1 to 3 stay in line A (Volume 2 still missing); 4 and 5 come from line B.
    await waitFor(() => expect([count('owned'), count('missing'), count('next')]).toEqual(['2', '1', '4']));
  });

  test('the page names the Edition Line by its publisher and years', async () => {
    await seriesPage('following');

    expect(screen.getByText('Dargaud · 2001–2005')).toBeTruthy();
  });

  test('the switch lists the other Edition Lines of the Series by name; picking one switches from its first Volume', async () => {
    const { follows } = await seriesPage('following');

    fireEvent.click(screen.getByRole('button', { name: 'Switch Edition Line' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Dark Horse · 2011–2015' }));

    await screen.findByText('Dark Horse · 2011–2015', { selector: '.series-tag' });
    expect(follows()[0]).toEqual(expect.objectContaining({ anchorIsbn: lineB[0].isbn, status: 'following' }));
    expect(follows()[0].fromVolume).toBeUndefined();
    expect(screen.queryByRole('button', { name: 'Dargaud · 2001–2005' })).toBeNull();
  });

  test('switching refuses a book of the same Edition Line, next to the field', async () => {
    const { follows } = await seriesPage('following');

    fireEvent.click(screen.getByRole('button', { name: 'Switch Edition Line' }));
    fireEvent.input(screen.getByLabelText('ISBN of the first Volume you collect in the new Edition Line'), { target: { value: lineA[3].isbn } });
    fireEvent.submit(screen.getByRole('button', { name: 'Switch' }).closest('form')!);

    expect(await screen.findByText('This book is already in your Edition Line.')).toBeTruthy();
    expect(follows()[0]).toMatchObject({ anchorIsbn: lineA[0].isbn });
  });

  test('a book of no Series says so', async () => {
    const { space } = memorySpace();
    const alone = volume(1, 'A', { series: null });
    render(<Series isbn={alone.isbn} sources={{ open: () => Promise.resolve(space), volumes: () => Promise.resolve([alone]), editions: () => Promise.resolve(new Map()), lines: () => Promise.resolve([]) }} />);

    expect(await screen.findByText('The Catalog knows no Series for this book.')).toBeTruthy();
  });
});

describe('Series page of a follow saved under an older identifier (same_as, ADR 0010)', () => {
  // The Catalog minted this identifier first; it now answers wd:Q1000001, same as it.
  const minted = 'atomes:catalog.test:01M750SM80AX373XJ01DSVNDXC';
  const linked = { ...blacksad, sameAs: [minted] };
  const linkedLines = [lineA, lineB].map((line) => line.map((each) => ({ ...each, series: linked })));

  test('the Series shows as followed, and dropping it changes the same record', async () => {
    const { follows, keys } = await seriesPage('following', linkedLines.flat(), minted, linkedLines);

    expect(screen.getByText('Following')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Stop following' }));
    await screen.findByText('Dropped');

    expect(keys()).toEqual([minted]);
    expect(follows()).toEqual([expect.objectContaining({ series: minted, status: 'dropped' })]);
  });
});

describe('Labels on the Series page', () => {
  const createdAt = '2026-11-05T10:00:00.000Z';

  test('"+ Label" puts a new Label on the Series, and its chip takes it off the Series only', async () => {
    const { labels } = await seriesPage('following');

    fireEvent.click(await screen.findByRole('button', { name: 'Label' }));
    fireEvent.input(screen.getByRole('textbox', { name: 'New Label for the Series' }), { target: { value: 'Noir' } });
    fireEvent.click(screen.getByRole('button', { name: 'Add' }));

    const remove = await screen.findByRole('button', { name: 'Remove the Label Noir from this Series' });
    expect(labels()).toEqual([expect.objectContaining({ name: 'Noir', works: [], series: [blacksad.id] })]);

    fireEvent.click(remove);
    await waitFor(() => expect(labels()).toEqual([expect.objectContaining({ name: 'Noir', works: [], series: [] })]));
  });

  test('one of the reader’s Labels goes on the Series in one tap and keeps its Works', async () => {
    const { labels } = await seriesPage('following', all, blacksad.id, [lineA, lineB], [{ name: 'Cats', works: [lineA[0].work.id], createdAt }]);

    fireEvent.click(await screen.findByRole('button', { name: 'Label' }));
    fireEvent.click(screen.getByRole('button', { name: 'Cats' }));

    expect(await screen.findByRole('button', { name: 'Remove the Label Cats from this Series' })).toBeTruthy();
    expect(labels()).toEqual([expect.objectContaining({ name: 'Cats', works: [lineA[0].work.id], series: [blacksad.id] })]);
  });
});

describe('Volume sheet', () => {
  const sheet = () => within(screen.getByRole('dialog'));
  const spine = (name: string) => screen.getByRole('button', { name });

  test('each spine is a button that opens the Volume sheet: cover, title, Volume number, state, actions', async () => {
    await seriesPage('following');

    fireEvent.click(spine('Volume 2: not owned'));

    expect(sheet().getByRole('heading', { name: 'Blacksad' })).toBeTruthy();
    expect(sheet().getByText('Volume 2', { selector: 'p' })).toBeTruthy();
    expect(sheet().getByText('Dargaud · 2001–2005')).toBeTruthy();
    expect(sheet().getByText('Not owned')).toBeTruthy();
    expect(sheet().getByRole('button', { name: 'I bought it' })).toBeTruthy();
    expect(sheet().getByRole('button', { name: 'Mark read' })).toBeTruthy();
    expect(sheet().getByRole('link', { name: 'Open' }).getAttribute('href')).toBe(bookHref(lineA[1].work.id));
  });

  test('"I bought it" saves one Copy of the Volume and the spine turns owned', async () => {
    const { copies } = await seriesPage('following');

    fireEvent.click(spine('Volume 2: not owned'));
    fireEvent.click(sheet().getByRole('button', { name: 'I bought it' }));

    await waitFor(() => expect(spine('Volume 2: owned, not read')).toBeTruthy());
    expect(copies().filter(({ isbn: one }) => one === lineA[1].isbn)).toEqual([expect.objectContaining({ works: [lineA[1].work.id] })]);
    expect(copies()).toHaveLength(3);
    // Owned now: no second Copy from the same sheet.
    expect(sheet().queryByRole('button', { name: 'I bought it' })).toBeNull();
    expect(sheet().getByText('Owned, not read')).toBeTruthy();
  });

  test('"Mark read" saves a Reading Status for the Work of the Volume, and the spine turns read', async () => {
    const { statuses } = await seriesPage('following');

    fireEvent.click(spine('Volume 3: owned, not read'));
    fireEvent.click(sheet().getByRole('button', { name: 'Mark read' }));

    await waitFor(() => expect(spine('Volume 3: read')).toBeTruthy());
    expect(statuses()).toContainEqual(expect.objectContaining({ work: lineA[2].work.id, isbn: lineA[2].isbn, status: 'read' }));
    expect(sheet().queryByRole('button', { name: 'Mark read' })).toBeNull();
  });

  test('marking a Volume of a Series not followed yet read follows it', async () => {
    const { follows } = await seriesPage();

    fireEvent.click(spine('Volume 2: not owned'));
    fireEvent.click(sheet().getByRole('button', { name: 'Mark read' }));

    await screen.findByText('Following');
    expect(follows()).toEqual([expect.objectContaining({ series: blacksad.id, anchorIsbn: lineA[1].isbn, status: 'following' })]);
  });

  test('a Volume read and not owned is outlined with the read mark, not Missing, and "Add to To Buy" puts it on To Buy by hand', async () => {
    const { toBuy } = await seriesPage('following');

    fireEvent.click(spine('Volume 2: not owned'));
    fireEvent.click(sheet().getByRole('button', { name: 'Mark read' }));

    await waitFor(() => expect(spine('Volume 2: read, not owned')).toBeTruthy());
    expect(count('missing')).toBe('0');
    expect(screen.queryByRole('heading', { name: 'Missing Volumes' })).toBeNull();
    expect(sheet().getByText('Read, not owned')).toBeTruthy();

    fireEvent.click(sheet().getByRole('button', { name: 'Add to To Buy' }));

    await waitFor(() => expect(sheet().getByText('On your To Buy list')).toBeTruthy());
    expect(toBuy()).toEqual([expect.objectContaining({ isbn: lineA[1].isbn })]);
    expect(sheet().queryByRole('button', { name: 'Add to To Buy' })).toBeNull();
  });

  test('a Volume the Catalog lacks is in the Missing list, counted apart, and a tap on it says why', async () => {
    document.body.insertAdjacentHTML(
      'beforeend',
      `<div data-toasts></div>
      <template data-toast-template>
        <div data-toast><p data-toast-text></p><button type="button" data-toast-action hidden></button><button type="button" data-toast-close></button></div>
      </template>`,
    );
    // The Catalog has no Edition of Volume 2; the reader owns 1 and 3.
    const gap = lineA.filter(({ volume: n }) => n !== 2);
    await seriesPage('following', [...gap, ...lineB], blacksad.id, [gap, lineB]);

    expect([count('missing'), count('not in the Catalog')]).toEqual(['0', '1']);
    expect(missingList()).toEqual(['2']);
    // Not on To Buy: the Catalog has no ISBN to buy.
    expect(screen.queryByText('They are on your To Buy list.')).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: 'Volume 2, not in the Catalog yet' }));

    expect(await screen.findByText('The Catalog has no Edition of Volume 2 yet.')).toBeTruthy();
  });

  // A modal <dialog>: the browser closes it on Escape (happy-dom does not; checked in a browser).
  test('the sheet is modal; Close and a tap on the backdrop close it', async () => {
    await seriesPage('following');
    const dialog = screen.getByRole<HTMLDialogElement>('dialog', { hidden: true });

    fireEvent.click(spine('Volume 2: not owned'));
    expect(dialog.open).toBe(true);
    fireEvent.click(sheet().getByRole('button', { name: 'Close' }));
    expect(dialog.open).toBe(false);

    fireEvent.click(spine('Volume 4: not owned'));
    expect(sheet().getByText('Volume 4', { selector: 'p' })).toBeTruthy();
    fireEvent.click(dialog);
    expect(dialog.open).toBe(false);
  });
});

describe('Series page after Series Onboarding', () => {
  test('a toast says how many Copies were added, and Undo removes exactly those, once', async () => {
    document.body.insertAdjacentHTML(
      'beforeend',
      `<div data-toasts></div>
      <template data-toast-template>
        <div data-toast><p data-toast-text></p><button type="button" data-toast-action hidden></button><button type="button" data-toast-close></button></div>
      </template>`,
    );
    const { space, stored } = memorySpace();
    const copy = (n: number): Copy => ({ isbn: lineA[n - 1].isbn, works: [lineA[n - 1].work.id], createdAt: '2026-11-14T11:00:00.000Z' });
    // Quick Add saved Volume 3; Series Onboarding added Volumes 1 and 2.
    const quickAdd = await saveCopy(space, copy(3));
    const added = [await saveCopy(space, copy(1)), await saveCopy(space, copy(2))];
    handOverAddedCopies(sessionStorage, { rkeys: added.map(({ rkey }) => rkey), text: '2 Copies added.' });
    const sources: Sources = {
      open: () => Promise.resolve(space),
      volumes: () => Promise.resolve(lineA),
      editions: () => Promise.resolve(new Map()),
      lines: () => Promise.resolve([]),
    };
    render(<Series isbn={lineA[2].isbn} sources={sources} />);

    expect(await screen.findByText('2 Copies added.')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Undo' }));

    await waitFor(() => expect(stored(copyCollection).map(({ rkey }) => rkey)).toEqual([quickAdd.rkey]));
    expect(takeAddedCopies(sessionStorage)).toBeUndefined();
  });
});
