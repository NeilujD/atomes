// The Labels of a Series on the Series page (glossary: Label): the Labels on
// the Series, each with Remove, and a "+ Label" chip that opens the reader's
// other Labels and a field for a new one. A Label on a Series applies to every
// Work of the Series; the Book page shows it with a Series mark and removes it
// here only. The rules are in src/lib/library/label.ts.
import { useEffect, useRef, useState } from 'preact/hooks';
import { reportNetwork, reportWaiting } from '../lib/connection';
import { pageLanguage, t } from '../lib/i18n/i18n';
import { attachSeries, detachSeries, listLabels, saveLabel, seriesLabelFor, seriesLabels, type Label, type SeriesIds } from '../lib/library/label';
import { savedText, sendWhenOnline, waitingCount } from '../lib/library/library';
import type { Saved } from '../lib/library/records';
import { isNetworkFailure } from '../lib/network';
import { freshListing } from '../lib/space/fresh-listing';
import { spaceErrorMessage, type Space } from '../lib/space/queued-store';
import { toast } from '../lib/toast';

export interface Sources {
  // Undefined when signed out.
  open(): Promise<Space | undefined>;
}

// As the lexicon: 64 UTF-16 units are never more than its 64 graphemes.
const nameLength = 64;

export function SeriesLabels({ series, sources }: { series: SeriesIds; sources: Sources }) {
  const [labels, setLabels] = useState<Saved<Label>[]>();
  const [adding, setAdding] = useState(false);
  const [saving, setSaving] = useState(false);
  const [typed, setTyped] = useState('');
  const [problem, setProblem] = useState<string>();

  const space = useRef<Space | undefined>(undefined);
  const listing = useRef<{ refresh: () => Promise<void> } | undefined>(undefined);
  const sending = useRef(false);
  // The toast of a change still waiting for the network; replaced when it is sent.
  const closeWaiting = useRef<() => void>(() => undefined);

  useEffect(() => {
    // No network: the connection status says it, and the listing tries again.
    function fail(error: unknown) {
      if (isNetworkFailure(error)) reportNetwork(false);
      else toast(spaceErrorMessage(error), { error: true });
    }

    async function start() {
      const own = await sources.open();
      if (!own) return;
      space.current = own;
      listing.current = freshListing(
        async () => ({ ...(await listLabels(own)), waiting: await waitingCount(own) }),
        (read) => {
          reportNetwork(!read.stale);
          reportWaiting(read.waiting);
          setLabels(read.records);
        },
        fail,
      );
      await listing.current.refresh();
    }

    start().catch(fail);
  }, [sources]);

  // One change at a time; the chips show what is saved once it is done.
  async function save(label: Label, rkey?: string) {
    const own = space.current;
    if (!own || saving) return;
    setSaving(true);
    try {
      const { state } = await saveLabel(own, label, rkey);
      closeWaiting.current();
      const close = toast(await savedText(own, state), { error: state === 'refused' });
      if (state === 'waiting') {
        closeWaiting.current = close;
        sendLater(own);
      }
    } catch (error) {
      toast(spaceErrorMessage(error), { error: true });
    } finally {
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

  if (!labels) return null;

  function add(event: Event) {
    event.preventDefault();
    const change = seriesLabelFor(typed, series, labels ?? [], new Date(), pageLanguage());
    if ('problem' in change) return setProblem(t(`labels.name-${change.problem}`));
    setProblem(undefined);
    setTyped('');
    void save(change.label, change.rkey);
  }

  const { carried, others } = seriesLabels(series, labels, pageLanguage());

  return (
    <div class="series-labels" role="group" aria-label={t('labels.series-title')}>
      <ul class="series-labels-chips">
        {carried.map(({ rkey, value }) => (
          <li key={rkey} class="chip series-label-chip">
            <span class="series-label-name">{value.name}</span>
            <button class="series-label-remove" type="button" disabled={saving} onClick={() => void save(detachSeries(value, series), rkey)}>
              <span aria-hidden="true">×</span>
              <span class="visually-hidden">{t('labels.series-remove', value.name)}</span>
            </button>
          </li>
        ))}
        <li>
          <button class="chip series-label-chip series-label-add" type="button" aria-expanded={adding} onClick={() => setAdding(!adding)}>
            <span aria-hidden="true">+ </span>
            {t('labels.add-series')}
          </button>
        </li>
      </ul>

      {adding && (
        <div class="series-labels-add">
          {others.length > 0 && (
            <div class="series-labels-chips" role="group" aria-label={t('labels.yours')}>
              {others.map(({ rkey, value }) => (
                <button
                  key={rkey}
                  class="chip series-label-chip series-label-add"
                  type="button"
                  disabled={saving}
                  onClick={() => void save(attachSeries(value, series), rkey)}
                >
                  <span aria-hidden="true">+ </span>
                  <span class="series-label-name">{value.name}</span>
                </button>
              ))}
            </div>
          )}
          <form class="series-switch-row" onSubmit={add} noValidate>
            <input
              class="field"
              maxLength={nameLength}
              autoComplete="off"
              value={typed}
              aria-label={t('labels.series-new')}
              aria-invalid={problem ? 'true' : undefined}
              aria-describedby="series-labels-hint"
              onInput={(event) => setTyped(event.currentTarget.value)}
            />
            <button class="button" type="submit" disabled={saving}>
              {t('labels.add')}
            </button>
          </form>
          <p class="series-hint" id="series-labels-hint" data-error={problem ? '' : undefined}>
            {problem ?? t('labels.series-applies')}
          </p>
        </div>
      )}
    </div>
  );
}
