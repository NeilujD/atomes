// A Series Correction from the Book page (ADR 0017): "Series: X · Change"
// opens a sheet. The reader searches a Series of the Catalog or makes a New
// Series, then picks the Edition Line and the Volume number. The Catalog
// keeps it for every reader of the instance; "Back to the sources" deletes
// it. Mounted by the script of src/pages/book.astro, which shows the Edition
// the Catalog answers next.
import { useRef, useState } from 'preact/hooks';
import type { Correction, Edition, SeriesFound } from '../lib/catalog/catalog';
import { correctEdition, findSeries, uncorrectEdition, type CorrectionAnswer } from '../lib/catalog/client';
import { bookHeight } from '../lib/catalog/lines';
import { pageLanguage, t } from '../lib/i18n/i18n';
import { lineLabel } from '../lib/library/model';
import { isNetworkFailure } from '../lib/network';

export interface Sources {
  find: typeof findSeries;
  correct: typeof correctEdition;
  uncorrect: typeof uncorrectEdition;
}

const live: Sources = { find: findSeries, correct: correctEdition, uncorrect: uncorrectEdition };

export interface SeriesCorrectionProps {
  edition: Edition;
  // The Catalog now gives this Edition, with `text` to tell the reader.
  onCorrected: (edition: Edition, text: string) => void;
  sources?: Sources;
}

// The languages a New Series offers, as the sources name them (ISO 639-2),
// with the code the browser names them by.
const languages: Record<string, string> = { fre: 'fr', eng: 'en', jpn: 'ja', kor: 'ko', chi: 'zh', spa: 'es', ita: 'it', ger: 'de', dut: 'nl', por: 'pt' };

type Step = { search: true } | { series: SeriesFound } | { newSeries: true };

