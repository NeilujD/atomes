// @vitest-environment happy-dom
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/preact';
import type { Window as HappyWindow } from 'happy-dom';
import { afterEach, beforeEach, describe, expect, test } from 'vitest';
import type { Edition } from '../lib/catalog/catalog';
import { saveCopy } from '../lib/library/copy';
import { deleteLabel, labelCollection, listLabels, saveLabel } from '../lib/library/label';
import { memorySpace } from '../lib/library/memory-space.fake';
import { saveReadingStatus } from '../lib/library/reading-status';
import { reconnectEvent } from '../lib/network';
import type { WriteState } from '../lib/space/queued-store';
import { Library, type Sources } from './Library';
import type { SelectionSources } from './Selection';

const edition = (isbn: string, title: string, authors: string[]): Edition => ({
  isbn,
  title,
  volumeTitle: null,
  authors,
  publisher: null,
  language: null,
  format: null,
  cover: null,
  work: { id: `wd:Q${isbn.slice(-6)}`, title },
  series: null,
  volumes: [],
  volume: null,
  sources: ['BnF'],
  fetchedAt: '2026-11-01T00:00:00.000Z',
});
const books = [
  edition('9782864976165', 'Astérix', ['Fabcaro']),
  edition('9782266320481', 'Dune', ['Frank Herbert']),
  edition('9782070464234', 'La Horde du Contrevent', ['Alain Damasio']),
];

// Two Volumes of one Series.
const onePiece = { id: 'wd:Q673', title: 'One Piece', sameAs: [] };
const volumes = ['9782723434621', '9782723434638'].map((isbn, index) => ({ ...edition(isbn, 'One Piece', ['Eiichirō Oda']), series: onePiece, volumes: [index + 1], volume: index + 1 }));
// A Volume of a second Series.
const gaston = { ...edition('9782800101187', 'Gaston 1', ['André Franquin']), series: { id: 'wd:Q30', title: 'Gaston', sameAs: [] }, volumes: [1], volume: 1 };
// Seventeen more novels, B to Z: with the three books, twenty, the fewest that get the A to Z index.
const isbn = (twelve: string) => {
  const sum = [...twelve].reduce((total, digit, at) => total + Number(digit) * (at % 2 === 0 ? 1 : 3), 0);
  return `${twelve}${(10 - (sum % 10)) % 10}`;
};
const shelf = [...'BEFGIJKMNOPQRSTVZ'].map((letter, at) => edition(isbn(`978207099${at + 100}`), `${letter}ook ${at}`, []));

// Bulk select calls no server unless a test says what it answers.
const refuse = () => Promise.reject(new Error('Not called in this test'));
const noSelectionCalls: SelectionSources = {
  sharing: { load: refuse, setPrivateWorks: refuse },
  correction: { find: refuse, correct: refuse, uncorrect: refuse },
  refresh: () => Promise.resolve(),
};

// The reader owns the three books and has read Dune (owned or not). `labelled`: the books that carry the Label "Sci-fi".
async function libraryScreen(owned = books, labelled: Edition[] = [], state: WriteState = 'sent', selection: Partial<SelectionSources> = {}) {
  const { space } = memorySpace(state);
  if (labelled.length > 0) await saveLabel(space, { name: 'Sci-fi', works: labelled.map((each) => each.work.id), createdAt: '2026-11-01T00:00:00.000Z' });
  for (const each of owned) await saveCopy(space, { isbn: each.isbn, works: [each.work.id], createdAt: '2026-11-01T00:00:00.000Z' });
  await saveReadingStatus(space, { work: books[1].work.id, isbn: books[1].isbn, status: 'read', updatedAt: '2026-11-02T00:00:00.000Z' });
  const sources: Sources = {
    open: () => Promise.resolve(space),
    editions: (isbns) => Promise.resolve(new Map([...books, ...volumes, gaston, ...shelf].filter((each) => isbns.includes(each.isbn)).map((each) => [each.isbn, each]))),
    selection: { ...noSelectionCalls, ...selection },
  };
  render(<Library sources={sources} />);
  await screen.findAllByRole('list');
  return space;
}

const titles = () => within(screen.getByRole('list')).getAllByRole('link').map((link) => link.querySelector('.library-book-title')?.textContent);

