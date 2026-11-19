// The app screenshots of the Landing page (CORE-156): `bun run landing-shots`.
// Starts its own dev server on the real book sources, with an empty data
// folder (`data-landing/`), signs in a demo reader, fills a demo Library of
// manga, comic books and novels, then saves each screen at phone and desktop
// size, light and dark, in `public/landing/`. The covers are the real ones the
// Catalog finds (owner's choice, 2026-11-19); a book with no cover is left out.
// The browser may ask only the dev server; any other host fails the run. The
// server asks the book sources, as on any instance.
// `--probe`: only look up the books and say which have a cover.
import { spawn } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { chromium, type Browser, type BrowserContext, type Page } from '@playwright/test';

const port = Number(process.env.LANDING_PORT ?? 4330);
const origin = `http://127.0.0.1:${port}`;
const dataDir = 'data-landing';
const outDir = join('public', 'landing');
const reader = { did: 'did:plc:landingdemo', handle: 'demo.reader' };

// The demo Library: a mix of manga, comic books and novels, each with a cover
// on the real sources (checked 2026-11-19 with `--probe`). `onboard`: what
// Series Onboarding answers when it opens: `yes` owns the earlier Volumes,
// `less` takes Volumes off the end of that range (they show as Missing, on To
// Buy), `follow` keeps the Series followed. By default Save adds only the book
// and does not follow the Series, so To Buy does not list 100 Volumes.
type Onboard = { yes?: boolean; less?: number; follow?: boolean };
type Pick = { isbn: string; kind: 'manga' | 'comic' | 'novel'; onboard?: Onboard };
const picks: Pick[] = [
  { isbn: '9782723478991', kind: 'manga' }, // One Piece 56
  { isbn: '9782723488525', kind: 'manga' }, // One Piece 1
  { isbn: '9782871294146', kind: 'manga' }, // Naruto 1
  { isbn: '9782505009566', kind: 'manga' }, // Naruto 50
  { isbn: '9782809482324', kind: 'manga' }, // Demon Slayer 1
  { isbn: '9782203085053', kind: 'comic', onboard: { yes: true, less: 2, follow: true } }, // Kaamelott 9
  { isbn: '9782864976165', kind: 'comic' }, // Astérix, L'Empire du Milieu
  { isbn: '9782012101333', kind: 'comic' }, // Astérix le Gaulois
  { isbn: '9782205049657', kind: 'comic' }, // Blacksad 1
  { isbn: '9782203001145', kind: 'comic' }, // Tintin
  { isbn: '9782072927515', kind: 'novel' }, // La Horde du Contrevent
  { isbn: '9782070360024', kind: 'novel' }, // L'Étranger
  { isbn: '9782070368228', kind: 'novel' }, // 1984
  { isbn: '9782266320481', kind: 'novel' }, // Dune
  { isbn: '9782070584628', kind: 'novel' }, // Harry Potter à l'école des sorciers
  { isbn: '9782070612758', kind: 'novel' }, // Le Petit Prince
];

// Shelf Check: a book of the Library (orange), then one not in it (green).
const checkOwned = '9782723478991'; // One Piece 56
const checkNotOwned = ['9782344068922', '9782723488532']; // One Piece 112, else One Piece 2
const seriesPage = '9782203085053'; // Kaamelott 9
const probeOnly = process.argv.includes('--probe');

// What the Catalog answers say of each ISBN seen, for the Volume order and the Labels.
type Book = { title: string; series: string | null; volume: number | null; work: string | null };
const books = new Map<string, Book>();

const sizes = {
  phone: { viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true },
  desktop: { viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1, isMobile: false, hasTouch: false },
} as const;
const themes = ['light', 'dark'] as const;

const blocked: string[] = [];

async function main() {
  rmSync(dataDir, { recursive: true, force: true });
  const server = startServer();
  try {
    await waitForServer();
    const browser = await chromium.launch();
    try {
      const seeded = await seed(browser);
      if (!seeded) return;
      mkdirSync(outDir, { recursive: true });
      const converter = await browser.newPage();
      for (const [size, device] of Object.entries(sizes)) {
        for (const theme of themes) {
          const context = await browser.newContext({ ...device, colorScheme: theme, locale: 'en-US', baseURL: origin, storageState: seeded });
          await prepare(context);
          const page = await context.newPage();
          page.setDefaultTimeout(30_000);
          for (const [name, open] of Object.entries(screens)) {
            console.log(`open ${name} ${size} ${theme}`);
            await open(page);
            await settle(page);
            const png = await page.screenshot({ animations: 'disabled' });
            const file = join(outDir, `${name}-${size}-${theme}.webp`);
            writeFileSync(file, await toWebp(converter, png));
            console.log(`saved ${file}`);
          }
          await context.unrouteAll({ behavior: 'ignoreErrors' });
          await context.close();
        }
      }
    } finally {
      await browser.close();
    }
  } finally {
    server.kill();
  }
  if (blocked.length > 0) throw new Error(`Requests to hosts other than the dev server:\n${[...new Set(blocked)].join('\n')}`);
}

