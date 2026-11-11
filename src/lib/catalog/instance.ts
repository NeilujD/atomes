// The Catalog of this server: `catalog.sqlite` in DATA_DIR (the Docker volume,
// ADR 0007; `data/` in development).
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { version } from '../../../package.json';
import { readerOf } from '../server/auth';
import { authDeps } from '../server/instance';
import { settings } from '../server/settings';
import { type CatalogAccess, createIpLimit } from './access';
import type { Catalog } from './catalog';
import { createCatalog } from './catalog';
import { politeFetch } from './sources';

let instance: Catalog | undefined;
let access: Promise<CatalogAccess> | undefined;

// One request per second on average for each signed-out IP address.
export function catalogAccess(): Promise<CatalogAccess> {
  access ??= authDeps().then((deps) => ({
    limit: createIpLimit({ max: 60, windowMs: 60_000 }),
    signedIn: (request) => readerOf(request, deps) !== undefined,
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
      fetch: politeFetch(`Atomes/${version} (+${origin ?? 'https://github.com/NeilujD/atomes'})`),
      host: origin ? new URL(origin).host : 'localhost',
    });
  }
  return instance;
}