export function SeriesCorrection({ edition, onCorrected, sources = live }: SeriesCorrectionProps) {
  const sheet = useRef<HTMLDialogElement>(null);
  const [step, setStep] = useState<Step>({ search: true });
  const [typed, setTyped] = useState(edition.series?.title ?? edition.title);
  const [found, setFound] = useState<SeriesFound[]>();
  const [anchor, setAnchor] = useState('');
  const [volume, setVolume] = useState(edition.volume === null ? '' : String(edition.volume));
  const [title, setTitle] = useState(edition.title);
  const [publisher, setPublisher] = useState(edition.publisher ?? '');
  const [language, setLanguage] = useState(edition.language && edition.language in languages ? edition.language : 'fre');
  const [height, setHeight] = useState(String(bookHeight(edition.format) ?? ''));
  const [problem, setProblem] = useState<string>();
  const [busy, setBusy] = useState(false);

  function open() {
    setStep({ search: true });
    setFound(undefined);
    setProblem(undefined);
    sheet.current?.showModal();
  }

  async function run<T>(ask: () => Promise<T>): Promise<T | undefined> {
    setBusy(true);
    setProblem(undefined);
    try {
      return await ask();
    } catch (error) {
      setProblem(t(isNetworkFailure(error) ? 'add.lookup-unreachable' : 'correction.failed'));
      return undefined;
    } finally {
      setBusy(false);
    }
  }

  async function search(event: Event) {
    event.preventDefault();
    if (!typed.trim()) return;
    const answer = await run(() => sources.find(typed.trim()));
    if (!answer) return;
    if ('signedOut' in answer) return setProblem(t('auth.session-ended'));
    if ('failed' in answer) return setProblem(t('correction.failed'));
    setFound(answer.found);
  }

  function pick(series: SeriesFound) {
    setAnchor(series.lines[0].anchor);
    setProblem(undefined);
    setStep({ series });
  }

  async function send(ask: () => Promise<CorrectionAnswer>, text: string) {
    const answer = await run(ask);
    if (!answer) return;
    if ('found' in answer) {
      sheet.current?.close();
      return onCorrected(answer.found, text);
    }
    setProblem(t('signedOut' in answer ? 'auth.session-ended' : 'tooMany' in answer ? 'correction.too-many' : 'correction.failed'));
  }

  function save(event: Event) {
    event.preventDefault();
    const number = volume.trim() ? Number(volume.trim().replace(',', '.')) : null;
    if (number !== null && !(number > 0 && number < 10_000)) return setProblem(t('find.bad-volume'));
    let correction: Correction;
    if ('newSeries' in step) {
      const size = height.trim() ? Number(height.trim().replace(',', '.')) : null;
      if (!title.trim() || !publisher.trim()) return setProblem(t('correction.bad-new'));
      if (size !== null && !(size >= 5 && size <= 100)) return setProblem(t('correction.bad-height'));
      correction = { newSeries: { title: title.trim(), publisher: publisher.trim(), language, height: size }, volume: number };
    } else {
      correction = { anchor, volume: number };
    }
    void send(() => sources.correct(edition.isbn, correction), t('correction.saved'));
  }

  const names = new Intl.DisplayNames([pageLanguage()], { type: 'language' });
  const volumeField = (
    <div class="correction-field">
      <label class="correction-field">
        <span class="label">{t('correction.volume')}</span>
        <input
          class="field"
          type="text"
          inputMode="decimal"
          maxLength={8}
          autoComplete="off"
          value={volume}
          aria-describedby="correction-volume-hint"
          onInput={(event) => setVolume(event.currentTarget.value)}
        />
      </label>
      <span class="hint" id="correction-volume-hint">
        {t('correction.volume-hint')}
      </span>
    </div>
  );
  const footer = (
    <>
      <p class="hint" data-error={problem ? '' : undefined} aria-live="polite">
        {problem}
      </p>
      <div class="correction-actions">
        <button class="button button-quiet" type="button" onClick={() => setStep({ search: true })}>
          {t('correction.back')}
        </button>
        <button class="button button-primary" type="submit" disabled={busy} aria-busy={busy}>
          {t('correction.save')}
        </button>
      </div>
    </>
  );

  return (
    <>
      <button class="series-change" type="button" aria-haspopup="dialog" aria-label={edition.series ? t('book.series-change-label') : undefined} onClick={open}>
        {t(edition.series ? 'book.series-change' : 'book.series-add')}
      </button>
      {/* A tap on the backdrop closes it, as Escape does. */}
      <dialog
        ref={sheet}
        class="correction-sheet"
        aria-labelledby="correction-title"
        onClick={(event) => event.target === event.currentTarget && event.currentTarget.close()}
      >
        <div class="correction-body">
          <div class="correction-head">
            <h2 class="correction-title" id="correction-title">
              {t('correction.title')}
            </h2>
            <button class="button button-quiet" type="button" onClick={() => sheet.current?.close()}>
              {t('correction.close')}
            </button>
          </div>
          <p class="hint">{t('correction.hint')}</p>

          {'search' in step && (
            <>
              <form class="correction-row" onSubmit={(event) => void search(event)}>
                <label class="correction-field">
                  <span class="label">{t('correction.search-label')}</span>
                  <input class="field" type="search" maxLength={300} autoComplete="off" value={typed} onInput={(event) => setTyped(event.currentTarget.value)} />
                </label>
                <button class="button" type="submit" disabled={busy} aria-busy={busy}>
                  {t('correction.search')}
                </button>
              </form>
              <p class="hint" data-error={problem ? '' : undefined} aria-live="polite">
                {problem}
              </p>
              {found?.length === 0 && <p class="hint">{t('correction.nothing')}</p>}
              {found && found.length > 0 && (
                <ul class="correction-list" aria-label={t('correction.found')}>
                  {found.map((each) => (
                    <li key={each.series.id}>
                      <button class="correction-item" type="button" onClick={() => pick(each)}>
                        {each.series.title}
                      </button>
                    </li>
                  ))}
                </ul>
              )}
              <div class="correction-actions">
                {edition.corrected && (
                  <button
                    class="button button-quiet"
                    type="button"
                    disabled={busy}
                    onClick={() => void send(() => sources.uncorrect(edition.isbn), t('correction.restored'))}
                  >
                    {t('correction.to-sources')}
                  </button>
                )}
                <button class="button" type="button" onClick={() => setStep({ newSeries: true })}>
                  {t('correction.new-series')}
                </button>
              </div>
            </>
          )}

          {'series' in step && (
            <form class="correction-form" onSubmit={save} noValidate>
              <fieldset class="correction-lines">
                <legend class="label">{t('correction.line')}</legend>
                {step.series.lines.map((line) => (
                  <label class="correction-line" key={line.anchor}>
                    <input type="radio" name="correction-line" checked={anchor === line.anchor} onChange={() => setAnchor(line.anchor)} />
                    <span>{lineLabel(line) || step.series.series.title}</span>
                  </label>
                ))}
              </fieldset>
              {volumeField}
              {footer}
            </form>
          )}

          {'newSeries' in step && (
            <form class="correction-form" onSubmit={save} noValidate>
              <label class="correction-field">
                <span class="label">{t('correction.series-title')}</span>
                <input class="field" type="text" maxLength={300} autoComplete="off" value={title} onInput={(event) => setTitle(event.currentTarget.value)} />
              </label>
              <label class="correction-field">
                <span class="label">{t('correction.publisher')}</span>
                <input class="field" type="text" maxLength={300} autoComplete="off" value={publisher} onInput={(event) => setPublisher(event.currentTarget.value)} />
              </label>
              <label class="correction-field">
                <span class="label">{t('correction.language')}</span>
                <select class="field" value={language} onChange={(event) => setLanguage(event.currentTarget.value)}>
                  {Object.entries(languages).map(([code, tag]) => (
                    <option key={code} value={code}>
                      {names.of(tag) ?? code}
                    </option>
                  ))}
                </select>
              </label>
              <label class="correction-field">
                <span class="label">{t('correction.height')}</span>
                <input
                  class="field"
                  type="text"
                  inputMode="decimal"
                  maxLength={5}
                  autoComplete="off"
                  value={height}
                  onInput={(event) => setHeight(event.currentTarget.value)}
                />
              </label>
              {volumeField}
              {footer}
            </form>
          )}
        </div>
      </dialog>
    </>
  );
}
