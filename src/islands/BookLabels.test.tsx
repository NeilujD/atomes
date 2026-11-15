// @vitest-environment happy-dom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/preact';
import { afterEach, describe, expect, test } from 'vitest';
import { labelCollection, saveLabel, type Label, type SeriesIds } from '../lib/library/label';
import { memorySpace } from '../lib/library/memory-space.fake';
import { reconnectEvent } from '../lib/network';
import { BookLabels } from './BookLabels';

const dune = 'wd:Q190192';
const fondation = 'wd:Q753894';
const label = (name: string, works: string[]): Label => ({ name, works, createdAt: '2026-11-05T10:00:00.000Z' });

// The Dune cycle, the Series of Dune.
const cycle: SeriesIds = { id: 'wd:Q3041974', sameAs: [] };

// The Book page of Dune, in `series` when the Catalog knows it. The reader has `labels`; `saved` gives what the store holds, as [name, Works].
async function duneLabels(labels: Label[] = [], series: SeriesIds | null = null) {
  const { space, stored } = memorySpace();
  for (const each of labels) await saveLabel(space, each);
  render(<BookLabels work={dune} sources={{ open: () => Promise.resolve(space), series: () => Promise.resolve(series) }} />);
  await screen.findByRole('button', { name: 'Label' });
  return { space, saved: () => stored(labelCollection).map(({ value }) => [(value as Label).name, (value as Label).works]) };
}

afterEach(cleanup);

