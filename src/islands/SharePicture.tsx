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

// The picture is drawn and its PNG made on a canvas the page does not show,
// then copied once to the preview: on Chrome for Android, a PNG read back
// from the preview canvas kept the GPU busy, and the buttons were not drawn
// for two frames (a phone recording, frames 92, 130, 181).
const live: MakePicture = async (canvas, choice) => {
  const work = document.createElement('canvas');
  await paintPicture(work, choice);
  const blob = await pictureBlob(work);
  canvas.width = work.width;
  canvas.height = work.height;
  canvas.getContext('2d')?.drawImage(work, 0, 0);
  return blob;
};

interface Picture {
  file: File;
  url: string;
}

// The browser can send a PNG with its share sheet. Asked once, with an empty
// PNG, so "Share the picture" is there from the first frame of the dialog.
const canSharePng = () => navigator.canShare?.({ files: [new File([], 'atomes.png', { type: 'image/png' })] }) ?? false;

interface SharePictureProps {
  numbers: Statistics;
  period: Period;
  filters: PictureChoice['filters'];
  make?: MakePicture;
}

export function SharePicture({ numbers, period, filters, make = live }: SharePictureProps) {
  const dialog = useRef<HTMLDialogElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const [open, setOpen] = useState(false);
  const [format, setFormat] = useState<PictureFormat>('story');
  const [names, setNames] = useState(true);
  const [picture, setPicture] = useState<Picture | null>(null);
  // The picture of a new choice is being made: the last one stays on screen
  // meanwhile, and the buttons do nothing until the new PNG is ready.
  const [making, setMaking] = useState(false);
  const [shareable] = useState(canSharePng);
  const [failed, setFailed] = useState<'share' | 'draw' | null>(null);
  const choice: PictureChoice = { numbers, period, filters, format, language: pageLanguage(), names };

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
    setMaking(true);
    setFailed(null);
    make(canvas.current, choice).then(
      (blob) => {
        if (!current) return;
        const file = new File([blob], pictureFileName(period, format), { type: 'image/png' });
        setPicture({ file, url: URL.createObjectURL(file) });
        setMaking(false);
      },
      () => {
        if (!current) return;
        setPicture(null);
        setMaking(false);
        setFailed('draw');
      },
    );
    return () => {
      current = false;
    };
  }, [open, numbers, period, filters.label, filters.ownedOnly, format, names]);

  useEffect(() => () => picture && URL.revokeObjectURL(picture.url), [picture]);

  // In the tap, with the PNG made before it: no await comes first.
  const send = () => {
    if (!ready) return;
    setFailed(null);
    navigator.share({ files: [ready.file] }).catch((error: unknown) => {
      // The reader closed the share sheet.
      if (error instanceof DOMException && error.name === 'AbortError') return;
      setFailed('share');
    });
  };

  const ready = picture && !making ? picture : null;

  // A hidden link, out of the dialog, saves the PNG: Firefox clicks only a
  // link in the document.
  const save = () => {
    if (!ready) return;
    const link = document.createElement('a');
    link.href = ready.url;
    link.download = ready.file.name;
    link.hidden = true;
    document.body.append(link);
    link.click();
    link.remove();
  };
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
        {/* A size before the first paint, so the preview has its place. Set once:
            a new size here would blank the canvas before the next picture is
            drawn; paintPicture sets the size of each picture as it draws it. */}
        <canvas ref={canvas} class="share-canvas" {...pictureSize('story')} role="img" aria-label={pictureAlt(choice)} data-ready={ready ? '' : undefined} />
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
        {/* Download always: the main action where the browser cannot share a file.
            Nothing in these buttons changes once the dialog is open: a change
            here when a new PNG is ready would make Chrome draw them again
            while the GPU is busy with the picture. */}
        <button class={shareable ? 'button' : 'button button-main'} type="button" onClick={save}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
            <path d="M12 15V3" />
            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
            <path d="m7 10 5 5 5-5" />
          </svg>
          {t('share.download')}
        </button>
      </div>
    </dialog>
  );
}
