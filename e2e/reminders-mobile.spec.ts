import { expect, test } from '@playwright/test';

test('reminder editing remains usable at the minimum supported mobile viewport', async ({
  page,
}) => {
  await page.setViewportSize({ width: 320, height: 720 });
  await page.goto('./');

  await page.getByRole('button', { name: 'Create a text note' }).click();
  const composer = page.getByRole('form', { name: 'New note' });
  await composer.getByLabel('Title').fill('Mobile reminder');
  await composer.getByRole('button', { name: 'Close' }).click();

  await page.getByRole('button', { name: 'Open note: Mobile reminder' }).click();
  const editor = page.getByRole('dialog', { name: 'Edit note' });
  await editor.getByRole('button', { name: 'Add reminder' }).click();

  await expect(editor.getByRole('group', { name: 'Set reminder' })).toBeVisible();
  await expect(editor.getByRole('button', { name: 'Today' })).toBeVisible();
  await expect(editor.getByRole('button', { name: 'Tomorrow' })).toBeVisible();
  await expect(editor.getByLabel('Date')).toBeVisible();
  await expect(editor.getByLabel('Time')).toBeVisible();
  await expect(editor.getByRole('button', { name: 'Save reminder' })).toBeVisible();

  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  expect(overflow).toBeLessThanOrEqual(1);
});