afterEach(() => {
  cleanup();
  localStorage.clear();
  history.replaceState(null, '');
});

describe('Library screen', () => {
  test('shows every book A to Z, each linking to its Book page', async () => {
    await libraryScreen();

    expect(titles()).toEqual(['Astérix', 'Dune', 'La Horde du Contrevent']);
    expect(screen.getAllByRole('link', { name: /Dune/ })[0].getAttribute('href')).toBe('/book?work=wd%3AQ320481');
  });

  test('a search without accents narrows the grid and says how many books it finds; Clear all brings every book back, with no count', async () => {
    await libraryScreen();
    // No search or filter: no count, and the place where it is read aloud waits.
    expect(screen.getByRole('status').textContent).toBe('');

    fireEvent.input(screen.getByRole('searchbox', { name: 'Search your Library' }), { target: { value: 'asterix' } });

    expect(titles()).toEqual(['Astérix']);
    expect(screen.getByRole('status').textContent).toBe('1 of 3 books');

    fireEvent.click(screen.getAllByRole('button', { name: 'Clear all' })[0]);

    expect(titles()).toEqual(['Astérix', 'Dune', 'La Horde du Contrevent']);
    expect(screen.getByRole<HTMLInputElement>('searchbox').value).toBe('');
    expect(screen.getByRole('status').textContent).toBe('');
    expect(screen.queryByRole('button', { name: 'Clear all' })).toBeNull();
  });

  test('the Reading Status chips show their counts only once a search or a filter is on', async () => {
    await libraryScreen();
    const statusChips = () => within(screen.getAllByRole('group', { name: 'Reading Status' })[0]).getAllByRole('button').map((chip) => chip.textContent);

    expect(statusChips()).toEqual(['All', 'Not yet', 'Reading', 'Read', 'Abandoned']);

    fireEvent.input(screen.getByRole('searchbox'), { target: { value: 'd' } });

    expect(statusChips()).toEqual(['All2', 'Not yet1', 'Reading0', 'Read1', 'Abandoned0']);
  });

  test('a search that finds nothing says so and offers Clear all', async () => {
    await libraryScreen();
    fireEvent.input(screen.getByRole('searchbox'), { target: { value: 'zzz' } });

    expect(screen.getByText('No book matches these filters.')).toBeTruthy();
  });

  test('a Label filter whose Label is deleted on another device falls away: every book shows and "All" is the Label chip pressed', async () => {
    const space = await libraryScreen(books, [books[1]]);
    const labelChips = () => within(screen.getAllByRole('group', { name: 'Label' })[0]);
    fireEvent.click(labelChips().getByRole('button', { name: /Sci-fi/ }));

    expect(titles()).toEqual(['Dune']);

    // Another device deletes the Label and makes another; this one reads the Library again.
    const [{ rkey }] = (await space.list(labelCollection)).records;
    await deleteLabel(space, rkey);
    await saveLabel(space, { name: 'Manga', works: [], createdAt: '2026-11-02T00:00:00.000Z' });
    dispatchEvent(new Event(reconnectEvent));

    await waitFor(() => expect(titles()).toEqual(['Astérix', 'Dune', 'La Horde du Contrevent']));
    expect(labelChips().getByRole('button', { name: /All/ }).getAttribute('aria-pressed')).toBe('true');
    expect(screen.getByRole('status').textContent).toBe('');
  });

  test('Series mode shows one card per Series, opening its Series page, and is still on after a reload; a book with no Series makes no card', async () => {
    await libraryScreen([...books, ...volumes]);
    fireEvent.click(screen.getByRole('radio', { name: 'Series' }));

    expect(titles()).toEqual(['One Piece']);
    expect(screen.getByRole('link', { name: /One Piece/ }).getAttribute('href')).toBe('/series?isbn=9782723434621');

    // A reload: the screen starts again, on the same device.
    cleanup();
    await libraryScreen([...books, ...volumes]);

    expect(titles()).toEqual(['One Piece']);
  });

  test('in Series mode, a search counts the Series cards it finds, out of the Series of the Library', async () => {
    await libraryScreen([...books, ...volumes, gaston]);
    fireEvent.click(screen.getByRole('radio', { name: 'Series' }));
    // Five books found, two Series.
    fireEvent.input(screen.getByRole('searchbox'), { target: { value: 'o' } });

    expect(titles()).toEqual(['Gaston', 'One Piece']);
    expect(screen.getByRole('status').textContent).toBe('2 of 2 Series');

    fireEvent.input(screen.getByRole('searchbox'), { target: { value: 'oda' } });

    expect(screen.getByRole('status').textContent).toBe('1 of 2 Series');
  });

  test('Series mode with no book in a Series says so, with no empty grid', async () => {
    await libraryScreen();
    fireEvent.click(screen.getByRole('radio', { name: 'Series' }));

    expect(screen.getByText('No book of your Library is in a Series.')).toBeTruthy();
    expect(screen.queryByRole('list')).toBeNull();
    expect(screen.queryByRole('button', { name: 'Clear all' })).toBeNull();
  });

  test('in Series mode, a filter that keeps only books with no Series says no Series matches, and offers Clear all', async () => {
    await libraryScreen([...books, ...volumes]);
    fireEvent.click(screen.getByRole('radio', { name: 'Series' }));
    fireEvent.input(screen.getByRole('searchbox'), { target: { value: 'dune' } });

    expect(screen.getByText('No Series matches these filters.')).toBeTruthy();
    expect(screen.getByRole('status').textContent).toBe('0 of 1 Series');
    expect(screen.getAllByRole('button', { name: 'Clear all' }).length).toBeGreaterThan(0);
  });
});

