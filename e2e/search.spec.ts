import type { Page } from "@playwright/test";
import { expect, quickAdd, test } from "./test";

// Search mode of Check a book (ADR 0021, CORE-184, CORE-190) on the recorded
// Catalog: an old title finds the Work, whose Editions come newest first under
// the title printed on each. A picked Edition gets the Shelf Check answer of a scan;
// "I have it" makes the Copy of Quick Add (CORE-185).
// The Preferred Language picks the Editions shown (CORE-186).

// Searches the words and opens the Christie Work.
async function openChristie(page: Page) {
  await page.getByLabel("Title of the book").fill("Dix petits nègres");
  await page.getByRole("button", { name: "Search", exact: true }).click();
  await page
    .getByRole("button", { name: /^Dix Petits Nègres Agatha Christie · 1939/ })
    .click();
}

// The reader's app language is English, so the Preferred Language is too: the
// French Editions of the French words come apart, after the English ones (CORE-186).
const editions = (page: Page) =>
  page
    .getByRole("list", { name: "Français · matches your search" })
    .getByRole("listitem");

test("Check → Search → an old title → Work → Edition → the Shelf Check answer → Add to To Buy", async ({
  page,
  signIn,
}) => {
  await signIn();
  // With no mode in the address, Check a book opens on Scan.
  await page.goto("/check");
  await expect(page.getByRole("radio", { name: "Scan" })).toBeChecked();
  await expect(page.getByLabel("ISBN", { exact: true })).toBeVisible();

  await page.getByRole("radio", { name: "Search" }).check();
  await expect(page).toHaveURL(/\/check\?mode=search$/);
  // One typed-ISBN field, in Scan mode only.
  await expect(page.getByLabel("ISBN", { exact: true })).toBeHidden();
  await openChristie(page);
  await expect(page).toHaveURL(
    /\/check\?mode=search&q=Dix\+petits\+n%C3%A8gres$/,
  );

  // Newest first: the 2025 Editions, then 2021, then 2020, all titled "Ils étaient dix".
  await expect(editions(page).first().locator(".search-title")).toHaveText(
    "Ils étaient dix",
  );
  await expect(
    page.getByText("23 Editions with no ISBN are not shown."),
  ).toBeVisible();
  const livreDePoche2020 = editions(page).filter({
    hasText: "ISBN 9782253241782",
  });
  await expect(livreDePoche2020).toContainText("2020 · le Livre de poche");
  await livreDePoche2020
    .getByRole("button", { name: /^Ils étaient dix/ })
    .click();

  // The answer of a scan; from Check, "I have it" is the main action.
  const answer = page.getByRole("dialog", { name: "Shelf Check" });
  await expect(
    answer.getByText("Not in your Library", { exact: true }),
  ).toBeVisible();
  await expect(answer.getByRole("button", { name: "I have it" })).toHaveClass(
    /result-primary/,
  );
  await answer.getByRole("button", { name: "Add to To Buy" }).click();
  await expect(answer).toBeHidden();
  await expect(
    page
      .getByRole("status")
      .filter({ hasText: "Ils étaient dix is on your To Buy list." })
      .first(),
  ).toBeVisible();

  // Back on the Editions; a reload keeps the words and the results.
  await expect(livreDePoche2020).toBeVisible();
  await page.reload();
  await expect(page.getByLabel("Title of the book")).toHaveValue(
    "Dix petits nègres",
  );
  await expect(
    page.getByRole("button", {
      name: /^Dix Petits Nègres Agatha Christie · 1939/,
    }),
  ).toBeVisible();

  await page
    .getByRole("navigation", { name: "Main" })
    .getByRole("link", { name: "To Buy" })
    .click();
  const byHand = page
    .getByRole("region", { name: "Added by hand" })
    .getByRole("listitem");
  await expect(byHand.filter({ hasText: "ISBN 9782253241782" })).toContainText(
    "Ils étaient dix",
  );
});

test("To Buy → Search mode, where Add to To Buy is the main action of the answer", async ({
  page,
  signIn,
}) => {
  await signIn();
  // The "+" of To Buy opens Search mode (its empty-list button too: ToBuy.test.tsx).
  await page.goto("/to-buy");
  await page.getByRole("link", { name: "Add a book" }).click();
  await expect(page).toHaveURL(/\/check\?mode=search&from=to-buy$/);
  await expect(page.getByRole("radio", { name: "Search" })).toBeChecked();
  await openChristie(page);

  // The 1977 Edition, which BnF knows only by its ISBN-10 (2-253-01709-4).
  await editions(page)
    .filter({ hasText: "ISBN 9782253017097" })
    .getByRole("button", { name: /^Dix petits nègres/ })
    .click();
  const answer = page.getByRole("dialog", { name: "Shelf Check" });
  await expect(
    answer.getByText("Not in your Library", { exact: true }),
  ).toBeVisible();
  const add = answer.getByRole("button", { name: "Add to To Buy" });
  await expect(add).toHaveClass(/result-primary/);
  await add.click();
  await expect(
    page
      .getByRole("status")
      .filter({ hasText: "Dix petits nègres is on your To Buy list." })
      .first(),
  ).toBeVisible();

  await page
    .getByRole("navigation", { name: "Main" })
    .getByRole("link", { name: "To Buy" })
    .click();
  const byHand = page
    .getByRole("region", { name: "Added by hand" })
    .getByRole("listitem");
  await expect(byHand.filter({ hasText: "ISBN 9782253017097" })).toContainText(
    "Dix petits nègres",
  );
});

