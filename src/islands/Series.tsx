// The Series page, a Preact island (ADR 0014): where the reader stands in one
// Series, and follow, switch Edition Line, stop following (glossary: Followed
// Series, Dropped Series, Edition Line). Each spine opens a Volume sheet: I
// bought it, Mark read, Open. "Select" starts bulk select
// (src/islands/Selection.tsx): a tap on a spine picks its Volume. A tap on a
// Volume the Catalog lacks opens the sheet that scans its ISBN (VolumeScan.tsx).
// The rules are in src/lib/library/series.ts; this file only renders and saves.
import { useEffect, useRef, useState } from 'preact/hooks';
import { openOwnSpace } from '../lib/auth/server-client';
import type { Edition, LineSummary } from '../lib/catalog/catalog';
import { coverUrl, lookupEditions, lookupVolumes } from '../lib/catalog/client';
import { reportNetwork, reportWaiting } from '../lib/connection';
import { pageLanguage, t } from '../lib/i18n/i18n';
import { takeAddedCopies } from '../lib/library/added-copies';
import { deleteCopy, saveCopy } from '../lib/library/copy';
import { saveFollow, type Follow } from '../lib/library/follow';
import { isSeries, readIsbn } from '../lib/library/ids';
import { loadLibrary, savedText, sendWhenOnline, waitingCount, worstState } from '../lib/library/library';
import { lineName } from '../lib/catalog/lines';
import { bookHref, lineLabel, statusChange, type Library } from '../lib/library/model';
import { followOnRead } from '../lib/library/onboarding';
import { saveReadingStatus } from '../lib/library/reading-status';
import {
  askCollected,
  collectedVolumes,
  dropSeries,
  followSeries,
  latestOwned,
  missingRanges,
  seriesCover,
  seriesStanding,
  switchLine,
  type CatalogAsk,
  type Spine,
} from '../lib/library/series';
import { bought, deleteToBuy, handAdd, saveToBuy } from '../lib/library/to-buy';
import { isNetworkFailure } from '../lib/network';
import { freshListing } from '../lib/space/fresh-listing';
import { spaceErrorMessage, type Space, type WriteState } from '../lib/space/queued-store';
import { toast } from '../lib/toast';
import { Cover } from './Cover';
import { liveSelection, SelectionBar, type SelectionSources } from './Selection';
import { SeriesLabels } from './SeriesLabels';
import { liveVolumeScan, VolumeScan, type VolumeScanSources } from './VolumeScan';

export interface Sources extends CatalogAsk {
  // Undefined when signed out.
  open(): Promise<Space | undefined>;
  // Every Edition Line of the Series of `isbn`, named; undefined when the Catalog cannot say.
  lines(isbn: string): Promise<LineSummary[] | undefined>;
  selection?: SelectionSources;
  scan?: VolumeScanSources;
}

const live: Sources = {
  open: async () => (await openOwnSpace())?.space,
  volumes: async (isbn) => (await lookupVolumes(isbn))?.volumes,
  editions: lookupEditions,
  lines: async (isbn) => (await lookupVolumes(isbn))?.lines,
  selection: liveSelection,
  scan: liveVolumeScan,
};

// `isbn`: an Edition of the Series, from the link (`seriesHref`). `markVolume`:
// the link came from the Book page of that Edition, so its Volume is marked.
export default function SeriesIsland({ isbn, markVolume }: { isbn: string; markVolume: boolean }) {
  return <Series isbn={isbn} markVolume={markVolume} sources={live} />;
}