describe('Owned or not', () => {
  // Dune is read; its only Copy was removed.
  const readNotOwned = () => libraryScreen([books[0], books[2]]);

  test('a Work read with no Copy carries the quiet "Not owned" mark in Grid, List and Cover flow; an owned one does not', async () => {
    await readNotOwned();

    expect(screen.getByRole('link', { name: /Dune/ }).textContent).toContain('Not owned');
    expect(screen.getByRole('link', { name: /Astérix/ }).textContent).not.toContain('Not owned');

    choose('List');

    expect(within(screen.getByRole('region', { name: 'D' })).getByRole('link', { name: /Dune/ }).textContent).toContain('Not owned');
    expect(within(screen.getByRole('region', { name: 'A' })).getByRole('link', { name: /Astérix/ }).textContent).not.toContain('Not owned');

    choose('Cover flow');

    expect(screen.getByRole('link', { current: true }).getAttribute('aria-label')).toBe('Dune, Not owned');
    expect(screen.getByRole('link', { name: 'Astérix' })).toBeTruthy();
    expect(screen.getByText(/Read · Not owned/)).toBeTruthy();
  });

  test('the "Not owned" filter lists only the Works with no Copy; Clear all brings every book back', async () => {
    await readNotOwned();
    const ownedChips = () => within(screen.getAllByRole('group', { name: 'Owned or not' })[0]);
    fireEvent.click(ownedChips().getByRole('button', { name: /Not owned/ }));

    expect(titles()).toEqual(['Dune']);
    expect(screen.getByText('1 of 3 books')).toBeTruthy();

    fireEvent.click(ownedChips().getByRole('button', { name: /^Owned/ }));

    expect(titles()).toEqual(['Astérix', 'La Horde du Contrevent']);

    fireEvent.click(screen.getAllByRole('button', { name: 'Clear all' })[0]);

    expect(titles()).toEqual(['Astérix', 'Dune', 'La Horde du Contrevent']);
  });
});

const headings = () => screen.getAllByRole('heading', { level: 2 }).map((heading) => heading.textContent);
const choose = (mode: string) => fireEvent.click(screen.getByRole('radio', { name: mode }));

