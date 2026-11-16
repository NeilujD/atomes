// The Sharing group of Settings, a Preact island (ADR 0014): the reader shares
// Reading Statuses, Followed Series or Labels by category (glossary: Shared).
// The server writes and deletes the records on the PDS (src/lib/server/sharing.ts);
// this file only renders and asks.
import { useEffect, useState } from 'preact/hooks';
import { t } from '../lib/i18n/i18n';
import { categoryNames, type Category, type SharingState } from '../lib/sharing/categories';
import { sharingClient, type SharingAnswer, type SharingClient } from '../lib/sharing/client';

// Back to the PDS of the linked AT Protocol Account, which asks for the
// permission to share, then back to Settings (POST /oauth/link with no handle,
// for this browser session only).
function signInAgain() {
  const form = document.createElement('form');
  form.method = 'post';
  form.action = '/oauth/link';
  document.body.append(form);
  form.submit();
}

// An unshared category may still be on the PDS while a change is pending.
function rowState(state: SharingState, category: Category) {
  if (state.shared[category]) return 'sharing.shared';
  return state.pending ? 'sharing.still-shared' : 'sharing.private';
}

export default function SharingIsland() {
  return <Sharing client={sharingClient()} signInAgain={signInAgain} />;
}

export function Sharing({ client, signInAgain }: { client: SharingClient; signInAgain: () => void }) {
  const [state, setState] = useState<SharingState>();
  const [needsConsent, setNeedsConsent] = useState(false);
  // No AT Protocol Account linked: nothing can be Shared (ADR 0016).
  const [unlinked, setUnlinked] = useState(false);
  const [problem, setProblem] = useState<string>();
  const [busy, setBusy] = useState(false);

  async function run(ask: () => Promise<SharingAnswer>) {
    setBusy(true);
    setProblem(undefined);
    try {
      const answer = await ask();
      if ('state' in answer) {
        setState(answer.state);
        setUnlinked(!answer.state.atproto);
        setNeedsConsent(answer.state.atproto && !answer.state.canShare);
      } else if ('needsConsent' in answer) setNeedsConsent(true);
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
    void run(() => client.load());
  }, [client]);

  const share = (category: Category, shared: boolean) => void run(() => client.setShared(category, shared));

  return (
    <div class="sharing">
      <p class="row-hint">{t('sharing.hint')}</p>
      {unlinked && <p class="row-hint">{t('sharing.needs-link')}</p>}
      {needsConsent && !unlinked && (
        <div class="sharing-note">
          <p class="row-hint">{t('sharing.consent')}</p>
          <button class="button" type="button" onClick={signInAgain}>
            {t('sharing.sign-in-again')}
          </button>
        </div>
      )}
      {!state && !problem && <p class="row-hint">{t('settings.checking')}</p>}
      {state &&
        categoryNames.map((category) => (
          <div class="row sharing-row" key={category}>
            <div>
              <p class="row-label" id={`sharing-${category}`}>
                {t(`sharing.${category}`)}
              </p>
              <p class="row-hint" id={`sharing-${category}-state`}>
                {t(rowState(state, category))}
              </p>
            </div>
            <input
              class="switch"
              type="checkbox"
              role="switch"
              aria-labelledby={`sharing-${category}`}
              aria-describedby={`sharing-${category}-state`}
              checked={state.shared[category]}
              // Turning off needs no permission: the server deletes as soon as it can.
              disabled={busy || ((needsConsent || unlinked) && !state.shared[category])}
              onChange={(event) => share(category, event.currentTarget.checked)}
            />
          </div>
        ))}
      {state && state.privateWorks.length > 0 && <p class="row-hint">{t('sharing.private-works', state.privateWorks.length)}</p>}
      {state?.pending && (
        <div class="sharing-note">
          <p class="row-hint">{t('sharing.pending')}</p>
          <button class="button" type="button" disabled={busy} onClick={() => void run(() => client.sync())}>
            {t('sharing.retry')}
          </button>
        </div>
      )}
      {problem && (
        <p class="row-error" role="alert">
          {problem}
        </p>
      )}
    </div>
  );
}
