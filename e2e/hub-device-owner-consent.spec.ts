import { expect, test } from '@playwright/test';

test('Notes owner requires explicit approval before handing any local summary to Hub', async ({
  page,
  context,
}) => {
  // A true Hub opener must live at '/' rather than Notes' scoped /notes/ base.
  // Route only that opener, leaving the popup to load the REAL Notes Vite app.
  await context.route('http://127.0.0.1:4173/', (route) =>
    route.fulfill({
      contentType: 'text/html',
      body: '<!doctype html><title>Hub owner origin</title><button id="launch">Open Notes</button><script>window.__notesHubMessage=null;window.addEventListener("message",e=>{if(e.origin===location.origin)window.__notesHubMessage=e.data});document.getElementById("launch").onclick=()=>window.open("/notes/?hubNotes="+ "a".repeat(32),"_blank");</script>',
    }),
  );
  await page.goto('http://127.0.0.1:4173/');
  const opening = page.waitForEvent('popup');
  await page.getByRole('button', { name: 'Open Notes' }).click();
  const popup = await opening;
  await expect(popup.getByRole('dialog', { name: 'Share your Notes overview?' })).toBeVisible();

  expect(
    await page.evaluate(
      () => (window as unknown as { __notesHubMessage: unknown }).__notesHubMessage,
    ),
  ).toBeNull();
  await popup.getByRole('button', { name: 'Share once' }).click();
  await expect
    .poll(() =>
      page.evaluate(() =>
        Boolean((window as unknown as { __notesHubMessage: unknown }).__notesHubMessage),
      ),
    )
    .toBe(true);
  const message = await page.evaluate(
    () => (window as unknown as { __notesHubMessage: Record<string, unknown> }).__notesHubMessage,
  );
  expect(message.type).toBe('thiepn:notes-hub-local:v1');
  expect(message.nonce).toBe('a'.repeat(32));
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
