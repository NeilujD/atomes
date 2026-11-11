// The To Buy screen (glossary: To Buy), a Preact island (ADR 0014): the
// Volumes of the Followed Series the reader does not own, one row per Series,
// and the Editions added by hand. The rules are in src/lib/library/to-buy.ts;
// this file only renders and saves.
import type { JSX } from 'preact';
import { useEffect, useRef, useState } from 'preact/hooks';
import { openOwnSpace } from '../lib/auth/server-client';
import type { Edition } from '../lib/catalog/catalog';
import { lookupEditions, lookupVolumes } from '../lib/catalog/client';
import { reportNetwork, reportWaiting } from '../lib/connection';
import { pageLanguage, t } from '../lib/i18n/i18n';
import { saveCopy } from '../lib/library/copy';
import { loadLibrary, savedText, sendWhenOnline, waitingCount, worstState } from '../lib/library/library';
import type { Library } from '../lib/library/model';
import { askCollected, seriesHref, type CatalogAsk } from '../lib/library/series';
import { bought, bySeries, deleteToBuy, handAdd, saveToBuy, toBuyList, type SeriesGroup, type ToBuyItem } from '../lib/library/to-buy';
import { isNetworkFailure } from '../lib/network';
import { freshListing } from '../lib/space/fresh-listing';
import { spaceErrorMessage, type Space, type WriteState } from '../lib/space/space';
import { toast } from '../lib/toast';

// Where the screen reads from: the reader's Library store and the Catalog.
export interface Sources extends CatalogAsk {
  // Undefined when signed out.
  open(): Promise<Space | undefined>;
}

const live: Sources = {
  open: async () => (await openOwnSpace())?.space,
  volumes: async (isbn) => (await lookupVolumes(isbn))?.volumes,
  editions: lookupEditions,
};

export default function ToBuyIsland() {
  return <ToBuy sources={live} />;
}

