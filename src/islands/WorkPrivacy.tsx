// The Visibility group of the Book page, a Preact island (ADR 0014): keeps one
// Work Private inside the Shared Reading Statuses and Labels (glossary:
// Shared). Shown only when one of them is Shared. The server removes the
// Work's records from the PDS (src/lib/server/sharing.ts).
import { useEffect, useState } from 'preact/hooks';
import { t } from '../lib/i18n/i18n';
import { isWorkId } from '../lib/library/ids';
import type { SharingState } from '../lib/sharing/categories';
import { sharingClient, type SharingAnswer, type SharingClient } from '../lib/sharing/client';

// `?work=<Catalog identifier>`, as the Book page reads it.
export default function WorkPrivacyIsland() {
  return <WorkPrivacy work={new URLSearchParams(location.search).get('work') ?? ''} client={sharingClient()} />;
}

export function WorkPrivacy({ work, client }: { work: string; client: SharingClient }) {
  const [state, setState] = useState<SharingState>();
  const [problem, setProblem] = useState<string>();
  const [busy, setBusy] = useState(false);

  async function run(ask: () => Promise<SharingAnswer>) {
    setBusy(true);
    setProblem(undefined);
    try {
      const answer = await ask();
      if ('state' in answer) setState(answer.state);
      else if ('signedOut' in answer) setProblem(t('auth.session-ended'));
      else if ('unreachable' in answer) setProblem(t('sharing.unreachable'));
      else setProblem(t('sharing.failed'));
    } catch {
      setProblem(t('sharing.failed'));
    } finally {
      setBusy(false);
    }
  }

  useEffect(() => {
    // The Book page says when the link names no Work. Offline, the group stays hidden.
    if (isWorkId(work)) void client.load().then((answer) => 'state' in answer && setState(answer.state), () => undefined);
  }, [client, work]);

  if (!state || !(state.shared.readingStatuses || state.shared.labels)) return null;
  const kept = state.privateWorks.includes(work);

  return (
    <section class="work-privacy" aria-labelledby="visibility-title">
      <h2 class="work-privacy-title" id="visibility-title">
        {t('sharing.visibility')}
      </h2>
      <div class="work-privacy-row">
        <div>
          <p class="work-privacy-label" id="keep-private">
            {t('sharing.keep-private')}
          </p>
          <p class="work-privacy-hint" id="keep-private-hint">
            {t('sharing.keep-private-hint')}
          </p>
        </div>
        <input
          class="switch"
          type="checkbox"
          role="switch"
          aria-labelledby="keep-private"
          aria-describedby="keep-private-hint"
          checked={kept}
          disabled={busy}
          onChange={(event) => {
            const keep = event.currentTarget.checked;
            void run(() => client.setPrivate(work, keep));
          }}
        />
      </div>
      {state.pending && (
        <div class="work-privacy-row">
          <p class="work-privacy-hint">{t('sharing.pending')}</p>
          <button class="button" type="button" disabled={busy} onClick={() => void run(() => client.sync())}>
            {t('sharing.retry')}
          </button>
        </div>
      )}
      {problem && (
        <p class="work-privacy-hint" role="alert">
          {problem}
        </p>
      )}
    </section>
  );
}
