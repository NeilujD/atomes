// Search (glossary; ADR 0021), the Search mode of Check a book
// (src/pages/check.astro, which renders it): the reader types title or author
// words, opens a Work (or an Author, then one of their Works; or a Series,
// then an Edition Line, then a Volume), and picks one of its Editions. The page then looks the ISBN
// up and shows the Shelf Check answer, as after a scan. Only the words leave
// the device, to the Atomes server; the results are not kept.
import { useEffect, useLayoutEffect, useRef, useState } from 'preact/hooks';
import type { Edition } from '../lib/catalog/catalog';
import type { FoundAnswer } from '../lib/catalog/client';
import { nativeLanguageName, type PreferredLanguage } from '../lib/catalog/languages';
import { sameLine } from '../lib/catalog/lines';
import type {
  AuthorResult,
  AuthorWorks,
  EditionResult,
  EditionSection,
  EditionsFound,
  Found,
  SeriesLine,
  SeriesResult,
  VolumeResult,
  WorkResult,
} from '../lib/catalog/search';
import { reportNetwork } from '../lib/connection';
import { t } from '../lib/i18n/i18n';
import { isSeries } from '../lib/library/ids';
import { languageName, lineLabel } from '../lib/library/model';
import { editionMark, workMark, type EditionMark, type SearchMarks } from '../lib/library/search-marks';
import { seriesLine } from '../lib/library/shelf-check';
import { isNetworkFailure } from '../lib/network';

export interface Sources {
  find(words: string): Promise<FoundAnswer<Found>>;
  // `language`: the Preferred Language, which picks the Editions shown.
  editions(work: WorkResult, language: PreferredLanguage): Promise<FoundAnswer<EditionsFound>>;
  // One page (from 1) of 20 Works of an Author, newest first.
  authorWorks(author: AuthorResult, page: number): Promise<FoundAnswer<AuthorWorks>>;
  // The Volumes of a Series, by number (CORE-187).
  seriesVolumes(series: SeriesResult): Promise<FoundAnswer<{ volumes: VolumeResult[] }>>;
  // The Volumes of the reader's Edition Line by its anchor ISBN, for the
  // Series line of a Followed Series; undefined when it cannot be asked.
  line(anchor: string): Promise<Edition[] | undefined>;
}

export interface SearchProps {
  sources: Sources;
  // The Preferred Language of this device (Settings), or "all".
  preferred: PreferredLanguage;
  // The words of the address (`q`): searched at once, so a reload keeps the results.
  words?: string;
  // The words of each search, for the address.
  onWords: (words: string) => void;
  // Looks the Edition up and opens its Shelf Check answer; gives why it could not.
  onPick: (isbn: string) => Promise<string | undefined>;
  // To Scan mode: Search needs a connection, a scan does not.
  onScan: () => void;
  // The marks from the Library on this device; none while it loads, or signed out.
  marks?: SearchMarks;
}

// One step of Search, as the reader goes deeper: the results, an Author, a
// Series, an Edition Line, a Work. The steps open form a stack; the last shows.
type Step =
  | { kind: 'results'; found: Found }
  | { kind: 'author'; row: AuthorResult; works: WorkResult[]; total: number; page: number }
  | { kind: 'series'; row: SeriesResult; volumes: VolumeResult[] }
  | { kind: 'line'; row: SeriesResult; volumes: VolumeResult[]; line: SeriesLine }
  | { kind: 'work'; row: WorkResult; found: EditionsFound };

// How the next step comes in (src/styles/search.css): a deeper step slides in
// from the right, Back slides it out, new results fade in.
type Motion = 'forward' | 'back' | 'fade' | 'none';

