import { expect, test } from '@playwright/test';

test('Notes owner requires explicit approval before handing any local summary to Hub', async ({
  page,
}) => {
  await page.goto('/');
  await expect(page.locator('#root')).toContainText('Notes');
  await page.evaluate(() => {
    (window as unknown as { __notesHubMessage: unknown }).__notesHubMessage = null;
    window.addEventListener('message', (event) => {
      if (event.origin === location.origin) {
        (window as unknown as { __notesHubMessage: unknown }).__notesHubMessage = event.data;
      }
    });
  });
  const nonce = 'a'.repeat(32);
  const opening = page.waitForEvent('popup');
  await page.evaluate((request) => {
    window.open('/?hubNotes=' + request, '_blank');
  }, nonce);
  const popup = await opening;
  await expect(
    popup.getByRole('dialog', { name: 'Share your Notes overview?' }),
  ).toBeVisible();

  expect(await page.evaluate(() => (window as unknown as { __notesHubMessage: unknown })
    .__notesHubMessage)).toBeNull();
  await popup.getByRole('button', { name: 'Share once' }).click();
  await expect.poll(() =>
    page.evaluate(() => Boolean((window as unknown as { __notesHubMessage: unknown })
      .__notesHubMessage)),
  ).toBe(true);
  const message = await page.evaluate(() =>
    (window as unknown as { __notesHubMessage: Record<string, unknown> }).__notesHubMessage);
  expect(message.type).toBe('thiepn:notes-hub-local:v1');
  expect(message.nonce).toBe(nonce);
  expect(message.snapshot).toMatchObject({
    schema: 'thiepn:notes-hub-local',
    version: 1,
    source: 'notes-local-device',
  });
  expect(message.snapshot).toHaveProperty('notes');
  expect(message.snapshot).toHaveProperty('reminders');
  expect(JSON.stringify(message)).not.toMatch(/content|accessToken|refreshToken/);
  await popup.close();
});
