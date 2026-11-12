// The cover of `src/lib/cover.ts` in an island. `class` sizes the box; the
// module fills it, so Preact renders no children here.
import { useLayoutEffect, useRef } from 'preact/hooks';
import { showCover, type CoverContent } from '../lib/cover';

export function Cover({ class: name, src, title, volume }: CoverContent & { class: string }) {
  const box = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => showCover(box.current!, { src, title, volume }), [src, title, volume]);
  return <div ref={box} class={`book-cover ${name}`} />;
}
