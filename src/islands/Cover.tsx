// A cover pulses until its image is there, then fades in, so a list of covers
// does not flash in one by one. A cover with no image, or one that fails to
// load, keeps the placeholder and its `children`. Each screen styles `class`,
// `[data-loading]` and `img[data-loaded]`.
import type { ComponentChildren } from 'preact';
import { useState } from 'preact/hooks';

export function Cover({ src, class: name, children }: { src: string | null; class: string; children?: ComponentChildren }) {
  const [state, setState] = useState<'loading' | 'loaded' | 'failed'>('loading');
  const shown = src !== null && state !== 'failed';
  return (
    <div class={name} data-loading={shown && state === 'loading' ? '' : undefined}>
      {shown ? (
        <img
          src={src}
          alt=""
          loading="lazy"
          decoding="async"
          data-loaded={state === 'loaded' ? '' : undefined}
          onLoad={() => setState('loaded')}
          onError={() => setState('failed')}
        />
      ) : (
        children
      )}
    </div>
  );
}
