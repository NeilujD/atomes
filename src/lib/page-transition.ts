// Page transitions between screens (CORE-90): native cross-document view
// transitions. The frame stays still, the page fades or pushes, and the cover of
// a book flies from the Library to its Book page and back. Styles:
// src/styles/page-transitions.css. Chrome 126+, Safari 18.2+; other browsers
// keep the plain navigation.
// https://developer.chrome.com/docs/web-platform/view-transitions/cross-document
//
// AppShell inlines `pageTransitionScript` in <head>, so it runs before first
// render and catches `pagereveal`. An inline script cannot import a module: the
// script is made from the source of the functions below, which share one scope
// and must not use anything else of this module.

// The page a Book was opened from, with the place of its cover there: the cover
// flies back to it. Pages are a path and a query, as in a link.
export interface Trip {
  back: string;
  book: string;
  rect: { left: number; top: number; width: number; height: number };
}

// Tabs are at the top; a Series is under them, a Book under a Series.
export function pageDepth(page: string): number {
  const path = page.split(/[?#]/)[0];
  return path === '/book' ? 2 : path === '/series' ? 1 : 0;
}

// Deeper pushes the new page in, shallower slides the old page out; between
// pages at the same depth, no direction (a fade).
export function transitionDirection(from: string, to: string): 'forward' | 'back' | null {
  const step = pageDepth(to) - pageDepth(from);
  return step > 0 ? 'forward' : step < 0 ? 'back' : null;
}

// The cover flies home only from the Book of the trip to the page it was opened
// from. Anywhere else there is no slot to land in, and it would hang over the page.
export function fliesHome(trip: Trip | null, from: string, to: string): boolean {
  return !!trip && trip.book === from && trip.back === to;
}

function installPageTransitions(): void {
  if (!('onpagereveal' in window)) return;
  const fromKey = 'atomes-page-from';
  const coverKey = 'atomes-page-cover';
  const tripKey = 'atomes-page-trip';
  const root = document.documentElement;
  const here = () => location.pathname + location.search;
  // Storage can be refused (private browsing): then no flight, never an error.
  const read = <T>(key: string): T | null => {
    try {
      return JSON.parse(sessionStorage.getItem(key) ?? 'null') as T | null;
    } catch {
      return null;
    }
  };
  const write = (key: string, value: unknown) => {
    try {
      if (value === null) sessionStorage.removeItem(key);
      else sessionStorage.setItem(key, JSON.stringify(value));
    } catch {
      // No storage: the next page has nothing to read.
    }
  };

  // Every name is set from here and cleared at the end of the transition, and
  // at reveal: a page back from the back/forward cache still holds its names.
  const named = new Set<HTMLElement>();
  const name = (element: HTMLElement | null) => {
    if (!element) return;
    element.style.viewTransitionName = 'book-cover';
    named.add(element);
  };
  const clearNames = () => {
    for (const element of named) element.style.viewTransitionName = '';
    named.clear();
  };

  // The same book can show twice on a page (Cover flow): the cover of the link tapped.
  let tapped: HTMLAnchorElement | null = null;
  addEventListener('click', (event) => (tapped = (event.target as Element | null)?.closest?.('a') ?? null), true);

  // Back home: the Library draws its covers after the page shows (client:only
  // island), but a transition takes its names when it starts. An empty box takes
  // the name at once at the saved place, then follows the real cover every
  // frame once it draws; the flying cover lands with it. The real cover stays
  // hidden until the end. A cover out of sight does not fly.
  const land = (trip: Trip) => {
    const box = document.createElement('div');
    box.setAttribute('aria-hidden', 'true');
    box.style.position = 'fixed';
    box.style.pointerEvents = 'none';
    const place = (rect: Trip['rect']) => {
      box.style.left = `${rect.left}px`;
      box.style.top = `${rect.top}px`;
      box.style.width = `${rect.width}px`;
      box.style.height = `${rect.height}px`;
    };
    place(trip.rect);
    name(box);
    document.body.append(box);
    const covers = `a[href="${CSS.escape(trip.book)}"] .book-cover`;
    const hidden = new Set<HTMLElement>();
    let flying = true;
    const follow = () => {
      if (!flying) return;
      const cover = [...document.querySelectorAll<HTMLElement>(covers)].find((element) => element.getClientRects().length > 0);
      if (cover) {
        cover.style.visibility = 'hidden';
        hidden.add(cover);
        const rect = cover.getBoundingClientRect();
        if (rect.bottom < 0 || rect.top > innerHeight || rect.right < 0 || rect.left > innerWidth) root.dataset.coverLost = '';
        else place(rect);
      }
      requestAnimationFrame(follow);
    };
    follow();
    return () => {
      flying = false;
      box.remove();
      for (const cover of hidden) cover.style.visibility = '';
      delete root.dataset.coverLost;
    };
  };

  addEventListener('pageswap', (event) => {
    const from = here();
    write(fromKey, from);
    write(coverKey, null);
    const entry = event.activation?.entry;
    if (!event.viewTransition || !entry?.url) return;
    const url = new URL(entry.url);
    const to = url.pathname + url.search;
    if (url.pathname === '/book') {
      const link = [tapped, ...document.querySelectorAll('a')].find((a) => a?.getAttribute('href') === to && a.querySelector('.book-cover'));
      const cover = link?.querySelector<HTMLElement>('.book-cover');
      // Opened with no cover (Shelf Check, a Series): no flight, there nor back.
      if (!cover) return write(tripKey, null);
      name(cover);
      // The Book page shows this image at once, with no new load.
      write(coverKey, { book: to, src: cover.querySelector('img')?.getAttribute('src') ?? null });
      const { left, top, width, height } = cover.getBoundingClientRect();
      write(tripKey, { back: from, book: to, rect: { left, top, width, height } } satisfies Trip);
    } else if (fliesHome(read<Trip>(tripKey), from, to)) {
      name(document.querySelector<HTMLElement>('[data-book-cover]'));
    }
  });

  addEventListener('pagereveal', (event) => {
    clearNames();
    const transition = event.viewTransition;
    const from = read<string>(fromKey);
    const cover = read<{ book: string; src: string | null }>(coverKey);
    const trip = read<Trip>(tripKey);
    const to = here();
    write(coverKey, null);
    // A trip ends on the first page that is not a Book: the cover flies home once.
    if (pageDepth(to) < 2) write(tripKey, null);
    if (!transition || !from) return;
    const direction = transitionDirection(from, to);
    if (direction) transition.types.add(direction);
    let landed = () => {};
    if (cover?.book === to) {
      const box = document.querySelector<HTMLElement>('[data-book-cover]');
      if (box && cover.src && !box.firstChild) {
        const image = document.createElement('img');
        image.alt = '';
        image.src = cover.src;
        box.classList.remove('skeleton');
        box.dataset.cover = 'loaded';
        box.append(image);
      }
      name(box);
    } else if (trip && fliesHome(trip, from, to)) {
      landed = land(trip);
    }
    void transition.finished.finally(() => {
      landed();
      clearNames();
    });
  });
}

const scope = [pageDepth, transitionDirection, fliesHome].map((rule) => rule.toString()).join('');
export const pageTransitionScript = `(()=>{${scope}(${installPageTransitions.toString()})()})();`;
