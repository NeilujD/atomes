// @vitest-environment happy-dom
import { afterEach, describe, expect, test } from 'vitest';
import { copyCollection, saveCopy } from './library/copy';
import { memorySpace } from './library/memory-space.fake';
import { lockWhileSaving } from './save-lock';

const isbn = '9791099999016';

// The Quick Add screen: a form with one submit button inside a screen. The
// save writes a Copy, then waits until the test lets it end with `next`.
function quickAddScreen(next: () => Promise<'leave' | HTMLElement | undefined>) {
  document.body.innerHTML = `
    <div data-screen>
      <input data-isbn />
      <form data-form><button type="submit">Add to Library</button></form>
    </div>`;
  const screen = document.querySelector<HTMLElement>('[data-screen]')!;
  const form = document.querySelector<HTMLFormElement>('[data-form]')!;
  const button = form.querySelector('button')!;
  const { space, stored } = memorySpace();
  lockWhileSaving(form, screen, async () => {
    await saveCopy(space, { isbn, works: [`isbn:${isbn}`], createdAt: '2026-11-12T10:00:00.000Z' });
    return next();
  });
  return { screen, button, copies: () => stored(copyCollection) };
}

// A save the test ends by hand, like a slow network.
function later<T>() {
  let end!: (value: T) => void;
  const promise = new Promise<T>((resolve) => (end = resolve));
  return { promise, end };
}

const settle = () => new Promise((resolve) => setTimeout(resolve));

afterEach(() => {
  document.body.innerHTML = '';
});

describe('Add to Library, one Copy per tap', () => {
  test('a double tap saves one Copy', async () => {
    const save = later<'leave'>();
    const { button, copies } = quickAddScreen(() => save.promise);

    button.click();
    button.click();
    save.end('leave');
    await settle();

    expect(copies()).toHaveLength(1);
  });

  test('the screen stays locked when the save moves on to Series Onboarding, so a tap before it loads saves nothing', async () => {
    const { screen, button, copies } = quickAddScreen(() => Promise.resolve('leave'));

    button.click();
    await settle();
    button.click();
    await settle();

    expect(copies()).toHaveLength(1);
    expect(screen.inert).toBe(true);
    expect(button.getAttribute('aria-busy')).toBe('true');
  });

  test('a save that stays on the screen gives it back, with the focus where the save asks', async () => {
    const isbnField = () => document.querySelector<HTMLInputElement>('[data-isbn]')!;
    const { screen, button, copies } = quickAddScreen(() => Promise.resolve(isbnField()));

    button.click();
    await settle();

    expect(screen.inert).toBe(false);
    expect(button.hasAttribute('aria-busy')).toBe(false);
    expect(document.activeElement).toBe(isbnField());
    button.click();
    await settle();
    expect(copies()).toHaveLength(2);
  });

  test('Back from Series Onboarding shows the screen unlocked (the browser cache keeps the page as it was)', async () => {
    const { screen, button } = quickAddScreen(() => Promise.resolve('leave'));
    button.click();
    await settle();

    window.dispatchEvent(Object.assign(new Event('pageshow'), { persisted: true }));

    expect(screen.inert).toBe(false);
    expect(button.hasAttribute('aria-busy')).toBe(false);
  });
});
