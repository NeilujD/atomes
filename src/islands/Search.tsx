// Search (glossary; ADR 0021), a Preact island (ADR 0014): the reader types
// title words, opens a Work, and picks one of its Editions to add to To Buy,
// or types the ISBN when they know it (the "+" of To Buy opens this screen).
// The rules of the add are To Buy's (src/lib/library/to-buy.ts). Only the
// words leave the device, to the Atomes server; the results are not kept.
import { useState } from 'preact/hooks';
import { openOwnSpace } from '../lib/auth/server-client';
import type { Lookup } from '../lib/catalog/catalog';
import { findEditions, findWorks, lookupEdition, type FoundAnswer } from '../lib/catalog/client';
import type { EditionResult, EditionsFound, WorkResult } from '../lib/catalog/search';
import { reportNetwork } from '../lib/connection';
import { t } from '../lib/i18n/i18n';
import { loadLibrary, savedText, sendWhenOnline } from '../lib/library/library';
import { languageName } from '../lib/library/model';
import { handAdd, saveToBuy } from '../lib/library/to-buy';
import { isNetworkFailure } from '../lib/network';
import { spaceErrorMessage, type Space } from '../lib/space/queued-store';
import { toast } from '../lib/toast';

export interface Sources {
  find(words: string): Promise<FoundAnswer<WorkResult[]>>;
  editions(work: WorkResult): Promise<FoundAnswer<EditionsFound>>;
  // The normal lookup of the picked ISBN: the Catalog stores the Edition.
  lookup(isbn: string): Promise<Lookup>;
  // Undefined when signed out.
  open(): Promise<Space | undefined>;
}

const live: Sources = {
  find: findWorks,
  editions: findEditions,
  lookup: lookupEdition,
  open: async () => (await openOwnSpace())?.space,
};

export default function SearchIsland() {
  return <Search sources={live} />;
}

