// How the Library shows its books: each book or each Series (the Books /
// Series switch), and for books Grid, List or Cover flow. Both choices are
// kept on the device, as the Appearance is (src/lib/appearance.ts).
import { keptChoice } from '../kept-choice';

// What the Library shows a card for: each book, or each Series.
export const groupings = ['books', 'series'] as const;
export type Grouping = (typeof groupings)[number];

export const { read: readGrouping, save: saveGrouping } = keptChoice('atomes:library-grouping', groupings, 'books');

export const modes = ['grid', 'list', 'flow'] as const;
export type Mode = (typeof modes)[number];

export const { read: readMode, save: saveMode } = keptChoice('atomes:library-mode', modes, 'grid');
