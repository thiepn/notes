import { expect, test, type Page } from '@playwright/test';

async function seedTextNote(page: Page, title: string) {
  await page.goto('./');
  const noteId = await page.evaluate(async (noteTitle) => {
    const db = await import('/notes/src/db/index.ts');
    const notes = new db.NotesRepository(db.notesDatabase);
    return (await notes.create({ title: noteTitle, content: 'P24 reminder workflow' })).id;
  }, title);
  await page.reload();
  await expect(page.getByRole('button', { name: `Open note: ${title}` })).toBeVisible();
  return noteId;
}

async function openTextEditor(page: Page, title: string) {
  await page.getByRole('button', { name: `Open note: ${title}` }).click();
  const editor = page.getByRole('dialog', { name: 'Edit note' });
  await expect(editor).toBeVisible();
  return editor;
}

test.describe('P24 compact reminder workflow', () => {
  test('new reminder expansion moves focus inside and Escape restores the compact trigger', async ({
    page,
  }) => {
    await seedTextNote(page, 'P24 new reminder');
    const editor = await openTextEditor(page, 'P24 new reminder');
    const trigger = editor.getByRole('button', { name: 'Add reminder', exact: true });

    await expect(trigger).toHaveAttribute('aria-expanded', 'false');
    await expect(trigger).toHaveAttribute('aria-controls', /.+/u);
    await trigger.click();

    const reminderEditor = editor.getByRole('group', { name: 'Set reminder' });
    await expect(reminderEditor).toBeVisible();
    await expect(reminderEditor.getByRole('button', { name: 'In 1 hour' })).toBeFocused();

    await page.keyboard.press('Escape');
    await expect(reminderEditor).toHaveCount(0);
    await expect(editor).toBeVisible();
    await expect(editor.getByRole('button', { name: 'Add reminder', exact: true })).toBeFocused();
  });

  test('existing reminders use stepwise Escape and always return focus to a useful control', async ({
    page,
  }) => {
    await seedTextNote(page, 'P24 existing reminder');
    const editor = await openTextEditor(page, 'P24 existing reminder');

    await editor.getByRole('button', { name: 'Add reminder', exact: true }).click();
    await editor.getByRole('button', { name: 'In 1 hour' }).click();
    await editor.getByRole('button', { name: 'Save reminder' }).click();

    const compactTrigger = editor.getByRole('button', { name: /Change reminder:/u });
    await expect(compactTrigger).toBeVisible();
    await expect(compactTrigger).toBeFocused();

    await compactTrigger.click();
    const change = editor.getByRole('button', { name: 'Change', exact: true });
    await expect(change).toBeFocused();

    await change.click();
    const reminderEditor = editor.getByRole('group', { name: 'Set reminder' });
    await expect(reminderEditor.getByRole('button', { name: 'In 1 hour' })).toBeFocused();

    await page.keyboard.press('Escape');
    await expect(reminderEditor).toHaveCount(0);
    await expect(change).toBeFocused();
    await expect(editor).toBeVisible();

    await page.keyboard.press('Escape');
    await expect(editor.getByRole('button', { name: /Change reminder:/u })).toBeFocused();
    await expect(editor).toBeVisible();
  });

  test('an in-flight reminder save locks every mutable editor control and blocks Escape', async ({
    page,
  }) => {
    await seedTextNote(page, 'P24 busy reminder');
    const editor = await openTextEditor(page, 'P24 busy reminder');
    await editor.getByRole('button', { name: 'Add reminder', exact: true }).click();
    await editor.getByRole('button', { name: 'In 1 hour' }).click();

    await page.evaluate(async () => {
      const db = await import('/notes/src/db/index.ts');
      const prototype = db.RemindersRepository.prototype;
      const originalSet = prototype.set;
      let releaseGate: (() => void) | null = null;
      const gate = new Promise<void>((resolve) => {
        releaseGate = resolve;
      });
      (
        window as typeof window & {
          __releaseP24ReminderSave?: () => void;
        }
      ).__releaseP24ReminderSave = () => releaseGate?.();
      Object.defineProperty(prototype, 'set', {
        configurable: true,
        value: async function (
          this: InstanceType<typeof db.RemindersRepository>,
          ...args: Parameters<typeof originalSet>
        ) {
          await gate;
          return originalSet.apply(this, args);
        },
      });
    });

    await editor.getByRole('button', { name: 'Save reminder' }).click();
    const control = editor.locator('.reminder-control-compact-expanded');
    await expect(control).toHaveAttribute('aria-busy', 'true');
    await expect(control.getByRole('status')).toHaveText('Updating reminder…');
    await expect(editor.getByRole('button', { name: 'In 1 hour' })).toBeDisabled();
    await expect(editor.getByRole('button', { name: 'Tomorrow 9:00' })).toBeDisabled();
    await expect(editor.getByRole('button', { name: 'Today', exact: true })).toBeDisabled();
    await expect(editor.getByLabel('Date')).toBeDisabled();
    await expect(editor.getByLabel('Time')).toBeDisabled();
    await expect(editor.getByRole('button', { name: 'Cancel' })).toBeDisabled();
    await expect(editor.getByRole('button', { name: 'Saving…' })).toBeDisabled();

    await page.keyboard.press('Escape');
    await expect(control).toBeVisible();
    await expect(editor).toBeVisible();

    await page.evaluate(() => {
      (
        window as typeof window & {
          __releaseP24ReminderSave?: () => void;
        }
      ).__releaseP24ReminderSave?.();
    });
    const compactTrigger = editor.getByRole('button', { name: /Change reminder:/u });
    await expect(compactTrigger).toBeVisible();
    await expect(compactTrigger).toBeFocused();
  });
});

test('returning to the app immediately refreshes reminder time buckets', async ({ page }) => {
  await page.goto('./');
  const seeded = await page.evaluate(async () => {
    const db = await import('/notes/src/db/index.ts');
    const notes = new db.NotesRepository(db.notesDatabase);
    const reminders = new db.RemindersRepository(db.notesDatabase);
    const baseNow = Date.now();
    const dueAt = baseNow + 5 * 60 * 1000;
    const note = await notes.create({ title: 'P24 foreground reminder', content: 'Time moves.' });
    await reminders.set(note.id, {
      dueAt,
      timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    });
    return { noteId: note.id, dueAt };
  });

  await page.reload();
  await page.getByRole('button', { name: 'Reminders' }).click();
  const card = page.locator(`[data-note-id="${seeded.noteId}"]`);
  await expect(card).toBeVisible();
  await expect(
    page.locator(`section[aria-label="Overdue reminders"] [data-note-id="${seeded.noteId}"]`),
  ).toHaveCount(0);

  await page.evaluate((afterDueAt) => {
    Date.now = () => afterDueAt;
    window.dispatchEvent(new Event('focus'));
  }, seeded.dueAt + 1);

  await expect(
    page.locator(`section[aria-label="Overdue reminders"] [data-note-id="${seeded.noteId}"]`),
  ).toBeVisible();
  await expect(card.locator('.note-card-reminder')).toContainText('Overdue');
});
