// @vitest-environment happy-dom
import { describe, expect, test } from 'vitest';
import { coverName, showCover } from './cover';

const content = { src: '/api/cover/9782723488525', title: 'One Piece', series: 'One Piece', volumeTitle: null, volume: 'Volume 1' };

function box(): HTMLElement {
  return document.createElement('div');
}

// The Series name and the name under the picture, as the default cover shows them.
function defaultCover(element: HTMLElement): string[] | null {
  const cover = element.querySelector('.book-cover-default');
  return cover && [...cover.querySelectorAll('.book-cover-series, .book-cover-name')].map((each) => each.textContent);
}

describe('showCover', () => {
  test('keeps the image a page transition put in the box: same image, still shown', () => {
    const element = box();
    const flown = document.createElement('img');
    flown.src = content.src;
    element.dataset.cover = 'loaded';
    element.append(flown);

    showCover(element, content);

    expect(element.querySelector('img')).toBe(flown);
    expect(element.dataset.cover).toBe('loaded');
  });

  test('replaces the image a page transition put in the box when the book has another', () => {
    const element = box();
    const flown = document.createElement('img');
    flown.src = '/api/cover/other';
    element.append(flown);

    showCover(element, content);

    expect(element.querySelector('img')).not.toBe(flown);
    expect(element.dataset.cover).toBe('loading');
  });

  test('no image: the default cover with the Series and Volume', () => {
    const element = box();
    showCover(element, { ...content, src: null });

    expect(element.dataset.cover).toBe('default');
    expect(element.querySelector('img')).toBeNull();
    expect(defaultCover(element)).toEqual(['One Piece', 'Volume 1']);
  });

  test('is loading while the image loads, then shows it', () => {
    const element = box();
    showCover(element, content);
    const image = element.querySelector('img')!;

    expect(element.dataset.cover).toBe('loading');
    image.dispatchEvent(new Event('load'));
    expect(element.dataset.cover).toBe('loaded');
  });

  test('a failed image shows the default cover, never a broken image', () => {
    const element = box();
    showCover(element, content);
    element.querySelector('img')!.dispatchEvent(new Event('error'));

    expect(element.dataset.cover).toBe('default');
    expect(element.querySelector('img')).toBeNull();
    expect(defaultCover(element)).toEqual(['One Piece', 'Volume 1']);
  });

  test('an image replaced by another one no longer changes the box', () => {
    const element = box();
    showCover(element, content);
    const old = element.querySelector('img')!;
    showCover(element, { ...content, src: '/api/cover/9782723488532' });

    old.dispatchEvent(new Event('error'));
    expect(element.dataset.cover).toBe('loading');
    expect(element.querySelector('img')!.getAttribute('src')).toBe('/api/cover/9782723488532');
  });

  test('the same image keeps loading; a later failure shows the newest details', () => {
    const element = box();
    showCover(element, content);
    const image = element.querySelector('img')!;
    showCover(element, { ...content, volumeTitle: 'Romance dawn' });

    expect(element.querySelector('img')).toBe(image);
    image.dispatchEvent(new Event('error'));
    expect(defaultCover(element)).toEqual(['One Piece', 'Romance dawn']);
  });

  test('after a failure, a new image is tried again', () => {
    const element = box();
    showCover(element, content);
    element.querySelector('img')!.dispatchEvent(new Event('error'));
    showCover(element, { ...content, src: '/api/cover/9782723488532' });

    expect(element.dataset.cover).toBe('loading');
    expect(element.querySelector('img')).not.toBeNull();
  });
});

describe('coverName', () => {
  const book = { title: 'One Piece', series: 'One Piece', volumeTitle: 'Romance dawn', volume: 'Volume 1' };

  test('a Volume of a Series: its Volume title, else a title that is not the Series name, else its Volume', () => {
    expect(coverName(book)).toBe('Romance dawn');
    expect(coverName({ ...book, title: 'Romance dawn', volumeTitle: null })).toBe('Romance dawn');
    expect(coverName({ ...book, volumeTitle: null })).toBe('Volume 1');
    expect(coverName({ ...book, volumeTitle: null, volume: '' })).toBe('One Piece');
  });

  test('a book with no Series: its title', () => {
    expect(coverName({ ...book, title: 'Dune', series: null })).toBe('Dune');
  });
});
