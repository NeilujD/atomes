// What the Library keeps for the way back from a Book or a Series (CORE-96):
// the search, Search in, Sort, the filters, the Cover flow move and the scroll.
// The island saves it in `history.state`, so it lives in this history entry
// only: the Library tab opens a new entry, and a clean Library. Pure: a saved
// state comes from the browser, so each part is checked and a bad one is dropped.
// A Label deleted since is dropped later, by `liveQuery` (browse.ts).
import { allBooks, searchIns, sorts, type LibraryQuery } from './browse';
import type { FlowMove } from './flow';
import { statuses, type Status } from './reading-status';

export interface LibraryState {
  query: LibraryQuery;
  flow: FlowMove | undefined;
  // Phone: the page scrolls. Desktop: the panel does (AppShell).
  scroll: { page: number; panel: number };
}

type Fields = Record<string, unknown>;
const fields = (value: unknown): Fields => (typeof value === 'object' && value !== null ? (value as Fields) : {});
const oneOf = <T>(choices: readonly T[], value: unknown, otherwise: T): T => (choices.includes(value as T) ? (value as T) : otherwise);
const textOrNull = (value: unknown) => (typeof value === 'string' ? value : null);
const place = (value: unknown) => (typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : 0);

export function savedLibraryState(saved: unknown): LibraryState {
  const { query, flow, scroll } = fields(saved);
  const asked = fields(query);
  const moved = fields(flow);
  const at = fields(scroll);
  return {
    query: {
      text: typeof asked.text === 'string' ? asked.text : allBooks.text,
      searchIn: oneOf(searchIns, asked.searchIn, allBooks.searchIn),
      sort: oneOf(sorts, asked.sort, allBooks.sort),
      author: textOrNull(asked.author),
      series: textOrNull(asked.series),
      status: oneOf<Status | null>(statuses, asked.status, null),
      label: textOrNull(asked.label),
      owned: typeof asked.owned === 'boolean' ? asked.owned : null,
    },
    flow: Number.isInteger(moved.to) && (moved.to as number) >= 0 && typeof moved.works === 'string' ? { to: moved.to as number, works: moved.works } : undefined,
    scroll: { page: place(at.page), panel: place(at.panel) },
  };
}
