// One choice among a few values, kept on this device (`localStorage`): the
// Appearance, the Library mode, Books or Series.
export function keptChoice<Choice extends string>(key: string, choices: readonly Choice[], fallback: Choice) {
  // A kept value that is no choice (an older version, a value changed by hand) gives the fallback.
  const parse = (value: string | null): Choice => choices.find((choice) => choice === value) ?? fallback;
  return {
    parse,
    // Storage can be blocked (private mode, browser settings): even reading
    // `localStorage` can throw. Then the choice lasts for the page only.
    read: (): Choice => {
      try {
        return parse(localStorage.getItem(key));
      } catch {
        return fallback;
      }
    },
    save: (choice: Choice): void => {
      try {
        localStorage.setItem(key, choice);
      } catch {
        // See read.
      }
    },
  };
}
