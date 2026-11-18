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
const make = (_canvas: HTMLCanvasElement, choice: PictureChoice) => {
  made.push(choice);
  return Promise.resolve(new Blob(['png'], { type: 'image/png' }));
};

let share: HTMLButtonElement;
beforeEach(() => {
  made = [];
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

    const download = await screen.findByRole('link', { name: 'Download' });
    expect(download.getAttribute('href')).toBe('blob:picture');
    expect(download.getAttribute('download')).toBe('atomes-2026-story.png');
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
    expect(screen.getByRole('link', { name: 'Download' })).toBeTruthy();
  });

  test('Square, then Series names off: the picture is made again for each', async () => {
    await openShare();

    fireEvent.click(screen.getByRole('radio', { name: 'Square' }));
    await waitFor(() => expect(screen.getByRole('link', { name: 'Download' }).getAttribute('download')).toBe('atomes-2026-square.png'));
    expect(screen.getByRole('img').getAttribute('aria-label')).toBe('Picture: 47 read in 2026, 61 added, 9 Series followed.');
    fireEvent.click(screen.getByRole('radio', { name: 'Story' }));
    fireEvent.click(screen.getByRole('switch', { name: 'Series names' }));

    await waitFor(() => expect(made.at(-1)).toMatchObject({ format: 'story', names: false }));
    expect(screen.getByRole('img').getAttribute('aria-label')).toBe('Picture: 47 read in 2026, 61 added, 9 Series followed.');
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
