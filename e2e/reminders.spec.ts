import { expect, test, type Page } from '@playwright/test';

async function createTextNote(page: Page, title: string) {
  await page.getByRole('button', { name: 'Create a text note' }).click();
  const composer = page.getByRole('form', { name: 'New note' });
  await composer.getByLabel('Title').fill(title);
  await composer.getByLabel('Note text').fill('Reminder regression note');
  await composer.getByRole('button', { name: 'Close' }).click();
  await expect(page.getByRole('button', { name: `Open note: ${title}` })).toBeVisible();
}

async function tomorrowInput(page: Page) {
  return page.evaluate(() => {
    const date = new Date();
    date.setDate(date.getDate() + 1);
    const year = date.getFullYear().toString().padStart(4, '0');
    const month = (date.getMonth() + 1).toString().padStart(2, '0');
    const day = date.getDate().toString().padStart(2, '0');
    return { date: `${year}-${month}-${day}`, time: '09:30' };
  });
}

test('reminders can be scheduled, viewed, completed, and restored with their note', async ({
  page,
}) => {
  await page.goto('./');
  await createTextNote(page, 'Call tomorrow');

  await page.getByRole('button', { name: 'Open note: Call tomorrow' }).click();
  const editor = page.getByRole('dialog', { name: 'Edit note' });
  await editor.getByRole('button', { name: 'Add reminder' }).click();
  const input = await tomorrowInput(page);
  await editor.getByLabel('Date').fill(input.date);
  await editor.getByLabel('Time').fill(input.time);
  await editor.getByRole('button', { name: 'Save reminder' }).click();
  await expect(editor.getByRole('button', { name: 'Change' })).toBeVisible();
  await editor.getByRole('button', { name: 'Close' }).click();

  const card = page.locator('[data-note-card]').filter({ hasText: 'Call tomorrow' });
  await expect(card.locator('.note-card-reminder')).toContainText('Tomorrow');

  const stored = await page.evaluate(async () => {
    const db = await import('/notes/src/db/index.ts');
    const note = (await db.notesDatabase.notes.toArray()).find(
      (item) => item.title === 'Call tomorrow',
    );
    const reminder = note
      ? await db.notesDatabase.reminders.where('noteId').equals(note.id).first()
      : undefined;
    return { noteId: note?.id ?? null, reminder: reminder ?? null };
  });
  expect(stored.reminder).toEqual(
    expect.objectContaining({ status: 'active', timeZone: expect.any(String) }),
  );

  await page.getByRole('button', { name: 'Reminders' }).click();
  await expect(page.getByRole('heading', { name: 'Reminders', level: 1 })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Upcoming', level: 2 })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Open note: Call tomorrow' })).toBeVisible();

  await page.getByRole('button', { name: 'Open note: Call tomorrow' }).click();
  const reminderEditor = page.getByRole('dialog', { name: 'Edit note' });
  await reminderEditor.getByRole('button', { name: 'Complete' }).click();
  await expect(reminderEditor.getByText('Reminder completed')).toBeVisible();
  await reminderEditor.getByRole('button', { name: 'Close' }).click();

  await expect(
    page.getByRole('heading', { name: 'Completed & dismissed', level: 2 }),
  ).toBeVisible();
  await expect(page.locator('.note-card-reminder').filter({ hasText: 'Completed' })).toBeVisible();

  await page.getByRole('button', { name: 'Open note: Call tomorrow' }).click();
  const reactivateEditor = page.getByRole('dialog', { name: 'Edit note' });
  await reactivateEditor.getByRole('button', { name: 'Change' }).click();
  await reactivateEditor.getByRole('button', { name: 'Save reminder' }).click();
  await reactivateEditor.getByRole('button', { name: 'Close' }).click();
  await expect(page.getByRole('heading', { name: 'Upcoming', level: 2 })).toBeVisible();

  const reminderCard = page.locator('[data-note-card]').filter({ hasText: 'Call tomorrow' });
  await reminderCard.getByRole('button', { name: 'Move note to trash: Call tomorrow' }).click();
  await expect(page.getByRole('button', { name: 'Open note: Call tomorrow' })).not.toBeVisible();

  const reminderStillStored = await page.evaluate(async (noteId) => {
    const db = await import('/notes/src/db/index.ts');
    return noteId ? db.notesDatabase.reminders.where('noteId').equals(noteId).count() : 0;
  }, stored.noteId);
  expect(reminderStillStored).toBe(1);

  await page.getByRole('button', { name: 'Trash' }).click();
  await page.getByRole('button', { name: 'Restore note: Call tomorrow' }).click();
  await page.getByRole('button', { name: 'Reminders' }).click();
  await expect(page.getByRole('button', { name: 'Open note: Call tomorrow' })).toBeVisible();
});

test('has:reminder tracks active reminder changes without leaving search', async ({ page }) => {
  await page.goto('./');
  await createTextNote(page, 'Search reminder');

  await page.getByLabel('Search notes').fill('has:reminder');
  await expect(page.getByRole('heading', { name: 'No matching notes', level: 2 })).toBeVisible();
  await page.getByLabel('Search notes').fill('Search reminder');
  await page.getByRole('button', { name: 'Open note: Search reminder' }).click();

  const editor = page.getByRole('dialog', { name: 'Edit note' });
  await editor.getByRole('button', { name: 'Add reminder' }).click();
  const input = await tomorrowInput(page);
  await editor.getByLabel('Date').fill(input.date);
  await editor.getByLabel('Time').fill(input.time);
  await editor.getByRole('button', { name: 'Save reminder' }).click();
  await editor.getByRole('button', { name: 'Close' }).click();

  await page.getByLabel('Search notes').fill('has:reminder');
  await expect(page.getByRole('button', { name: 'Open note: Search reminder' })).toBeVisible();

  await page.getByRole('button', { name: 'Open note: Search reminder' }).click();
  await page
    .getByRole('dialog', { name: 'Edit note' })
    .getByRole('button', { name: 'Dismiss' })
    .click();
  await page
    .getByRole('dialog', { name: 'Edit note' })
    .getByRole('button', { name: 'Close' })
    .click();
  await expect(page.getByRole('button', { name: 'Open note: Search reminder' })).not.toBeVisible();
});
