// The connection status in the frame (ConnectionStatus in AppShell), as Linear
// shows it: "Offline", the saves that wait on this device, and Reconnect.
//
// The browser's online flag can say "online" with no network that works, so the
// pages also report what they saw: a network failure, or an answer from the PDS.
import { t } from './i18n/i18n';
import { reconnectEvent } from './network';

let browserOnline = navigator.onLine;
// A page saw a network failure, and nothing answered since.
let failed = false;
let waiting = 0;

export function reportNetwork(works: boolean): void {
  failed = !works;
  render();
}

export function reportWaiting(count: number): void {
  waiting = count;
  render();
}

function render() {
  const offline = !browserOnline || failed;
  for (const status of document.querySelectorAll<HTMLElement>('[data-connection]')) {
    status.querySelector<HTMLElement>('[data-connection-body]')!.hidden = !offline;
    status.querySelector('[data-connection-waiting]')!.textContent = waiting === 0 ? '' : t('connection.waiting', waiting);
  }
}

// Asks the Atomes server (not cached by the service worker). If it answers, the
// network works: the pages read and send again at once.
async function reconnect() {
  const buttons = document.querySelectorAll<HTMLButtonElement>('[data-reconnect]');
  for (const button of buttons) button.setAttribute('aria-busy', 'true');
  try {
    const answer = await fetch('/health', { cache: 'no-store' });
    if (answer.ok) {
      browserOnline = true;
      failed = false;
      dispatchEvent(new Event(reconnectEvent));
    }
  } catch {
    failed = true;
  } finally {
    for (const button of buttons) button.removeAttribute('aria-busy');
    render();
  }
}

export function startConnectionStatus(): void {
  addEventListener('offline', () => {
    browserOnline = false;
    render();
  });
  // `online` can come before the network works: check before saying so.
  addEventListener('online', () => void reconnect());
  for (const button of document.querySelectorAll<HTMLButtonElement>('[data-reconnect]')) {
    button.addEventListener('click', () => void reconnect());
  }
  render();
}
