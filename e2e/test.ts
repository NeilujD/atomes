// `test` and `expect` for every spec: import them from here, not from @playwright/test.
import { test as base, expect, type Page } from '@playwright/test';
import { readerDid } from './readers';

export { expect };

export const test = base.extend<{ signIn: () => Promise<void>; devServerPage: void }>({
  // Signs this browser in as the reader of this spec file, with no PDS
  // (/dev/sign-in-as, CORE-71). Through a request, not a page: opening the
  // Library it lands on would start a session check that the next page.goto
  // cuts, and the cut check sends WebKit to the sign-in screen.
  signIn: async ({ page, baseURL }, use, testInfo) => {
    await use(async () => {
      const did = readerDid(testInfo.project.name, testInfo.file);
      const answer = await page.request.get(`/dev/sign-in-as?did=${encodeURIComponent(did)}`, { maxRedirects: 0 });
      expect(answer.status(), `sign-in as ${did}`).toBe(303);
      // The session cookie is Secure. WebKit on Linux (CI) does not send a
      // Secure cookie to http://127.0.0.1, so the browser gets it without Secure.
      const [name, value] = answer.headers()['set-cookie'].split(';')[0].split(/=(.*)/);
      await page.context().addCookies([{ name, value, url: baseURL!, httpOnly: true, sameSite: 'Lax' }]);
    });
  },

  devServerPage: [
    async ({ context, baseURL }, use) => {
      // No test reaches a PDS or a real book source: the browser may ask only
      // the dev server. A request to any other host is refused, and fails the test.
      const origin = new URL(baseURL!).origin;
      const blocked: string[] = [];
      await context.route(
        (url) => url.origin !== origin,
        (route) => {
          blocked.push(route.request().url());
          return route.abort('blockedbyclient');
        },
      );
      // The Astro dev toolbar sits over the bottom of a phone screen, where
      // the main buttons are. Readers never see it: hide it.
      await context.addInitScript(() => {
        addEventListener('DOMContentLoaded', () => {
          const style = document.createElement('style');
          style.textContent = 'astro-dev-toolbar { display: none !important; }';
          document.head.append(style);
        });
      });
      await use();
      expect(blocked, 'requests to hosts other than the dev server').toEqual([]);
    },
    { auto: true },
  ],
});

// Quick Add by ISBN on Check a book, as a reader who types it.
export async function quickAdd(page: Page, isbn: string): Promise<void> {
  await page.goto('/check');
  await page.getByLabel('ISBN', { exact: true }).fill(isbn);
  await page.getByRole('button', { name: 'Look up' }).click();
  await page.getByRole('button', { name: 'Add to Library' }).click();
}
