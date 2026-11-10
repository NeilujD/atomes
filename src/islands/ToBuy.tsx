// The To Buy screen (glossary: To Buy), a Preact island (ADR 0014): the
// Missing Volumes of the Followed Series and the Editions added by hand. The
// rules are in src/lib/library/to-buy.ts; this file only renders and saves.
import { useEffect, useRef, useState } from 'preact/hooks';
import { openOwnSpace } from '../lib/auth/server-client';
import type { Edition } from '../lib/catalog/catalog';
import { lookupEditions, lookupVolumes } from '../lib/catalog/client';
import { reportNetwork, reportWaiting } from '../lib/connection';
import { pageLanguage, t } from '../lib/i18n/i18n';
import { saveCopy } from '../lib/library/copy';
import { loadLibrary, savedText, sendWhenOnline, waitingCount, worstState } from '../lib/library/library';
import type { Library } from '../lib/library/model';
import { bought, deleteToBuy, handAdd, saveToBuy, toBuyList, type ToBuyItem } from '../lib/library/to-buy';
import { isNetworkFailure } from '../lib/network';
import { freshListing } from '../lib/space/fresh-listing';
import { spaceErrorMessage, type Space, type WriteState } from '../lib/space/space';
import { toast } from '../lib/toast';

// Where the screen reads from: the reader's Library store and the Catalog.
export interface Sources {
  // Undefined when signed out.
  open(): Promise<Space | undefined>;
  // The Volumes of the Edition Line of `isbn`; undefined when the Catalog cannot say.
  volumes(isbn: string): Promise<Edition[] | undefined>;
  editions(isbns: string[]): Promise<Map<string, Edition>>;
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

    // The Edition Line of each Followed Series and the Editions added by hand,
    // when not asked yet. A Series the Catalog cannot answer for now shows no
    // Missing Volume, and is asked again on the next read.
    async function askCatalog(read: Library) {
      const followed = read.follows.filter(({ rkey, value }) => value.status === 'following' && !lines.current.has(rkey));
      await Promise.all(
        followed.map(async ({ rkey, value }) => {
          const volumes = await sources.volumes(value.anchorIsbn).catch(() => undefined);
          if (volumes) lines.current.set(rkey, volumes);
        }),
      );
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

      <section class="to-buy-group" aria-labelledby="to-buy-missing">
        <h2 class="to-buy-group-title" id="to-buy-missing">
          {t('tobuy.missing')}
        </h2>
        {list.missing.length === 0 ? <p class="to-buy-empty">{t('tobuy.missing-empty')}</p> : <ul class="to-buy-list">{list.missing.map(row)}</ul>}
      </section>

      <section class="to-buy-group" aria-labelledby="to-buy-by-hand">
        <h2 class="to-buy-group-title" id="to-buy-by-hand">
          {t('tobuy.by-hand')}
        </h2>
        {list.byHand.length === 0 ? <p class="to-buy-empty">{t('tobuy.by-hand-empty')}</p> : <ul class="to-buy-list">{list.byHand.map(row)}</ul>}
      </section>
    </div>
  );
}

function Row({ item, saving, onBuy, onRemove }: { item: ToBuyItem; saving: string | undefined; onBuy: () => void; onRemove: () => void }) {
  const id = `to-buy-${item.isbn}`;
  const series = [item.series && item.series !== item.title ? item.series : '', item.volume !== null ? t('book.volume', item.volume) : '']
    .filter(Boolean)
    .join(' · ');
  const busy = saving === item.isbn ? 'true' : undefined;
  return (
    <li class="to-buy-item">
      <div class="to-buy-cover">{item.cover && <img src={item.cover} alt="" />}</div>
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
