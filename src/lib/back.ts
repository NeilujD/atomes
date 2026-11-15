// The back arrow of a Book or Series page (ui-direction: View header). The
// installed app has no browser Back button: the arrow is the way back. After an
// Atomes page it steps back in history, so the Library opens as the reader left
// it (src/lib/library/library-state.ts); else it is a link to the Library.

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
