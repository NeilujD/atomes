// What every chart of Statistics shares (ADR 0019, ui-direction view type
// "Charts"): a small heading, a "Table" switch, and a card that holds the
// drawing or, switched on, the same numbers in a real table. Styles:
// src/styles/charts.css.
import type { ComponentChildren } from 'preact';
import { useState } from 'preact/hooks';
import { t } from '../../lib/i18n/i18n';

export interface TableData {
  // The heads of the columns, the first one over the row names.
  heads: string[];
  // One row per group or name: its name, then its figures.
  rows: { name: string; figures: string[] }[];
}

export interface ChartFrameProps {
  title: string;
  table: TableData;
  // Above the drawing or the table: a control of the screen (the dimension of "Most read").
  controls?: ComponentChildren;
  // Under the drawing or the table: one line of the screen ("11 read are in no Series.").
  note?: string;
  // The drawing.
  children: ComponentChildren;
}

export function ChartFrame({ title, table, controls, note, children }: ChartFrameProps) {
  const [asTable, setAsTable] = useState(false);
  return (
    <section class="chart">
      <div class="chart-head">
        <h2 class="small-heading">{title}</h2>
        <button class="button button-quiet" type="button" aria-pressed={asTable} onClick={() => setAsTable(!asTable)}>
          <svg class="chart-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
            {/* Lucide's table (https://lucide.dev, ISC). */}
            <path d="M12 3v18M3 9h18M3 15h18" />
            <rect width="18" height="18" x="3" y="3" rx="2" />
          </svg>
          {t('chart.table')}
        </button>
      </div>
      <div class="card">
        {controls && <div class="chart-controls">{controls}</div>}
        {asTable ? (
          <table class="chart-table">
            <caption class="visually-hidden">{title}</caption>
            <thead>
              <tr>
                {table.heads.map((head) => (
                  <th key={head} scope="col">
                    {head}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {table.rows.map((row, at) => (
                <tr key={at}>
                  <th scope="row">{row.name}</th>
                  {row.figures.map((figure, column) => (
                    <td key={column}>{figure}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          children
        )}
        {note && <p class="chart-note">{note}</p>}
      </div>
    </section>
  );
}