export function ToBuy({ sources }: { sources: Sources }) {
  const [library, setLibrary] = useState<Library>();
  // In place of the list when there is none to show (signed out, or the first read failed).
  const [message, setMessage] = useState<{ text: string; signIn: boolean }>();
  // The ISBN whose change is saving, or 'add'.
  const [saving, setSaving] = useState<string>();
  const [typed, setTyped] = useState('');
  const [problem, setProblem] = useState<string>();

  const space = useRef<Space | undefined>(undefined);
  const listing = useRef<{ refresh: () => Promise<void> } | undefined>(undefined);
  // Catalog answers kept for this visit, so an offline reload keeps the titles.
  // Edition Lines by anchor ISBN.
  const lines = useRef(new Map<string, Edition[]>());
  const editions = useRef(new Map<string, Edition>());
  const loaded = useRef(false);
  const sending = useRef(false);
  // The toast of a change still waiting for the network; replaced when it is sent.
  const closeWaiting = useRef<() => void>(() => undefined);

  useEffect(() => {
    // No network: the connection status says it, and the listing tries again.
    function fail(error: unknown) {
      const network = isNetworkFailure(error);
      if (network) reportNetwork(false);
      if (!loaded.current) setMessage({ text: spaceErrorMessage(error), signIn: false });
      else if (!network) toast(spaceErrorMessage(error), { error: true });
    }

    async function start() {
      const own = await sources.open();
      if (!own) return setMessage({ text: t('tobuy.sign-in'), signIn: true });
      space.current = own;
      listing.current = freshListing(
        async () => {
          const read = await loadLibrary(own);
          await askCatalog(read.library);
          return { ...read, waiting: await waitingCount(own) };
        },
        (read) => {
          // Stale: the store did not answer, so this is the copy on this device.
          reportNetwork(!read.stale);
          reportWaiting(read.waiting);
          loaded.current = true;
          setMessage(undefined);
          setLibrary(read.library);
        },
        fail,
      );
      await listing.current.refresh();
    }

    // The Edition Lines of the Followed Series (series.ts) and the Editions
    // added by hand, when not asked yet. A Series the Catalog cannot answer
    // for now shows no Volume, and is asked again on the next read.
    async function askCatalog(read: Library) {
      const followed = read.follows.filter(({ value }) => value.status === 'following').map(({ value }) => value);
      await askCollected(followed, read, lines.current, editions.current, sources);
      const unknown = read.toBuy.map(({ value }) => value.isbn).filter((isbn) => !editions.current.has(isbn));
      for (const [isbn, edition] of await sources.editions(unknown)) editions.current.set(isbn, edition);
    }

    start().catch(fail);
  }, [sources]);

  // One change at a time; the list shows what is saved once it is done.
  async function save(key: string, change: (own: Space) => Promise<WriteState>) {
    const own = space.current;
    if (!own || saving) return;
    setSaving(key);
    try {
      const state = await change(own);
      closeWaiting.current();
      const close = toast(await savedText(own, state), { error: state === 'refused' });
      if (state === 'waiting') {
        closeWaiting.current = close;
        sendLater(own);
      }
    } catch (error) {
      toast(spaceErrorMessage(error), { error: true });
    } finally {
      setSaving(undefined);
      await listing.current?.refresh();
    }
  }

  function sendLater(own: Space) {
    if (sending.current) return;
    sending.current = true;
    sendWhenOnline(
      own,
      () => {
        sending.current = false;
        reportNetwork(true);
        reportWaiting(0);
        closeWaiting.current();
        toast(t('saved.sent'));
      },
      (error) => toast(spaceErrorMessage(error), { error: true }),
    );
  }

  // "I bought it": the Copy, and the hand-added record goes.
  function buy(item: ToBuyItem) {
    void save(item.isbn, async (own) => {
      const { copy, remove } = bought(item, new Date());
      const states = [(await saveCopy(own, copy)).state];
      if (remove) states.push(await deleteToBuy(own, remove));
      return worstState(states);
    });
  }

  function remove(item: ToBuyItem) {
    void save(item.isbn, (own) => deleteToBuy(own, item.isbn));
  }

  function add(event: Event) {
    event.preventDefault();
    if (!library) return;
    const result = handAdd(typed, library, editions.current, new Date());
    if ('problem' in result) {
      const { problem: why } = result;
      return setProblem(why === 'owned' ? t('tobuy.owned') : why === 'listed' ? t('tobuy.listed') : t(`isbn.${why}`));
    }
    setProblem(undefined);
    setTyped('');
    void save('add', (own) => saveToBuy(own, result.toBuy));
  }

  if (message) {
    return (
      <div class="to-buy">
        <p class="to-buy-message" role="status">
          {message.text} {message.signIn && <a href="/settings">{t('link.settings')}</a>}
        </p>
      </div>
    );
  }
  if (!library) return <ToBuySkeleton />;

  const list = toBuyList(library, lines.current, editions.current, pageLanguage());
  const row = (item: ToBuyItem) => (
    <Row key={item.isbn} item={item} saving={saving} onBuy={() => buy(item)} onRemove={() => remove(item)} />
  );
  return (
    <div class="to-buy">
      <p class="to-buy-hint">{t('tobuy.private')}</p>
      <form class="to-buy-add" onSubmit={add} noValidate>
        <label class="to-buy-label" for="to-buy-isbn">
          {t('tobuy.add-label')}
        </label>
        <div class="to-buy-add-row">
          <input
            class="field"
            id="to-buy-isbn"
            inputMode="numeric"
            autoComplete="off"
            value={typed}
            aria-invalid={problem ? 'true' : undefined}
            aria-describedby="to-buy-isbn-hint"
            onInput={(event) => setTyped(event.currentTarget.value)}
          />
          <button class="button" type="submit" disabled={saving !== undefined} aria-busy={saving === 'add' ? 'true' : undefined}>
            {t('tobuy.add')}
          </button>
        </div>
        <p class="to-buy-hint" id="to-buy-isbn-hint" data-error={problem ? '' : undefined}>
          {problem ?? t('tobuy.add-hint')}
        </p>
      </form>

      <section class="to-buy-group" aria-labelledby="to-buy-followed">
        <h2 class="to-buy-group-title" id="to-buy-followed">
          {t('tobuy.followed')}
        </h2>
        {list.followed.length === 0 ? (
          <p class="to-buy-empty">{t('tobuy.followed-empty')}</p>
        ) : (
          bySeries(list.followed).map((group, index) => <Series key={group.id} group={group} id={`to-buy-series-${index}`} row={row} />)
        )}
      </section>

      <section class="to-buy-group" aria-labelledby="to-buy-by-hand">
        <h2 class="to-buy-group-title" id="to-buy-by-hand">
          {t('tobuy.by-hand')}
        </h2>
        {list.byHand.length === 0 ? <p class="to-buy-empty">{t('tobuy.by-hand-empty')}</p> : <Paged items={list.byHand} row={row} />}
      </section>
    </div>
  );
}