export function Series({ isbn, markVolume = false, sources }: { isbn: string; markVolume?: boolean; sources: Sources }) {
  const [library, setLibrary] = useState<Library>();
  // In place of the page when there is nothing to show.
  const [message, setMessage] = useState<string>();
  const [saving, setSaving] = useState(false);
  const [switching, setSwitching] = useState(false);
  // The Edition Lines of the Series, to switch to by name.
  const [seriesLines, setSeriesLines] = useState<LineSummary[]>([]);
  const [typed, setTyped] = useState('');
  const [problem, setProblem] = useState<string>();
  // The Volume whose sheet is open, and the one whose cover shows above its spine (mouse hover).
  const [chosen, setChosen] = useState<number>();
  const [peek, setPeek] = useState<{ volume: number; align: PeekAlign }>();
  const sheet = useRef<HTMLDialogElement>(null);
  // Bulk select: on or off, and the Volumes picked, in the order of the taps.
  const [selecting, setSelecting] = useState(false);
  const [selected, setSelected] = useState<number[]>([]);
  // The Volume the Catalog lacks whose sheet is open.
  const [scanning, setScanning] = useState<number>();

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
      offerUndo();
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

    // Series Onboarding opened this page: say what it added, with Undo for the
    // Copies it added (only those: their record keys came with them).
    function offerUndo() {
      const added = takeAddedCopies(sessionStorage);
      if (!added) return;
      const undo = () =>
        void save(async (own) => {
          const states: WriteState[] = [];
          for (const rkey of added.rkeys) states.push(await deleteCopy(own, rkey));
          return worstState(states);
        });
      toast(added.text, added.rkeys.length > 0 ? { action: { label: t('common.undo'), run: undo } } : {});
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

  // A Volume read and not owned is not on To Buy (glossary): the reader puts it there by hand.
  function addToBuy({ edition }: Spine) {
    if (!library) return;
    const added = handAdd(edition.isbn, library, editions.current, new Date());
    if ('toBuy' in added) void save((own) => saveToBuy(own, added.toBuy));
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

  function openSwitch(follow: Follow) {
    setSwitching(!switching);
    if (switching) return;
    sources
      .lines(follow.anchorIsbn)
      .then((found) => setSeriesLines(found ?? []))
      .catch(() => setSeriesLines([]));
  }

  async function switchTo(event: Event, follow: Follow) {
    event.preventDefault();
    const read = readIsbn(typed);
    if ('problem' in read) return setProblem(t(`isbn.${read.problem}`));
    await switchFrom(read.isbn, follow);
  }

  // A named line switches from its first Volume, a typed ISBN from its Volume.
  async function switchFrom(isbn: string, follow: Follow) {
    const edition = (await sources.editions([isbn]).catch(() => new Map<string, Edition>())).get(isbn);
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
  const anchorLine = lines.current.get(anchor.isbn) ?? volumes;
  const otherLines = seriesLines.filter((line) => !anchorLine.some(({ isbn: one }) => one === line.anchor));
  // The Edition Line a printing is in, by name (the Volume sheet): after a switch, Volumes come from two lines.
  const lineOf = (printing: Edition) => lineLabel(lineName([...lines.current.values()].find((line) => line.some(({ isbn: one }) => one === printing.isbn)) ?? [printing]));
  const standing = seriesStanding(volumes, library);
  const following = follow?.status === 'following';
  const from = Number(follow?.fromVolume);
  // The latest Volume the reader owns; none owned, the Series cover (as in Library Series mode).
  const cover = latestOwned(volumes, library) ?? seriesCover(volumes) ?? anchor;
  // The tone of the glow (Q9): orange when the reader owns every Volume the
  // Catalog lists (owned or read and owned) and none is Missing; green otherwise.
  const ownsAll = standing.spines.length > 0 && standing.unknown.length === 0 && standing.spines.every(({ state }) => state === 'owned' || state === 'read');
  const tone = ownsAll ? 'owned' : 'not-owned';
  const missing = new Set(standing.missing.map(({ volume }) => volume));
  // One spine width for the whole Series: room for the widest number (series.css).
  const digits = String(standing.spines.at(-1)?.volume ?? 0).length;
  const spine = standing.spines.find(({ volume }) => volume === chosen);
  // The Volume of the Book the reader came from: in colour, with a glow (Q10).
  const isMarked = (volume: number) => markVolume && edition.volumes.includes(volume);
  const onToBuy = spine !== undefined && library.toBuy.some(({ value }) => value.isbn === spine.edition.isbn);
  const seriesTitle = edition.series.title;
  const pick = (volume: number) => setSelected(selected.includes(volume) ? selected.filter((each) => each !== volume) : [...selected, volume]);
  const picked = standing.spines
    .filter(({ volume }) => selected.includes(volume))
    .map(({ edition: printing }) => ({ work: printing.work.id, isbn: printing.isbn, edition: printing }));
  // After a Series Correction the Edition Lines changed: the page asks the Catalog again.
  const afterCorrection = async () => {
    lines.current.clear();
    editions.current.clear();
    await listing.current?.refresh();
  };
  const afterSave = async (moved: Edition[] = []) => {
    if (moved.length === 0) return listing.current?.refresh();
    setSelected([]);
    await afterCorrection();
  };
  // The Series title is the page heading: the view title of the frame, as on the Book page (one h1).
  document.title = `${edition.series.title} · Atomes`;
  const viewTitle = document.querySelector('[data-view-title]');
  if (viewTitle) viewTitle.textContent = seriesTitle;

  return (
    <div class="series" data-tone={tone}>
      <div class="glow series-glow" aria-hidden="true">
        <span class="glow-blob glow-b1 series-b1" />
        <span class="glow-blob glow-b2 series-b2" />
        <span class="glow-blob glow-b3 series-b3" />
      </div>
      <div class="series-head">
        <div class="series-stage">
          <span class="glow-halo" aria-hidden="true" />
          <span class="glow-ring glow-r1" aria-hidden="true" />
          <span class="glow-ring glow-r2" aria-hidden="true" />
          <span class="glow-ring glow-r3" aria-hidden="true" />
          <EditionCover class="series-cover" edition={cover} series={seriesTitle} />
        </div>
        <div class="series-text">
          <p class="series-tags">
            <span class="chip series-tag">{following ? t('series.following') : follow ? t('series.dropped') : t('series.not-followed')}</span>
            <span class="chip series-tag">{lineLabel(lineName(anchorLine), pageLanguage())}</span>
            {following && Number.isInteger(from) && from > 1 && <span class="chip series-tag">{t('series.from-volume', from)}</span>}
          </p>
          <p class="series-title" aria-hidden="true">
            {seriesTitle}
          </p>
          <p class="series-authors">{anchor.authors.join(', ')}</p>

          <section class="card series-standing" aria-labelledby="series-standing-title">
            <h2 class="small-heading" id="series-standing-title">
              {t('series.standing')}
            </h2>
            <dl class="series-counts">
              <Count value={standing.owned} label={t('series.owned')} tone="owned" />
              <Count value={standing.read} label={t('series.read')} />
              <Count value={standing.missing.length} label={t('series.missing')} tone="not-owned" />
              {standing.unknown.length > 0 && <Count value={standing.unknown.length} label={t('series.unknown')} />}
            </dl>
          </section>

          <div class="series-actions">
            {following && follow ? (
              <>
                <button class="button" type="button" disabled={saving} aria-expanded={switching} onClick={() => openSwitch(follow)}>
                  {t('series.switch')}
                </button>
                <button class="button button-quiet" type="button" disabled={saving} onClick={() => saveChange(dropSeries(follow, new Date()))}>
                  {t('series.stop-following')}
                </button>
              </>
            ) : (
              <button
                class="button button-main"
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
          <SeriesLabels series={edition.series} sources={sources} />
        </div>
      </div>

      {switching && follow && (
        <form class="card series-switch" onSubmit={(event) => void switchTo(event, follow)} noValidate>
          {otherLines.length > 0 && (
            <fieldset class="series-lines">
              <legend class="series-label">{t('series.switch-lines')}</legend>
              <div class="series-switch-row">
                {otherLines.map((line) => (
                  <button key={line.anchor} class="button" type="button" disabled={saving} onClick={() => void switchFrom(line.anchor, follow)}>
                    {lineLabel(line)}
                  </button>
                ))}
              </div>
            </fieldset>
          )}
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
            <button class="button button-main" type="submit" disabled={saving}>
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

      {(standing.missing.length > 0 || standing.unknown.length > 0) && (
        <section class="card series-missing" aria-labelledby="series-missing-title">
          <h2 class="small-heading" id="series-missing-title">
            {t('series.missing-title')}
          </h2>
          <ul class="series-missing-list">
            {missingRanges(standing).map(({ first, last, unknown }) => (
              <li key={first}>
                {unknown ? (
                  <button
                    class="series-missing-unknown"
                    type="button"
                    data-volume={first}
                    aria-haspopup="dialog"
                    aria-label={t('series.unknown-volume', first)}
                    onClick={() => setScanning(first)}
                  >
                    {first}
                  </button>
                ) : first === last ? (
                  first
                ) : (
                  `${first}–${last}`
                )}
              </li>
            ))}
          </ul>
          {standing.missing.length > 0 && (
            <p class="series-hint">
              {following ? (
                <>
                  {t('series.missing-on-to-buy')} <a href="/to-buy">{t('nav.to-buy')}</a>
                </>
              ) : (
                t('series.missing-follow')
              )}
            </p>
          )}
        </section>
      )}

      <section class="series-volumes" aria-labelledby="series-volumes">
        <div class="series-group-head">
          <h2 class="small-heading" id="series-volumes">
            {t('series.volumes')}
          </h2>
          {!selecting && (
            <button class="button button-quiet" type="button" onClick={() => setSelecting(true)}>
              {t('select.start')}
            </button>
          )}
        </div>
        <ol class="series-spines" style={`--spine-digits: ${digits}`}>
          {standing.spines.map(({ volume, state, edition: printing }) => (
            <li
              key={volume}
              class="series-spine"
              data-state={state}
              data-missing={missing.has(volume) ? '' : undefined}
              data-current={isMarked(volume) ? '' : undefined}
            >
              {/* Desktop: the cover above the spine while the mouse is on it. A tap only opens the sheet. */}
              {peek?.volume === volume && (
                <div class="series-peek" data-align={peek.align}>
                  <EditionCover class="series-peek-cover" edition={printing} series={seriesTitle} />
                </div>
              )}
              <button
                class="series-spine-button"
                type="button"
                aria-haspopup={selecting ? undefined : 'dialog'}
                aria-pressed={selecting ? selected.includes(volume) : undefined}
                aria-current={isMarked(volume) ? 'true' : undefined}
                onClick={() => (selecting ? pick(volume) : open(volume))}
                onPointerEnter={(event) => event.pointerType === 'mouse' && setPeek({ volume, align: peekAlign(event.currentTarget) })}
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

      {selecting && space.current && (
        <SelectionBar
          picked={picked}
          onAll={() => setSelected(standing.spines.map(({ volume }) => volume))}
          onDone={() => {
            setSelecting(false);
            setSelected([]);
          }}
          space={space.current}
          library={library}
          onSaved={afterSave}
          sources={sources.selection ?? liveSelection}
        />
      )}

      {scanning !== undefined && (
        <VolumeScan
          volume={scanning}
          anchor={anchor.isbn}
          onChanged={afterCorrection}
          onClose={() => setScanning(undefined)}
          sources={sources.scan ?? liveVolumeScan}
        />
      )}

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
              <p class="series-hint">{lineOf(spine.edition)}</p>
              <p class="series-hint">{t('series.state', spine.state)}</p>
              {spine.state === 'read-not-owned' && onToBuy && <p class="series-hint">{t('series.on-to-buy')}</p>}
              <div class="series-actions">
                {spine.state === 'read-not-owned' && !onToBuy && (
                  <button class="button button-main" type="button" disabled={saving} aria-busy={saving ? 'true' : undefined} onClick={() => addToBuy(spine)}>
                    {t('series.add-to-buy')}
                  </button>
                )}
                {spine.state === 'not-owned' && (
                  <button class="button button-main" type="button" disabled={saving} aria-busy={saving ? 'true' : undefined} onClick={() => buy(spine)}>
                    {t('tobuy.bought')}
                  </button>
                )}
                {spine.state !== 'read' && spine.state !== 'read-not-owned' && (
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

type PeekAlign = 'start' | 'center' | 'end';

// The cover shows centred above its spine, unless that puts it past an end of
// the spine row: then it lines up with that end, so the panel never cuts it.
function peekAlign(spine: HTMLElement): PeekAlign {
  const row = spine.closest('ol')!.getBoundingClientRect();
  const { left, right } = spine.getBoundingClientRect();
  const middle = (left + right) / 2;
  const half = peekWidth / 2;
  return middle - half < row.left ? 'start' : middle + half > row.right ? 'end' : 'center';
}

// The width of `.series-peek` (--series-thumb, theme.css).
const peekWidth = 96;

// The linked Edition, as its Edition Line lists it; undefined until the Catalog answers.
function linked(lines: Map<string, Edition[]>, isbn: string): Edition | undefined {
  return lines.get(isbn)?.find((each) => each.isbn === isbn);
}

function followOf(library: Library, edition: Edition | undefined): Follow | undefined {
  const series = edition?.series;
  return library.follows.find(({ rkey }) => isSeries(series, rkey))?.value;
}

// `tone`: the colour of ownership the number takes (Q8).
function Count({ value, label, tone }: { value: number; label: string; tone?: 'owned' | 'not-owned' }) {
  return (
    // The number shows above its label (CSS); a `dl` group keeps the term first.
    <div class="series-count" data-tone={tone}>
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
        <div class="series-stage">
          <div class="book-cover series-cover skeleton" />
        </div>
        <div class="series-text">
          <div class="skeleton series-skeleton-title" />
          <div class="skeleton series-skeleton-line" />
        </div>
      </div>
    </div>
  );
}
