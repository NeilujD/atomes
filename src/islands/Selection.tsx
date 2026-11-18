// Bulk select (CORE-109), shared by the Library and the Series page: the bar
// at the bottom with the count, "Select all", "Done" and four actions (Label,
// Reading Status, Private, Move to Series). Each action ends with one toast
// with Undo. The rules are in src/lib/library/bulk.ts; Move to Series is the
// Series Correction sheet (src/islands/SeriesCorrection.tsx).
import { useRef, useState } from 'preact/hooks';
import type { Edition } from '../lib/catalog/catalog';
import { correctEdition, findSeries, refreshCorrected, uncorrectEdition } from '../lib/catalog/client';
import { reportNetwork, reportWaiting } from '../lib/connection';
import { pageLanguage, t } from '../lib/i18n/i18n';
import { addLabelBulk, moveUndo, privacyChange, removeLabelBulk, statusBulk, writeAll, type Bulk, type Picked } from '../lib/library/bulk';
import { labelsAtoZ, listLabels, type Label } from '../lib/library/label';
import { savedText, sendWhenOnline } from '../lib/library/library';
import type { Library } from '../lib/library/model';
import { statuses, type Status } from '../lib/library/reading-status';
import type { Saved } from '../lib/library/records';
import { sharingClient, type SharingAnswer, type SharingClient } from '../lib/sharing/client';
import { newRecordKey, spaceErrorMessage, type Space, type WriteState } from '../lib/space/queued-store';
import { toast } from '../lib/toast';
import { SeriesCorrection, type Sources as CorrectionSources } from './SeriesCorrection';

// What the bar asks besides the reader's records: the sharing API (Private)
// and the Catalog (Move to Series).
export interface SelectionSources {
  sharing: Pick<SharingClient, 'load' | 'setPrivateWorks'>;
  correction: CorrectionSources;
  // After a Series Correction: this device asks the Catalog again (refreshCorrected).
  refresh(isbn: string): Promise<void>;
}

export const liveSelection: SelectionSources = {
  sharing: sharingClient(),
  correction: { find: findSeries, correct: correctEdition, uncorrect: uncorrectEdition },
  refresh: refreshCorrected,
};

// A picked book, with its Catalog Edition when the Catalog knows it (Move to Series needs it).
export type PickedBook = Picked & { edition?: Edition };

export interface SelectionBarProps {
  picked: PickedBook[];
  onAll: () => void;
  onDone: () => void;
  space: Space;
  library: Library;
  // A save is done: the screen reads the Library again. `moved`: the Editions
  // the Catalog now gives after Move to Series.
  onSaved: (moved?: Edition[]) => Promise<void> | void;
  sources: SelectionSources;
}

type Sheet = 'label' | 'status' | 'private';

