// The Labels section of the Book page, a Preact island (ADR 0014): the Labels
// this Work carries, the reader's others to add in one tap, a field for a new
// one, and where every Label is renamed or deleted. Labels are Private: they are saved in the reader's Library store, never
// in a Shared record. The rules are in src/lib/library/label.ts; this file
// only renders and saves.
import { useEffect, useRef, useState } from 'preact/hooks';
import { openOwnSpace } from '../lib/auth/server-client';
import { reportNetwork, reportWaiting } from '../lib/connection';
import { pageLanguage, t } from '../lib/i18n/i18n';
import { isWorkId } from '../lib/library/ids';
import { attach, deleteLabel, detach, labelFor, listLabels, renamed, saveLabel, workLabels, type Label } from '../lib/library/label';
import { savedText, sendWhenOnline, waitingCount } from '../lib/library/library';
import type { Saved } from '../lib/library/records';
import { isNetworkFailure } from '../lib/network';
import { freshListing } from '../lib/space/fresh-listing';
import { spaceErrorMessage, type Space, type WriteState } from '../lib/space/space';
import { toast } from '../lib/toast';

export interface Sources {
  // Undefined when signed out.
  open(): Promise<Space | undefined>;
}

const live: Sources = {
  open: async () => (await openOwnSpace())?.space,
};

// `?work=<Catalog identifier>`, as the Book page reads it.
export default function BookLabelsIsland() {
  return <BookLabels work={new URLSearchParams(location.search).get('work') ?? ''} sources={live} />;
}

// As the lexicon: 64 UTF-16 units are never more than its 64 graphemes.
const nameLength = 64;

type Change = (own: Space) => Promise<WriteState>;
type Save = (change: Change) => void;

export function BookLabels({ work, sources }: { work: string; sources: Sources }) {
  const [labels, setLabels] = useState<Saved<Label>[]>();
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
      // A link to no book: the Book page says so.
      if (!isWorkId(work)) return;
      const own = await sources.open();
      // No session: the gate (AppShell) is sending the visitor to the sign-in screen.
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
  }, [work, sources]);

  // One change at a time; the section shows what is saved once it is done.
  const save: Save = (change) => void saveNow(change);

  async function saveNow(change: Change) {
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
      // Busy until the section shows the save: a second tap cannot save twice.
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

  // Nothing until the Labels are read: the Book page shows its own skeleton.
  if (!labels) return null;

  function add(event: Event) {
    event.preventDefault();
    const change = labelFor(typed, work, labels ?? [], new Date(), pageLanguage());
    if ('problem' in change) return setProblem(t(`labels.name-${change.problem}`));
    setProblem(undefined);
    setTyped('');
    save(async (own) => (await saveLabel(own, change.label, change.rkey)).state);
  }

  const { carried, others, all } = workLabels(work, labels, pageLanguage());

  return (
    <div class="labels">
      {carried.length > 0 ? (
        <ul class="labels-chips">
          {carried.map(({ rkey, value }) => (
            <li key={rkey} class="labels-chip">
              <span class="labels-chip-name">{value.name}</span>
              <button
                class="labels-chip-remove"
                type="button"
                disabled={saving}
                onClick={() => save(async (own) => (await saveLabel(own, detach(value, work), rkey)).state)}
              >
                <span aria-hidden="true">×</span>
                <span class="visually-hidden">{t('labels.remove', value.name)}</span>
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <p class="labels-hint">{t('labels.none')}</p>
      )}

      {others.length > 0 && (
        <div class="labels-chips" role="group" aria-label={t('labels.yours')}>
          {others.map(({ rkey, value }) => (
            <button
              key={rkey}
              class="labels-chip labels-chip-add"
              type="button"
              disabled={saving}
              onClick={() => save(async (own) => (await saveLabel(own, attach(value, work), rkey)).state)}
            >
              <span class="labels-chip-plus" aria-hidden="true">
                +
              </span>
              <span class="labels-chip-name">{value.name}</span>
            </button>
          ))}
        </div>
      )}

      <form class="labels-new" onSubmit={add} noValidate>
        <label class="labels-label" for="labels-new">
          {t('labels.new')}
        </label>
        <div class="labels-row">
          <input
            class="field"
            id="labels-new"
            maxLength={nameLength}
            autoComplete="off"
            value={typed}
            aria-invalid={problem ? 'true' : undefined}
            aria-describedby="labels-new-hint"
            onInput={(event) => setTyped(event.currentTarget.value)}
          />
          <button class="button" type="submit" disabled={saving}>
            {t('labels.add')}
          </button>
        </div>
        <p class="labels-hint" id="labels-new-hint" data-error={problem ? '' : undefined}>
          {problem ?? t('labels.private')}
        </p>
      </form>

      {all.length > 0 && (
        <details class="labels-edit">
          <summary class="labels-hint">{t('labels.edit')}</summary>
          <ul class="labels-edit-list">
            {all.map((label) => (
              <EditRow key={label.rkey} label={label} labels={labels} saving={saving} save={saveNow} />
            ))}
          </ul>
        </details>
      )}
    </div>
  );
}

// One of the reader's Labels: a new name, or Delete, which asks first as it
// takes the Label off every book.
function EditRow({ label, labels, saving, save }: { label: Saved<Label>; labels: Saved<Label>[]; saving: boolean; save: (change: Change) => Promise<void> }) {
  const saved = label.value.name;
  // What the reader typed over the saved name. It lasts while that name is
  // the saved one: a rename, here or on another device, shows the new name.
  const [typed, setTyped] = useState<{ name: string; over: string }>();
  const name = typed?.over === saved ? typed.name : saved;
  const [problem, setProblem] = useState<string>();
  const [asking, setAsking] = useState(false);
  const hint = `labels-problem-${label.rkey}`;

  function rename(event: Event) {
    event.preventDefault();
    const change = renamed(label, name, labels, pageLanguage());
    if ('problem' in change) return setProblem(t(`labels.name-${change.problem}`));
    setProblem(undefined);
    // The name as it is saved, with no spaces around it; once the save ends, the saved name, even if the save failed.
    setTyped({ name: change.label.name, over: saved });
    if (change.label.name !== saved) void save(async (own) => (await saveLabel(own, change.label, label.rkey)).state).then(() => setTyped(undefined));
  }

  if (asking) {
    return (
      <li class="labels-edit-row">
        <p class="labels-ask">{t('labels.delete-ask', label.value.name)}</p>
        <div class="labels-row">
          <button class="button" type="button" disabled={saving} onClick={() => void save((own) => deleteLabel(own, label.rkey))}>
            {t('labels.delete')}
          </button>
          <button class="button button-quiet" type="button" onClick={() => setAsking(false)}>
            {t('labels.cancel')}
          </button>
        </div>
      </li>
    );
  }

  return (
    <li class="labels-edit-row">
      <form class="labels-row" onSubmit={rename} noValidate>
        <input
          class="field"
          maxLength={nameLength}
          autoComplete="off"
          value={name}
          aria-label={t('labels.name', label.value.name)}
          aria-invalid={problem ? 'true' : undefined}
          aria-describedby={problem ? hint : undefined}
          onInput={(event) => setTyped({ name: event.currentTarget.value, over: saved })}
        />
        <button class="button" type="submit" disabled={saving}>
          {t('labels.rename')}
        </button>
        <button class="button button-quiet" type="button" disabled={saving} aria-label={t('labels.delete-label', label.value.name)} onClick={() => setAsking(true)}>
          {t('labels.delete')}
        </button>
      </form>
      {problem && (
        <p class="labels-hint" id={hint} data-error="">
          {problem}
        </p>
      )}
    </li>
  );
}
