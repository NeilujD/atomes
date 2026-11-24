// Search (glossary; ADR 0021), the Search mode of Check a book
// (src/pages/check.astro, which renders it): the reader types title or author
// words, opens a Work (or an Author, then one of their Works; or a Series,
// then an Edition Line, then a Volume), and picks one of its Editions. The page then looks the ISBN
// up and shows the Shelf Check answer, as after a scan. Only the words leave
// the device, to the Atomes server; the results are not kept.
import { useEffect, useState } from 'preact/hooks';
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

export function Search({ sources, preferred, words: given = '', onWords, onPick, onScan, marks }: SearchProps) {
  const [words, setWords] = useState(given);
  const [results, setResults] = useState<Found>();
  // The open Author: the pages of their Works shown so far.
  const [author, setAuthor] = useState<{ row: AuthorResult; works: WorkResult[]; total: number; page: number }>();
  // The open Series: its Volumes, and the Edition Line picked.
  const [series, setSeries] = useState<{ row: SeriesResult; volumes: VolumeResult[]; line?: SeriesLine }>();
  const [work, setWork] = useState<WorkResult>();
  const [found, setFound] = useState<EditionsFound>();
  // Why the last search or pick did not work; the words stay in the box.
  const [problem, setProblem] = useState<{ text: string; offline: boolean }>();
  const [busy, setBusy] = useState(false);
  // The Edition whose answer is coming.
  const [picking, setPicking] = useState<string>();

  const say = (key: 'search.offline' | 'add.sources-down' | 'auth.session-ended') => setProblem({ text: t(key), offline: key === 'search.offline' });

  // A source answer, or undefined with the problem shown.
  async function ask<T>(question: () => Promise<FoundAnswer<T>>): Promise<T | undefined> {
    setProblem(undefined);
    if (!navigator.onLine) {
      say('search.offline');
      return undefined;
    }
    setBusy(true);
    try {
      const answer = await question();
      if ('found' in answer) return answer.found;
      say('signedOut' in answer ? 'auth.session-ended' : 'add.sources-down');
    } catch (error) {
      const offline = isNetworkFailure(error);
      if (offline) reportNetwork(false);
      say(offline ? 'search.offline' : 'add.sources-down');
    } finally {
      setBusy(false);
    }
    return undefined;
  }

  async function search(typed: string) {
    if (!typed) return;
    const answer = await ask(() => sources.find(typed));
    if (!answer) return;
    setResults(answer);
    setAuthor(undefined);
    setSeries(undefined);
    setWork(undefined);
    setFound(undefined);
  }

  // The words of the address, once.
  useEffect(() => {
    void search(given.trim());
  }, []);

  async function open(row: WorkResult) {
    const answer = await ask(() => sources.editions(row, preferred));
    if (!answer) return;
    setWork(row);
    setFound(answer);
  }

  async function openAuthor(row: AuthorResult) {
    const answer = await ask(() => sources.authorWorks(row, 1));
    if (!answer) return;
    setAuthor({ row, works: answer.works, total: answer.total, page: 1 });
  }

  async function openSeries(row: SeriesResult) {
    const answer = await ask(() => sources.seriesVolumes(row));
    if (!answer) return;
    setSeries({ row, volumes: answer.volumes });
  }

  // A Volume opens as the Work it is.
  const openVolume = (volume: VolumeResult) =>
    open({ id: volume.id, also: [], title: volumeLabel(volume.number, volume.title), authors: [], year: null, language: null });

  async function showMore() {
    if (!author) return;
    const answer = await ask(() => sources.authorWorks(author.row, author.page + 1));
    if (!answer) return;
    const shown = new Set(author.works.map(({ id }) => id));
    setAuthor({ ...author, works: [...author.works, ...answer.works.filter(({ id }) => !shown.has(id))], page: author.page + 1 });
  }

  async function pick(isbn: string) {
    setProblem(undefined);
    setBusy(true);
    setPicking(isbn);
    try {
      const why = await onPick(isbn);
      if (why) setProblem({ text: why, offline: false });
    } finally {
      setBusy(false);
      setPicking(undefined);
    }
  }

  return (
    <div class="search">
      <form
        class="search-form"
        role="search"
        onSubmit={(event) => {
          event.preventDefault();
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
          <button class="button button-main" type="submit" disabled={busy} aria-busy={busy && !work ? 'true' : undefined}>
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

      {work && found ? (
        <section class="search-group" aria-labelledby="search-work">
          <button class="button button-quiet search-back" type="button" onClick={() => setWork(undefined)}>
            {author ? author.row.name : series?.line ? lineLabel(series.line) : t('search.back')}
          </button>
          <h2 class="search-work-title" id="search-work">
            {work.title}
          </h2>
          <p class="search-hint">{[work.authors.join(', '), work.year].filter(Boolean).join(' · ')}</p>
          <WorkMarkLine work={work} marks={marks} />
          {found.editions.length === 0 ? (
            <p class="search-hint">{t('search.no-editions')}</p>
          ) : (
            inLine(found, series?.line).map((section) => (
              <EditionList
                key={section.language}
                section={section}
                marks={marks}
                busy={busy}
                picking={picking}
                onPick={(isbn) => void pick(isbn)}
              />
            ))
          )}
          {found.noIsbn > 0 && <p class="search-hint">{t('search.no-isbn', found.noIsbn)}</p>}
        </section>
      ) : series?.line ? (
        <section class="search-group" aria-labelledby="search-line">
          <button class="button button-quiet search-back" type="button" onClick={() => setSeries({ ...series, line: undefined })}>
            {series.row.title}
          </button>
          <h2 class="search-work-title" id="search-line">
            {lineLabel(series.line)}
          </h2>
          <ul class="card search-list" aria-label={t('search.volumes')}>
            {series.volumes.map((volume) => (
              <li class="search-item" key={volume.id}>
                <button class="search-pick" type="button" disabled={busy} onClick={() => void openVolume(volume)}>
                  <span class="search-title">{volumeLabel(volume.number, volume.title)}</span>
                </button>
              </li>
            ))}
          </ul>
        </section>
      ) : series ? (
        <section class="search-group" aria-labelledby="search-series">
          <button class="button button-quiet search-back" type="button" onClick={() => setSeries(undefined)}>
            {t('search.back')}
          </button>
          <h2 class="search-work-title" id="search-series">
            {series.row.title}
          </h2>
          <ul class="card search-list" aria-label={t('search.edition-lines')}>
            {series.row.lines.map((line) => (
              <li class="search-item" key={`${lineLabel(line)}|${line.language}`}>
                <button class="search-pick" type="button" onClick={() => setSeries({ ...series, line })}>
                  <span class="search-title">{lineLabel(line)}</span>
                  {line.language && <span class="chip search-tag">{languageName(line)}</span>}
                </button>
              </li>
            ))}
          </ul>
        </section>
      ) : author ? (
        <section class="search-group" aria-labelledby="search-author">
          <button class="button button-quiet search-back" type="button" onClick={() => setAuthor(undefined)}>
            {t('search.back')}
          </button>
          <h2 class="search-work-title" id="search-author">
            {author.row.name}
          </h2>
          <p class="search-hint">{t('search.author-works', author.total)}</p>
          <ul class="card search-list" aria-label={t('search.works')}>
            {author.works.map((row) => (
              <WorkRow key={row.id} work={row} marks={marks} busy={busy} onOpen={() => void open(row)} />
            ))}
          </ul>
          {author.works.length < author.total && (
            <button class="button search-more" type="button" disabled={busy} aria-busy={busy ? 'true' : undefined} onClick={() => void showMore()}>
              {t('search.show-more')}
            </button>
          )}
        </section>
      ) : (
        results && (
          <section class="search-group" aria-label={t('search.works')}>
            {results.works.length === 0 && results.authors.length === 0 && results.series.length === 0 ? (
              <p class="search-hint">{t('search.nothing')}</p>
            ) : (
              <>
                {results.series.length > 0 && (
                  <ul class="card search-list" aria-label={t('search.series')}>
                    {results.series.map((row) => (
                      <li class="search-item" key={row.id}>
                        <button class="search-pick" type="button" disabled={busy} onClick={() => void openSeries(row)}>
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
                        <button class="search-pick" type="button" disabled={busy} onClick={() => void openAuthor(row)}>
                          <span class="search-title">{authorLine(row, results.authors)}</span>
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
                {results.works.length > 0 && (
                  <ul class="card search-list">
                    {results.works.map((row) => (
                      <WorkRow key={row.id} work={row} marks={marks} busy={busy} onOpen={() => void open(row)} />
                    ))}
                  </ul>
                )}
              </>
            )}
          </section>
        )
      )}
    </div>
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

function WorkRow({ work, marks, busy, onOpen }: { work: WorkResult; marks?: SearchMarks; busy: boolean; onOpen: () => void }) {
  return (
    <li class="search-item">
      <button class="search-pick" type="button" disabled={busy} onClick={onOpen}>
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