// --- The dev server ---------------------------------------------------------

function startServer() {
  const server = spawn('node', ['node_modules/astro/bin/astro.mjs', 'dev', '--host', '127.0.0.1', '--port', String(port), '--ignore-lock'], {
    env: {
      ...process.env,
      DATA_DIR: dataDir,
      DEV_TOOLBAR: 'off',
      PORT: String(port),
      SESSION_ENCRYPTION_KEY: randomBytes(32).toString('base64'),
    },
    stdio: ['ignore', 'ignore', 'inherit'],
  });
  return server;
}

async function waitForServer() {
  const until = Date.now() + 120_000;
  while (Date.now() < until) {
    try {
      if ((await fetch(`${origin}/health`)).ok) return;
    } catch {
      // Not up yet.
    }
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  throw new Error(`The dev server did not answer on ${origin}/health`);
}

// --- Every page of every context --------------------------------------------

async function prepare(context: BrowserContext) {
  await context.route(
    (url) => url.origin !== origin,
    (route) => {
      blocked.push(route.request().url());
      return route.abort('blockedbyclient');
    },
  );
  // The environment badge ("local") is not part of the app readers see; its room stays.
  await context.addInitScript(() => {
    addEventListener('DOMContentLoaded', () => {
      const style = document.createElement('style');
      style.textContent = '.environment { visibility: hidden !important; }';
      document.head.append(style);
    });
  });
  // Notes what each Catalog answer says of its books (learn).
  await context.route(
    (url) => url.origin === origin && url.pathname.startsWith('/api/catalog/') && !url.pathname.endsWith('/cover'),
    async (route) => {
      try {
        const response = await route.fetch();
        if (!response.headers()['content-type']?.includes('json')) return await route.fulfill({ response });
        const json: unknown = await response.json();
        learn(json);
        return await route.fulfill({ response, json });
      } catch (error) {
        // The page left, or its context closed, while the answer came: nothing to show it to.
        if (!/disposed|closed/i.test(String(error))) throw error;
      }
    },
  );
}

// Walks a Catalog answer and notes each Edition.
function learn(value: unknown) {
  if (Array.isArray(value)) return value.forEach(learn);
  if (!value || typeof value !== 'object') return;
  const object = value as Record<string, unknown>;
  if (typeof object.isbn === 'string') {
    const series = object.series as { title?: string } | null | undefined;
    const work = object.work as { id?: string } | undefined;
    const known = books.get(object.isbn);
    books.set(object.isbn, {
      title: typeof object.title === 'string' ? object.title : (known?.title ?? object.isbn),
      series: series?.title ?? known?.series ?? null,
      volume: typeof object.volume === 'number' ? object.volume : (known?.volume ?? null),
      work: work?.id ?? known?.work ?? null,
    });
  }
  Object.values(object).forEach(learn);
}

// --- The demo Library -------------------------------------------------------

async function seed(browser: Browser) {
  const context = await browser.newContext({ ...sizes.phone, locale: 'en-US', baseURL: origin });
  await prepare(context);
  const page = await context.newPage();
  page.setDefaultTimeout(30_000);
  await signIn(page);
  console.log('signed in');

  // Only books the Catalog knows, with a cover it can serve.
  const found: Pick[] = [];
  for (const pick of picks) {
    const cover = await hasCover(page, pick.isbn);
    console.log(`${cover ? 'cover   ' : 'no cover'} ${pick.kind.padEnd(5)} ${pick.isbn} ${books.get(pick.isbn)?.title ?? '(unknown)'}`);
    if (cover) found.push(pick);
  }
  notOwned = (await firstWithCover(page, checkNotOwned)) ?? checkNotOwned[0];
  if (probeOnly) return undefined;

  // Through Quick Add and Series Onboarding, as a reader does.
  for (const pick of found) await add(page, pick.isbn, pick.onboard);

  await page.goto('/library');
  await islandsLoaded(page);
  console.log('backdate');
  const novels = found.filter((pick) => pick.kind === 'novel').map((pick) => pick.isbn);
  await page.evaluate(backdate, { books: Object.fromEntries(books), novels, today: new Date().toISOString().slice(0, 10) });
  const state = await context.storageState();
  await context.unrouteAll({ behavior: 'ignoreErrors' });
  await context.close();
  return state;
}

// The Shelf Check book not in the Library: the first of `checkNotOwned` with a cover.
let notOwned = checkNotOwned[0];

async function hasCover(page: Page, code: string): Promise<boolean> {
  const answer = await page.request.get(`/api/catalog/editions/${code}`);
  if (!answer.ok()) return false;
  const edition = (await answer.json()) as { cover?: string | null };
  learn(edition);
  if (!edition.cover) return false;
  const cover = await page.request.get(`/api/catalog/editions/${code}/cover`);
  return cover.ok() && (cover.headers()['content-type'] ?? '').startsWith('image/');
}

async function firstWithCover(page: Page, codes: string[]): Promise<string | undefined> {
  for (const code of codes) if (await hasCover(page, code)) return code;
  return undefined;
}

async function signIn(page: Page) {
  const query = new URLSearchParams(reader).toString();
  const answer = await page.request.get(`/dev/sign-in-as?${query}`, { maxRedirects: 0 });
  if (answer.status() !== 303) throw new Error(`sign-in-as answered ${answer.status()}`);
  const [name, value] = answer.headers()['set-cookie'].split(';')[0].split(/=(.*)/);
  await page.context().addCookies([{ name, value, url: origin, httpOnly: true, sameSite: 'Lax' }]);
}

// Quick Add by ISBN; when Series Onboarding opens, Save, after "Yes" (own the earlier Volumes) when asked.
async function add(page: Page, code: string, onboard: Onboard = {}) {
  console.log(`add ${code}`);
  await page.goto(`${origin}/check`);
  await page.getByLabel('ISBN', { exact: true }).fill(code);
  await page.getByRole('button', { name: 'Look up' }).click();
  await page.getByRole('button', { name: 'Add to Library' }).click();
  const save = page.getByRole('button', { name: 'Save', exact: true });
  const added = page.getByText(/is in your Library/);
  await save.or(added).first().waitFor();
  if (await save.isVisible()) {
    const yes = page.getByRole('button', { name: 'Yes', exact: true });
    if (onboard.yes && (await yes.isVisible())) {
      await yes.click();
      for (let i = 0; i < (onboard.less ?? 0); i++) await page.getByRole('button', { name: 'One less' }).first().click();
    }
    const follow = page.getByRole('switch', { name: /Tell me when a new Volume is out/ });
    if ((await follow.isVisible()) && (await follow.isChecked()) !== (onboard.follow ?? false)) await follow.click();
    await save.click();
    await page.waitForURL(/\/series/);
  }
  await islandsLoaded(page);
}

// Runs in the page: dates, Reading Statuses, Labels and a Loan, through the
// instance API (same origin, so the CSRF check passes). Volumes are read and
// got in order over the last year, as a reader would have done.
async function backdate({ books, novels, today }: { books: Record<string, Book>; novels: string[]; today: string }) {
  type Saved<T> = { rkey: string; value: T };
  type Copy = { isbn: string; works: string[]; acquiredAt?: string; createdAt: string };
  const api = (path: string, init?: RequestInit) =>
    fetch(`/api/library/${path}`, { ...init, headers: { 'content-type': 'application/json' } }).then(async (response): Promise<unknown> => {
      if (!response.ok) throw new Error(`${init?.method ?? 'GET'} ${path}: ${response.status} ${await response.text()}`);
      return response.json();
    });
  const put = (collection: string, rkey: string, value: object) => api(`${collection}/${encodeURIComponent(rkey)}`, { method: 'PUT', body: JSON.stringify({ ...value, $type: collection }) });
  const day = (daysAgo: number) => {
    const date = new Date(`${today}T00:00:00.000Z`);
    date.setUTCDate(date.getUTCDate() - Math.max(0, Math.round(daysAgo)));
    return date.toISOString().slice(0, 10) + 'T00:00:00.000Z';
  };
  let micros = BigInt(Date.now()) * 1000n;
  const tid = () => {
    micros += 1n;
    let value = micros << 10n;
    let key = '';
    for (let i = 0; i < 13; i++) {
      key = '234567abcdefghijklmnopqrstuvwxyz'[Number(value & 31n)] + key;
      value >>= 5n;
    }
    return key;
  };

  const { records: copies } = (await api('app.atomes.copy')) as { records: Saved<Copy>[] };
  const series = new Map<string, Saved<Copy>[]>();
  for (const copy of copies) {
    const book = books[copy.value.isbn];
    const key = book?.series ?? copy.value.isbn;
    series.set(key, [...(series.get(key) ?? []), copy]);
  }
  for (const list of series.values()) list.sort((a, b) => (books[a.value.isbn]?.volume ?? 0) - (books[b.value.isbn]?.volume ?? 0));

  // Share of each Series read, and when the reader started it (days ago).
  const plans: Record<string, { read: number; startedDaysAgo: number; unread?: boolean }> = {
    'One Piece': { read: 0.9, startedDaysAgo: 360 },
    Naruto: { read: 0.6, startedDaysAgo: 300 },
    Kaamelott: { read: 0.6, startedDaysAgo: 240 },
  };
  const now = new Date().toISOString();
  const read: string[] = [];
  // A book alone (a novel, an album): read; one in four not finished, reading or not started yet; days spread over the year.
  for (const [index, [name, list]] of [...series].entries()) {
    const plan = Object.entries(plans).find(([key]) => name.toLowerCase().includes(key.toLowerCase()))?.[1] ?? {
      read: index % 4 === 3 ? 0 : 1,
      startedDaysAgo: 20 + ((index * 47) % 330),
      unread: index % 8 === 7,
    };
    const readCount = Math.round(list.length * plan.read);
    for (const [i, copy] of list.entries()) {
      const work = copy.value.works[0];
      const got = plan.startedDaysAgo + 40 - (i / list.length) * (plan.startedDaysAgo - 10);
      await put('app.atomes.copy', copy.rkey, { ...copy.value, acquiredAt: day(got) });
      if (!work) continue;
      const finished = plan.startedDaysAgo - (i / Math.max(1, readCount)) * (plan.startedDaysAgo - 5);
      const status = i < readCount ? 'read' : i === readCount && !plan.unread ? 'reading' : 'unread';
      const value: Record<string, string> = { work, isbn: copy.value.isbn, status, updatedAt: now };
      if (status !== 'unread') value.startedAt = day(status === 'read' ? finished + 4 : 3);
      if (status === 'read') value.finishedAt = day(finished);
      await put('app.atomes.readingStatus', work, value);
      if (status === 'read') read.push(work);
    }
  }

  const works = (match: (copy: Copy) => boolean) => copies.filter((copy) => match(copy.value)).flatMap((copy) => copy.value.works);
  const named = (...names: string[]) => (copy: Copy) => {
    const book = books[copy.isbn];
    return names.some((name) => `${book?.series ?? ''} ${book?.title ?? ''}`.toLowerCase().includes(name));
  };
  await put('app.atomes.label', tid(), { name: 'Favourites', works: works(named('one piece', 'kaamelott', 'astérix', 'dune')), createdAt: now });
  await put('app.atomes.label', tid(), { name: 'Novels', works: works((copy) => novels.includes(copy.isbn)), createdAt: now });
  const lent = series.get([...series.keys()].find((key) => key.includes('Naruto')) ?? '')?.[0];
  if (lent) await put('app.atomes.loan', tid(), { copy: lent.rkey, borrower: 'Sam', lentAt: day(12), createdAt: now });
}

// --- The screens ------------------------------------------------------------

const screens: Record<string, (page: Page) => Promise<void>> = {
  home: (page) => goto(page, '/'),
  library: (page) => goto(page, '/library'),
  series: (page) => goto(page, `/series?isbn=${seriesPage}`),
  'check-owned': (page) => check(page, checkOwned),
  'check-not-owned': (page) => check(page, notOwned),
  'to-buy': (page) => goto(page, '/to-buy'),
  statistics: (page) => goto(page, '/statistics'),
};

async function goto(page: Page, path: string) {
  await page.goto(`${origin}${path}`);
}

async function check(page: Page, code: string) {
  await goto(page, '/check');
  await page.getByLabel('ISBN', { exact: true }).fill(code);
  await page.getByRole('button', { name: 'Look up' }).click();
  await page.getByRole('dialog', { name: 'Shelf Check' }).waitFor();
}

const islandsLoaded = (page: Page) => page.waitForFunction(() => document.querySelectorAll('astro-island[ssr]').length === 0);

// Islands loaded, no request running, every cover drawn, the arrival motion over.
async function settle(page: Page) {
  await islandsLoaded(page);
  await page.waitForLoadState('networkidle');
  await page.waitForFunction(() =>
    [...document.images].every((image) => {
      const box = image.getBoundingClientRect();
      const shown = box.bottom > 0 && box.top < innerHeight && box.right > 0 && box.left < innerWidth;
      return !shown || image.complete;
    }),
  );
  await page.waitForTimeout(1500);
}

// Chromium encodes WebP from a canvas: no image package needed.
async function toWebp(page: Page, png: Buffer): Promise<Buffer> {
  const base64 = await page.evaluate(async (data) => {
    const blob = await (await fetch(`data:image/png;base64,${data}`)).blob();
    const bitmap = await createImageBitmap(blob);
    const canvas = new OffscreenCanvas(bitmap.width, bitmap.height);
    canvas.getContext('2d')!.drawImage(bitmap, 0, 0);
    const bytes = new Uint8Array(await (await canvas.convertToBlob({ type: 'image/webp', quality: 0.86 })).arrayBuffer());
    let text = '';
    for (let i = 0; i < bytes.length; i += 0x8000) text += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
    return btoa(text);
  }, png.toString('base64'));
  return Buffer.from(base64, 'base64');
}

await main();
