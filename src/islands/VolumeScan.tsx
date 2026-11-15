// The sheet of a Volume the Catalog lacks (ADR 0017, "Where the reader makes
// one"): the reader scans or types the ISBN of that Volume, and a Series
// Correction puts that Edition in the Edition Line at that number, for every
// reader of the instance. Undo goes back to the sources. Opened by a tap on
// an unknown Volume: the Missing list of the Series page (Series.tsx) and the
// tiles of Series Onboarding (onboarding.astro). The host mounts it to open
// it, and asks the Catalog for the Edition Line again in `onChanged`.
import { useEffect, useRef, useState } from 'preact/hooks';
import { correctEdition, lookupEdition, refreshCorrected, uncorrectEdition } from '../lib/catalog/client';
import { t } from '../lib/i18n/i18n';
import { readIsbn } from '../lib/library/ids';
import { isNetworkFailure } from '../lib/network';
import { cameraProblem, loadReader, openCamera, watchBarcodes } from '../lib/scan/barcode';
import { toast } from '../lib/toast';

export interface VolumeScanSources {
  lookup: typeof lookupEdition;
  correct: typeof correctEdition;
  uncorrect: typeof uncorrectEdition;
}

// This device keeps the new answers too (service worker, device Catalog).
export const liveVolumeScan: VolumeScanSources = {
  lookup: lookupEdition,
  correct: async (isbn, correction) => {
    const answer = await correctEdition(isbn, correction);
    if ('found' in answer) await refreshCorrected(isbn);
    return answer;
  },
  uncorrect: async (isbn) => {
    const answer = await uncorrectEdition(isbn);
    await refreshCorrected(isbn);
    return answer;
  },
};

export interface VolumeScanProps {
  volume: number;
  // The anchor ISBN of the Edition Line the Volume joins.
  anchor: string;
  // After the Correction and after its Undo: the Edition Line changed.
  onChanged: () => unknown;
  onClose: () => void;
  sources?: VolumeScanSources;
}

type Camera = 'off' | 'starting' | 'looking';

