// The Series page, a Preact island (ADR 0014): where the reader stands in one
// Series, and follow, switch Edition Line, stop following (glossary: Followed
// Series, Dropped Series, Edition Line). Each spine opens a Volume sheet: I
// bought it, Mark read, Open. The rules are in src/lib/library/series.ts;
// this file only renders and saves.
import { useEffect, useRef, useState } from 'preact/hooks';
import { openOwnSpace } from '../lib/auth/server-client';
import type { Edition } from '../lib/catalog/catalog';
import { coverUrl, lookupEditions, lookupVolumes } from '../lib/catalog/client';
import { reportNetwork, reportWaiting } from '../lib/connection';
import { pageLanguage, t } from '../lib/i18n/i18n';
import { saveCopy } from '../lib/library/copy';
import { saveFollow, type Follow } from '../lib/library/follow';
import { isSeries, readIsbn } from '../lib/library/ids';
import { loadLibrary, savedText, sendWhenOnline, waitingCount, worstState } from '../lib/library/library';
import { bookHref, editionLabel, statusChange, type Library } from '../lib/library/model';
import { followOnRead } from '../lib/library/onboarding';
import { saveReadingStatus } from '../lib/library/reading-status';
import {
  askCollected,
  collectedVolumes,
  dropSeries,
  followSeries,
  seriesCover,
  seriesStanding,
  switchLine,
  type CatalogAsk,
  type Spine,
} from '../lib/library/series';
import { bought, deleteToBuy } from '../lib/library/to-buy';
import { isNetworkFailure } from '../lib/network';
import { freshListing } from '../lib/space/fresh-listing';
import { spaceErrorMessage, type Space, type WriteState } from '../lib/space/space';
import { toast } from '../lib/toast';
import { Cover } from './Cover';

export interface Sources extends CatalogAsk {
  // Undefined when signed out.
  open(): Promise<Space | undefined>;
}

const live: Sources = {
  open: async () => (await openOwnSpace())?.space,
  volumes: async (isbn) => (await lookupVolumes(isbn))?.volumes,
  editions: lookupEditions,
};

// `isbn`: an Edition of the Series, from the link (`seriesHref`).
export default function SeriesIsland({ isbn }: { isbn: string }) {
  return <Series isbn={isbn} sources={live} />;
}

