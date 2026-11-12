// @vitest-environment happy-dom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/preact';
import { afterEach, describe, expect, test } from 'vitest';
import type { Choice, Edition, SearchFound } from '../lib/catalog/catalog';
import type { ChooseAnswer } from '../lib/catalog/client';
import type { BookDetails } from '../lib/library/copy';
import { FindInBnf, volumeRanges, type Sources } from './FindInBnf';

const kaamelott10 = '9782203255647';
const kaamelott9 = '9782203085053';
const found: SearchFound = {
  lines: [{ anchor: kaamelott9, series: 'Kaamelott', publisher: 'Casterman', language: 'fre', volumes: [1, 2, 3, 4, 5, 6, 7, 8, 9] }],
  works: [{ anchor: '9782265144026', title: 'Réglez-lui son compte !', authors: ['San-Antonio'], publisher: 'Fleuve noir', year: 2019 }],
};
const chosen = { isbn: kaamelott10, title: 'Kaamelott', volume: 10, sources: ['reader'] } as Edition;

function screenFor(answer: ChooseAnswer = { found: chosen }, details: BookDetails = { title: 'Kaamelott' }) {
  const searched: [string, string][] = [];
  const choices: Choice[] = [];
  const result = { chosen: undefined as Edition | undefined, typed: undefined as BookDetails | undefined };
  const sources: Sources = {
    search: (title, publisher) => {
      searched.push([title, publisher]);
      return Promise.resolve({ found });
    },
    choose: (isbn, choice) => {
      choices.push(choice);
      return Promise.resolve(isbn === kaamelott10 ? answer : { failed: true });
    },
  };
  render(
    <FindInBnf
      isbn={kaamelott10}
      typed={() => ({ details })}
      onChosen={(edition) => (result.chosen = edition)}
      onTyped={(typed) => (result.typed = typed)}
      sources={sources}
    />,
  );
  return { searched, choices, result };
}

async function searchCasterman() {
  fireEvent.input(screen.getByLabelText('Publisher'), { target: { value: 'Casterman ' } });
  fireEvent.click(screen.getByRole('button', { name: 'Search the BnF' }));
  await screen.findByText('Casterman · Volumes 1–9');
}

afterEach(cleanup);

describe('Find in BnF (Quick Add, an ISBN no source knows)', () => {
  test('the reader finds Kaamelott (Casterman) by its title and picks Volume 10, the one after the last known', async () => {
    const { searched, choices, result } = screenFor();

    await searchCasterman();
    fireEvent.click(screen.getByRole('button', { name: 'This is Kaamelott' }));

    expect(searched).toEqual([['Kaamelott', 'Casterman']]);
    await waitFor(() => expect(result.chosen).toBe(chosen));
    expect(choices).toEqual([{ anchor: kaamelott9, volume: 10, title: 'Kaamelott', authors: [] }]);
  });

  test('a wrong Volume number is not sent', async () => {
    const { choices } = screenFor();
    await searchCasterman();

    fireEvent.input(screen.getByLabelText('Volume'), { target: { value: 'dix' } });
    fireEvent.click(screen.getByRole('button', { name: 'This is Kaamelott' }));

    expect(await screen.findByText('Type the Volume number, for example 10.')).toBeTruthy();
    expect(choices).toEqual([]);
  });

  test('a book with no shared Work fills the form with its authors instead', async () => {
    const { result } = screenFor({ noSharedWork: true }, { title: 'Réglez-lui son compte !' });
    await searchCasterman();

    fireEvent.click(screen.getByRole('button', { name: 'This is Réglez-lui son compte !' }));

    await waitFor(() => expect(result.typed).toEqual({ title: 'Réglez-lui son compte !', authors: ['San-Antonio'] }));
    expect(result.chosen).toBeUndefined();
  });

  test('a session ended while on the screen: says so', async () => {
    screenFor({ signedOut: true });
    await searchCasterman();

    fireEvent.click(screen.getByRole('button', { name: 'This is Kaamelott' }));

    expect(await screen.findByText('Your session has ended. Sign in again.')).toBeTruthy();
  });

  test.each([
    [[1, 2, 3, 4, 5, 6, 7, 8, 9], '1–9'],
    [[1, 2, 4, 6, 7], '1–2, 4, 6–7'],
    [[3], '3'],
  ])('Volumes %j read as %s', (volumes, text) => {
    expect(volumeRanges(volumes)).toBe(text);
  });
});
