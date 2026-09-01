import { expect, test } from '@playwright/test';

async function waitForServiceWorkerControl(page: import('@playwright/test').Page) {
  await page.evaluate(async () => {
    if (!('serviceWorker' in navigator)) throw new Error('Service workers are unavailable.');
    await navigator.serviceWorker.ready;
  });

  const controlled = await page.evaluate(() => Boolean(navigator.serviceWorker.controller));
  if (!controlled) await page.reload();

  await expect
    .poll(() => page.evaluate(() => Boolean(navigator.serviceWorker.controller)), {
      message: 'The production page should be controlled by the Notes service worker.',
    })
    .toBe(true);
}

async function readReminderSnapshot(page: import('@playwright/test').Page, title: string) {
  return page.evaluate(async (noteTitle) => {
    const database = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open('thiepn-notes');
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });

    try {
      const readAll = <T>(storeName: string) =>
        new Promise<T[]>((resolve, reject) => {
          const transaction = database.transaction(storeName, 'readonly');
          const request = transaction.objectStore(storeName).getAll();
          request.onsuccess = () => resolve(request.result as T[]);
          request.onerror = () => reject(request.error);
        });

      const notes = await readAll<{ id: string; title: string }>('notes');
      const note = notes.find((item) => item.title === noteTitle);
      if (!note) return null;

      const reminders = await readAll<{
        id: string;
        noteId: string;
        dueAt: number;
        status: string;
      }>('reminders');
      const reminder = reminders.find((item) => item.noteId === note.id);

      return reminder ? { id: reminder.id, dueAt: reminder.dueAt, status: reminder.status } : null;
    } finally {
      database.close();
    }
  }, title);
}

test('reminders survive offline cold reloads and can be changed without network access', async ({
  page,
  context,
}) => {
  await page.goto('./');

  await page.getByRole('button', { name: 'Create a text note' }).click();
  const composer = page.getByRole('form', { name: 'New note' });
  await composer.getByLabel('Title').fill('Offline reminder');
  await composer.getByLabel('Note text').fill('Reminder data must remain local.');
  await composer.getByRole('button', { name: 'Close' }).click();

  await page.getByRole('button', { name: 'Open note: Offline reminder' }).click();
  const editor = page.getByRole('dialog', { name: 'Edit note' });
  await editor.getByRole('button', { name: 'Add reminder' }).click();
  await editor.getByRole('button', { name: 'Tomorrow' }).click();
  await editor.getByLabel('Time').fill('10:15');
  await editor.getByRole('button', { name: 'Save reminder' }).click();
  await editor.getByRole('button', { name: 'Close' }).click();

  await waitForServiceWorkerControl(page);
  await context.setOffline(true);
  await page.reload({ waitUntil: 'domcontentloaded' });

  await page.getByRole('button', { name: 'Reminders' }).click();
  await expect(page.getByRole('button', { name: 'Open note: Offline reminder' })).toBeVisible();

  const reminderBefore = await readReminderSnapshot(page, 'Offline reminder');
  expect(reminderBefore).toEqual(
    expect.objectContaining({
      id: expect.any(String),
      dueAt: expect.any(Number),
      status: 'active',
    }),
  );

  await page.getByRole('button', { name: 'Open note: Offline reminder' }).click();
  const offlineEditor = page.getByRole('dialog', { name: 'Edit note' });
  const snoozeStartedAt = await page.evaluate(() => Date.now());
  await offlineEditor.getByRole('button', { name: 'Snooze 1 hour' }).click();
  await offlineEditor.getByRole('button', { name: 'Close' }).click();

  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.getByRole('button', { name: 'Reminders' }).click();
  await expect(page.getByRole('button', { name: 'Open note: Offline reminder' })).toBeVisible();

  const reminderAfter = await readReminderSnapshot(page, 'Offline reminder');

  expect(reminderAfter?.id).toBe(reminderBefore?.id);
  expect(reminderAfter?.status).toBe('active');
  expect(reminderAfter?.dueAt).not.toBe(reminderBefore?.dueAt);
  expect(reminderAfter?.dueAt).toBeGreaterThanOrEqual(snoozeStartedAt + 59 * 60 * 1000);
  expect(reminderAfter?.dueAt).toBeLessThanOrEqual(snoozeStartedAt + 61 * 60 * 1000);

  await context.setOffline(false);
});
