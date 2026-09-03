import { expect, test } from '@playwright/test';

test('search uses attachment metadata indexes without requiring attachment table scans', async ({
  page,
}) => {
  await page.goto('./');
  await expect(page.getByRole('heading', { name: 'Notes', level: 1 })).toBeVisible();

  const indexes = await page.evaluate(async () => {
    const db = await import('/notes/src/db/index.ts');
    const notes = new db.NotesRepository(db.notesDatabase);
    const note = await notes.create({ title: 'Indexed attachment note', content: 'metadata only' });
    await db.notesDatabase.attachments.add({
      id: crypto.randomUUID(),
      noteId: note.id,
      name: 'massive-reference-photo.jpg',
      mimeType: 'image/jpeg',
      size: 4,
      checksum: 'scale-checksum',
      data: new Blob([new Uint8Array([1, 2, 3, 4])], { type: 'image/jpeg' }),
      createdAt: Date.now(),
    });
    const table = db.notesDatabase.attachments as typeof db.notesDatabase.attachments & {
      toArray: () => Promise<never>;
    };
    table.toArray = async () => {
      throw new Error('Search must not scan Blob-bearing attachment rows.');
    };
    return db.notesDatabase.attachments.schema.indexes.map((index) => index.name);
  });

  expect(indexes).toContain('[noteId+name]');
  expect(indexes).toContain('[noteId+mimeType]');

  await page.getByRole('searchbox', { name: 'Search notes' }).fill('massive reference photo');
  await expect(page.getByText('Attachment · massive-reference-photo.jpg')).toBeVisible();
});

test('settings exposes local storage health and keeps keyboard focus inside the dialog', async ({
  page,
}) => {
  await page.goto('./');
  await page.getByRole('button', { name: 'More options' }).click();
  await page.getByRole('menuitem', { name: 'Settings' }).click();
  const settings = page.getByRole('dialog', { name: 'Settings' });
  await settings.getByRole('button', { name: 'Data & advanced' }).click();
  await expect(settings.getByText('Local storage health')).toBeVisible();

  for (let index = 0; index < 20; index += 1) await page.keyboard.press('Tab');
  expect(
    await page.evaluate(() => Boolean(document.activeElement?.closest('[role="dialog"]'))),
  ).toBe(true);
});
