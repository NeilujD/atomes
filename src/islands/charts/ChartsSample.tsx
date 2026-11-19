// Development only (src/pages/dev/charts.astro): each chart part with sample
// data, for the stress test of the view type "Charts" (ui-direction). The
// Statistics screen feeds the same parts from src/lib/library/stats.ts.
import { monthNames, pageLanguage, type Language } from '../../lib/i18n/i18n';
import { Columns } from './Columns';
import { RankedBars } from './RankedBars';
import { Tile } from './Tile';

const months = (language: Language) => Array.from({ length: 12 }, (_, month) => monthNames(`2026-${String(month + 1).padStart(2, '0')}`, language));

const years = ['2020', '2021', '2022', '2023', '2024', '2025', '2026'].map((year) => ({ label: year, name: year }));

export default function ChartsSample() {
  const language = pageLanguage();
  return (
    <div class="charts-sample">
      <div class="charts-sample-tiles">
        <Tile label="Added" value={61} />
        <Tile label="Reading" value={3} />
        <Tile label="Owned, not read yet" value={1058} />
      </div>
      <Columns
        title="Read and added, by month"
        scale="month"
        groups={months(language)}
        series={[
          { label: 'Read', values: [3, 5, 2, 6, 4, 7, 9, 3, 2, 4, 2, 0] },
          { label: 'Added', values: [6, 4, 3, 8, 5, 4, 7, 6, 3, 9, 6, 0] },
        ]}
        picked={10}
      />
      <Columns
        title="Read and added, by year"
        scale="year"
        groups={years}
        series={[
          { label: 'Read', values: [9, 14, 22, 31, 38, 52, 47] },
          { label: 'Added', values: [6, 11, 30, 44, 41, 59, 61] },
        ]}
      />
      <Columns title="Read, by month (one series)" scale="month" groups={months(language)} series={[{ label: 'Read', values: [3, 5, 2, 6, 4, 7, 9, 3, 2, 4, 2, 0] }]} />
      <RankedBars
        title="Most read"
        nameHead="Series"
        valueHead="Read"
        rows={[
          { name: 'One Piece', value: 12 },
          { name: 'The Girl from the Other Side: Siúil, a Rún', value: 6 },
          { name: 'Dune', value: 4 },
          { name: 'Vinland Saga', value: 4 },
          { name: 'The Expanse', value: 3 },
          { name: 'Sandman', value: 1 },
        ]}
        note="11 read are in no Series."
      >
        <div class="segmented" role="radiogroup" aria-label="Most read by">
          {['Series', 'Authors', 'Labels', 'Publishers'].map((dimension, at) => (
            <label key={dimension} class="segment">
              <input type="radio" name="dimension" checked={at === 0} />
              {dimension}
            </label>
          ))}
        </div>
      </RankedBars>
      <RankedBars
        title="Your Library today"
        nameHead="Reading Status"
        valueHead="Works"
        rows={[
          { name: 'Read', value: 318 },
          { name: 'Reading', value: 3 },
          { name: 'Not yet', value: 58 },
          { name: 'Abandoned', value: 33 },
        ]}
        note="412 owned in 37 Series."
      />
    </div>
  );
}
