// @vitest-environment happy-dom
import { cleanup, render, screen } from '@testing-library/preact';
import { afterEach, describe, expect, test } from 'vitest';
import { ShelfCheckAnswer } from './ShelfCheckAnswer';

afterEach(cleanup);

// A book the Catalog does not know, above the form where the reader types it.
describe('the Shelf Check answer of a typed book', () => {
  test('owned: its Reading Status and the Book page', () => {
    render(<ShelfCheckAnswer check={{ kind: 'owned', status: 'reading', followed: null }} work="isbn:9791099999993" />);

    expect(screen.getByText('Already in your Library')).toBeTruthy();
    expect(screen.getByText('Reading Status: Reading')).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Open its Book page' }).getAttribute('href')).toBe('/book?work=isbn%3A9791099999993');
  });

  test('read but not owned: the Book page', () => {
    render(<ShelfCheckAnswer check={{ kind: 'read', status: 'read', followed: null }} work="isbn:9791099999993" />);

    expect(screen.getByText('Read, not in your Library')).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Open its Book page' })).toBeTruthy();
  });

  test('not in the Library: no link', () => {
    render(<ShelfCheckAnswer check={{ kind: 'new', status: 'unread', followed: null }} work="isbn:9791099999993" />);

    expect(screen.getByText('Not in your Library')).toBeTruthy();
    expect(screen.queryByRole('link')).toBeNull();
  });
});
