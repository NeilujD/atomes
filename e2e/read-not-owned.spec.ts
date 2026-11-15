import { expect, quickAdd, test } from './test';

// A Volume read but not owned is not Missing (CORE-102): its spine is outlined
// with the read mark, it is not counted Missing nor on To Buy, and its Volume
// sheet offers "Add to To Buy".

test('a Volume read but not owned is not Missing, and "Add to To Buy" puts it on To Buy by hand', async ({ page, signIn }) => {
  test.slow();
  await signIn();
  // Spy x Family 16, Kurokawa: its whole Edition Line is recorded. The reader owns every Volume but 3.
  await quickAdd(page, '9791042021030');
  await expect(page.getByRole('heading', { name: /Which Volumes of Spy x Family/i })).toBeVisible();
  await page.getByRole('button', { name: 'Yes' }).click();
  await page.getByRole('button', { name: /^Volume 3, owned/ }).click();
  await expect(page.getByRole('button', { name: /^Volume 3, missing/ })).toBeVisible();
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(page).toHaveURL(/\/series/);
  await expect(page.getByRole('region', { name: 'Missing Volumes' }).getByRole('listitem')).toHaveText(['3']);

  // Volume 3 read (borrowed): no longer Missing.
  const volumes = page.getByRole('region', { name: 'Volumes' });
  await volumes.getByRole('button', { name: 'Volume 3: not owned' }).click();
  const sheet = page.getByRole('dialog');
  await sheet.getByRole('button', { name: 'Mark read' }).click();
  await expect(volumes.getByRole('button', { name: 'Volume 3: read, not owned' })).toBeVisible();
  await expect(page.getByRole('region', { name: 'Missing Volumes' })).toHaveCount(0);

  // The reader wants it again.
  await sheet.getByRole('button', { name: 'Add to To Buy' }).click();
  await expect(sheet.getByText('On your To Buy list')).toBeVisible();
  await sheet.getByRole('button', { name: 'Close' }).click();

  await page.getByRole('navigation', { name: 'Main' }).getByRole('link', { name: 'To Buy' }).click();
  await expect(page.getByRole('region', { name: 'Added by hand' }).getByRole('listitem').filter({ hasText: /Spy x Family/i })).toBeVisible();
  await expect(page.getByRole('button', { name: /^Spy x Family · .*\(3\)/i })).toHaveCount(0);
});