export function VolumeScan({ volume, anchor, onChanged, onClose, sources = liveVolumeScan }: VolumeScanProps) {
  const sheet = useRef<HTMLDialogElement>(null);
  const field = useRef<HTMLInputElement>(null);
  const video = useRef<HTMLVideoElement>(null);
  // Aborted when the camera stops, for any reason (a book read, the sheet closed).
  const scanning = useRef(new AbortController());
  const [typed, setTyped] = useState('');
  const [problem, setProblem] = useState<string>();
  const [busy, setBusy] = useState(false);
  const [camera, setCamera] = useState<Camera>('off');

  useEffect(() => {
    sheet.current?.showModal();
    return () => scanning.current.abort();
  }, []);

  function stopCamera() {
    scanning.current.abort();
    setCamera('off');
  }

  function typeInstead(reason: string) {
    stopCamera();
    setProblem(reason);
    field.current?.focus();
  }

  // As on Check a book: the first good ISBN read is sent.
  async function scan() {
    setProblem(undefined);
    scanning.current.abort();
    const controller = new AbortController();
    scanning.current = controller;
    const { signal } = controller;
    setCamera('starting');
    let stream: MediaStream;
    try {
      stream = await openCamera();
    } catch (error) {
      return typeInstead(t(`camera.${cameraProblem(error)}`));
    }
    const stop = () => stream.getTracks().forEach((track) => track.stop());
    if (signal.aborted) return stop();
    signal.addEventListener('abort', stop);
    const shown = video.current!;
    shown.srcObject = stream;
    signal.addEventListener('abort', () => (shown.srcObject = null));
    try {
      await shown.play();
      await loadReader();
      if (signal.aborted) return;
      setCamera('looking');
      await watchBarcodes(shown, found, signal);
    } catch {
      if (!signal.aborted) typeInstead(t('scan.no-barcodes'));
    }
  }

  // A wrong check digit is a misread: keep reading without a word.
  function found(text: string): boolean {
    const read = readIsbn(text);
    if (!('isbn' in read)) {
      if (read.problem !== 'check-digit') setProblem(t(`isbn.${read.problem}`));
      return false;
    }
    navigator.vibrate?.(40);
    stopCamera();
    setTyped(read.isbn);
    void send(read.isbn);
    return true;
  }

  function submit(event: Event) {
    event.preventDefault();
    const read = readIsbn(typed);
    if ('problem' in read) return setProblem(t(`isbn.${read.problem}`));
    void send(read.isbn);
  }

  async function send(isbn: string) {
    if (busy) return;
    setBusy(true);
    setProblem(undefined);
    try {
      const known = await sources.lookup(isbn);
      if ('notFound' in known) return setProblem(t('scan-volume.not-found'));
      if (!('found' in known)) return setProblem(t('correction.failed'));
      const answer = await sources.correct(isbn, { anchor, volume });
      if (!('found' in answer)) {
        return setProblem(t('signedOut' in answer ? 'auth.session-ended' : 'tooMany' in answer ? 'correction.too-many' : 'correction.failed'));
      }
      sheet.current?.close();
      // Undo would delete an earlier Correction of this Edition too: none then.
      const undo = async () => {
        await sources.uncorrect(isbn).catch(() => undefined);
        await onChanged();
      };
      toast(t('scan-volume.joined', volume), known.found.corrected ? {} : { action: { label: t('common.undo'), run: () => void undo() } });
      await onChanged();
    } catch (error) {
      setProblem(t(isNetworkFailure(error) ? 'add.lookup-unreachable' : 'correction.failed'));
    } finally {
      setBusy(false);
    }
  }

  return (
    // A tap on the backdrop closes it, as Escape does.
    <dialog
      ref={sheet}
      class="correction-sheet"
      aria-labelledby="volume-scan-title"
      onClose={() => {
        stopCamera();
        onClose();
      }}
      onClick={(event) => event.target === event.currentTarget && event.currentTarget.close()}
    >
      <div class="correction-body">
        <div class="correction-head">
          <h2 class="correction-title" id="volume-scan-title">
            {t('scan-volume.title', volume)}
          </h2>
          <button class="button button-quiet" type="button" onClick={() => sheet.current?.close()}>
            {t('common.close')}
          </button>
        </div>
        <p class="hint">{t('scan-volume.hint', volume)}</p>
        {/* Only where the browser can open a camera (HTTPS or loopback); it needs a tap. */}
        {'mediaDevices' in navigator && camera === 'off' && (
          <button class="button" type="button" onClick={() => void scan()}>
            {t('add.scan')}
          </button>
        )}
        <div class="volume-scan-camera" hidden={camera === 'off'}>
          <video class="volume-scan-video" ref={video} muted playsInline />
          <p class="hint" aria-live="polite">
            {camera === 'starting' ? t('add.camera-starting') : t('scan.looking')}
          </p>
          <button class="button button-quiet" type="button" onClick={stopCamera}>
            {t('add.type-isbn')}
          </button>
        </div>
        <form class="correction-form" onSubmit={submit} noValidate>
          <label class="correction-field">
            <span class="label">{t('add.isbn')}</span>
            <input
              ref={field}
              class="field"
              inputMode="numeric"
              autoComplete="off"
              maxLength={20}
              value={typed}
              aria-invalid={problem ? 'true' : undefined}
              onInput={(event) => setTyped(event.currentTarget.value)}
            />
          </label>
          <p class="hint" data-error={problem ? '' : undefined} aria-live="polite">
            {problem}
          </p>
          <div class="correction-actions">
            <button class="button button-primary" type="submit" disabled={busy} aria-busy={busy}>
              {t('scan-volume.save', volume)}
            </button>
          </div>
        </form>
      </div>
    </dialog>
  );
}
