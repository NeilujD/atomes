// One cover for every screen (islands through `Cover.tsx`, page scripts
// directly). The box is a 2:3 `.book-cover` styled in `theme.css`: it keeps
// its place while the image loads (`data-cover="loading"`: the plain soft box,
// no pulse), fades the image in (`loaded`), and shows the default cover (`default`) when there is
// no image or it fails to load: a plain book with the Series name on top, a
// grey picture, the name of the book under it and three grey lines.

export interface CoverContent {
  // A path on the Atomes server, or none.
  src: string | null;
  title: string;
  // The Series title, when the book is part of one.
  series: string | null;
  volumeTitle: string | null;
  // The Volume line, such as "Volume 3"; empty for none.
  volume: string;
}

// The name under the picture. A Volume of a Series: its Volume title, else its
// title when it is not the Series name (the Catalog often files the Volume
// title there), else its Volume. A book with no Series: its title.
export function coverName({ title, series, volumeTitle, volume }: Omit<CoverContent, 'src'>): string {
  if (!series) return title;
  return volumeTitle || (title !== series ? title : '') || volume || title;
}

const shown = new WeakMap<HTMLElement, CoverContent>();

export function showCover(box: HTMLElement, content: CoverContent): void {
  const before = shown.get(box);
  shown.set(box, content);
  // The image of the cover that flew in from the Library (src/lib/page-transition.ts): no new load, no fade.
  if (!before && content.src && box.querySelector('img')?.getAttribute('src') === content.src) return;
  // Same image: no new load. A default cover takes the new text.
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
  const content = shown.get(box)!;
  const cover = span('book-cover-default');
  // The screen shows the title next to the cover: screen readers skip this copy.
  cover.setAttribute('aria-hidden', 'true');
  if (content.series) cover.append(span('book-cover-series', content.series));
  const lines = span('book-cover-lines');
  lines.append(span(), span(), span());
  cover.append(span('book-cover-picture'), span('book-cover-name', coverName(content)), lines);
  box.dataset.cover = 'default';
  box.replaceChildren(cover);
}

function span(name?: string, text?: string): HTMLElement {
  const element = document.createElement('span');
  if (name) element.className = name;
  if (text) element.textContent = text;
  return element;
}
