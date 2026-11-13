// For a screen whose requests can answer out of order (Check a book, offline
// and online lookups): each call starts a request and gives a check that is
// true only while no later request has started, so a late answer is dropped.
export function latestOnly(): () => () => boolean {
  let latest = 0;
  return () => {
    const mine = ++latest;
    return () => mine === latest;
  };
}
