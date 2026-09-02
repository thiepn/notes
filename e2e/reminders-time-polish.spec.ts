import { expect, test, type Page } from '@playwright/test';

async function seedReminderLibrary(page: Page) {
  await page.goto('./');
  return page.evaluate(async () => {
    const db = await import('/notes/src/db/index.ts');
    const notes = new db.NotesRepository(db.notesDatabase);
    const reminders = new db.RemindersRepository(db.notesDatabase);
    const now = Date.now();

    const atLocalDay = (days: number, hour: number) => {
      const date = new Date(now);
      date.setDate(date.getDate() + days);
      date.setHours(hour, 0, 0, 0);
      return date.getTime();
    };

    const make = async (title: string, dueAt: number) => {
      const note = await notes.create({ title, content: `${title} body` });
      await reminders.set(note.id, {
        dueAt,
        timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      });
      return note.id;
    };

    const overdue = await make('Overdue polish', now - 60 * 60 * 1000);
    const tomorrow = await make('Tomorrow polish', atLocalDay(1, 9));
    const nextWeek = await make('Next seven polish', atLocalDay(3, 11));
    const later = await make('Later polish', atLocalDay(10, 9));
    const completed = await make('Completed polish', atLocalDay(2, 9));
    await reminders.complete(completed);

    return { overdue, tomorrow, nextWeek, later, completed };
  });
}

async function createTextNote(page: Page, title: string) {
  await page.getByRole('button', { name: 'Create a text note' }).click();
  const composer = page.getByRole('form', { name: 'New note' });
  await composer.getByLabel('Title').fill(title);
  await composer.getByLabel('Note text').fill('Reminder polish note');
  await composer.getByRole('button', { name: 'Close' }).click();
}

test('reminder workspace uses useful time buckets, counts, and overdue presentation', async ({
  page,
}) => {
  const ids = await seedReminderLibrary(page);
  await page.reload();
  await page.getByRole('button', { name: 'Reminders' }).click();

  await expect(page.getByText('4 active · 1 completed/dismissed')).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Overdue', level: 2 })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Tomorrow', level: 2 })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Next 7 days', level: 2 })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Later', level: 2 })).toBeVisible();
  await expect(
    page.getByRole('heading', { name: 'Completed & dismissed', level: 2 }),
  ).toBeVisible();

  const overdueCard = page.locator(`[data-note-id="${ids.overdue}"]`);
  const overdueChip = overdueCard.locator('.note-card-reminder');
  await expect(overdueChip).toHaveAttribute('data-overdue', 'true');
  await expect(overdueChip).toContainText('Overdue');

  await expect(page.locator(`[data-note-id="${ids.tomorrow}"]`)).toBeVisible();
  await expect(page.locator(`[data-note-id="${ids.nextWeek}"]`)).toBeVisible();
  await expect(page.locator(`[data-note-id="${ids.later}"]`)).toBeVisible();
  await expect(page.locator(`[data-note-id="${ids.completed}"]`)).toBeVisible();
});

test('quick scheduling and richer snooze choices preserve the existing reminder record model', async ({
  page,
}) => {
  await page.goto('./');
  await createTextNote(page, 'Quick reminder polish');
  await page.getByRole('button', { name: 'Open note: Quick reminder polish' }).click();
  const editor = page.getByRole('dialog', { name: 'Edit note' });

  const beforeQuick = Date.now();
  await editor.getByRole('button', { name: 'Add reminder' }).click();
  await editor.getByRole('button', { name: 'In 1 hour' }).click();
  await editor.getByRole('button', { name: 'Save reminder' }).click();
  const afterQuick = Date.now();

  const saved = await page.evaluate(async () => {
    const db = await import('/notes/src/db/index.ts');
    const note = (await db.notesDatabase.notes.toArray()).find(
      (item) => item.title === 'Quick reminder polish',
    );
    return note ? db.notesDatabase.reminders.where('noteId').equals(note.id).first() : undefined;
  });
  expect(saved?.status).toBe('active');
  expect(saved?.dueAt).toBeGreaterThan(beforeQuick + 55 * 60 * 1000);
  expect(saved?.dueAt).toBeLessThan(afterQuick + 65 * 60 * 1000);

  await editor.getByRole('button', { name: /Change reminder:/u }).click();
  const beforeSnooze = Date.now();
  await editor.getByRole('button', { name: '10 min', exact: true }).click();
  const afterSnooze = Date.now();

  const snoozed = await page.evaluate(async () => {
    const db = await import('/notes/src/db/index.ts');
    const note = (await db.notesDatabase.notes.toArray()).find(
      (item) => item.title === 'Quick reminder polish',
    );
    return note ? db.notesDatabase.reminders.where('noteId').equals(note.id).first() : undefined;
  });
  expect(snoozed?.status).toBe('active');
  expect(snoozed?.dueAt).toBeGreaterThan(beforeSnooze + 9 * 60 * 1000);
  expect(snoozed?.dueAt).toBeLessThan(afterSnooze + 11 * 60 * 1000);
  expect(snoozed?.lastNotifiedAt).toBeNull();
});

test('tomorrow-morning quick preset uses local 09:00 without bypassing manual inputs', async ({
  page,
}) => {
  await page.goto('./');
  await createTextNote(page, 'Morning preset polish');
  await page.getByRole('button', { name: 'Open note: Morning preset polish' }).click();
  const editor = page.getByRole('dialog', { name: 'Edit note' });
  await editor.getByRole('button', { name: 'Add reminder' }).click();
  await editor.getByRole('button', { name: 'Tomorrow 9:00' }).click();

  await expect(editor.getByLabel('Time')).toHaveValue('09:00');
  const expectedDate = await page.evaluate(() => {
    const date = new Date();
    date.setDate(date.getDate() + 1);
    return `${date.getFullYear().toString().padStart(4, '0')}-${(date.getMonth() + 1)
      .toString()
      .padStart(2, '0')}-${date.getDate().toString().padStart(2, '0')}`;
  });
  await expect(editor.getByLabel('Date')).toHaveValue(expectedDate);
});
