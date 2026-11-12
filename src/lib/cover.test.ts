// @vitest-environment happy-dom
import { describe, expect, test } from 'vitest';
import { showCover } from './cover';

const content = { src: '/api/cover/9782723488525', title: 'One Piece', volume: 'Volume 1' };

function box(): HTMLElement {
  return document.createElement('div');
}

function defaultCover(element: HTMLElement): string | null {
  return element.querySelector('.book-cover-default')?.textContent ?? null;
}

describe('showCover', () => {
  test('no image: the default cover with the title and Volume', () => {
    const element = box();
    showCover(element, { ...content, src: null });

    expect(element.dataset.cover).toBe('default');
    expect(element.querySelector('img')).toBeNull();
    expect(defaultCover(element)).toBe('One PieceVolume 1');
  });

  test('pulses while the image loads, then shows it', () => {
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
    expect(defaultCover(element)).toBe('One PieceVolume 1');
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

  test('the same image keeps loading; a later failure shows the newest title', () => {
    const element = box();
    showCover(element, content);
    const image = element.querySelector('img')!;
    showCover(element, { ...content, title: 'One Piece: Romance Dawn', volume: '' });

    expect(element.querySelector('img')).toBe(image);
    image.dispatchEvent(new Event('error'));
    expect(defaultCover(element)).toBe('One Piece: Romance Dawn');
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
