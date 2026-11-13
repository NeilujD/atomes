import { describe, expect, test } from 'vitest';
import { accountKey, gateBootScript } from './gate-boot';

describe('gateBootScript', () => {
  // Runs the exact script that AppShell inlines in <head>, against a fake page.
  function boot(stored: string | null | Error) {
    const dataset: Record<string, string> = {};
    const localStorage = {
      getItem: (key: string) => {
        if (stored instanceof Error) throw stored;
        return key === accountKey ? stored : null;
      },
    };
    const document = { documentElement: { dataset } };
    // eslint-disable-next-line @typescript-eslint/no-implied-eval -- the script is a string by design: it is inlined in HTML.
    const run = new Function('localStorage', 'document', gateBootScript) as (ls: typeof localStorage, doc: typeof document) => void;
    run(localStorage, document);
    return dataset.gate;
  }

  test('hides the screen when the device saw no account', () => {
    expect(boot(null)).toBe('pending');
  });

  test('shows the screen at once when the device saw an account', () => {
    expect(boot(JSON.stringify({ did: 'did:plc:reader', handle: 'reader.test' }))).toBeUndefined();
  });

  test('shows the screen when storage is blocked: the gate still runs', () => {
    expect(boot(new Error('SecurityError'))).toBeUndefined();
  });
});
