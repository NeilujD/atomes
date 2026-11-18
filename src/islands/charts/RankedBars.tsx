// Ranked bars (ADR 0019): a name, a bar and a figure per row, every bar on
// one left edge, the longest for the highest value. The caller ranks the
// rows. A long name ends with an ellipsis on the screen and keeps its full
// text for a screen reader and in the table.
import type { ComponentChildren } from 'preact';
import { ChartFrame, pageFormat, type Format } from './ChartFrame';

export interface RankedRow {
  name: string;
  value: number;
}

export interface RankedBarsProps {
  title: string;
  // The heads of the table: "Series", "Read".
  nameHead: string;
  valueHead: string;
  rows: RankedRow[];
  note?: string;
  format?: Format;
  // Above the rows: a control of the screen (Series / Authors / Labels / Publishers).
  children?: ComponentChildren;
}

export function RankedBars({ title, nameHead, valueHead, rows, note, format = pageFormat(), children }: RankedBarsProps) {
  const highest = Math.max(0, ...rows.map(({ value }) => value));
  const table = { heads: [nameHead, valueHead], rows: rows.map(({ name, value }) => ({ name, figures: [format(value)] })) };
  return (
    <ChartFrame title={title} table={table} controls={children} note={note}>
      <ol class="ranked" aria-label={title}>
        {rows.map(({ name, value }, at) => (
          <li key={at}>
            <span class="ranked-name" title={name}>
              {name}
            </span>
            <span class="ranked-track" aria-hidden="true">
              <span class="ranked-fill" style={{ width: `${highest ? (value / highest) * 100 : 0}%` }} />
            </span>
            <span class="ranked-value">{format(value)}</span>
          </li>
        ))}
      </ol>
    </ChartFrame>
  );
}
