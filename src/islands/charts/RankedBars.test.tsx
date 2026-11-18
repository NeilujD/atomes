// @vitest-environment happy-dom
import { cleanup, fireEvent, render, screen, within } from '@testing-library/preact';
import { afterEach, describe, expect, test } from 'vitest';
import { RankedBars } from './RankedBars';

afterEach(cleanup);

const longName = 'The Girl from the Other Side: Siúil, a Rún, the complete Edition Line';
const mostRead = {
  title: 'Most read',
  nameHead: 'Series',
  valueHead: 'Read',
  rows: [
    { name: 'One Piece', value: 1200 },
    { name: longName, value: 6 },
    { name: 'Dune', value: 4 },
  ],
  format: (value: number) => new Intl.NumberFormat('en').format(value),
};

describe('ranked bars', () => {
  test('a row per name, in the order given, with its figure', () => {
    render(<RankedBars {...mostRead} />);

    const rows = within(screen.getByRole('list', { name: 'Most read' })).getAllByRole('listitem');
    expect(rows.map((row) => row.textContent)).toEqual(['One Piece1,200', `${longName}6`, 'Dune4']);
  });

  test('a long name keeps its full text', () => {
    render(<RankedBars {...mostRead} />);

    expect(screen.getByText(longName)).toBeTruthy();
  });

  test('the Table switch shows the numbers of the drawing in a table', () => {
    render(<RankedBars {...mostRead} />);

    fireEvent.click(screen.getByRole('button', { name: 'Table' }));

    const rows = within(screen.getByRole('table', { name: 'Most read' })).getAllByRole('row');
    expect(rows.map((row) => [...row.querySelectorAll('th, td')].map((cell) => cell.textContent))).toEqual([
      ['Series', 'Read'],
      ['One Piece', '1,200'],
      [longName, '6'],
      ['Dune', '4'],
    ]);
    expect(screen.queryByRole('list', { name: 'Most read' })).toBeNull();
  });

  test('what the caller puts above the rows and the note under them stay with the table', () => {
    render(
      <RankedBars {...mostRead} note="11 read are in no Series.">
        <button type="button">Authors</button>
      </RankedBars>,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Table' }));

    expect(screen.getByRole('table')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Authors' })).toBeTruthy();
    expect(screen.getByText('11 read are in no Series.')).toBeTruthy();
  });
});
