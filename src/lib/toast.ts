// Toasts: short notices over the page, so a result never moves the content.
// The region and the template are in AppShell. A toast closes after a few
// seconds, but not while the pointer or the focus is on it; an error stays
// until the reader closes it.

export interface ToastLink {
  href: string;
  label: string;
}

export interface ToastOptions {
  link?: ToastLink;
  error?: boolean;
}

const plainMs = 5_000;
const linkMs = 9_000;
const most = 3;

// Returns a function that closes the toast (for a notice that a later one replaces).
export function toast(text: string, { link, error = false }: ToastOptions = {}): () => void {
  const region = document.querySelector<HTMLElement>('[data-toasts]');
  const template = document.querySelector<HTMLTemplateElement>('[data-toast-template]');
  if (!region || !template) return () => undefined;

  // The same notice again (a retry that fails again): keep the one shown.
  const shown = [...region.querySelectorAll<HTMLElement>('[data-toast]')];
  const same = shown.find((each) => each.dataset.text === text);
  if (same) return () => same.remove();

  const item = template.content.firstElementChild!.cloneNode(true) as HTMLElement;
  item.dataset.text = text;
  if (error) {
    item.dataset.error = '';
    item.setAttribute('role', 'alert');
  }
  const body = item.querySelector<HTMLElement>('[data-toast-text]')!;
  body.textContent = text;
  if (link) {
    const anchor = document.createElement('a');
    anchor.href = link.href;
    anchor.textContent = link.label;
    body.append(' ', anchor);
  }

  const close = () => item.remove();
  item.querySelector('[data-toast-close]')!.addEventListener('click', close);

  if (!error) {
    let timer = setTimeout(close, link ? linkMs : plainMs);
    const pause = () => clearTimeout(timer);
    const resume = () => {
      clearTimeout(timer);
      timer = setTimeout(close, plainMs);
    };
    item.addEventListener('pointerenter', pause);
    item.addEventListener('focusin', pause);
    item.addEventListener('pointerleave', () => {
      if (!item.matches(':focus-within')) resume();
    });
    item.addEventListener('focusout', (event) => {
      if (!item.contains(event.relatedTarget as Node | null) && !item.matches(':hover')) resume();
    });
  }

  region.append(item);
  for (const old of shown.slice(0, Math.max(0, shown.length + 1 - most))) old.remove();
  return close;
}