describe('Library modes', () => {
  test('List puts the books under their letters, each linking to its Book page; Grid brings the grid back', async () => {
    await libraryScreen();
    choose('List');

    expect(headings()).toEqual(['A', 'D', 'L']);
    expect(within(screen.getByRole('region', { name: 'D' })).getByRole('link', { name: /Dune/ }).getAttribute('href')).toBe('/book?work=wd%3AQ320481');

    choose('Grid');

    expect(screen.queryAllByRole('heading', { level: 2 })).toEqual([]);
    expect(titles()).toEqual(['Astérix', 'Dune', 'La Horde du Contrevent']);
  });

  test('a List row shows the Reading Status only when the book is not unread', async () => {
    await libraryScreen();
    choose('List');
    const row = (letter: string) => within(screen.getByRole('region', { name: letter })).getByRole('link');

    expect(row('D').textContent).toContain('Read');
    expect(row('A').textContent).not.toContain('Not yet');
    expect(row('L').textContent).not.toContain('Not yet');
  });

  test('with 20 books, List has an A to Z index of the letters with books; a letter jumps there and moves the focus to its group', async () => {
    await libraryScreen([...books, ...shelf]);
    choose('List');
    const index = within(screen.getByRole('navigation', { name: 'Jump to a letter' }));

    expect(index.getAllByRole('button').map((button) => button.textContent).join('')).toBe('ABDEFGIJKLMNOPQRSTVZ');

    fireEvent.click(index.getByRole('button', { name: 'L' }));

    expect(document.activeElement).toBe(screen.getByRole('region', { name: 'L' }));
  });

  test('under 20 books, List has no index', async () => {
    await libraryScreen();
    choose('List');

    expect(headings()).toEqual(['A', 'D', 'L']);
    expect(screen.queryByRole('navigation', { name: 'Jump to a letter' })).toBeNull();
  });

  test('the mode is kept on this device: the next visit opens in it; a kept value that is no mode opens the Grid', async () => {
    await libraryScreen();
    choose('List');
    cleanup();
    await libraryScreen();

    expect(headings()).toEqual(['A', 'D', 'L']);

    cleanup();
    localStorage.setItem('atomes:library-mode', 'shelf');
    await libraryScreen();

    expect(screen.getByRole<HTMLInputElement>('radio', { name: 'Grid' }).checked).toBe(true);
    expect(titles()).toEqual(['Astérix', 'Dune', 'La Horde du Contrevent']);
  });

  test('the mode is for Books: Series shows its cards with no mode switch and no index; back to Books, the kept List shows again', async () => {
    await libraryScreen([...books, ...volumes]);
    choose('List');
    choose('Series');

    expect(titles()).toEqual(['One Piece']);
    expect(screen.queryByRole('radiogroup', { name: 'View' })).toBeNull();
    expect(screen.queryByRole('navigation', { name: 'Jump to a letter' })).toBeNull();

    choose('Books');

    expect(headings()).toEqual(['A', 'D', 'L', 'O']);
    expect(screen.getByRole<HTMLInputElement>('radio', { name: 'List' }).checked).toBe(true);
  });

  test('a Label filter narrows List and Cover flow', async () => {
    await libraryScreen(books, [books[1], books[2]]);
    fireEvent.click(screen.getAllByRole('button', { name: /Sci-fi/ })[0]);
    choose('List');

    expect(headings()).toEqual(['D', 'L']);

    choose('Cover flow');

    expect(screen.getByText('2 of 2')).toBeTruthy();
    expect(screen.queryByRole('link', { name: 'Astérix' })).toBeNull();
  });

  test('sorted by "Recently added", List is one group with no index', async () => {
    await libraryScreen();
    choose('List');
    fireEvent.change(screen.getByLabelText('Sort by'), { target: { value: 'added' } });

    expect(headings()).toEqual(['Recently added']);
    expect(screen.queryByRole('navigation', { name: 'Jump to a letter' })).toBeNull();
  });
});

// happy-dom opens a 1024 px window: the desktop toolbar. These tests narrow it to a phone.
const viewport = (width: number) => (globalThis as unknown as { happyDOM: { setViewport(size: { width: number }): void } }).happyDOM.setViewport({ width });

