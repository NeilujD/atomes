// PROTOTYPE, throwaway: builds preview.html from results.json (capture.mjs).
import { readFile, writeFile } from 'node:fs/promises';
const results = JSON.parse(await readFile(new URL('./results.json', import.meta.url), 'utf8'));
const about = {
  off: ['Off (today)', 'Hard cut: blank flash, then the skeleton.'],
  fade: ['A · Calm fade', 'Chrome (sidebar, tab bar) stays still. Only the page fades through: old out 120 ms, new in 200 ms. Cheapest, safest, everywhere.'],
  morph: ['B · Cover morph', 'A + the tapped cover flies to its place on the Book page (380 ms). The cover is the object the reader tapped: the eye never loses it.'],
  push: ['C · Push', 'Drill-down (Library → Series → Book) slides the page in from the right; back slides it out. Phone: full iOS-style push. Desktop: 32 px shift + fade inside the panel. Tabs stay a fade.'],
  'morph-push': ['D · Morph + push', 'B + C: the page pushes in while the cover flies. Most "native app" feel; most motion.'],
};
const cell = (r) => r ? `<figure><figcaption>${r.engine} · ${r.device}</figcaption>${r.video ? `<video src="${r.video}" autoplay loop muted playsinline></video>` : ''}<div class="frames">${r.frames.map((f) => `<img src="${f}" alt="">`).join('')}</div></figure>` : '';
const rows = Object.entries(about).map(([key, [title, text]]) => {
  const pick = (engine, device) => results.find((r) => r.variant === key && r.engine === engine && r.device === device);
  return `<section><h2>${title}</h2><p>${text}</p><div class="row">${cell(pick('chromium', 'phone'))}${cell(pick('chromium', 'desktop'))}${cell(pick('webkit', 'phone'))}</div></section>`;
}).join('');
await writeFile(new URL('./preview.html', import.meta.url), `<!doctype html><meta charset="utf-8"><title>Atomes · view transition variants</title>
<style>body{font:14px system-ui;margin:24px;background:#f6f6f3;color:#121317}h1{font-size:22px}section{margin:32px 0;border-top:1px solid #ddd;padding-top:16px}
.row{display:flex;gap:24px;align-items:flex-start;overflow-x:auto}figure{margin:0}figcaption{font-weight:600;margin-bottom:6px}
video{display:block;max-height:420px;border:1px solid #ccc;border-radius:8px;background:#fff}.frames{display:flex;gap:6px;margin-top:6px}.frames img{height:140px;border:1px solid #ccc;border-radius:4px}</style>
<h1>Library → Book → back: view transition variants</h1>
<p>Videos: real speed (Library, tap One Piece, Book, back). Small images: the same transition frozen at 20 %, 45 %, 75 %. Headless capture; WebKit frames are not reliable (see notes).</p>${rows}`);
