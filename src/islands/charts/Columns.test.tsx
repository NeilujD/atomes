// @vitest-environment happy-dom
import { cleanup, fireEvent, render, screen, within } from '@testing-library/preact';
import { afterEach, describe, expect, test } from 'vitest';
import { Columns, scaleTop, type ColumnSeries } from './Columns';

afterEach(cleanup);

const read: ColumnSeries = { label: 'Read', values: [4, 0, 1200] };
const quarter = {
  title: 'Read and added, by month',
  scale: 'month' as const,
  groups: [
    { label: 'J', name: 'January 2026' },
    { label: 'F', name: 'February 2026' },
    { label: 'M', name: 'March 2026' },
  ],
  series: [read, { label: 'Added', values: [5, 2, 7] }] as [ColumnSeries, ColumnSeries],
  format: (value: number) => new Intl.NumberFormat('en').format(value),
};

describe('columns', () => {
  test('each group is a button named by its numbers', () => {
    render(<Columns {...quarter} />);

    expect(screen.getByRole('button', { name: 'January 2026: Read 4, Added 5' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'February 2026: Read 0, Added 2' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'March 2026: Read 1,200, Added 7' })).toBeTruthy();
  });

  test('a tap on a group picks it, and the readout gives its numbers', () => {
    render(<Columns {...quarter} />);
    const february = screen.getByRole('button', { name: /^February 2026/ });

    fireEvent.click(february);

    expect(february.getAttribute('aria-pressed')).toBe('true');
    expect(screen.getByRole('button', { name: /^January 2026/ }).getAttribute('aria-pressed')).toBe('false');
    const readout = screen.getByRole('status');
    expect(readout.textContent).toContain('February 2026');
    expect(readout.textContent).toContain('Read 0');
    expect(readout.textContent).toContain('Added 2');
  });

  test('the arrow keys move between groups, and only the picked group is in the tab order', () => {
    render(<Columns {...quarter} picked={0} />);
    const [january, february, march] = ['January', 'February', 'March'].map((month) => screen.getByRole('button', { name: new RegExp(`^${month} 2026`) }));

    expect([january, february, march].map((group) => group.tabIndex)).toEqual([0, -1, -1]);
    january.focus();
    fireEvent.keyDown(january, { key: 'ArrowRight' });
    expect(document.activeElement).toBe(february);
    expect(february.getAttribute('aria-pressed')).toBe('true');
    expect([january, february, march].map((group) => group.tabIndex)).toEqual([-1, 0, -1]);

    fireEvent.keyDown(february, { key: 'End' });
    expect(document.activeElement).toBe(march);
    fireEvent.keyDown(march, { key: 'ArrowRight' });
    expect(document.activeElement).toBe(march);
    fireEvent.keyDown(march, { key: 'Home' });
    expect(document.activeElement).toBe(january);
    fireEvent.keyDown(january, { key: 'ArrowLeft' });
    expect(document.activeElement).toBe(january);
  });

  test('the last group is picked at first', () => {
    render(<Columns {...quarter} />);

    expect(screen.getByRole('button', { name: /^March 2026/ }).getAttribute('aria-pressed')).toBe('true');
  });

  test('the Table switch shows the numbers of the drawing in a table', () => {
    render(<Columns {...quarter} />);

    fireEvent.click(screen.getByRole('button', { name: 'Table' }));

    expect(screen.getByRole('button', { name: 'Table' }).getAttribute('aria-pressed')).toBe('true');
    const rows = within(screen.getByRole('table', { name: 'Read and added, by month' })).getAllByRole('row');
    expect(rows.map((row) => [...row.querySelectorAll('th, td')].map((cell) => cell.textContent))).toEqual([
      ['Month', 'Read', 'Added'],
      ['January 2026', '4', '5'],
      ['February 2026', '0', '2'],
      ['March 2026', '1,200', '7'],
    ]);
    expect(screen.queryByRole('button', { name: /^January 2026/ })).toBeNull();
  });

  test('by year, the table heads its groups "Year"', () => {
    render(<Columns title="Read, by year" scale="year" groups={[{ label: '2025', name: '2025' }]} series={[{ label: 'Read', values: [52] }]} />);

    fireEvent.click(screen.getByRole('button', { name: 'Table' }));

    expect(screen.getByRole('columnheader', { name: 'Year' })).toBeTruthy();
    expect(screen.getByRole('cell', { name: '52' })).toBeTruthy();
  });

  test('a legend names the two series; one series needs none', () => {
    const { unmount } = render(<Columns {...quarter} />);
    expect(within(screen.getByRole('list', { name: 'Legend' })).getAllByRole('listitem').map((item) => item.textContent)).toEqual(['Read', 'Added']);
    unmount();

    render(<Columns {...quarter} series={[read]} />);
    expect(screen.queryByRole('list', { name: 'Legend' })).toBeNull();
  });
});

// Ticks at 0, half and the top: the top is the highest value rounded up so
// that the half tick is a round whole number.
describe('the top of the scale', () => {
  test.each([
    [0, 2],
    [1, 2],
    [7, 8],
    [9, 10],
    [20, 20],
    [21, 30],
    [52, 60],
    [61, 80],
    [1200, 1200],
    [1201, 1600],
  ])('the highest value %i gives a top of %i', (highest, top) => {
    expect(scaleTop(highest)).toBe(top);
  });
});
