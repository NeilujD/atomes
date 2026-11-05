// The Catalog of this server: `catalog.sqlite` in DATA_DIR (the Docker volume,
// ADR 0007; `data/` in development).
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { version } from '../../../package.json';
import type { Catalog } from './catalog';
import { createCatalog } from './catalog';
import { politeFetch } from './sources';

let instance: Catalog | undefined;

export function catalog(): Catalog {
  if (!instance) {
    const dir = process.env.DATA_DIR ?? 'data';
    mkdirSync(dir, { recursive: true });
    const origin = process.env.PUBLIC_APP_ORIGIN;
    instance = createCatalog({
      file: join(dir, 'catalog.sqlite'),
      // Sources ask for a contact URL, never an email (spike 0002).
      fetch: politeFetch(`Atomes/${version} (+${origin ?? 'https://github.com/NeilujD/atomes'})`),
      host: origin ? new URL(origin).host : 'localhost',
    });
  }
  return instance;
}
