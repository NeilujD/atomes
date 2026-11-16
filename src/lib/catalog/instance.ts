// The Catalog of this server: `catalog.sqlite` in DATA_DIR (the Docker volume,
// ADR 0007; `data/` in development).
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { version } from '../../../package.json';
import { readerOf } from '../server/auth';
import { accountStore, authDeps } from '../server/instance';
import { settings } from '../server/settings';
import { type CatalogAccess, createIpLimit } from './access';
import type { Catalog } from './catalog';
import { createCatalog } from './catalog';
import { politeFetch } from './sources';

// Development only, with CATALOG_SOURCES=recorded: the Catalog answers from the
// recorded answers of `fixtures/`, with no network. The check is on
// import.meta.env.DEV, fixed at build time: the build drops this import, so a
// built server ignores the setting and always asks the real sources.
const recorded =
  import.meta.env.DEV && process.env.CATALOG_SOURCES === 'recorded' ? (await import('./recorded.fake')).recordedFetch().fetch : undefined;

let instance: Catalog | undefined;
let access: Promise<CatalogAccess> | undefined;

// One request per second on average for each signed-out IP address. 200
// Series Corrections an hour for each Account: a long Series moved at once
// fits (bulk select, CORE-109), a runaway script does not.
export function catalogAccess(): Promise<CatalogAccess> {
  access ??= authDeps().then((deps) => ({
    limit: createIpLimit({ max: 60, windowMs: 60_000 }),
    signedIn: (request) => readerOf(request, deps) !== undefined,
    account: (request) => readerOf(request, deps)?.account,
    writes: createIpLimit({ max: 200, windowMs: 3600_000 }),
  }));
  return access;
}

export function catalog(): Catalog {
  if (!instance) {
    const dir = process.env.DATA_DIR ?? 'data';
    mkdirSync(dir, { recursive: true });
    const origin = settings().appOrigin;
    instance = createCatalog({
      file: join(dir, 'catalog.sqlite'),
      // Sources ask for a contact URL, never an email (spike 0002).
      fetch: recorded ?? politeFetch(`Atomes/${version} (+${origin ?? 'https://github.com/NeilujD/atomes'})`),
      host: origin ? new URL(origin).host : 'localhost',
      // Opens library.sqlite after its own steps: a Catalog step reads its Accounts.
      accounts: accountStore(),
    });
  }
  return instance;
}