export function Series({ isbn, sources }: { isbn: string; sources: Sources }) {
  const [library, setLibrary] = useState<Library>();
  // In place of the page when there is nothing to show.
  const [message, setMessage] = useState<string>();
  const [saving, setSaving] = useState(false);
  const [switching, setSwitching] = useState(false);
  const [typed, setTyped] = useState('');
  const [problem, setProblem] = useState<string>();
  // The Volume whose sheet is open, and the one whose cover shows above its spine (mouse hover).
  const [chosen, setChosen] = useState<number>();
  const [peek, setPeek] = useState<number>();
  const sheet = useRef<HTMLDialogElement>(null);

  const space = useRef<Space | undefined>(undefined);
  const listing = useRef<{ refresh: () => Promise<void> } | undefined>(undefined);
  // Catalog answers kept for this visit: Edition Lines by anchor ISBN, Editions by ISBN.
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
      if (!loaded.current) setMessage(spaceErrorMessage(error));
      else if (!network) toast(spaceErrorMessage(error), { error: true });
    }

    async function start() {
      if (!('isbn' in readIsbn(isbn))) return setMessage(t('series.bad-link'));
      const own = await sources.open();
      // No session: the gate (AppShell) is sending the visitor to the sign-in screen.
      if (!own) return;
      space.current = own;
      listing.current = freshListing(
        async () => {
          const read = await loadLibrary(own);
          await askCatalog(read.library);
          return { ...read, waiting: await waitingCount(own) };
        },
        (read) => {
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

    // The Edition Line of the linked Edition, then the lines the reader collects.
    async function askCatalog(read: Library) {
      if (!lines.current.has(isbn)) {
        const volumes = await sources.volumes(isbn).catch(() => undefined);
        if (volumes) lines.current.set(isbn, volumes);
      }
      const follow = followOf(read, linked(lines.current, isbn));
      if (follow) await askCollected([follow], read, lines.current, editions.current, sources);
    }

    start().catch(fail);
  }, [isbn, sources]);

  // One change at a time; the page shows what is saved once it is done.
  async function save(change: (own: Space) => Promise<WriteState>) {
    const own = space.current;
    if (!own || saving) return;
    setSaving(true);
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
      // Busy until the page shows the save: a second tap cannot save twice.
      await listing.current?.refresh();
      setSaving(false);
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

  function saveChange(follow: Follow) {
    void save((own) => saveFollow(own, follow));
  }

  // The same save as "I bought it" on To Buy: the Copy, and the hand-added record goes.
  function buy({ edition }: Spine) {
    const byHand = library?.toBuy.some(({ value }) => value.isbn === edition.isbn) ?? false;
    void save(async (own) => {
      const { copy, remove } = bought({ isbn: edition.isbn, work: edition.work.id, byHand }, new Date());
      const states = [(await saveCopy(own, copy)).state];
      if (remove) states.push(await deleteToBuy(own, remove));
      return worstState(states);
    });
  }

  // As on the Book page: marking a Volume read follows its Series.
  function markRead({ edition }: Spine) {
    if (!library) return;
    const now = new Date();
    const change = statusChange(edition.work.id, edition.isbn, 'read', library, now);
    if (!change) return;
    const follow = followOnRead(edition, 'read', library, now);
    void save(async (own) => {
      const state = await saveReadingStatus(own, change);
      return follow ? worstState([state, await saveFollow(own, follow)]) : state;
    });
  }

  function open(volume: number) {
    setPeek(undefined);
    setChosen(volume);
    sheet.current?.showModal();
  }

  async function switchTo(event: Event, follow: Follow) {
    event.preventDefault();
    const read = readIsbn(typed);
    if ('problem' in read) return setProblem(t(`isbn.${read.problem}`));
    const edition = (await sources.editions([read.isbn]).catch(() => new Map<string, Edition>())).get(read.isbn);
    const result = switchLine(follow, edition, lines.current.get(follow.anchorIsbn) ?? [], new Date());
    if ('problem' in result) return setProblem(t(`series.switch-${result.problem}`));
    setProblem(undefined);
    setTyped('');
    setSwitching(false);
    saveChange(result.follow);
  }

  if (message) {
    return (
      <div class="series">
        <p class="series-message" role="status">
          {message}
        </p>
      </div>
    );
  }
  if (!library) return <SeriesSkeleton />;

  const edition = linked(lines.current, isbn);
  if (!edition) return <Message text={t('series.unavailable')} />;
  if (!edition.series) return <Message text={t('series.no-series')} />;

  const follow = followOf(library, edition);
  const volumes = (follow && collectedVolumes(follow, library, lines.current, editions.current)) ?? lines.current.get(isbn) ?? [];
  const anchor = follow ? (lines.current.get(follow.anchorIsbn)?.find((each) => each.isbn === follow.anchorIsbn) ?? edition) : edition;
  const standing = seriesStanding(volumes, library);
  const following = follow?.status === 'following';
  const from = Number(follow?.fromVolume);
  const cover = seriesCover(volumes) ?? anchor;
  const spine = standing.spines.find(({ volume }) => volume === chosen);
  const seriesTitle = edition.series.title;
  document.title = `${edition.series.title} · Atomes`;

  return (
    <div class="series">
      <div class="series-head">
        <EditionCover class="series-cover" edition={cover} series={seriesTitle} />
        <div class="series-text">
          <p class="series-tags">
            <span class="series-tag" data-following={following ? '' : undefined}>
              {following ? t('series.following') : follow ? t('series.dropped') : t('series.not-followed')}
            </span>
            <span class="series-tag">{editionLabel(anchor, pageLanguage())}</span>
            {following && Number.isInteger(from) && from > 1 && <span class="series-tag">{t('series.from-volume', from)}</span>}
          </p>
          <h1 class="series-title">{edition.series.title}</h1>
          <p class="series-authors">{anchor.authors.join(', ')}</p>

          <dl class="series-counts" aria-label={t('series.standing')}>
            <Count value={standing.owned} label={t('series.owned')} />
            <Count value={standing.read} label={t('series.read')} />
            <Count value={standing.missing.length} label={t('series.missing')} />
            <Count value={standing.next ?? '—'} label={t('series.next')} />
          </dl>

          <div class="series-actions">
            {following && follow ? (
              <>
                <button class="button" type="button" disabled={saving} aria-expanded={switching} onClick={() => setSwitching(!switching)}>
                  {t('series.switch')}
                </button>
                <button class="button button-quiet" type="button" disabled={saving} onClick={() => saveChange(dropSeries(follow, new Date()))}>
                  {t('series.stop-following')}
                </button>
              </>
            ) : (
              <button
                class="button button-primary"
                type="button"
                disabled={saving}
                onClick={() => {
                  const change = followSeries(anchor, follow, new Date());
                  if (change) saveChange(change);
                }}
              >
                {t('series.follow')}
              </button>
            )}
          </div>
        </div>
      </div>

      {switching && follow && (
        <form class="series-switch" onSubmit={(event) => void switchTo(event, follow)} noValidate>
          <label class="series-label" for="series-isbn">
            {t('series.switch-label')}
          </label>
          <div class="series-switch-row">
            <input
              class="field"
              id="series-isbn"
              inputMode="numeric"
              autoComplete="off"
              value={typed}
              aria-invalid={problem ? 'true' : undefined}
              aria-describedby="series-isbn-hint"
              onInput={(event) => setTyped(event.currentTarget.value)}
            />
            <button class="button button-primary" type="submit" disabled={saving}>
              {t('series.switch-save')}
            </button>
            <button class="button button-quiet" type="button" onClick={() => setSwitching(false)}>
              {t('series.cancel')}
            </button>
          </div>
          <p class="series-hint" id="series-isbn-hint" data-error={problem ? '' : undefined}>
            {problem ?? t('series.switch-hint')}
          </p>
        </form>
      )}

      {standing.missing.length > 0 && (
        <section class="series-missing" aria-labelledby="series-missing-title">
          <h2 class="series-missing-title" id="series-missing-title">
            {t('series.missing-title', standing.missing.map(({ volume }) => volume).join(', '))}
          </h2>
          <p class="series-hint">
            {following ? (
              <>
                {t('series.missing-on-to-buy')} <a href="/to-buy">{t('nav.to-buy')}</a>
              </>
            ) : (
              t('series.missing-follow')
            )}
          </p>
        </section>
      )}

      <section aria-labelledby="series-volumes">
        <h2 class="series-group-title" id="series-volumes">
          {t('series.volumes')}
        </h2>
        <ol class="series-spines">
          {standing.spines.map(({ volume, state, edition: printing }) => (
            <li key={volume} class="series-spine" data-state={state}>
              {/* Desktop: the cover above the spine while the mouse is on it. A tap only opens the sheet. */}
              {peek === volume && <EditionCover class="series-peek" edition={printing} series={seriesTitle} />}
              <button
                class="series-spine-button"
                type="button"
                aria-haspopup="dialog"
                onClick={() => open(volume)}
                onPointerEnter={(event) => event.pointerType === 'mouse' && setPeek(volume)}
                onPointerLeave={() => setPeek(undefined)}
              >
                <span class="series-spine-bar" aria-hidden="true" />
                <span aria-hidden="true">{volume}</span>
                <span class="visually-hidden">{t('series.spine', volume, state)}</span>
              </button>
            </li>
          ))}
        </ol>
      </section>

      {/* Escape closes it, as a tap on the backdrop does. */}
      <dialog
        ref={sheet}
        class="series-sheet"
        aria-labelledby="series-sheet-title"
        onClose={() => setChosen(undefined)}
        onClick={(event) => event.target === event.currentTarget && event.currentTarget.close()}
      >
        {spine && (
          // The body fills the sheet: a tap inside never reaches the dialog itself.
          <div class="series-sheet-body">
            {/* First, so the sheet opens with focus on Close, not on a save. */}
            <button class="button button-quiet series-sheet-close" type="button" onClick={() => sheet.current?.close()}>
              {t('common.close')}
            </button>
            <EditionCover class="series-sheet-cover" edition={spine.edition} series={seriesTitle} />
            <div class="series-sheet-text">
              <h2 class="series-sheet-title" id="series-sheet-title">
                {spine.edition.volumeTitle ?? spine.edition.title}
              </h2>
              <p>{t('book.volume', spine.volume)}</p>
              <p class="series-hint">{t('series.state', spine.state)}</p>
              <div class="series-actions">
                {spine.state === 'not-owned' && (
                  <button class="button button-primary" type="button" disabled={saving} aria-busy={saving ? 'true' : undefined} onClick={() => buy(spine)}>
                    {t('tobuy.bought')}
                  </button>
                )}
                {spine.state !== 'read' && (
                  <button class="button" type="button" disabled={saving} onClick={() => markRead(spine)}>
                    {t('series.mark-read')}
                  </button>
                )}
                <a class="button button-quiet" href={bookHref(spine.edition.work.id)}>
                  {t('series.open-book')}
                </a>
              </div>
            </div>
          </div>
        )}
      </dialog>
    </div>
  );
}

// The cover of one Edition (header, spine hover, Volume sheet); the default cover when it has none.
function EditionCover({ class: name, edition, series }: { class: string; edition: Edition; series: string }) {
  return (
    <Cover
      class={name}
      src={coverUrl(edition)}
      title={edition.title}
      series={series}
      volumeTitle={edition.volumeTitle}
      volume={edition.volumes.length > 0 ? t('book.volumes', edition.volumes) : ''}
    />
  );
}

// The linked Edition, as its Edition Line lists it; undefined until the Catalog answers.
function linked(lines: Map<string, Edition[]>, isbn: string): Edition | undefined {
  return lines.get(isbn)?.find((each) => each.isbn === isbn);
}

function followOf(library: Library, edition: Edition | undefined): Follow | undefined {
  const series = edition?.series;
  return library.follows.find(({ rkey }) => isSeries(series, rkey))?.value;
}

function Count({ value, label }: { value: number | string; label: string }) {
  return (
    // The number shows above its label (CSS); a `dl` group keeps the term first.
    <div class="series-count">
      <dt>{label}</dt>
      <dd>{value}</dd>
    </div>
  );
}

function Message({ text }: { text: string }) {
  return (
    <div class="series">
      <p class="series-message" role="status">
        {text}
      </p>
    </div>
  );
}

// While the Library loads; also the page's fallback before the island starts.
export function SeriesSkeleton() {
  return (
    <div class="series" aria-busy="true">
      <div class="series-head" aria-hidden="true">
        <div class="book-cover series-cover skeleton" />
        <div class="series-text">
          <div class="skeleton series-skeleton-title" />
          <div class="skeleton series-skeleton-line" />
        </div>
      </div>
    </div>
  );
}