export function Search({ sources, preferred, words: given = '', onWords, onPick, onScan, marks }: SearchProps) {
  const [words, setWords] = useState(given);
  const [steps, setSteps] = useState<Step[]>([]);
  // The steps as they will be once the step coming in shows.
  const shown = useRef<Step[]>([]);
  // Why the last search or pick did not work; the words stay in the box.
  const [problem, setProblem] = useState<{ text: string; offline: boolean }>();
  // One request at a time: the row (or "search") whose answer is coming. The
  // ref takes a second tap before the next render disables the rows.
  const [pending, setPending] = useState<string>();
  const running = useRef<object>(undefined);
  // Ends the view transition once the new step is on the page.
  const drawn = useRef<() => void>(undefined);

  const say = (key: 'search.offline' | 'add.sources-down' | 'auth.session-ended') => setProblem({ text: t(key), offline: key === 'search.offline' });

  function stop() {
    running.current = undefined;
    setPending(undefined);
  }

  // A source answer, or undefined with the problem shown. On an answer the
  // request still runs (the current step stays, dimmed) until `show`.
  async function ask<T>(key: string, question: () => Promise<FoundAnswer<T>>): Promise<T | undefined> {
    if (running.current) return undefined;
    setProblem(undefined);
    if (!navigator.onLine) {
      say('search.offline');
      return undefined;
    }
    const request = {};
    running.current = request;
    setPending(key);
    try {
      const answer = await question();
      // Back came first: the answer is for a step no longer shown.
      if (running.current !== request) return undefined;
      if ('found' in answer) return answer.found;
      say('signedOut' in answer ? 'auth.session-ended' : 'add.sources-down');
    } catch (error) {
      if (running.current !== request) return undefined;
      const offline = isNetworkFailure(error);
      if (offline) reportNetwork(false);
      say(offline ? 'search.offline' : 'add.sources-down');
    }
    stop();
    return undefined;
  }

  useLayoutEffect(() => {
    drawn.current?.();
    drawn.current = undefined;
  }, [steps]);

  // The next steps, in a view transition of the step (no motion with reduced motion).
  function show(next: Step[], motion: Motion) {
    shown.current = next;
    const update = () => {
      stop();
      setSteps(next);
    };
    if (motion === 'none' || !document.startViewTransition || matchMedia('(prefers-reduced-motion: reduce)').matches) return update();
    try {
      document.startViewTransition({
        types: [`search-${motion}`],
        update: () =>
          new Promise<void>((resolve) => {
            drawn.current = resolve;
            update();
          }),
      });
    } catch {
      // A browser with no transition types.
      update();
    }
  }

  // A deeper step, with its own history entry: the browser Back and the phone
  // back gesture go up one step, not out of Check.
  function deeper(step: Step) {
    const next = [...shown.current, step];
    history.pushState({ searchStep: next.length - 1 }, '');
    show(next, 'forward');
  }

  async function search(typed: string) {
    if (!typed) return;
    const answer = await ask('search', () => sources.find(typed));
    if (!answer) return;
    const depth = shown.current.length - 1;
    show([{ kind: 'results', found: answer }], 'fade');
    // The history entries of the steps before go.
    if (depth > 0) history.go(-depth);
  }

  useEffect(() => {
    // An entry left by a step before a reload is the first step now.
    history.replaceState({ ...(history.state as object | null), searchStep: 0 }, '');
    const back = (event: PopStateEvent) => {
      const depth = (event.state as { searchStep?: number } | null)?.searchStep ?? 0;
      if (depth >= shown.current.length - 1) return;
      show(shown.current.slice(0, depth + 1), 'back');
    };
    addEventListener('popstate', back);
    // The words of the address, once.
    void search(given.trim());
    return () => removeEventListener('popstate', back);
  }, []);

  async function open(row: WorkResult, key = row.id) {
    const answer = await ask(key, () => sources.editions(row, preferred));
    if (answer) deeper({ kind: 'work', row, found: answer });
  }

  async function openAuthor(row: AuthorResult) {
    const answer = await ask(row.id, () => sources.authorWorks(row, 1));
    if (answer) deeper({ kind: 'author', row, works: answer.works, total: answer.total, page: 1 });
  }

  async function openSeries(row: SeriesResult) {
    const answer = await ask(row.id, () => sources.seriesVolumes(row));
    if (answer) deeper({ kind: 'series', row, volumes: answer.volumes });
  }

  // An Edition Line needs no request.
  function openLine(series: Step & { kind: 'series' }, line: SeriesLine) {
    if (!running.current) deeper({ kind: 'line', row: series.row, volumes: series.volumes, line });
  }

  // A Volume opens as the Work it is.
  const openVolume = (volume: VolumeResult) =>
    open({ id: volume.id, also: [], title: volumeLabel(volume.number, volume.title), authors: [], year: null, language: null });

  async function showMore(author: Step & { kind: 'author' }) {
    const answer = await ask('more', () => sources.authorWorks(author.row, author.page + 1));
    if (!answer) return;
    const known = new Set(author.works.map(({ id }) => id));
    const works = [...author.works, ...answer.works.filter(({ id }) => !known.has(id))];
    show([...shown.current.slice(0, -1), { ...author, works, page: author.page + 1 }], 'none');
  }

  async function pick(isbn: string) {
    if (running.current) return;
    const request = {};
    running.current = request;
    setPending(isbn);
    setProblem(undefined);
    try {
      const why = await onPick(isbn);
      if (why && running.current === request) setProblem({ text: why, offline: false });
    } finally {
      if (running.current === request) stop();
    }
  }

  const busy = pending !== undefined;
  const step = steps.at(-1);
  const before = steps.at(-2);
  // Back, named with the step it returns to; it goes back in the history too.
  const back = before && (
    <button class="button button-quiet search-back" type="button" disabled={busy} onClick={() => history.back()}>
      {stepName(before)}
    </button>
  );

  return (
    <div class="search">
      <form
        class="search-form"
        role="search"
        onSubmit={(event) => {
          event.preventDefault();
          if (running.current) return;
          const typed = words.trim();
          onWords(typed);
          void search(typed);
        }}
        noValidate
      >
        <label class="search-label" for="search-words">
          {t('search.label')}
        </label>
        <div class="search-row">
          <input
            class="field"
            id="search-words"
            type="search"
            enterKeyHint="search"
            maxLength={300}
            autoComplete="off"
            value={words}
            aria-describedby="search-problem"
            onInput={(event) => setWords(event.currentTarget.value)}
          />
          <button class="button button-main" type="submit" disabled={busy} aria-busy={pending === 'search' ? 'true' : undefined}>
            {t('search.submit')}
          </button>
        </div>
        <p class="search-hint" id="search-problem" data-error={problem ? '' : undefined} aria-live="polite">
          {problem?.text ?? t('search.hint')}
        </p>
        {problem?.offline && (
          <button class="button search-scan" type="button" onClick={onScan}>
            {t('add.scan')}
          </button>
        )}
      </form>

      <div class="search-step" data-busy={busy ? '' : undefined}>
        {step?.kind === 'work' ? (
          <section class="search-group" aria-labelledby="search-work">
            {back}
            <h2 class="search-work-title" id="search-work">
              {step.row.title}
            </h2>
            <p class="search-hint">{[step.row.authors.join(', '), step.row.year].filter(Boolean).join(' · ')}</p>
            <WorkMarkLine work={step.row} marks={marks} />
            {step.found.editions.length === 0 ? (
              <p class="search-hint">{t('search.no-editions')}</p>
            ) : (
              inLine(step.found, before?.kind === 'line' ? before.line : undefined).map((section) => (
                <EditionList
                  key={section.language}
                  section={section}
                  marks={marks}
                  busy={busy}
                  picking={pending}
                  onPick={(isbn) => void pick(isbn)}
                />
              ))
            )}
            {step.found.noIsbn > 0 && <p class="search-hint">{t('search.no-isbn', step.found.noIsbn)}</p>}
          </section>
        ) : step?.kind === 'line' ? (
          <section class="search-group" aria-labelledby="search-line">
            {back}
            <h2 class="search-work-title" id="search-line">
              {lineLabel(step.line)}
            </h2>
            <ul class="card search-list" aria-label={t('search.volumes')}>
              {step.volumes.map((volume) => (
                <li class="search-item" key={volume.id}>
                  <button
                    class="search-pick"
                    type="button"
                    disabled={busy}
                    aria-busy={pending === volume.id ? 'true' : undefined}
                    onClick={() => void openVolume(volume)}
                  >
                    <span class="search-title">{volumeLabel(volume.number, volume.title)}</span>
                  </button>
                </li>
              ))}
            </ul>
          </section>
        ) : step?.kind === 'series' ? (
          <section class="search-group" aria-labelledby="search-series">
            {back}
            <h2 class="search-work-title" id="search-series">
              {step.row.title}
            </h2>
            <ul class="card search-list" aria-label={t('search.edition-lines')}>
              {step.row.lines.map((line) => (
                <li class="search-item" key={`${lineLabel(line)}|${line.language}`}>
                  <button class="search-pick" type="button" disabled={busy} onClick={() => openLine(step, line)}>
                    <span class="search-title">{lineLabel(line)}</span>
                    {line.language && <span class="chip search-tag">{languageName(line)}</span>}
                  </button>
                </li>
              ))}
            </ul>
          </section>
        ) : step?.kind === 'author' ? (
          <section class="search-group" aria-labelledby="search-author">
            {back}
            <h2 class="search-work-title" id="search-author">
              {step.row.name}
            </h2>
            <p class="search-hint">{t('search.author-works', step.total)}</p>
            <ul class="card search-list" aria-label={t('search.works')}>
              {step.works.map((row) => (
                <WorkRow key={row.id} work={row} marks={marks} busy={busy} loading={pending === row.id} onOpen={() => void open(row)} />
              ))}
            </ul>
            {step.works.length < step.total && (
              <button
                class="button search-more"
                type="button"
                disabled={busy}
                aria-busy={pending === 'more' ? 'true' : undefined}
                onClick={() => void showMore(step)}
              >
                {t('search.show-more')}
              </button>
            )}
          </section>
        ) : (
          step && <Results found={step.found} marks={marks} sources={sources} pending={pending} onWork={open} onAuthor={openAuthor} onSeries={openSeries} />
        )}
      </div>
    </div>
  );
}

