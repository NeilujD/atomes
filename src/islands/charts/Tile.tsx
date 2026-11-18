// A tile of Statistics (ADR 0019): a number over its label, in a card. A
// screen reader reads the label first, then the number.
import { pageFormat, type Format } from './ChartFrame';

export interface TileProps {
  label: string;
  value: number;
  format?: Format;
}

export function Tile({ label, value, format = pageFormat() }: TileProps) {
  return (
    <dl class="card chart-tile">
      <dt>{label}</dt>
      <dd>{format(value)}</dd>
    </dl>
  );
}