describe('Labels on the Book page', () => {
  test('a Label on the Series of the book shows with a Series mark, with no Remove: the Series page removes it', async () => {
    await duneLabels([{ ...label('Space opera', []), series: [cycle.id] }, label('Classics', [fondation])], cycle);

    const chip = (await screen.findByText('Space opera')).closest('li')!;
    expect(chip.textContent).toContain('From the Series');
    expect(screen.queryByRole('button', { name: 'Remove the Label Space opera from this book' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Space opera' })).toBeNull();
    expect(screen.getByText('Labels from the Series are removed on the Series page.')).toBeTruthy();
    expect(screen.queryByText('No Label on this book.')).toBeNull();
  });

  test('a Series Label stays off a book whose Series the Catalog does not know', async () => {
    await duneLabels([{ ...label('Space opera', []), series: [cycle.id] }]);

    expect(screen.getByText('No Label on this book.')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Space opera' })).toBeTruthy();
  });

  test('the New Label field stays closed until "+ Label" is tapped, then takes the focus', async () => {
    await duneLabels();

    expect(screen.queryByRole('textbox', { name: 'New Label' })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Label' }));

    expect(screen.getByRole('button', { name: 'Label' }).getAttribute('aria-expanded')).toBe('true');
    expect(document.activeElement).toBe(screen.getByRole('textbox', { name: 'New Label' }));
  });

  test('a typed name makes a Label on this book and shows it', async () => {
    const { saved } = await duneLabels();

    fireEvent.click(screen.getByRole('button', { name: 'Label' }));
    fireEvent.input(screen.getByRole('textbox', { name: 'New Label' }), { target: { value: 'Sci-fi' } });
    fireEvent.click(screen.getByRole('button', { name: 'Add' }));

    expect(await screen.findByRole('button', { name: 'Remove the Label Sci-fi from this book' })).toBeTruthy();
    expect(saved()).toEqual([['Sci-fi', [dune]]]);
    expect(screen.getByRole<HTMLInputElement>('textbox', { name: 'New Label' }).value).toBe('');
  });

  test('a name with no letter saves nothing and says what is missing', async () => {
    const { saved } = await duneLabels();

    fireEvent.click(screen.getByRole('button', { name: 'Label' }));
    fireEvent.click(screen.getByRole('button', { name: 'Add' }));

    expect(screen.getByText('Type a name for the Label.')).toBeTruthy();
    expect(saved()).toEqual([]);
  });

  test('one of the reader’s other Labels goes on the book in one tap, and Remove takes it off without deleting it', async () => {
    const { saved } = await duneLabels([label('Classics', [fondation])]);

    fireEvent.click(screen.getByRole('button', { name: 'Classics' }));
    const remove = await screen.findByRole('button', { name: 'Remove the Label Classics from this book' });

    expect(saved()).toEqual([['Classics', [fondation, dune]]]);

    fireEvent.click(remove);

    expect(await screen.findByRole('button', { name: 'Classics' })).toBeTruthy();
    expect(saved()).toEqual([['Classics', [fondation]]]);
  });

  test('a Label gets a new name; the name of another Label is refused and nothing is saved', async () => {
    const { saved } = await duneLabels([label('Sci-fi', [dune]), label('Classics', [fondation])]);
    const name = screen.getByRole('textbox', { name: 'Name of the Label Sci-fi' });
    const rename = () => fireEvent.submit(name.closest('form')!);

    fireEvent.input(name, { target: { value: 'classics' } });
    rename();

    expect(screen.getByText('You already have a Label with this name.')).toBeTruthy();
    expect(saved()).toEqual([
      ['Sci-fi', [dune]],
      ['Classics', [fondation]],
    ]);

    fireEvent.input(name, { target: { value: 'SF' } });
    rename();

    expect(await screen.findByRole('button', { name: 'Remove the Label SF from this book' })).toBeTruthy();
    expect(saved()).toEqual([
      ['SF', [dune]],
      ['Classics', [fondation]],
    ]);
  });

  test('after a rename the field shows the saved name, not the spaces typed around it', async () => {
    const { saved } = await duneLabels([label('Sci-fi', [dune])]);
    const name = screen.getByRole<HTMLInputElement>('textbox', { name: 'Name of the Label Sci-fi' });
    const rename = () => fireEvent.submit(name.closest('form')!);

    // Only spaces more: nothing to save.
    fireEvent.input(name, { target: { value: '  Sci-fi ' } });
    rename();

    expect(name.value).toBe('Sci-fi');

    fireEvent.input(name, { target: { value: '  SF ' } });
    rename();

    expect(await screen.findByRole('button', { name: 'Remove the Label SF from this book' })).toBeTruthy();
    expect(saved()).toEqual([['SF', [dune]]]);
    expect(name.value).toBe('SF');
  });

  test('a rename that the store does not save shows the saved name again', async () => {
    const { space, saved } = await duneLabels([label('Sci-fi', [dune])]);
    const name = screen.getByRole<HTMLInputElement>('textbox', { name: 'Name of the Label Sci-fi' });
    space.put = () => Promise.reject(new Error('The store is closed.'));

    fireEvent.input(name, { target: { value: 'SF' } });
    fireEvent.submit(name.closest('form')!);

    await waitFor(() => expect(name.value).toBe('Sci-fi'));
    expect(saved()).toEqual([['Sci-fi', [dune]]]);
  });

  test('a Label renamed on another device shows its new name in its field', async () => {
    const { space } = await duneLabels([label('Sci-fi', [dune])]);
    const name = screen.getByRole<HTMLInputElement>('textbox', { name: 'Name of the Label Sci-fi' });

    const [{ rkey }] = (await space.list(labelCollection)).records;
    await saveLabel(space, label('Anticipation', [dune]), rkey);
    dispatchEvent(new Event(reconnectEvent));

    await waitFor(() => expect(name.value).toBe('Anticipation'));
  });

  test('Delete asks first: Cancel keeps the Label, Delete takes it off every book', async () => {
    const { saved } = await duneLabels([label('Sci-fi', [dune, fondation])]);

    fireEvent.click(screen.getByRole('button', { name: 'Delete the Label Sci-fi' }));
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));

    expect(saved()).toEqual([['Sci-fi', [dune, fondation]]]);

    fireEvent.click(screen.getByRole('button', { name: 'Delete the Label Sci-fi' }));
    expect(screen.getByText('Delete the Label Sci-fi from every book?')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Delete' }));

    expect(await screen.findByText('No Label on this book.')).toBeTruthy();
    expect(saved()).toEqual([]);
  });
});
