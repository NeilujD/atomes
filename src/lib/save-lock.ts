// One save per tap (spec M5b, Quick Add save). From the submit until the next
// screen loads, `screen` is inert and the submit button busy, so a second tap
// saves nothing. No overlay: the content does not move (ui-direction).
// `save` resolves to 'leave' when it opens the next screen; else to the
// element to focus once the screen is back, if any. Back can show the page
// again from the browser cache, locked: it comes back unlocked.
export function lockWhileSaving(
  form: HTMLFormElement,
  screen: HTMLElement,
  save: () => Promise<'leave' | HTMLElement | undefined>,
): void {
  const button = form.querySelector<HTMLButtonElement>('button[type="submit"]')!;
  const lock = (on: boolean) => {
    screen.inert = on;
    button.disabled = on;
    if (on) button.setAttribute('aria-busy', 'true');
    else button.removeAttribute('aria-busy');
  };
  form.addEventListener('submit', (event) => {
    event.preventDefault();
    if (screen.inert) return;
    lock(true);
    void submit();
  });
  // A save that throws gives the screen back; its error stays unhandled, so it shows.
  async function submit() {
    let next: 'leave' | HTMLElement | undefined;
    try {
      next = await save();
    } finally {
      if (next !== 'leave') lock(false);
    }
    if (next !== 'leave') next?.focus();
  }
  addEventListener('pageshow', (event) => {
    if (event.persisted) lock(false);
  });
}
