// @vitest-environment happy-dom
import { cleanup, render, screen } from '@testing-library/preact';
import { afterEach, expect, test } from 'vitest';
import { Tile } from './Tile';

afterEach(cleanup);

test('a tile gives its number with its label', () => {
  render(<Tile label="Owned, not read yet" value={1058} format={(value) => new Intl.NumberFormat('fr').format(value)} />);

  expect(screen.getByRole('term').textContent).toBe('Owned, not read yet');
  expect(screen.getByRole('definition').textContent).toBe('1 058');
});