describe('On the phone', () => {
  beforeEach(() => viewport(390));
  afterEach(() => viewport(1024));
  const view = () => screen.getByRole<HTMLSelectElement>('combobox', { name: 'View' });

  test('Grid, List or Cover flow is one View menu, in the row of the search; Books / Series stays a switch', async () => {
    await libraryScreen();

    expect(within(view()).getAllByRole('option').map((option) => option.textContent)).toEqual(['Grid', 'List', 'Cover flow']);
    expect(view().value).toBe('grid');
    expect(view().closest('.library-search-row')).toBe(screen.getByRole('searchbox').closest('.library-search-row'));
    expect(screen.queryByRole('radiogroup', { name: 'View' })).toBeNull();
    expect(screen.getByRole('radio', { name: 'Series' })).toBeTruthy();

    fireEvent.change(view(), { target: { value: 'list' } });

    expect(headings()).toEqual(['A', 'D', 'L']);
    expect(view().value).toBe('list');
  });

  test('Series shows no View menu', async () => {
    await libraryScreen();
    fireEvent.click(screen.getByRole('radio', { name: 'Series' }));

    expect(screen.queryByRole('combobox', { name: 'View' })).toBeNull();
  });

  test('in Series mode, the sheet shows as many Series as the cards', async () => {
    await libraryScreen([...books, ...volumes, gaston]);
    fireEvent.click(screen.getByRole('radio', { name: 'Series' }));
    fireEvent.input(screen.getByRole('searchbox'), { target: { value: 'oda' } });

    expect(screen.getByRole('button', { name: 'Show 1 Series', hidden: true })).toBeTruthy();
  });
});

describe('Cover flow', () => {
  // The cover in front.
  const current = () => screen.getByRole('link', { current: true }).getAttribute('aria-label');
  const slider = () => screen.getByRole<HTMLInputElement>('slider', { name: 'Browse your Library' });

  test('starts on the book in the middle', async () => {
    await libraryScreen();
    choose('Cover flow');

    expect(current()).toBe('Dune');
    expect(screen.getByText('2 of 3')).toBeTruthy();
    expect(slider().value).toBe('2');
  });

  test('Next and Previous move one book, the slider follows, and each stops at its end', async () => {
    await libraryScreen();
    choose('Cover flow');
    const press = (name: string) => fireEvent.click(screen.getByRole('button', { name }));
    press('Next');

    expect([current(), slider().value]).toEqual(['La Horde du Contrevent', '3']);
    expect(screen.getByText('3 of 3')).toBeTruthy();

    press('Next');

    expect(current()).toBe('La Horde du Contrevent');

    press('Previous');
    press('Previous');
    press('Previous');

    expect([current(), slider().value]).toEqual(['Astérix', '1']);
  });

  test('the slider goes straight to a book', async () => {
    await libraryScreen();
    choose('Cover flow');
    fireEvent.input(slider(), { target: { value: '3' } });

    expect(current()).toBe('La Horde du Contrevent');
    expect(screen.getByText('3 of 3')).toBeTruthy();
  });

  test('a cover on the side comes to the front when chosen; in front, it links to its Book page', async () => {
    await libraryScreen();
    choose('Cover flow');
    fireEvent.click(screen.getByRole('link', { name: 'Astérix' }));

    expect([current(), slider().value]).toEqual(['Astérix', '1']);
    expect(screen.getByRole('link', { current: true }).getAttribute('href')).toBe('/book?work=wd%3AQ976165');
  });

  describe('on the phone', () => {
    // Under 960 px: the phone frame (docs/design/ui-direction.md).
    const viewport = (width: number, height: number) => (window as unknown as HappyWindow).happyDOM.setViewport({ width, height });
    const phone = () => viewport(390, 844);
    afterEach(() => viewport(1024, 768));
    // On the phone the View is a menu (CORE-110).
    const chooseOnPhone = (mode: string) => fireEvent.change(screen.getByRole('combobox', { name: 'View' }), { target: { value: mode } });

    test('the covers are a strip to swipe: no Previous, Next or slider, and every book is a link', async () => {
      phone();
      await libraryScreen();
      chooseOnPhone('flow');

      expect(current()).toBe('Dune');
      expect(screen.getByText('2 of 3')).toBeTruthy();
      expect(screen.queryByRole('button', { name: 'Previous' })).toBeNull();
      expect(screen.queryByRole('button', { name: 'Next' })).toBeNull();
      expect(screen.queryByRole('slider')).toBeNull();
      // The cover first; the title under the strip links too for the book in front.
      expect(['Astérix', 'Dune', 'La Horde du Contrevent'].map((name) => screen.getAllByRole('link', { name })[0].getAttribute('href'))).toEqual([
        '/book?work=wd%3AQ976165',
        '/book?work=wd%3AQ320481',
        '/book?work=wd%3AQ464234',
      ]);
    });

    test('a cover on the side comes to the front when tapped', async () => {
      phone();
      await libraryScreen();
      chooseOnPhone('flow');
      fireEvent.click(screen.getByRole('link', { name: 'La Horde du Contrevent' }));

      expect(current()).toBe('La Horde du Contrevent');
      expect(screen.getByText('3 of 3')).toBeTruthy();
    });
  });

  test('a search starts again in the middle of the books it finds', async () => {
    await libraryScreen();
    choose('Cover flow');
    fireEvent.input(slider(), { target: { value: '1' } });
    fireEvent.input(screen.getByRole('searchbox'), { target: { value: 'd' } });

    expect(current()).toBe('La Horde du Contrevent');
    expect(screen.getByText('2 of 2')).toBeTruthy();
  });
});

