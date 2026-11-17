// The back arrow of a Book or Series page (ui-direction: View header), and the
// close icon of the privacy notice. The installed app has no browser Back
// button: they are the way back. After an Atomes page they step back in
// history, so the screen opens as the reader left it (the Library:
// src/lib/library/library-state.ts); else they are a plain link.
//
// A tap can come before the page script has run (a slow phone, the CI runner):
// the link then goes to its href. The privacy notice gets the screen that
// opened it from the server (openerHref), so that tap goes there too.

export interface Before {
  // `document.referrer`: an Atomes page sends it, another site does not
  // (Referrer-Policy same-origin, src/lib/server/security.ts).
  referrer: string;
  origin: string;
  // The page before, as the page transitions saved it (src/lib/page-transition.ts).
  // The installed app on iOS often has no referrer.
  from: string | null;
  // `history.length`: 1 when this page opened in a new tab.
  entries: number;
}

export function goesBack({ referrer, origin, from, entries }: Before): boolean {
  if (entries < 2) return false;
  // A referrer from another site wins over a page saved before leaving for it.
  if (referrer !== '') return new URL(referrer).origin === origin;
  return from !== null;
}

// Storage can be refused (private browsing): then no page before.
function pageBefore(): string | null {
  try {
    // The key of src/lib/page-transition.ts.
    return sessionStorage.getItem('atomes-page-from');
  } catch {
    return null;
  }
}

export function startBackArrow(): void {
  document.querySelector('[data-back]')?.addEventListener('click', (event) => {
    if (!goesBack({ referrer: document.referrer, origin: location.origin, from: pageBefore(), entries: history.length })) return;
    event.preventDefault();
    history.back();
  });
}

// The href of the close icon of the privacy notice: the path of the Atomes page
// that opened it, from the Referer header (sent only by a same-origin page:
// Referrer-Policy same-origin); Home else. The Host header, not the request
// URL: the built server can put `localhost` there (src/middleware.ts).
export function openerHref(referer: string | null, host: string | null): string {
  if (!referer || !host || !URL.canParse(referer)) return '/';
  const { host: from, pathname } = new URL(referer);
  // Never `//other.site`: a path that starts with two slashes leaves the host.
  if (from !== host || pathname === '/privacy' || pathname.startsWith('//')) return '/';
  return pathname;
}
