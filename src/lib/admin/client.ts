// The page side of the admin API (src/lib/server/admin.ts): JSON in and out,
// same origin, never cached.
export interface AdminAnswer {
  ok: boolean;
  status: number;
  error?: string;
  body: Record<string, unknown>;
}

export async function postAdmin(path: string, body: unknown): Promise<AdminAnswer> {
  try {
    const response = await fetch(path, {
      method: 'POST',
      credentials: 'same-origin',
      cache: 'no-store',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    });
    const answer = (await response.json().catch(() => ({}))) as Record<string, unknown>;
    return { ok: response.ok, status: response.status, error: typeof answer.error === 'string' ? answer.error : undefined, body: answer };
  } catch {
    return { ok: false, status: 0, error: 'Network', body: {} };
  }
}

// The parts of the page that `selectors` name, again as the server draws them
// now: the rest of the page stays (links just made, an open form). Reloads
// the page when the server does not answer with it.
export async function redraw(...selectors: string[]): Promise<void> {
  const response = await fetch(location.href, { cache: 'no-store', credentials: 'same-origin' }).catch(() => undefined);
  if (!response?.ok) return location.reload();
  const next = new DOMParser().parseFromString(await response.text(), 'text/html');
  for (const selector of selectors) {
    const from = next.querySelector(selector);
    const to = document.querySelector(selector);
    if (!from || !to) return location.reload();
    to.replaceChildren(...from.childNodes);
  }
  // The new rows come with their buttons disabled: each script enables its own again.
  document.dispatchEvent(new Event(redrawn));
}

export const redrawn = 'admin:redrawn';

// Leads to the row of an Account and marks it (`:target`, admin.css). With
// "Flagged only" on, the row may not be in the list: the whole list then.
export function showRow(reference: string): void {
  if (!document.getElementById(reference)) return location.assign(`/admin?part=accounts#${reference}`);
  // The same hash again would not move: clear it first, with no jump.
  if (location.hash === `#${reference}`) history.replaceState(null, '', location.pathname + location.search);
  location.hash = reference;
}

// The line under a form or in a dialog: its hint, or why the server refused.
// A refusal reads in ink and weight, not in red: red marks actions that destroy (ui-direction, colour roles).
export function say(line: HTMLElement, text: string, refused = false): void {
  line.textContent = text;
  line.classList.toggle('refused', refused);
}

// Enables the buttons of `selector` now, and again after each redraw: a button
// stays disabled until the script that handles it runs (ui-direction).
export function enable(selector: string): void {
  const run = () => {
    for (const button of document.querySelectorAll<HTMLButtonElement>(selector)) button.disabled = false;
  };
  run();
  document.addEventListener(redrawn, run);
}
