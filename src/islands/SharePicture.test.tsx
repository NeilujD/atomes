// @vitest-environment happy-dom
// The share dialog of Statistics (ADR 0019, R4): the Share button of the page
// opens it once the island has drawn; it shows the picture with its text
// alternative, Story or Square, "Series names", "Share the picture" when the
// browser can share a file, and Download always. The canvas painter stands
// aside: happy-dom has no canvas.
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/preact';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import type { PictureChoice } from '../lib/library/share-picture';
import type { Statistics } from '../lib/library/stats';
import { SharePicture } from './SharePicture';

const numbers = {
  read: 47,
  added: 61,
  followed: 9,
  columns: { scale: 'month', groups: [] },
  mostRead: { series: { rows: [{ name: 'One Piece', value: 12 }], outside: 0 } },
} as unknown as Statistics;

let made: PictureChoice[];
// While set, a picture waits for it before it is made.
let gate: Promise<void> | null;
const make = async (_canvas: HTMLCanvasElement, choice: PictureChoice) => {
  if (gate) await gate;
  made.push(choice);
  return new Blob(['png'], { type: 'image/png' });
};

let share: HTMLButtonElement;
// The PNGs that Download saved: the link it clicked.
let saved: { href: string | null; download: string; inDocument: boolean }[];
beforeEach(() => {
  made = [];
  gate = null;
  saved = [];
  vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (this: HTMLAnchorElement) {
    saved.push({ href: this.getAttribute('href'), download: this.download, inDocument: this.isConnected });
  });
  document.documentElement.lang = 'en';
  // The main action of statistics.astro, disabled until the island has drawn.
  document.body.insertAdjacentHTML('beforeend', '<button type="button" disabled data-statistics-share>Share</button>');
  share = document.querySelector('[data-statistics-share]')!;
  URL.createObjectURL = vi.fn(() => 'blob:picture');
  URL.revokeObjectURL = vi.fn();
});

afterEach(() => {
  cleanup();
  document.body.innerHTML = '';
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  Reflect.deleteProperty(navigator, 'canShare');
  Reflect.deleteProperty(navigator, 'share');
});

function canShareFiles(shared: unknown[]) {
  Object.defineProperty(navigator, 'canShare', { configurable: true, value: (data: { files?: File[] }) => (data.files?.length ?? 0) > 0 });
  Object.defineProperty(navigator, 'share', {
    configurable: true,
    value: (data: unknown) => {
      shared.push(data);
      return Promise.resolve();
    },
  });
}

async function openShare() {
  render(<SharePicture numbers={numbers} period={2026} filters={{ label: null, ownedOnly: false }} make={make} />);
  await waitFor(() => expect(share.disabled).toBe(false));
  share.focus();
  fireEvent.click(share);
  return screen.findByRole('dialog', { name: 'Share' });
}

describe('the share dialog', () => {
  test('the Share button opens it with the Story picture, its numbers as text, and Series names on', async () => {
    await openShare();

    expect(screen.getByRole('img', { name: 'Picture: 47 read in 2026, 61 added, 9 Series followed. Most read: One Piece.' })).toBeTruthy();
    expect(screen.getByRole('radio', { name: 'Story' })).toHaveProperty('checked', true);
    expect(screen.getByRole('switch', { name: 'Series names' })).toHaveProperty('checked', true);
    await waitFor(() => expect(made).toEqual([{ numbers, period: 2026, filters: { label: null, ownedOnly: false }, format: 'story', language: 'en', names: true }]));
  });

  test('a browser that cannot share a file shows Download only', async () => {
    await openShare();

    await waitFor(() => expect(made).toHaveLength(1));
    await waitFor(() => expect(screen.getByRole('img').hasAttribute('data-ready')).toBe(true));
    fireEvent.click(screen.getByRole('button', { name: 'Download' }));

    expect(saved).toEqual([{ href: 'blob:picture', download: 'atomes-2026-story.png', inDocument: true }]);
    expect(screen.queryByRole('button', { name: 'Share the picture' })).toBeNull();
  });

  test('a browser that can share a file shares the PNG of the picture, ready before the tap', async () => {
    const shared: unknown[] = [];
    canShareFiles(shared);
    await openShare();

    fireEvent.click(await screen.findByRole('button', { name: 'Share the picture' }));

    expect(shared).toHaveLength(1);
    const [file] = (shared[0] as { files: File[] }).files;
    expect([file.name, file.type]).toEqual(['atomes-2026-story.png', 'image/png']);
    expect(screen.getByRole('button', { name: 'Download' })).toBeTruthy();
  });

  test('Square, then Series names off: the picture is made again for each', async () => {
    await openShare();

    fireEvent.click(screen.getByRole('radio', { name: 'Square' }));
    await waitFor(() => expect(made.at(-1)).toMatchObject({ format: 'square' }));
    expect(screen.getByRole('img').getAttribute('aria-label')).toBe('Picture: 47 read in 2026, 61 added, 9 Series followed.');
    fireEvent.click(screen.getByRole('radio', { name: 'Story' }));
    fireEvent.click(screen.getByRole('switch', { name: 'Series names' }));

    await waitFor(() => expect(made.at(-1)).toMatchObject({ format: 'story', names: false }));
    expect(screen.getByRole('img').getAttribute('aria-label')).toBe('Picture: 47 read in 2026, 61 added, 9 Series followed.');
  });

  test('while the picture of a new choice is made, the old one stays, and nothing in the buttons changes', async () => {
    const shared: unknown[] = [];
    canShareFiles(shared);
    await openShare();
    const canvas = screen.getByRole<HTMLCanvasElement>('img');
    await waitFor(() => expect(canvas.hasAttribute('data-ready')).toBe(true));
    // A change in the buttons when a PNG is ready made Chrome on Android show them empty for two frames.
    const actions = document.querySelector('.share-actions')!;
    const before = actions.outerHTML;
    // The next picture waits until the test lets it go.
    let done = () => {};
    gate = new Promise<void>((resolve) => (done = resolve));

    fireEvent.click(screen.getByRole('radio', { name: 'Square' }));

    // The canvas keeps its picture and its size; a tap shares and saves nothing yet.
    expect([canvas.getAttribute('width'), canvas.getAttribute('height'), canvas.hasAttribute('data-ready')]).toEqual(['1080', '1920', false]);
    fireEvent.click(screen.getByRole('button', { name: 'Share the picture' }));
    fireEvent.click(screen.getByRole('button', { name: 'Download' }));
    expect([shared, saved]).toEqual([[], []]);
    expect(actions.outerHTML).toBe(before);

    done();
    await waitFor(() => expect(canvas.hasAttribute('data-ready')).toBe(true));
    expect(actions.outerHTML).toBe(before);
    fireEvent.click(screen.getByRole('button', { name: 'Share the picture' }));
    fireEvent.click(screen.getByRole('button', { name: 'Download' }));
    expect(shared).toHaveLength(1);
    expect(saved).toEqual([expect.objectContaining({ download: 'atomes-2026-square.png' })]);
  });

  test('Close closes it, and the focus returns to Share', async () => {
    const dialog = await openShare();

    fireEvent.click(screen.getByRole('button', { name: 'Close' }));

    await waitFor(() => expect((dialog as HTMLDialogElement).open).toBe(false));
    expect(document.activeElement).toBe(share);
  });

  test('browser Back closes it, and the focus returns to Share', async () => {
    const dialog = await openShare();

    dispatchEvent(new PopStateEvent('popstate'));

    await waitFor(() => expect((dialog as HTMLDialogElement).open).toBe(false));
    expect(document.activeElement).toBe(share);
  });
});
