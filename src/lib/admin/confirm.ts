// Opens a confirm dialog of the admin panel (`.confirm`, theme.css). Resolves
// true when the Admin confirms; Cancel and Escape resolve false.
export function confirmed(dialog: HTMLDialogElement): Promise<boolean> {
  dialog.returnValue = '';
  dialog.showModal();
  return new Promise((resolve) => {
    dialog.addEventListener('close', () => resolve(dialog.returnValue === 'confirm'), { once: true });
  });
}
