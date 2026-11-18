// Columns (ADR 0019): one or two series on one baseline, a group per month or
// per year. Each group is a button named by its numbers; the picked one shows
// them on the readout line, and the arrow keys move between groups. Ink for
// the first series, the medium shade for the second (ui-direction, Colour
// roles). The caller gives the names and the formatter of its language.
import { useRef, useState } from 'preact/hooks';
import { t } from '../../lib/i18n/i18n';
import { ChartFrame, pageFormat, type Format } from './ChartFrame';

export interface ColumnGroup {
  // Under the column: "J", "2025".
  label: string;
  // In the readout, the table and the name of the button: "January 2026".
  name: string;
}

export interface ColumnSeries {
  label: string;
  // One value per group.
  values: number[];
}

export interface ColumnsProps {
  title: string;
  // A bar is 10 px wide by month, 24 px by year; the table heads its groups "Month" or "Year".
  scale: 'month' | 'year';
  groups: ColumnGroup[];
  series: [ColumnSeries] | [ColumnSeries, ColumnSeries];
  // The group picked at first. Default: the last one.
  picked?: number;
  format?: Format;
}

// The top of the scale: the highest value, rounded up so that the tick at
// half is a round whole number too.
export function scaleTop(highest: number): number {
  const half = highest / 2;
  if (half <= 10) return 2 * Math.max(1, Math.ceil(half));
  const power = 10 ** Math.floor(Math.log10(half / 10));
  const step = [10, 15, 20, 25, 30, 40, 50, 60, 80, 100].map((base) => base * power).find((value) => value >= half) ?? 100 * power;
  return 2 * step;
}

const moves: Record<string, (at: number, last: number) => number> = {
  ArrowRight: (at, last) => Math.min(at + 1, last),
  ArrowLeft: (at) => Math.max(at - 1, 0),
  Home: () => 0,
  End: (_, last) => last,
};

export function Columns({ title, scale, groups, series, picked: first, format = pageFormat() }: ColumnsProps) {
  const [picked, setPicked] = useState(first ?? groups.length - 1);
  const buttons = useRef<(HTMLButtonElement | null)[]>([]);
  const top = scaleTop(Math.max(0, ...series.flatMap(({ values }) => values)));
  const figures = (at: number) => series.map(({ label, values }) => t('chart.figure', label, format(values[at] ?? 0)));

  function onKeyDown(event: KeyboardEvent, at: number) {
    const move = moves[event.key];
    if (!move) return;
    event.preventDefault();
    const next = move(at, groups.length - 1);
    setPicked(next);
    buttons.current[next]?.focus();
  }

  const table = {
    heads: [t(scale === 'month' ? 'chart.month' : 'chart.year'), ...series.map(({ label }) => label)],
    rows: groups.map(({ name }, at) => ({ name, figures: series.map(({ values }) => format(values[at] ?? 0)) })),
  };

  return (
    <ChartFrame title={title} table={table}>
      <div class="chart-top">
        <p class="chart-readout" role="status">
          {groups[picked] && (
            <>
              <strong>{groups[picked].name}</strong>
              {figures(picked).map((figure, at) => (
                <span key={at}>{figure}</span>
              ))}
            </>
          )}
        </p>
        {series.length === 2 && (
          <ul class="chart-legend" aria-label={t('chart.legend')}>
            {series.map(({ label }) => (
              <li key={label}>
                <span class="chart-swatch" />
                {label}
              </li>
            ))}
          </ul>
        )}
      </div>
      <div class="columns" data-scale={scale}>
        <div class="columns-ticks" aria-hidden="true">
          <span>{format(top)}</span>
          <span>{format(top / 2)}</span>
          <span>{format(0)}</span>
        </div>
        <div class="columns-plot">
          {groups.map((group, at) => (
            <button
              key={at}
              ref={(button) => {
                buttons.current[at] = button;
              }}
              class="columns-group"
              type="button"
              aria-pressed={at === picked}
              aria-label={t('chart.group', group.name, figures(at))}
              tabIndex={at === picked ? 0 : -1}
              onClick={() => setPicked(at)}
              onKeyDown={(event) => onKeyDown(event, at)}
            >
              {series.map(({ values }, index) => (
                <span key={index} class="columns-bar" style={{ height: `${((values[at] ?? 0) / top) * 100}%` }} />
              ))}
            </button>
          ))}
        </div>
        <div class="columns-axis" aria-hidden="true">
          {groups.map(({ label }, at) => (
            <span key={at} data-picked={at === picked || undefined}>
              {label}
            </span>
          ))}
        </div>
      </div>
    </ChartFrame>
  );
}
