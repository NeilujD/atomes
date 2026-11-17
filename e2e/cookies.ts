import type { Page } from '@playwright/test';

// WebKit on Linux (CI) does not keep a Secure cookie of http://127.0.0.1
// (test.ts): there, the cookies of the Invite and of the session go to the
// browser without Secure, as the signIn fixture does. Chromium keeps the real ones.
export async function keepCookiesWithoutSecure(page: Page, baseURL: string) {
  await page.route(/\/api\/(invite|sign-in\/check)$/, async (route) => {
    const response = await route.fetch();
    const cookies = response
      .headersArray()
      .filter(({ name }) => name.toLowerCase() === 'set-cookie')
      .map(({ value }) => value.split(';')[0].split(/=(.*)/))
      .filter(([, value]) => value);
    if (cookies.length > 0) {
      await page.context().addCookies(cookies.map(([name, value]) => ({ name, value, url: baseURL, httpOnly: true, sameSite: 'Lax' as const })));
    }
    const headers = Object.fromEntries(Object.entries(response.headers()).filter(([name]) => name !== 'set-cookie'));
    await route.fulfill({ response, headers });
  });
}
