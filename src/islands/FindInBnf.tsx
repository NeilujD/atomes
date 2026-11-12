// Quick Add, for an ISBN no book source knows (CORE-40): find its Series or
// Work in BnF by the title the reader typed, and the publisher. The reader
// picks an Edition Line and the Volume, or a book; the Catalog keeps that pick
// for every reader. Mounted by src/pages/add.astro under the typed details.
import { useState } from 'preact/hooks';
import type { Edition, LineFound, SearchFound, WorkFound } from '../lib/catalog/catalog';
import { chooseEdition, searchCatalog, type ChooseAnswer, type SearchAnswer } from '../lib/catalog/client';
import { t } from '../lib/i18n/i18n';
import type { BookDetails } from '../lib/library/copy';
import { isNetworkFailure } from '../lib/network';

export interface Sources {
  search(title: string, publisher: string): Promise<SearchAnswer>;
  choose: typeof chooseEdition;
}

const live: Sources = { search: searchCatalog, choose: chooseEdition };

export interface FindProps {
  isbn: string;
  // What the reader typed in the details form, or what to fix there.
  typed: () => { details: BookDetails } | { problem: string };
  // The Catalog now has an Edition for `isbn`.
  onChosen: (edition: Edition) => void;
  // A book with no shared Work: its details go into the form to check and add.
  onTyped: (details: BookDetails) => void;
  sources?: Sources;
}

export function FindInBnf({ isbn, typed, onChosen, onTyped, sources = live }: FindProps) {
  const [publisher, setPublisher] = useState('');
  const [found, setFound] = useState<SearchFound>();
  const [volumes, setVolumes] = useState<Record<string, string>>({});
  const [problem, setProblem] = useState<string>();
  const [busy, setBusy] = useState(false);

  async function run<T>(ask: () => Promise<T>): Promise<T | undefined> {
    setBusy(true);
    setProblem(undefined);
    try {
      return await ask();
    } catch (error) {
      setProblem(t(isNetworkFailure(error) ? 'add.lookup-unreachable' : 'find.failed'));
      return undefined;
    } finally {
      setBusy(false);
    }
  }

  async function search() {
    const read = typed();
    if ('problem' in read) return setProblem(read.problem);
    const answer = await run(() => sources.search(read.details.title, publisher.trim()));
    if (!answer) return;
    if ('signedOut' in answer) return setProblem(t('auth.session-ended'));
    if ('unavailable' in answer) return setProblem(t('add.sources-down'));
    setFound(answer.found);
    setVolumes(Object.fromEntries(answer.found.lines.map((line) => [line.anchor, String(Math.max(...line.volumes) + 1)])));
  }

  async function choose(anchor: string, volume: number | null, fallback?: WorkFound) {
    const read = typed();
    if ('problem' in read) return setProblem(read.problem);
    const { title, authors = [] } = read.details;
    const answer: ChooseAnswer | undefined = await run(() => sources.choose(isbn, { anchor, volume, title, authors }));
    if (!answer) return;
    if ('found' in answer) return onChosen(answer.found);
    if ('signedOut' in answer) return setProblem(t('auth.session-ended'));
    if ('noSharedWork' in answer && fallback) {
      const names = authors.length ? authors : fallback.authors;
      onTyped({ title, ...(names.length > 0 && { authors: names }) });
      return setProblem(t('find.typed'));
    }
    setProblem(t('find.failed'));
  }

  function chooseLine(line: LineFound) {
    const volume = Number((volumes[line.anchor] ?? '').trim().replace(',', '.'));
    if (!(volume > 0 && volume < 10_000)) return setProblem(t('find.bad-volume'));
    void choose(line.anchor, volume);
  }

  const nothing = found && found.lines.length === 0 && found.works.length === 0;
  return (
    <section class="find" aria-labelledby="find-title">
      <h3 class="label" id="find-title">
        {t('find.title')}
      </h3>
      <p class="hint">{t('find.hint')}</p>
      <div class="find-row">
        <label class="details-field">
          <span class="label">{t('find.publisher')}</span>
          <input
            class="field"
            type="text"
            maxLength={300}
            autoComplete="off"
            value={publisher}
            onInput={(event) => setPublisher(event.currentTarget.value)}
            // Enter searches; it must not add the book (this is inside the add form).
            onKeyDown={(event) => {
              if (event.key !== 'Enter') return;
              event.preventDefault();
              void search();
            }}
          />
        </label>
        <button class="button" type="button" disabled={busy} aria-busy={busy} onClick={() => void search()}>
          {t('find.search')}
        </button>
      </div>
      <p class="hint" data-error={problem ? '' : undefined} aria-live="polite">
        {problem}
      </p>
      {nothing && <p class="hint">{t('find.nothing')}</p>}
      {found && found.lines.length > 0 && (
        <ul class="find-list" aria-label={t('find.lines')}>
          {found.lines.map((line) => (
            <li class="find-item" key={line.anchor}>
              <div class="find-text">
                <span class="find-name">{line.series}</span>
                <span class="hint">{[line.publisher, t('find.volumes', volumeRanges(line.volumes))].filter(Boolean).join(' · ')}</span>
              </div>
              <label class="find-volume">
                <span class="label">{t('add.field-volume')}</span>
                <input
                  class="field"
                  type="text"
                  inputMode="decimal"
                  maxLength={8}
                  autoComplete="off"
                  value={volumes[line.anchor] ?? ''}
                  onInput={(event) => setVolumes({ ...volumes, [line.anchor]: event.currentTarget.value })}
                />
              </label>
              <button class="button" type="button" disabled={busy} onClick={() => chooseLine(line)}>
                {t('find.use-line', line.series)}
              </button>
            </li>
          ))}
        </ul>
      )}
      {found && found.works.length > 0 && (
        <ul class="find-list" aria-label={t('find.works')}>
          {found.works.map((work) => (
            <li class="find-item" key={work.anchor}>
              <div class="find-text">
                <span class="find-name">{work.title}</span>
                <span class="hint">{[work.authors.join(', '), work.publisher, work.year].filter(Boolean).join(' · ')}</span>
              </div>
              <button class="button" type="button" disabled={busy} onClick={() => void choose(work.anchor, null, work)}>
                {t('find.use-work', work.title)}
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

// "1–9, 11": Volume numbers as short ranges.
export function volumeRanges(volumes: number[]): string {
  const ranges: [number, number][] = [];
  for (const volume of volumes) {
    const last = ranges.at(-1);
    if (last && volume === last[1] + 1) last[1] = volume;
    else ranges.push([volume, volume]);
  }
  return ranges.map(([from, to]) => (from === to ? String(from) : `${from}–${to}`)).join(', ');
}
