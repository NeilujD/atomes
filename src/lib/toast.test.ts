// @vitest-environment happy-dom
import { fireEvent, screen } from '@testing-library/preact';
import { beforeEach, describe, expect, test, vi } from 'vitest';
import { toast } from './toast';

// The toast region and template, as AppShell has them.
beforeEach(() => {
  document.body.innerHTML = `
    <div data-toasts></div>
    <template data-toast-template>
      <div data-toast>
        <p data-toast-text></p>
        <button type="button" data-toast-action hidden></button>
        <button type="button" aria-label="Close" data-toast-close></button>
      </div>
    </template>`;
});

describe('A toast with an action', () => {
  test('its button runs the action once and closes the toast', () => {
    const run = vi.fn();
    toast('55 Copies added.', { action: { label: 'Undo', run } });

    fireEvent.click(screen.getByRole('button', { name: 'Undo' }));

    expect(run).toHaveBeenCalledOnce();
    expect(screen.queryByText('55 Copies added.')).toBeNull();
  });

  test('a toast with no action shows no action button', () => {
    toast('Saved.');

    expect(screen.getByText('Saved.')).toBeTruthy();
    expect(screen.queryAllByRole('button').map((button) => button.getAttribute('aria-label'))).toEqual(['Close']);
  });
});