export function Search({ sources }: { sources: Sources }) {
  const [words, setWords] = useState('');
  const [works, setWorks] = useState<WorkResult[]>();
  const [work, setWork] = useState<WorkResult>();
  const [found, setFound] = useState<EditionsFound>();
  const [picked, setPicked] = useState<string>();
  // Why the last search or add did not work; the words stay in the box.
  const [problem, setProblem] = useState<string>();
  const [refused, setRefused] = useState<string>();
  const [busy, setBusy] = useState(false);
  const [isbn, setIsbn] = useState('');
  const [isbnProblem, setIsbnProblem] = useState<string>();

  // A source answer, or undefined with the problem shown.
  async function ask<T>(question: () => Promise<FoundAnswer<T>>): Promise<T | undefined> {
    setProblem(navigator.onLine ? undefined : t('search.offline'));
    if (!navigator.onLine) return undefined;
    setBusy(true);
    try {
      const answer = await question();
      if ('found' in answer) return answer.found;
      setProblem(t('signedOut' in answer ? 'auth.session-ended' : 'add.sources-down'));
    } catch (error) {
      const offline = isNetworkFailure(error);
      if (offline) reportNetwork(false);
      setProblem(t(offline ? 'search.offline' : 'add.sources-down'));
    } finally {
      setBusy(false);
    }
    return undefined;
  }

  async function search(event: Event) {
    event.preventDefault();
    const typed = words.trim();
    if (!typed) return;
    const answer = await ask(() => sources.find(typed));
    if (!answer) return;
    setWorks(answer);
    setWork(undefined);
    setFound(undefined);
  }

  async function open(row: WorkResult) {
    const answer = await ask(() => sources.editions(row));
    if (!answer) return;
    setWork(row);
    setFound(answer);
    setPicked(undefined);
    setRefused(undefined);
  }

  // The rule of the To Buy hand add: refused when the Edition is owned or
  // listed. Gives why it is refused, or undefined once it is saved (or waits
  // for the network). The lookup stores the Edition in the Catalog and gives
  // its Work; with no answer (offline, sources down, an ISBN no source knows)
  // the ISBN is added alone, as before Search.
  async function addToBuy(typed: string): Promise<string | undefined> {
    setBusy(true);
    try {
      const own = await sources.open();
      if (!own) return t('auth.session-ended');
      const looked = await sources.lookup(typed).catch(() => ({ unavailable: true }) as const);
      const editions = new Map('found' in looked ? [[looked.found.isbn, looked.found]] : []);
      const { library } = await loadLibrary(own);
      const result = handAdd(typed, library, editions, new Date());
      if ('problem' in result) {
        const { problem: why } = result;
        return why === 'owned' ? t('tobuy.owned') : why === 'listed' ? t('tobuy.listed') : t(`isbn.${why}`);
      }
      const state = await saveToBuy(own, result.toBuy);
      toast(await savedText(own, state), { error: state === 'refused' });
      if (state === 'waiting') sendWhenOnline(own, () => toast(t('saved.sent')), (error) => toast(spaceErrorMessage(error), { error: true }));
      return undefined;
    } catch (error) {
      toast(spaceErrorMessage(error), { error: true });
      return undefined;
    } finally {
      setBusy(false);
    }
  }

  async function addPicked(picked: string) {
    setRefused(await addToBuy(picked));
  }

  async function addTyped(event: Event) {
    event.preventDefault();
    const why = await addToBuy(isbn);
    setIsbnProblem(why);
    if (!why) setIsbn('');
  }

  return (
    <div class="search">
      <form class="search-form" role="search" onSubmit={(event) => void search(event)} noValidate>
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
          {/* The main action, until an Edition is picked: then "Add to To Buy" is. */}
          <button class={picked && work ? 'button' : 'button button-main'} type="submit" disabled={busy} aria-busy={busy && !work ? 'true' : undefined}>
            {t('search.submit')}
          </button>
        </div>
        <p class="search-hint" id="search-problem" data-error={problem ? '' : undefined} aria-live="polite">
          {problem ?? t('search.hint')}
        </p>
      </form>

      {work && found ? (
        <section class="search-group" aria-labelledby="search-work">
          <button class="button button-quiet search-back" type="button" onClick={() => setWork(undefined)}>
            {t('search.back')}
          </button>
          <h2 class="search-work-title" id="search-work">
            {work.title}
          </h2>
          <p class="search-hint">{[work.authors.join(', '), work.year].filter(Boolean).join(' · ')}</p>
          {found.editions.length === 0 ? (
            <p class="search-hint">{t('search.no-editions')}</p>
          ) : (
            <ul class="card search-list" aria-label={t('search.editions')}>
              {found.editions.map((each) => (
                <EditionRow
                  key={each.isbn}
                  edition={each}
                  picked={picked === each.isbn}
                  busy={busy}
                  refused={picked === each.isbn ? refused : undefined}
                  onPick={() => {
                    setPicked(picked === each.isbn ? undefined : each.isbn);
                    setRefused(undefined);
                  }}
                  onAdd={() => void addPicked(each.isbn)}
                />
              ))}
            </ul>
          )}
          {found.noIsbn > 0 && <p class="search-hint">{t('search.no-isbn', found.noIsbn)}</p>}
        </section>
      ) : (
        works && (
          <section class="search-group" aria-label={t('search.works')}>
            {works.length === 0 ? (
              <p class="search-hint">{t('search.nothing')}</p>
            ) : (
              <ul class="card search-list">
                {works.map((row) => (
                  <li class="search-item" key={row.id}>
                    <button class="search-pick" type="button" disabled={busy} onClick={() => void open(row)}>
                      <span class="search-title">{row.title}</span>
                      <span class="search-line">{[row.authors.join(', '), row.year].filter(Boolean).join(' · ')}</span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </section>
        )
      )}

      {/* A book whose ISBN the reader knows: To Buy's add by ISBN. A problem stays next to the field. */}
      <form class="card search-form" onSubmit={(event) => void addTyped(event)} noValidate>
        <label class="search-label" for="search-isbn">
          {t('tobuy.add-label')}
        </label>
        <div class="search-row">
          <input
            class="field"
            id="search-isbn"
            inputMode="numeric"
            autoComplete="off"
            value={isbn}
            aria-invalid={isbnProblem ? 'true' : undefined}
            aria-describedby="search-isbn-hint"
            onInput={(event) => setIsbn(event.currentTarget.value)}
          />
          <button class="button" type="submit" disabled={busy}>
            {t('tobuy.add')}
          </button>
        </div>
        <p class="search-hint" id="search-isbn-hint" data-error={isbnProblem ? '' : undefined}>
          {isbnProblem ?? t('tobuy.add-hint')}
        </p>
      </form>
    </div>
  );
}

// One Edition, as printed; a tap picks it and shows what to do with it.
function EditionRow(props: {
  edition: EditionResult;
  picked: boolean;
  busy: boolean;
  refused: string | undefined;
  onPick: () => void;
  onAdd: () => void;
}) {
  const { edition, picked, busy, refused } = props;
  const id = `search-edition-${edition.isbn}`;
  const line = [edition.year, edition.publisher, edition.collection, languageName(edition)].filter(Boolean).join(' · ');
  return (
    <li class="search-item">
      <button class="search-pick" type="button" aria-expanded={picked} aria-controls={`${id}-actions`} onClick={props.onPick}>
        <span class="search-title" id={id}>
          {edition.title}
        </span>
        <span class="search-line">{line}</span>
        <span class="search-hint">{t('book.isbn', edition.isbn)}</span>
      </button>
      {picked && (
        <div class="search-actions" id={`${id}-actions`}>
          <button class="button button-main" type="button" aria-describedby={id} disabled={busy} aria-busy={busy ? 'true' : undefined} onClick={props.onAdd}>
            {t('search.add-to-buy')}
          </button>
          {refused && (
            <p class="search-hint" data-error="" role="status">
              {refused}
            </p>
          )}
        </div>
      )}
    </li>
  );
}