describe('Library state in its history entry', () => {
  test('back from a Book, the Library opens with the search and filters saved in its history entry', async () => {
    history.replaceState({ library: { query: { text: 'du', status: 'read' } } }, '');
    await libraryScreen();

    expect(titles()).toEqual(['Dune']);
    expect(screen.getByRole<HTMLInputElement>('searchbox').value).toBe('du');
  });

  test('a search is saved in the history entry, so the same entry opens with it again', async () => {
    await libraryScreen();
    fireEvent.input(screen.getByRole('searchbox'), { target: { value: 'asterix' } });

    // The way back to this entry: the screen starts again.
    cleanup();
    await libraryScreen();

    expect(titles()).toEqual(['Astérix']);
  });

  test('the Cover flow move is saved too: the same entry opens on the same book', async () => {
    await libraryScreen();
    choose('Cover flow');
    fireEvent.input(screen.getByRole('slider', { name: 'Browse your Library' }), { target: { value: '3' } });
    // Left in Grid, so the next screen draws its list first.
    choose('Grid');

    cleanup();
    await libraryScreen();
    choose('Cover flow');

    expect(screen.getByRole('link', { current: true }).getAttribute('aria-label')).toBe('La Horde du Contrevent');
    expect(screen.getByText('3 of 3')).toBeTruthy();
  });
});

