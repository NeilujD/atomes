// How the Library shows its books: Grid, List or Cover flow. The choice is
// kept on the device, as the Appearance is (src/lib/appearance.ts).

export const modes = ['grid', 'list', 'flow'] as const;
export type Mode = (typeof modes)[number];

const modeKey = 'atomes:library-mode';

// A kept value that is no mode gives the Grid. Storage can be blocked: even
// reading `localStorage` can throw. Then the choice lasts for the page only.
export function readMode(): Mode {
  try {
    const kept = localStorage.getItem(modeKey);
    return modes.find((mode) => mode === kept) ?? 'grid';
  } catch {
    return 'grid';
  }
}

export function saveMode(mode: Mode): void {
  try {
    localStorage.setItem(modeKey, mode);
  } catch {
    // See readMode.
  }
}