test("Search: an owned Edition gets the owned answer of a scan, with nothing to buy", async ({
  page,
  signIn,
}) => {
  await signIn();
  // A Copy of the 2020 Edition, added by its ISBN.
  await quickAdd(page, "9782253241782");
  await expect(
    page
      .getByRole("status")
      .filter({ hasText: "Ils étaient dix is in your Library." })
      .first(),
  ).toBeVisible();

  // An old Search link opens Search mode.
  await page.goto("/search");
  await expect(page).toHaveURL(/\/check\?mode=search$/);
  await openChristie(page);
  await editions(page)
    .filter({ hasText: "ISBN 9782253241782" })
    .getByRole("button", { name: /^Ils étaient dix/ })
    .click();

  const answer = page.getByRole("dialog", { name: "Shelf Check" });
  await expect(
    answer.getByText("Already in your Library", { exact: true }),
  ).toBeVisible();
  await expect(
    answer.getByRole("button", { name: "Add to To Buy" }),
  ).toHaveCount(0);
  // Back closes the answer, not the page: the Editions stay.
  await page.goBack();
  await expect(answer).toBeHidden();
  await expect(editions(page).first()).toBeVisible();
});

test('Quick Add → Search by title or author → a Volume Work → Edition → "I have it" → Series Onboarding; Search then marks it', async ({
  page,
  signIn,
}) => {
  await signIn();
  // The link under the scanner of Quick Add (CORE-185): Search mode, on the same page.
  await page.goto("/check");
  await page.getByRole("link", { name: "Search by title or author" }).click();
  await expect(page.getByRole("radio", { name: "Search" })).toBeChecked();
  await expect(page).toHaveURL(/\/check\?mode=search$/);

  await page.getByLabel("Title of the book").fill("Le Combat des chefs");
  await page.getByRole("button", { name: "Search", exact: true }).click();
  await page
    .getByRole("button", {
      name: /^Le Combat des chefs René Goscinny, Albert Uderzo · 1966/,
    })
    .click();
  // Astérix 7, Hachette, 2005: a Volume of a Series this reader neither follows nor dropped.
  await editions(page)
    .filter({ hasText: "ISBN 9782012101395" })
    .getByRole("button")
    .click();

  const answer = page.getByRole("dialog", { name: "Shelf Check" });
  await expect(
    answer.getByText("Not in your Library", { exact: true }),
  ).toBeVisible();
  const haveIt = answer.getByRole("button", { name: "I have it" });
  await expect(haveIt).toHaveClass(/result-primary/);
  await haveIt.click();
  await expect(page).toHaveURL(/\/onboarding\?isbn=9782012101395$/);
  await expect(
    page.getByRole("heading", { name: /^Which Volumes/ }),
  ).toBeVisible();

  // The Copy was saved before Series Onboarding: it is in the Library.
  await page.goto("/library");
  await expect(
    page
      .locator("main")
      .getByText(/combat des chefs/i)
      .first(),
  ).toBeVisible();

  // Search now marks the Work and the exact Edition.
  await page.goto("/check?mode=search&q=Le+Combat+des+chefs");
  const work = page.getByRole("button", {
    name: /^Le Combat des chefs René Goscinny, Albert Uderzo · 1966/,
  });
  await expect(work).toContainText("Already in your Library");
  await work.click();
  await expect(
    editions(page).filter({ hasText: "ISBN 9782012101395" }),
  ).toContainText("In Library");
  await expect(editions(page).filter({ hasText: "In Library" })).toHaveCount(1);
});

test('Settings → French preferred → "And Then There Were None" → a French section, then an English section', async ({
  page,
  signIn,
}) => {
  await signIn();
  await page.goto("/settings");
  const preferred = page.getByRole("radiogroup", {
    name: "Preferred Language",
  });
  // With no choice, it follows the app language.
  await expect(preferred.getByRole("radio", { name: "English" })).toBeChecked();
  await preferred.getByRole("radio", { name: "Français" }).check();
  await page.reload();
  await expect(
    preferred.getByRole("radio", { name: "Français" }),
  ).toBeChecked();

  await page.goto("/check?mode=search");
  await page.getByLabel("Title of the book").fill("And Then There Were None");
  await page.getByRole("button", { name: "Search", exact: true }).click();
  await page
    .getByRole("button", {
      name: /^And Then There Were None Agatha Christie · 1939/,
    })
    .click();

  await expect(page.locator(".search-section")).toHaveText([
    "Français",
    "English · matches your search",
  ]);
  const french = page.getByRole("list", { name: "Français", exact: true });
  await expect(
    french.getByRole("listitem").first().locator(".search-title"),
  ).toHaveText("Ils étaient dix");
  await expect(french.locator(".search-tag")).toHaveCount(0);
  const english = page
    .getByRole("list", { name: "English · matches your search" })
    .getByRole("listitem");
  await expect(english.filter({ hasText: "ISBN 9780062325549" })).toContainText(
    "And Then There Were None",
  );
  await expect(english.first().locator(".search-tag")).toHaveText("English");
});
