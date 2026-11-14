// PROTOTYPE, throwaway: records the view transition variants for the preview page.
// Needs `bun run dev` on 127.0.0.1:4321 and a Library holding "One Piece".
// Run: node .ai/vt-preview/capture.mjs
import { chromium, webkit } from '@playwright/test';
import { mkdir, readdir, rename, rm, writeFile } from 'node:fs/promises';

const base = 'http://127.0.0.1:4321';
const out = new URL('./', import.meta.url).pathname;
const variants = ['off', 'fade', 'morph', 'push', 'morph-push'];
const viewports = { phone: { width: 390, height: 760 }, desktop: { width: 1280, height: 720 } };
const fractions = [0.2, 0.45, 0.75];
const results = [];

async function openLibrary(page, variant, slow) {
  await page.goto(`${base}/library?vt=${variant}`);
  await page.evaluate((slow) => localStorage.setItem('atomes-vt-slow', slow ? '1' : '0'), slow);
  await page.goto(`${base}/library`);
  // Grid mode, so every variant starts from the same screen.
  const grid = page.getByRole('radio', { name: 'Grid' }).or(page.getByRole('button', { name: 'Grid' })).first();
  if (await grid.isVisible().catch(() => false)) await grid.click();
  await page.locator('a.library-book', { hasText: 'One Piece' }).locator('img').waitFor();
  await page.waitForTimeout(600);
}

for (const engine of [chromium, webkit]) {
  const browser = await engine.launch();
  for (const [device, viewport] of Object.entries(viewports)) {
    if (engine === webkit && device === 'desktop') continue;
    for (const variant of variants) {
      const tag = `${engine.name()}-${device}-${variant}`;
      const dir = `${out}${tag}`;
      await rm(dir, { recursive: true, force: true });
      await mkdir(dir, { recursive: true });
      const context = await browser.newContext({ viewport, recordVideo: { dir, size: viewport } });
      const page = await context.newPage();
      await page.goto(`${base}/dev/sign-in-as`);
      await page.waitForURL('**/library');

      // Real speed: Library -> Book -> back.
      await openLibrary(page, variant, false);
      await page.locator('a.library-book', { hasText: 'One Piece' }).click();
      await page.waitForURL('**/book?**');
      await page.waitForTimeout(1400);
      await page.goBack();
      await page.waitForTimeout(1400);
      const log = await page.evaluate(() => sessionStorage.getItem('atomes-vt-log'));

      // Frozen frames of Library -> Book, slowed so the script can catch them.
      const frames = [];
      if (variant !== 'off') {
        await openLibrary(page, variant, true);
        await page.locator('a.library-book', { hasText: 'One Piece' }).click();
        await page.waitForURL('**/book?**');
        const caught = await page
          .waitForFunction(() => {
            const all = document.getAnimations().filter((a) => a.effect?.pseudoElement?.startsWith('::view-transition'));
            if (!all.length) return false;
            all.forEach((a) => a.pause());
            return all.length;
          }, null, { timeout: 1500, polling: 16 })
          .then(() => true, () => false);
        if (caught) {
          for (const f of fractions) {
            await page.evaluate((f) => {
              for (const a of document.getAnimations().filter((a) => a.effect?.pseudoElement?.startsWith('::view-transition'))) {
                const { delay = 0, duration } = a.effect.getTiming();
                a.currentTime = f * (Number(delay) + Number(duration));
              }
            }, f);
            await page.waitForTimeout(80);
            const file = `${dir}/frame-${Math.round(f * 100)}.png`;
            await page.screenshot({ path: file });
            frames.push(file.slice(out.length));
          }
        }
      }
      await context.close();
      const [video] = (await readdir(dir)).filter((f) => f.endsWith('.webm'));
      if (video) await rename(`${dir}/${video}`, `${dir}/motion.webm`);
      results.push({ tag, engine: engine.name(), device, variant, video: video ? `${tag}/motion.webm` : null, frames, log });
      console.log(tag, frames.length, 'frames', log);
    }
  }
  await browser.close();
}

await writeFile(`${out}results.json`, JSON.stringify(results, null, 2));
