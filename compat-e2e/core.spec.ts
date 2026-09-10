import { expect, test } from '@playwright/test';

test('core capture, persistence, editing, and local search work across browser engines', async ({
  page,
}) => {
  await page.goto('./');
  await expect(page.getByRole('heading', { name: 'Notes', level: 1 })).toBeVisible();

  await page.getByRole('button', { name: 'Create a text note' }).click();
  await page.getByLabel('Title').fill('Cross-browser field note');
  await page
    .getByLabel('Note text')
    .fill('Portable browser coverage keeps local-first writing dependable.');
  await page.getByRole('button', { name: 'Close' }).click();

  const note = page.getByRole('button', { name: 'Open note: Cross-browser field note' });
  await expect(note).toBeVisible();

  await page.reload();
  await expect(note).toBeVisible();
  await note.click();
  const editor = page.getByRole('dialog', { name: 'Edit note' });
  await editor
    .getByLabel('Note text')
    .fill('Portable browser coverage keeps local-first writing dependable after editing.');
  await editor.getByRole('button', { name: 'Close' }).click();

  const search = page.getByRole('searchbox', { name: 'Search notes' });
  await search.fill('dependable after editing');
  await expect(page.getByRole('button', { name: 'Open note: Cross-browser field note' })).toBeVisible();
});

test('mobile navigation and workspace context remain usable across browser engines', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('./');

  const navigation = page.getByRole('navigation', { name: 'Mobile navigation' });
  await expect(navigation).toBeVisible();
  await expect(page).toHaveTitle('Notes');
  await expect(page.getByTestId('workspace-announcer')).toHaveText('Notes workspace');

  const dimensions = await page.evaluate(() => ({
    body: document.body.scrollWidth,
    document: document.documentElement.scrollWidth,
    viewport: innerWidth,
  }));
  expect(dimensions.body).toBeLessThanOrEqual(dimensions.viewport);
  expect(dimensions.document).toBeLessThanOrEqual(dimensions.viewport);

  await navigation.getByRole('button', { name: 'Find a note' }).click();
  await expect(page.getByRole('searchbox', { name: 'Search notes' })).toBeFocused();
  await expect(page).toHaveTitle('Search — Notes');
  await expect(page.getByTestId('workspace-announcer')).toHaveText('Search workspace');

  await navigation.getByRole('button', { name: 'Show reminders' }).click();
  await expect(page.getByRole('heading', { name: 'Reminders', level: 1 })).toBeVisible();
  await expect(page).toHaveTitle('Reminders — Notes');
  await expect(page.getByTestId('workspace-announcer')).toHaveText('Reminders workspace');
});
