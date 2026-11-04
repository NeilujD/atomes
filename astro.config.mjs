// @ts-check
import { createHash } from 'node:crypto';
import { readFile, readdir, writeFile } from 'node:fs/promises';
import { URL } from 'node:url';
import { defineConfig } from 'astro/config';
import node from '@astrojs/node';

/**
 * Writes the built assets and a version into the service worker (public/sw.js),
 * so it precaches the whole app shell and a deploy with new assets installs a new cache.
 * @returns {import('astro').AstroIntegration}
 */
function precacheAppShell() {
  return {
    name: 'atomes:precache-app-shell',
    hooks: {
      'astro:build:done': async ({ dir }) => {
        const assets = (await readdir(new URL('_astro/', dir))).sort().map((file) => `/_astro/${file}`);
        const version = createHash('sha256').update(assets.join('\n')).digest('hex').slice(0, 12);
        const swUrl = new URL('sw.js', dir);
        const source = await readFile(swUrl, 'utf8');
        const placeholder = "const BUILD = { version: 'dev', assets: [] };";
        if (!source.includes(placeholder)) throw new Error(`sw.js no longer contains: ${placeholder}`);
        await writeFile(swUrl, source.replace(placeholder, `const BUILD = ${JSON.stringify({ version, assets })};`));
      },
    },
  };
}

// https://astro.build/config
export default defineConfig({
  output: 'server',
  adapter: node({
    mode: 'standalone',
  }),
  integrations: [precacheAppShell()],
});