// One row per Series, "One Piece · 63 Volumes (51–113)", that opens to its
// Volumes: a Series the reader is far behind on stays one row.
function Series({ group, id, row }: { group: SeriesGroup; id: string; row: (item: ToBuyItem) => JSX.Element }) {
  const [open, setOpen] = useState(false);
  return (
    <section class="to-buy-series" aria-labelledby={`${id}-title`}>
      <h3 class="to-buy-series-title" id={`${id}-title`}>
        <button class="to-buy-series-toggle" type="button" aria-expanded={open} aria-controls={id} onClick={() => setOpen(!open)}>
          {t('tobuy.series', group.title ?? '', group.items.length, group.volumes)}
        </button>
      </h3>
      {/* Hidden, not removed: "Show more" keeps its place when the row closes. */}
      <div class="to-buy-series-volumes" id={id} hidden={!open}>
        {/* Follow, switch Edition Line, stop following. */}
        <a class="to-buy-series-link" href={seriesHref(group.items[0].isbn)}>
          {t('series.open')}
        </a>
        <Paged items={group.items} row={row} />
      </div>
    </section>
  );
}

const pageSize = 10;

// The first books of a list, and a button for the next ones: a Series the
// reader is far behind on must not fill the screen.
function Paged({ items, row }: { items: ToBuyItem[]; row: (item: ToBuyItem) => JSX.Element }) {
  const [shown, setShown] = useState(pageSize);
  const left = items.length - shown;
  return (
    <>
      <ul class="to-buy-list">{items.slice(0, shown).map(row)}</ul>
      {left > 0 && (
        <button class="button button-quiet to-buy-more" type="button" onClick={() => setShown(shown + pageSize)}>
          {t('tobuy.show-more', Math.min(pageSize, left), left)}
        </button>
      )}
    </>
  );
}

// A cover pulses until its image is there, then fades in, so a list of covers
// does not flash in one by one. A cover that fails to load keeps the placeholder.
function Cover({ src }: { src: string | null }) {
  const [state, setState] = useState<'loading' | 'loaded' | 'failed'>('loading');
  const shown = src !== null && state !== 'failed';
  return (
    <div class="to-buy-cover" data-loading={shown && state === 'loading' ? '' : undefined}>
      {shown && (
        <img
          src={src}
          alt=""
          loading="lazy"
          decoding="async"
          data-loaded={state === 'loaded' ? '' : undefined}
          onLoad={() => setState('loaded')}
          onError={() => setState('failed')}
        />
      )}
    </div>
  );
}

function Row({ item, saving, onBuy, onRemove }: { item: ToBuyItem; saving: string | undefined; onBuy: () => void; onRemove: () => void }) {
  const id = `to-buy-${item.isbn}`;
  const series = [item.series && item.series !== item.title ? item.series : '', item.volumes.length > 0 ? t('book.volumes', item.volumes) : '']
    .filter(Boolean)
    .join(' · ');
  const busy = saving === item.isbn ? 'true' : undefined;
  return (
    <li class="to-buy-item">
      <Cover src={item.cover} />
      {/* The buttons say which book they act on through this text. */}
      <div class="to-buy-text" id={id}>
        <p class="to-buy-title">{item.title}</p>
        {series && <p class="to-buy-line">{series}</p>}
        <p class="to-buy-hint">{[item.edition, t('book.isbn', item.isbn)].filter(Boolean).join(' · ')}</p>
      </div>
      <div class="to-buy-actions">
        <button class="button" type="button" aria-describedby={id} aria-busy={busy} disabled={saving !== undefined} onClick={onBuy}>
          {t('tobuy.bought')}
        </button>
        {item.byHand && (
          <button class="button button-quiet" type="button" aria-describedby={id} disabled={saving !== undefined} onClick={onRemove}>
            {t('tobuy.remove')}
          </button>
        )}
      </div>
    </li>
  );
}

// While the Library loads; also the page's fallback before the island starts.
export function ToBuySkeleton() {
  return (
    <div class="to-buy" aria-busy="true">
      {[0, 1, 2].map((each) => (
        <div key={each} class="to-buy-item" aria-hidden="true">
          <div class="to-buy-cover skeleton" />
          <div class="to-buy-text">
            <div class="skeleton to-buy-skeleton-title" />
            <div class="skeleton to-buy-skeleton-line" />
          </div>
        </div>
      ))}
    </div>
  );
}