export function SelectionBar({ picked, onAll, onDone, space, library, onSaved, sources }: SelectionBarProps) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [sheet, setSheet] = useState<Sheet>();
  const [labels, setLabels] = useState<Saved<Label>[]>([]);
  const [typed, setTyped] = useState('');
  const [problem, setProblem] = useState<string>();
  const [busy, setBusy] = useState(false);
  const sending = useRef(false);
  const closeWaiting = useRef<() => void>(() => undefined);
  const works = picked.map(({ work }) => work);
  const count = picked.length;

  function open(chosen: Sheet) {
    setSheet(chosen);
    setProblem(undefined);
    setTyped('');
    if (chosen === 'label')
      void listLabels(space).then(
        ({ records }) => setLabels(records),
        () => setLabels([]),
      );
    dialog.current?.showModal();
  }

  function close() {
    dialog.current?.close();
  }

  // One action at a time; the screen shows what is saved once it is done.
  async function busyWith(task: () => Promise<void>) {
    if (busy) return;
    setBusy(true);
    try {
      await task();
    } catch (error) {
      toast(spaceErrorMessage(error), { error: true });
    } finally {
      await onSaved();
      setBusy(false);
    }
  }

  // The records of a bulk action, then one toast: what it did, or that it
  // waits on this device; Undo writes the records back.
  function save(bulk: Bulk, done: string) {
    close();
    if (bulk.writes.length === 0) return void toast(t('select.unchanged'));
    void busyWith(async () => {
      const state = await writeAll(space, bulk.writes);
      await tell(state, done, () => void busyWith(async () => tell(await writeAll(space, bulk.undo), t('select.undone'))));
    });
  }

  async function tell(state: WriteState, done: string, undo?: () => void) {
    closeWaiting.current();
    const text = state === 'sent' ? done : await savedText(space, state);
    const shown = toast(text, { error: state === 'refused', ...(undo && state !== 'refused' ? { action: { label: t('common.undo'), run: undo } } : {}) });
    if (state !== 'waiting') return;
    closeWaiting.current = shown;
    if (sending.current) return;
    sending.current = true;
    sendWhenOnline(
      space,
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

  // The typed name, or the name of a Label of the list; an existing Label keeps its own spelling.
  function addLabel(name: string) {
    const bulk = addLabelBulk(name, works, labels, new Date(), pageLanguage(), newRecordKey);
    if ('problem' in bulk) return setProblem(t(`labels.name-${bulk.problem}`));
    save(bulk, t('select.label-added', (bulk.writes[0].value as Label).name, count));
  }

  function setStatus(status: Status) {
    save(statusBulk(picked, status, library, new Date()), t('select.status-saved', t(`status.${status}`), count));
  }

  // On the server (sharing API): only the Works whose state changes, so Undo turns back exactly those.
  function setPrivate(kept: boolean) {
    close();
    void busyWith(async () => {
      const loaded = await sources.sharing.load();
      if (!('state' in loaded)) return sharingProblem(loaded);
      const changed = privacyChange(works, kept, loaded.state.privateWorks);
      if (changed.length === 0) return void toast(t('select.unchanged'));
      const answer = await sources.sharing.setPrivateWorks(changed, kept);
      if (!('state' in answer)) return sharingProblem(answer);
      const undo = () =>
        void busyWith(async () => {
          const back = await sources.sharing.setPrivateWorks(changed, !kept);
          if ('state' in back) toast(t('select.undone'));
          else sharingProblem(back);
        });
      toast(t(kept ? 'select.private-saved' : 'select.private-freed', changed.length), { action: { label: t('common.undo'), run: undo } });
    });
  }

  function sharingProblem(answer: Exclude<SharingAnswer, { state: unknown }>) {
    toast(t('signedOut' in answer ? 'auth.session-ended' : 'unreachable' in answer ? 'sharing.unreachable' : 'sharing.failed'), { error: true });
  }

  // The Catalog took these Corrections (all, or those before a refusal): Undo
  // sends back to the sources the ones that had none before (moveUndo).
  function moved(found: Edition[], editions: Edition[]) {
    for (const { isbn } of found) void sources.refresh(isbn);
    const back = moveUndo(editions.filter(({ isbn }) => found.some((each) => each.isbn === isbn)));
    const undo = () =>
      void busyWith(async () => {
        const restored: Edition[] = [];
        for (const isbn of back) {
          const answer = await sources.correction.uncorrect(isbn);
          if (!('found' in answer)) return void toast(t('correction.failed'), { error: true });
          restored.push(answer.found);
          void sources.refresh(isbn);
        }
        await onSaved(restored);
        toast(t('select.undone'));
      });
    toast(t('select.moved', found.length), back.length > 0 ? { action: { label: t('common.undo'), run: undo } } : {});
    void onSaved(found);
  }

  const editions = picked.flatMap(({ edition }) => edition ?? []);
  const none = count === 0 || busy;
  const { carried, others } = labelGroups(labelsAtoZ(labels, pageLanguage()), works);

  return (
    <div class="selection-bar card card-raised" role="toolbar" aria-label={t('select.bar')}>
      <div class="selection-row">
        <p class="selection-count" aria-live="polite">
          {t('select.count', count)}
        </p>
        <button class="button button-quiet" type="button" onClick={onAll}>
          {t('select.all')}
        </button>
        <button class="button button-quiet" type="button" onClick={onDone}>
          {t('select.done')}
        </button>
      </div>
      <div class="selection-row selection-actions">
        <button class="button" type="button" aria-haspopup="dialog" disabled={none} onClick={() => open('label')}>
          {t('select.label')}
        </button>
        <button class="button" type="button" aria-haspopup="dialog" disabled={none} onClick={() => open('status')}>
          {t('select.status')}
        </button>
        <button class="button" type="button" aria-haspopup="dialog" disabled={none} onClick={() => open('private')}>
          {t('select.private')}
        </button>
        {editions.length > 0 && !busy ? (
          // A new set of books starts the sheet again.
          <SeriesCorrection
            key={editions.map(({ isbn }) => isbn).join(' ')}
            editions={editions}
            button={t('select.move')}
            onCorrected={(found) => moved(found, editions)}
            sources={sources.correction}
          />
        ) : (
          <button class="button" type="button" disabled>
            {t('select.move')}
          </button>
        )}
      </div>

      {/* A tap on the backdrop closes it, as Escape does. */}
      <dialog
        ref={dialog}
        class="correction-sheet"
        aria-labelledby="selection-sheet-title"
        onClose={() => setSheet(undefined)}
        onClick={(event) => event.target === event.currentTarget && event.currentTarget.close()}
      >
        <div class="correction-body">
          <div class="correction-head">
            <h2 class="correction-title" id="selection-sheet-title">
              {sheet === 'label' ? t('select.label-title', count) : sheet === 'status' ? t('select.status-title', count) : t('select.private-title', count)}
            </h2>
            <button class="button button-quiet" type="button" onClick={close}>
              {t('common.close')}
            </button>
          </div>

          {sheet === 'label' && (
            <>
              <form
                class="correction-row"
                onSubmit={(event) => {
                  event.preventDefault();
                  addLabel(typed);
                }}
                noValidate
              >
                <label class="correction-field">
                  <span class="label">{t('labels.new')}</span>
                  <input
                    class="field"
                    maxLength={64}
                    autoComplete="off"
                    value={typed}
                    aria-invalid={problem ? 'true' : undefined}
                    onInput={(event) => setTyped(event.currentTarget.value)}
                  />
                </label>
                <button class="button" type="submit">
                  {t('labels.add')}
                </button>
              </form>
              <p class="hint" data-error={problem ? '' : undefined} aria-live="polite">
                {problem}
              </p>
              {labels.length > 0 && (
                <ul class="correction-list" aria-label={t('labels.yours')}>
                  {[...carried, ...others].map((label) => (
                    <li key={label.rkey} class="selection-label">
                      <span>{label.value.name}</span>
                      <span class="selection-label-actions">
                        <button class="button button-quiet" type="button" aria-label={t('select.label-add', label.value.name)} onClick={() => addLabel(label.value.name)}>
                          {t('labels.add')}
                        </button>
                        {carried.includes(label) && (
                          <button
                            class="button button-quiet"
                            type="button"
                            aria-label={t('select.label-remove', label.value.name)}
                            onClick={() => save(removeLabelBulk(label, works), t('select.label-removed', label.value.name, count))}
                          >
                            {t('select.remove')}
                          </button>
                        )}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </>
          )}

          {sheet === 'status' && (
            <div class="correction-actions selection-choices">
              {statuses.map((status) => (
                <button key={status} class="button" type="button" onClick={() => setStatus(status)}>
                  {t(`status.${status}`)}
                </button>
              ))}
            </div>
          )}

          {sheet === 'private' && (
            <>
              <p class="hint">{t('sharing.keep-private-hint')}</p>
              <div class="correction-actions selection-choices">
                <button class="button" type="button" onClick={() => setPrivate(false)}>
                  {t('select.private-off')}
                </button>
                <button class="button" type="button" onClick={() => setPrivate(true)}>
                  {t('select.private-on')}
                </button>
              </div>
            </>
          )}
        </div>
      </dialog>
    </div>
  );
}

// The Labels some picked Work carries (they offer Remove), then the others.
function labelGroups(labels: Saved<Label>[], works: string[]): { carried: Saved<Label>[]; others: Saved<Label>[] } {
  const carried = labels.filter(({ value }) => value.works.some((work) => works.includes(work)));
  return { carried, others: labels.filter((label) => !carried.includes(label)) };
}
