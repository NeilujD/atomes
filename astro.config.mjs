// @ts-check
import { createHash } from 'node:crypto';
import { readFile, readdir, writeFile } from 'node:fs/promises';
import { URL } from 'node:url';
import { defineConfig } from 'astro/config';
import node from '@astrojs/node';
import preact from '@astrojs/preact';

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
  // Preact islands for interactive data screens (ADR 0014).
  integrations: [preact(), precacheAppShell()],
  // Content-Security-Policy of the pages (ADR 0013), with a hash for each inline
  // script and style. Astro sends it as a response header on pages rendered on
  // demand, and not in `astro dev`. The middleware (src/lib/server/security.ts)
  // adds the other headers and a policy for the other answers.
  // https://docs.astro.build/en/reference/configuration-reference/#securitycsp
  security: {
    csp: {
      // Everything comes from the app: covers through /api/catalog, the barcode
      // wasm from /_astro. No `form-action`: sign-in posts to the app, which
      // redirects to the reader's PDS.
      directives: ["default-src 'self'", "object-src 'none'", "base-uri 'none'", "frame-ancestors 'none'"],
      // The barcode scan compiles its wasm (zxing-wasm) on iPhone.
      scriptDirective: { resources: ["'self'", "'wasm-unsafe-eval'"] },
    },
  },
});
