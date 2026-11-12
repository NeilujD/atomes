// One cover for every screen (islands through `Cover.tsx`, page scripts
// directly). The box is a 2:3 `.book-cover` styled in `theme.css`: it keeps
// its place while the image loads, pulses (`data-cover="loading"`), fades the
// image in (`loaded`), and shows the default cover, the title and Volume on
// soft grey (`default`), when there is no image or it fails to load.

export interface CoverContent {
  // A path on the Atomes server, or none.
  src: string | null;
  title: string;
  // The Volume line of the default cover, such as "Volume 3"; empty for none.
  volume: string;
}

const shown = new WeakMap<HTMLElement, CoverContent>();

export function showCover(box: HTMLElement, content: CoverContent): void {
  const before = shown.get(box);
  shown.set(box, content);
  // Same image: no new load and no new pulse. A default cover takes the new text.
  if (before?.src === content.src && box.dataset.cover !== 'default') return;
  if (!content.src || before?.src === content.src) return showDefault(box);

  const image = document.createElement('img');
  image.alt = '';
  image.loading = 'lazy';
  image.decoding = 'async';
  image.addEventListener('load', () => {
    if (image.parentNode === box) box.dataset.cover = 'loaded';
  });
  image.addEventListener('error', () => {
    if (image.parentNode === box) showDefault(box);
  });
  image.src = content.src;
  box.dataset.cover = 'loading';
  box.replaceChildren(image);
}

function showDefault(box: HTMLElement): void {
  const { title, volume } = shown.get(box)!;
  const cover = document.createElement('span');
  cover.className = 'book-cover-default';
  // The screen shows the title next to the cover: screen readers skip this copy.
  cover.setAttribute('aria-hidden', 'true');
  cover.append(line('book-cover-title', title));
  if (volume) cover.append(line('book-cover-volume', volume));
  box.dataset.cover = 'default';
  box.replaceChildren(cover);
}

function line(name: string, text: string): HTMLElement {
  const element = document.createElement('span');
  element.className = name;
  element.textContent = text;
  return element;
}
