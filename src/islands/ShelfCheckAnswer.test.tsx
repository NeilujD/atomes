// @vitest-environment happy-dom
import { cleanup, render, screen } from '@testing-library/preact';
import { afterEach, describe, expect, test } from 'vitest';
import type { Edition } from '../lib/catalog/catalog';
import type { Spine } from '../lib/library/series';
import type { ShelfCheck } from '../lib/library/shelf-check';
import { ShelfCheckAnswer } from './ShelfCheckAnswer';

afterEach(cleanup);

const spyFamily = { id: 'wd:Q88456222', title: 'Spy x Family', sameAs: [] };
const spine = (volume: number, state: Spine['state']): Spine => ({ volume, state, edition: { isbn: `isbn-${volume}` } as Edition });

describe('the Shelf Check answer', () => {
  test('owned: its Reading Status and the Book page', () => {
    render(<ShelfCheckAnswer check={{ kind: 'owned', status: 'reading', followed: null }} work="wd:Q1" volumes={[]} />);

    expect(screen.getByText('In your Library')).toBeTruthy();
    expect(screen.getByText('Reading Status: Reading')).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Open its Book page' }).getAttribute('href')).toBe('/book?work=wd%3AQ1');
  });

  test('read but not owned', () => {
    render(<ShelfCheckAnswer check={{ kind: 'read', status: 'read', followed: null }} work="wd:Q1" volumes={[]} />);

    expect(screen.getByText('Read, but you have no Copy')).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Open its Book page' })).toBeTruthy();
  });

  test('missing from a Series, with the spine row and this Volume marked', () => {
    const check: ShelfCheck = {
      kind: 'missing',
      status: 'unread',
      followed: spyFamily,
      spines: [spine(1, 'read'), spine(2, 'owned'), spine(3, 'not-owned'), spine(4, 'owned')],
    };
    render(<ShelfCheckAnswer check={check} work="wd:Q3" volumes={[3]} />);

    expect(screen.getByText('Missing from Spy x Family')).toBeTruthy();
    const row = screen.getByRole('list', { name: 'Volumes of Spy x Family' });
    expect([...row.querySelectorAll('li')].map((each) => each.textContent)).toEqual([
      '1Volume 1: read',
      '2Volume 2: owned, not read',
      '3Volume 3: not owned',
      '4Volume 4: owned, not read',
    ]);
    expect(row.querySelector('[aria-current="true"]')?.textContent).toBe('3Volume 3: not owned');
    expect(screen.queryByRole('link')).toBeNull();
  });

  test('not in the Library, in a Followed Series', () => {
    render(<ShelfCheckAnswer check={{ kind: 'new', status: 'unread', followed: spyFamily }} work="wd:Q17" volumes={[17]} />);

    expect(screen.getByText('Not in your Library')).toBeTruthy();
    expect(screen.getByText('You follow Spy x Family.')).toBeTruthy();
  });

  test('unknown on this device: not in your Library, check online later', () => {
    render(<ShelfCheckAnswer check={{ kind: 'unknown', status: 'unread', followed: null }} work="isbn:9791099999993" volumes={[]} />);

    expect(screen.getByText('Not in your Library')).toBeTruthy();
    expect(screen.getByText('This device does not know this book yet. Check online later.')).toBeTruthy();
    expect(screen.queryByRole('link')).toBeNull();
  });
});
