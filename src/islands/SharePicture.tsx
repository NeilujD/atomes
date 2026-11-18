// The share dialog of Statistics (ADR 0019, R4, R5), rendered by the
// Statistics island once it has drawn: it enables the Share button of the
// page (statistics.astro) and opens over it, full screen on the phone and a
// 420 px card on desktop, as the Shelf Check result. The device draws the
// picture (share-picture.ts, picture-painter.ts) and makes its PNG before any
// tap, since iOS needs share() inside the tap. Nothing goes to the server and
// nothing is published: the preview is the reader's consent.
import { useEffect, useRef, useState } from 'preact/hooks';
import { pageLanguage, t } from '../lib/i18n/i18n';
import { pictureAlt, pictureFileName, pictureSize, type PictureChoice, type PictureFormat } from '../lib/library/share-picture';
import type { Period, Statistics } from '../lib/library/stats';
import { paintPicture, pictureBlob } from './picture-painter';

// Draws the picture on the canvas and gives its PNG.
export type MakePicture = (canvas: HTMLCanvasElement, choice: PictureChoice) => Promise<Blob>;

const live: MakePicture = async (canvas, choice) => {
  await paintPicture(canvas, choice);
  return pictureBlob(canvas);
};

interface Picture {
  file: File;
  url: string;
  // The browser can send this file with its share sheet (navigator.canShare).
  shareable: boolean;
}

export function SharePicture({ numbers, period, make = live }: { numbers: Statistics; period: Period; make?: MakePicture }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const [open, setOpen] = useState(false);
  const [format, setFormat] = useState<PictureFormat>('story');
  const [names, setNames] = useState(true);
  const [picture, setPicture] = useState<Picture | null>(null);
  const [failed, setFailed] = useState<'share' | 'draw' | null>(null);
  const choice: PictureChoice = { numbers, period, format, language: pageLanguage(), names };

  // The Share button of the page: enabled now that the island has drawn. The
  // dialog has its own history entry, so browser Back closes it, not the page.
  useEffect(() => {
    const button = document.querySelector<HTMLButtonElement>('[data-statistics-share]');
    const box = dialog.current;
    if (!button || !box) return;
    let entry = false;
    const show = () => {
      box.showModal();
      history.pushState({ statisticsShare: true }, '');
      entry = true;
      setOpen(true);
    };
    const closed = () => {
      setOpen(false);
      setFailed(null);
      if (entry) {
        entry = false;
        history.back();
      }
      button.focus();
    };
    const back = () => {
      if (!entry) return;
      entry = false;
      box.close();
    };
    button.addEventListener('click', show);
    box.addEventListener('close', closed);
    addEventListener('popstate', back);
    button.disabled = false;
    return () => {
      button.disabled = true;
      button.removeEventListener('click', show);
      box.removeEventListener('close', closed);
      removeEventListener('popstate', back);
    };
  }, []);

  // The picture of the choice, and its PNG, while the dialog is open.
  useEffect(() => {
    if (!open || !canvas.current) return;
    let current = true;
    setPicture(null);
    setFailed(null);
    make(canvas.current, choice).then(
      (blob) => {
        if (!current) return;
        const file = new File([blob], pictureFileName(period, format), { type: 'image/png' });
        setPicture({ file, url: URL.createObjectURL(file), shareable: navigator.canShare?.({ files: [file] }) ?? false });
      },
      () => current && setFailed('draw'),
    );
    return () => {
      current = false;
    };
  }, [open, numbers, period, format, names]);

  useEffect(() => () => picture && URL.revokeObjectURL(picture.url), [picture]);

  // In the tap, with the PNG made before it: no await comes first.
  const send = () => {
    if (!picture) return;
    setFailed(null);
    navigator.share({ files: [picture.file] }).catch((error: unknown) => {
      // The reader closed the share sheet.
      if (error instanceof DOMException && error.name === 'AbortError') return;
      setFailed('share');
    });
  };

  const shareable = picture?.shareable ?? false;
  return (
    <dialog ref={dialog} class="share" aria-labelledby="share-title">
      <div class="share-head">
        <button class="icon-button" type="button" aria-label={t('common.close')} onClick={() => dialog.current?.close()}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-linecap="round" aria-hidden="true">
            <path d="M6 6l12 12M18 6L6 18" />
          </svg>
        </button>
        <h2 class="small-heading" id="share-title">
          {t('stats.share')}
        </h2>
        <span class="share-head-space" />
      </div>

      <div class="share-stage">
        {/* Its size before the paint, so the preview keeps its place. */}
        <canvas ref={canvas} class="share-canvas" {...pictureSize(format)} role="img" aria-label={pictureAlt(choice)} data-ready={picture ? '' : undefined} />
      </div>

      <div class="share-choices">
        <div class="segmented" role="radiogroup" aria-label={t('share.format')}>
          {(['story', 'square'] as const).map((each) => (
            <label key={each} class="segment">
              <input type="radio" name="share-format" value={each} checked={each === format} onChange={() => setFormat(each)} />
              {t(`share.${each}`)}
            </label>
          ))}
        </div>
        {/* A Square has no Series names. */}
        <label class="share-names">
          <span>{t('share.names')}</span>
          <input class="switch" type="checkbox" role="switch" checked={names} disabled={format === 'square'} onChange={(event) => setNames(event.currentTarget.checked)} />
        </label>
      </div>

      <p class="share-note">{t('share.note')}</p>
      {failed && (
        <p class="share-note" role="status">
          {t(failed === 'share' ? 'share.failed' : 'share.not-drawn')}
        </p>
      )}

      <div class="share-actions">
        {shareable && (
          <button class="button button-main" type="button" onClick={send}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
              <path d="M12 2v13" />
              <path d="m16 6-4-4-4 4" />
              <path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8" />
            </svg>
            {t('share.send')}
          </button>
        )}
        {/* Download always: the main action where the browser cannot share a file. */}
        <a
          class={shareable ? 'button' : 'button button-main'}
          href={picture?.url}
          download={picture?.file.name}
          aria-disabled={picture ? undefined : 'true'}
          role={picture ? undefined : 'link'}
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
            <path d="M12 15V3" />
            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
            <path d="m7 10 5 5 5-5" />
          </svg>
          {t('share.download')}
        </a>
      </div>
    </dialog>
  );
}
