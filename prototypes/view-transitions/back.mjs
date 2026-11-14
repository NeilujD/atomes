// PROTOTYPE, throwaway: frozen frames of Book -> Library (back).
import { chromium } from '@playwright/test';
const variant = process.argv[2] ?? 'morph-push';
const device = process.argv[3] ?? 'phone';
const viewport = device === 'phone' ? { width: 390, height: 760 } : { width: 1280, height: 720 };
const b = await chromium.launch();
const page = await (await b.newContext({ viewport })).newPage();
await page.goto('http://127.0.0.1:4321/dev/sign-in-as');
await page.goto(`http://127.0.0.1:4321/library?vt=${variant}`);
await page.evaluate(() => localStorage.setItem('atomes-vt-slow', '1'));
await page.goto('http://127.0.0.1:4321/library');
await page.locator('a.library-book', { hasText: 'One Piece' }).locator('img').waitFor();
await page.evaluate(() => addEventListener('pageshow', (e) => sessionStorage.setItem('persisted', String(e.persisted))));
await page.locator('a.library-book', { hasText: 'One Piece' }).click();
await page.waitForURL('**/book?**');
await page.waitForTimeout(2500);
await page.goBack({ waitUntil: 'commit' });
const caught = await page.waitForFunction(() => {
  const all = document.getAnimations().filter((a) => a.effect?.pseudoElement?.startsWith('::view-transition'));
  all.forEach((a) => a.pause());
  return all.length > 0;
}, null, { timeout: 3000, polling: 16 }).then(() => true, () => false);
console.log('caught', caught);
for (const f of [0.1, 0.3, 0.6, 0.95]) {
  await page.evaluate((f) => { for (const a of document.getAnimations().filter((a) => a.effect?.pseudoElement?.startsWith('::view-transition'))) { const t = a.effect.getTiming(); a.currentTime = f * (Number(t.delay) + Number(t.duration)); } }, f);
  await page.waitForTimeout(80);
  await page.screenshot({ path: `.ai/vt-preview/back/${variant}-${device}-${Math.round(f * 100)}.png` });
}
await page.evaluate(() => document.getAnimations().forEach((a) => a.play()));
await page.waitForTimeout(2500);
console.log(await page.evaluate(() => ({ log: sessionStorage.getItem('atomes-vt-log'), nav: performance.getEntriesByType('navigation')[0]?.type, reasons: JSON.stringify(performance.getEntriesByType('navigation')[0]?.notRestoredReasons?.reasons ?? null) })));
await page.screenshot({ path: `.ai/vt-preview/back/${variant}-${device}-end.png` });
await b.close();
