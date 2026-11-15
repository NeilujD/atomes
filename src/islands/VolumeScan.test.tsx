// @vitest-environment happy-dom
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/preact';
import { afterEach, beforeEach, expect, test } from 'vitest';
import type { Edition } from '../lib/catalog/catalog';
import { VolumeScan, type VolumeScanSources } from './VolumeScan';

const anchor = '9782876952058';
// A book a source knows, with no Series yet.
const book: Edition = {
  isbn: '9782072927515',
  title: 'Dragon Ball 5',
  volumeTitle: null,
  authors: ['Akira Toriyama'],
  publisher: 'Glénat',
  language: 'fre',
  format: '18 cm',
  cover: null,
  work: { id: 'isbn:9782072927515', title: 'Dragon Ball 5' },
  series: null,
  volumes: [],
  volume: null,
  sources: ['BnF'],
  fetchedAt: '2026-11-15T10:00:00.000Z',
};

beforeEach(() => {
  document.body.insertAdjacentHTML(
    'beforeend',
    `<div data-toasts></div>
    <template data-toast-template>
      <div data-toast><p data-toast-text></p><button type="button" data-toast-action hidden></button><button type="button" data-toast-close></button></div>
    </template>`,
  );
});

afterEach(() => {
  cleanup();
  document.body.innerHTML = '';
});

// The sheet of Volume 5, on a Catalog that knows `known`; what it was asked.
function sheetOf(known: Edition[] = [book]) {
  const asked = { corrections: [] as [string, unknown][], uncorrected: [] as string[], changed: 0, closed: 0 };
  const sources: VolumeScanSources = {
    lookup: (isbn) => {
      const found = known.find((each) => each.isbn === isbn);
      return Promise.resolve(found ? { found } : { notFound: true });
    },
    correct: (isbn, correction) => {
      asked.corrections.push([isbn, correction]);
      return Promise.resolve({ found: { ...book, isbn, volume: 5, volumes: [5] } });
    },
    uncorrect: (isbn) => {
      asked.uncorrected.push(isbn);
      return Promise.resolve({ found: book });
    },
  };
  render(
    <VolumeScan
      volume={5}
      anchor={anchor}
      onChanged={() => asked.changed++}
      onClose={() => asked.closed++}
      sources={sources}
    />,
  );
  const sheet = within(screen.getByRole('dialog', { name: 'Add Volume 5 to the Catalog' }));
  const add = (isbn: string) => {
    fireEvent.input(sheet.getByLabelText('ISBN'), { target: { value: isbn } });
    fireEvent.click(sheet.getByRole('button', { name: 'Add Volume 5' }));
  };
  return { asked, sheet, add };
}

test('opens as a modal sheet; Close closes it', () => {
  const { sheet, asked } = sheetOf();
  const dialog = screen.getByRole<HTMLDialogElement>('dialog');
  expect(dialog.open).toBe(true);

  fireEvent.click(sheet.getByRole('button', { name: 'Close' }));

  expect(dialog.open).toBe(false);
  expect(asked.closed).toBe(1);
});

test('a typed ISBN joins the Edition Line at this Volume number; Undo goes back to the sources', async () => {
  const { asked, add } = sheetOf();

  add(book.isbn);

  expect(await screen.findByText('Volume 5 joins the Edition Line. Every reader sees it.')).toBeTruthy();
  expect(asked.corrections).toEqual([[book.isbn, { anchor, volume: 5 }]]);
  await waitFor(() => expect(asked.changed).toBe(1));
  expect(asked.closed).toBe(1);

  fireEvent.click(screen.getByRole('button', { name: 'Undo' }));

  await waitFor(() => expect(asked.changed).toBe(2));
  expect(asked.uncorrected).toEqual([book.isbn]);
});

test('an Edition a reader corrected before gets no Undo: it would delete that Correction too', async () => {
  const { add } = sheetOf([{ ...book, corrected: true }]);

  add(book.isbn);

  expect(await screen.findByText('Volume 5 joins the Edition Line. Every reader sees it.')).toBeTruthy();
  expect(screen.queryByRole('button', { name: 'Undo' })).toBeNull();
});

test('an ISBN no source knows, or not an ISBN, says so in the sheet and corrects nothing', async () => {
  const { asked, sheet, add } = sheetOf();

  add('9791099999993');
  expect(await sheet.findByText('No book source knows this ISBN. Check it, or try again in a few days.')).toBeTruthy();

  add('12345');
  expect(await sheet.findByText('This is not a book’s ISBN. It has 13 digits and starts with 978 or 979.')).toBeTruthy();

  expect(asked.corrections).toEqual([]);
  expect(screen.getByRole<HTMLDialogElement>('dialog').open).toBe(true);
});