describe('Bulk select', () => {
  const toasts = () =>
    document.body.insertAdjacentHTML(
      'beforeend',
      `<div data-toasts></div>
      <template data-toast-template>
        <div data-toast><p data-toast-text></p><button type="button" data-toast-action hidden></button><button type="button" data-toast-close></button></div>
      </template>`,
    );
  const sheet = () => within(screen.getByRole('dialog'));
  const select = (...names: string[]) => {
    fireEvent.click(screen.getByRole('button', { name: 'Select' }));
    for (const name of names) fireEvent.click(screen.getByRole('button', { name: new RegExp(name) }));
  };

  beforeEach(toasts);
  afterEach(() => {
    document.body.innerHTML = '';
  });

  test('select 3 books and add the Label "Shōnen": the 3 Works carry it, and Undo removes it', async () => {
    const space = await libraryScreen();
    select('Astérix', 'Dune', 'La Horde');
    expect(screen.getByText('3 selected')).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: 'Label' }));
    fireEvent.input(sheet().getByRole('textbox', { name: 'New Label' }), { target: { value: 'Shōnen' } });
    fireEvent.click(sheet().getByRole('button', { name: 'Add' }));

    await waitFor(async () => expect((await listLabels(space)).records.map(({ value }) => value.works)).toEqual([books.map((each) => each.work.id)]));
    expect(await screen.findByText('Shōnen on 3 books.')).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: 'Undo' }));

    await waitFor(async () => expect((await listLabels(space)).records).toEqual([]));
  });

  test('"Select all" takes what the filter shows; a tap on a picked book leaves it out', async () => {
    await libraryScreen();
    fireEvent.input(screen.getByRole('searchbox'), { target: { value: 'a' } });
    select();

    fireEvent.click(screen.getByRole('button', { name: 'Select all' }));
    expect(screen.getByText('3 selected')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: /Dune/ }));
    expect(screen.getByText('2 selected')).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: 'Done' }));
    expect(screen.queryByText('2 selected')).toBeNull();
    expect(screen.getAllByRole('link', { name: /Dune/ }).length).toBeGreaterThan(0);
  });

  test('set Read on every picked Work in one action, with one toast; offline the writes wait on this device', async () => {
    const space = await libraryScreen(books, [], 'waiting');
    select('Astérix', 'Dune', 'La Horde');

    fireEvent.click(screen.getByRole('button', { name: 'Reading Status' }));
    fireEvent.click(sheet().getByRole('button', { name: 'Read' }));

    expect(await screen.findByText(/Waiting: saved on this device/)).toBeTruthy();
    const saved = (await space.list('app.atomes.readingStatus')).records.map(({ value }) => (value as { status: string }).status);
    expect(saved).toEqual(['read', 'read', 'read']);
    expect(screen.getAllByRole('button', { name: 'Undo' })).toHaveLength(1);
  });

  test('Move to Series refused partway: the saved moves get their toast and Undo; Save again reuses the New Series made', async () => {
    const corrections: [string, unknown][] = [];
    const uncorrected: string[] = [];
    // The second Correction is over the limit, once.
    const answers = [true, false, true, true];
    const correction: SelectionSources['correction'] = {
      find: refuse,
      correct: (isbn, asked) => {
        const taken = answers.shift();
        if (taken) corrections.push([isbn, asked]);
        return Promise.resolve(taken ? { found: { ...books.find((each) => each.isbn === isbn)!, corrected: true } } : { tooMany: true });
      },
      uncorrect: (isbn) => {
        uncorrected.push(isbn);
        return Promise.resolve({ found: books.find((each) => each.isbn === isbn)! });
      },
    };
    await libraryScreen(books, [], 'sent', { correction });
    select('Astérix', 'Dune', 'La Horde');

    fireEvent.click(screen.getByRole('button', { name: 'Move to Series' }));
    fireEvent.click(sheet().getByRole('button', { name: 'New Series' }));
    fireEvent.input(sheet().getByLabelText('Publisher'), { target: { value: 'Glénat' } });
    fireEvent.click(sheet().getByRole('button', { name: 'Save' }));

    expect(await screen.findByText('1 book moved. Every reader sees it.')).toBeTruthy();
    expect(sheet().getByText('Too many Series Corrections for now. Try again in an hour.')).toBeTruthy();

    fireEvent.click(sheet().getByRole('button', { name: 'Save' }));

    expect(await screen.findByText('2 books moved. Every reader sees it.')).toBeTruthy();
    const newSeries = { newSeries: { title: 'Astérix', publisher: 'Glénat', language: 'fre', height: null }, volume: null };
    expect(corrections).toEqual([
      [books[0].isbn, newSeries],
      [books[1].isbn, { anchor: books[0].isbn, volume: null }],
      [books[2].isbn, { anchor: books[0].isbn, volume: null }],
    ]);

    // Undo on the first toast turns back only the move it saved.
    const first = screen.getByText('1 book moved. Every reader sees it.').closest('[data-toast]')!;
    fireEvent.click(within(first as HTMLElement).getByRole('button', { name: 'Undo' }));

    expect(await screen.findByText('Undone.')).toBeTruthy();
    expect(uncorrected).toEqual([books[0].isbn]);
  });

  test('keeps the picked Works Private in one request; Undo lets go only the ones it changed', async () => {
    const calls: [string[], boolean][] = [];
    const state = { shared: { readingStatuses: true, follows: false, labels: false }, privateWorks: [books[1].work.id], pending: false, canShare: true };
    const sharing = {
      load: () => Promise.resolve({ state }),
      setPrivateWorks: (works: string[], kept: boolean) => {
        calls.push([works, kept]);
        return Promise.resolve({ state });
      },
    };
    await libraryScreen(books, [], 'sent', { sharing });
    select('Astérix', 'Dune', 'La Horde');

    fireEvent.click(screen.getByRole('button', { name: 'Private' }));
    fireEvent.click(sheet().getByRole('button', { name: 'Keep Private' }));

    expect(await screen.findByText('2 books kept Private.')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Undo' }));

    await waitFor(() => expect(calls).toHaveLength(2));
    expect(calls).toEqual([
      [[books[0].work.id, books[2].work.id], true],
      [[books[0].work.id, books[2].work.id], false],
    ]);
  });
});
