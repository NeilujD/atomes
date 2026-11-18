// Runs once before the journeys (playwright.config.ts, project `warm`). The dev
// server builds each page the first time it is asked for. In CI, with both browsers
// running, that first build took up to 8.8 s (/onboarding, WebKit), which is most
// of the 10 s a journey waits for the next screen. Asking for every page here
// builds them before any journey runs. Pages render with no session.
import { expect, test } from './test';

const pages = ['/', '/library', '/book', '/series', '/to-buy', '/statistics', '/check', '/onboarding', '/settings', '/sign-in'];

test('build every page once', async ({ request }) => {
  test.setTimeout(120_000);
  for (const page of pages) {
    const answer = await request.get(page, { maxRedirects: 0 });
    expect(answer.status(), page).toBeLessThan(500);
  }
});