// The name of a step, on the Back button that returns to it.
function stepName(step: Step): string {
  if (step.kind === 'results') return t('search.back');
  if (step.kind === 'author') return step.row.name;
  if (step.kind === 'line') return lineLabel(step.line);
  return step.row.title;
}

// The results of a search: Series, then Authors, then Works.
function Results({
  found: results,
  marks,
  sources,
  pending,
  onWork,
  onAuthor,
  onSeries,
}: {
  found: Found;
  marks?: SearchMarks;
  sources: Sources;
  pending: string | undefined;
  onWork: (row: WorkResult) => Promise<void>;
  onAuthor: (row: AuthorResult) => Promise<void>;
  onSeries: (row: SeriesResult) => Promise<void>;
}) {
  const busy = pending !== undefined;
  const loading = (id: string) => (pending === id ? 'true' : undefined);
  return (
    <section class="search-group" aria-label={t('search.works')}>
      {results.works.length === 0 && results.authors.length === 0 && results.series.length === 0 ? (
        <p class="search-hint">{t('search.nothing')}</p>
      ) : (
        <>
          {results.series.length > 0 && (
            <ul class="card search-list" aria-label={t('search.series')}>
              {results.series.map((row) => (
                <li class="search-item" key={row.id}>
                  <button class="search-pick" type="button" disabled={busy} aria-busy={loading(row.id)} onClick={() => void onSeries(row)}>
                    <span class="search-title">{row.title}</span>
                    <span class="search-line">{t('search.series-lines', row.lines.length)}</span>
                    <SeriesMarkLine series={row} marks={marks} sources={sources} />
                  </button>
                </li>
              ))}
            </ul>
          )}
          {results.authors.length > 0 && (
            <ul class="card search-list" aria-label={t('search.authors')}>
              {results.authors.map((row) => (
                <li class="search-item" key={row.id}>
                  <button class="search-pick" type="button" disabled={busy} aria-busy={loading(row.id)} onClick={() => void onAuthor(row)}>
                    <span class="search-title">{authorLine(row, results.authors)}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
          {results.works.length > 0 && (
            <ul class="card search-list">
              {results.works.map((row) => (
                <WorkRow key={row.id} work={row} marks={marks} busy={busy} loading={pending === row.id} onOpen={() => void onWork(row)} />
              ))}
            </ul>
          )}
        </>
      )}
    </section>
  );
}


// The Shelf Check answer of a Work, in the words of the result screen.
function WorkMarkLine({ work, marks }: { work: WorkResult; marks?: SearchMarks }) {
  const mark = marks && workMark([work.id, ...work.also], marks);
  if (!mark) return null;
  return (
    <span class="search-mark" data-mark={mark.kind}>
      {mark.kind === 'owned' ? t('check.owned') : t('check.read', t(`status.${mark.status}`))}
    </span>
  );
}

// "7 · Le Combat des chefs"; the number only, or the title only, when the
// sources give no other.
const volumeLabel = (number: number | null | undefined, title: string | null | undefined) =>
  [number, title].filter((each) => each !== null && each !== undefined).join(' · ');

// The Editions of the Edition Line picked in a Series, in one list: the line
// has one language, whatever the Preferred Language. Otherwise the sections.
function inLine(found: EditionsFound, line: SeriesLine | undefined): EditionSection[] {
  if (!line) return found.sections;
  return [{ language: null, matches: false, editions: found.editions.filter((each) => each.line && sameLine(each.line, line)) }];
}

// The Shelf Check Series line of a Series the reader follows (or dropped),
// in their Edition Line: "You have 12 of 40 · 3 missing". None otherwise.
function SeriesMarkLine({ series, marks, sources }: { series: SeriesResult; marks?: SearchMarks; sources: Sources }) {
  const anchor = marks?.library.follows.find(({ rkey }) => isSeries(series, rkey))?.value.anchorIsbn;
  const [text, setText] = useState<string>();
  useEffect(() => {
    if (!marks || !anchor) return;
    let live = true;
    void sources
      .line(anchor)
      .catch(() => undefined)
      .then((volumes) => {
        const counts = volumes && seriesLine(series, volumes, marks.library);
        if (live) setText(counts && t('check.series-line', counts.owned, counts.total, counts.missing));
      });
    return () => {
      live = false;
    };
  }, [anchor, marks, series]);
  return text ? <span class="search-mark">{text}</span> : null;
}

// The Editions of one language, under its name in itself ("Français"); the
// language of the words searched says so, and tags each row. All languages:
// one list, no heading, each row tagged.
function EditionList({
  section,
  marks,
  busy,
  picking,
  onPick,
}: {
  section: EditionSection;
  marks?: SearchMarks;
  busy: boolean;
  picking: string | undefined;
  onPick: (isbn: string) => void;
}) {
  const name = section.language && nativeLanguageName(section.language);
  const heading = name && (section.matches ? t('search.matches', name) : name);
  const tagged = !section.language || section.matches;
  return (
    <>
      {heading && <h3 class="small-heading search-section">{heading}</h3>}
      {section.editions.length === 0 ? (
        <p class="search-hint">{t('search.none-in-language')}</p>
      ) : (
        <ul class="card search-list" aria-label={heading || t('search.editions')}>
          {section.editions.map((each) => (
            <EditionRow
              key={each.isbn}
              edition={each}
              tagged={tagged}
              mark={marks && editionMark(each.isbn, marks)}
              busy={busy}
              picking={picking === each.isbn}
              onPick={() => onPick(each.isbn)}
            />
          ))}
        </ul>
      )}
    </>
  );
}

// "Agatha Christie · 489 Works"; with the birth year when another Author of
// the results has the same name.
function authorLine(row: AuthorResult, all: AuthorResult[]): string {
  const homonym = row.birthYear !== null && all.some((other) => other !== row && other.name === row.name);
  return `${row.name}${homonym ? ` (${row.birthYear})` : ''} · ${t('search.author-works', row.works)}`;
}

function WorkRow({
  work,
  marks,
  busy,
  loading,
  onOpen,
}: {
  work: WorkResult;
  marks?: SearchMarks;
  busy: boolean;
  loading: boolean;
  onOpen: () => void;
}) {
  return (
    <li class="search-item">
      <button class="search-pick" type="button" disabled={busy} aria-busy={loading ? 'true' : undefined} onClick={onOpen}>
        <span class="search-title">{work.title}</span>
        <span class="search-line">{[work.authors.join(', '), work.year].filter(Boolean).join(' · ')}</span>
        <WorkMarkLine work={work} marks={marks} />
      </button>
    </li>
  );
}

// One Edition, as printed; a tap shows its Shelf Check answer.
function EditionRow({
  edition,
  mark,
  tagged,
  busy,
  picking,
  onPick,
}: {
  edition: EditionResult;
  mark?: EditionMark;
  tagged: boolean;
  busy: boolean;
  picking: boolean;
  onPick: () => void;
}) {
  const line = [edition.year, edition.publisher, edition.collection].filter(Boolean).join(' · ');
  // An Edition of a Volume: "Volume 7 · Le Combat des chefs · Hachette · 2001–2004".
  const volume = volumeLabel(edition.volume, edition.volumeTitle);
  const inSeries = [volume && t('search.volume', volume), edition.line && lineLabel(edition.line)].filter(Boolean).join(' · ');
  const tag = tagged && languageName(edition);
  return (
    <li class="search-item">
      <button class="search-pick" type="button" disabled={busy} aria-busy={picking ? 'true' : undefined} onClick={onPick}>
        <span class="search-title">{edition.title}</span>
        {tag && <span class="chip search-tag">{tag}</span>}
        <span class="search-line">{line}</span>
        {inSeries && <span class="search-line">{inSeries}</span>}
        <span class="search-hint">{t('book.isbn', edition.isbn)}</span>
        {mark && (
          <span class="search-mark" data-mark={mark}>
            {t(mark === 'owned' ? 'search.in-library' : 'search.on-to-buy')}
          </span>
        )}
      </button>
    </li>
  );
}
