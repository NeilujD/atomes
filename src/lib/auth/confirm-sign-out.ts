// The sign-out dialog of AppShell, always asked first: sign-out removes the
// Library from this device, saves still waiting too (device-data.ts).
// Resolves true when the reader confirms; Cancel (focused first) and Escape resolve false.
export function confirmSignOut(): Promise<boolean> {
  const dialog = document.querySelector<HTMLDialogElement>('[data-sign-out-dialog]');
  if (!dialog) return Promise.resolve(false);
  dialog.returnValue = '';
  dialog.showModal();
  return new Promise((resolve) => {
    dialog.addEventListener('close', () => resolve(dialog.returnValue === 'confirm'), { once: true });
  });
}
