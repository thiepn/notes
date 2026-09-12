import { expect, test, type Page } from '@playwright/test';

const ONBOARDING_KEY = 'notes.onboarding.quickstart.v1';

async function waitForNotesWorkspace(page: Page) {
  await expect(page.getByRole('heading', { name: 'Notes', level: 1 })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Create a text note' })).toBeVisible();
}

async function preparePage(page: Page, viewport?: { width: number; height: number }) {
  if (viewport) await page.setViewportSize(viewport);
  await page.addInitScript((key) => window.localStorage.setItem(key, 'done'), ONBOARDING_KEY);
  await page.goto('./');
  await waitForNotesWorkspace(page);
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

async function createLabel(page: Page, name: string) {
  await page.getByRole('button', { name: 'Edit labels' }).click();
  const manager = page.getByRole('dialog', { name: 'Edit labels' });
  await manager.getByLabel('New label name').fill(name);
  await manager.getByRole('button', { name: 'Create label' }).click();
  await expect(manager.getByText(name, { exact: true })).toBeVisible();
  await manager.getByRole('button', { name: 'Close label manager' }).click();
}

function cardFor(page: Page, title: string) {
  return page.locator('[data-note-card]').filter({ hasText: title }).first();
}

test.describe('P20 release certification', () => {
  test('capture, organization, reminder, archive, and restore preserve one coherent note', async ({
    page,
  }) => {
    await preparePage(page);
    await createLabel(page, 'Release');

    await page.getByRole('button', { name: 'Create a text note' }).click();
    const composer = page.getByRole('form', { name: 'New note' });
    await composer.getByLabel('Title').fill('P20 integrated note');
    await composer
      .getByLabel('Note text')
      .fill('Release certification crosses capture, organization, reminders, and lifecycle.');
    await composer.getByRole('button', { name: 'Close' }).click();

    let card = cardFor(page, 'P20 integrated note');
    await expect(card).toBeVisible();
    await card.hover();
    await card.getByRole('button', { name: 'More actions: P20 integrated note' }).click();
    await card.getByRole('menuitem', { name: 'Labels', exact: true }).click();
    const labelPicker = page.getByRole('dialog', { name: 'Note labels' });
    await labelPicker.getByLabel('Add label Release: P20 integrated note').check();
    await page.keyboard.press('Escape');

    card = cardFor(page, 'P20 integrated note');
    await card.hover();
    await card.getByRole('button', { name: 'Change color: P20 integrated note' }).click();
    await page
      .getByRole('dialog', { name: 'Note color' })
      .getByRole('button', { name: 'Set Yellow color: P20 integrated note' })
      .click();

    await page.getByRole('button', { name: 'Open note: P20 integrated note' }).click();
    const editor = page.getByRole('dialog', { name: 'Edit note' });
    await editor.getByRole('button', { name: 'Add reminder' }).click();
    const reminder = await tomorrowInput(page);
    await editor.getByLabel('Date').fill(reminder.date);
    await editor.getByLabel('Time').fill(reminder.time);
    await editor.getByRole('button', { name: 'Save reminder' }).click();
    await editor.getByRole('button', { name: 'Close' }).click();

    card = cardFor(page, 'P20 integrated note');
    await expect(card).toHaveAttribute('data-color', 'yellow');
    await expect(card.getByText('Release', { exact: true })).toBeVisible();
    await expect(card.locator('.note-card-reminder')).toBeVisible();

    await card.hover();
    await card.getByRole('button', { name: 'Archive note: P20 integrated note' }).click();
    await expect(cardFor(page, 'P20 integrated note')).toHaveCount(0);

    await page.getByRole('button', { name: 'Archive', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'Archive', level: 1 })).toBeVisible();
    card = cardFor(page, 'P20 integrated note');
    await expect(card).toBeVisible();
    await expect(card).toHaveAttribute('data-color', 'yellow');
    await expect(card.getByText('Release', { exact: true })).toBeVisible();
    await expect(card.locator('.note-card-reminder')).toBeVisible();

    await card.hover();
    await card.getByRole('button', { name: 'Unarchive note: P20 integrated note' }).click();
    await page.getByRole('button', { name: 'Notes', exact: true }).click();
    await expect(cardFor(page, 'P20 integrated note')).toBeVisible();
  });

  test('a full-library restore returns related records and immediately re-enters local search', async ({
    page,
  }) => {
    await preparePage(page);

    const restored = await page.evaluate(async () => {
      const db = await import('/notes/src/db/index.ts');
      const { BackupRepository } = await import('/notes/src/features/backup/backupRepository.ts');
      const notes = new db.NotesRepository(db.notesDatabase);
      const checklists = new db.ChecklistsRepository(db.notesDatabase);
      const labels = new db.LabelsRepository(db.notesDatabase);
      const reminders = new db.RemindersRepository(db.notesDatabase);
      const backup = new BackupRepository(db.notesDatabase);

      const text = await notes.create({
        title: 'P20 restored knowledge',
        content: 'p20-semantic-roundtrip release evidence survives exact restore',
        color: 'blue',
      });
      const label = await labels.create('Release evidence');
      await labels.assign(text.id, label.id);
      await reminders.set(text.id, {
        dueAt: Date.now() + 24 * 60 * 60 * 1000,
        timeZone: 'Europe/Berlin',
      });
      const checklist = await checklists.create('P20 restored checklist', [
        { id: crypto.randomUUID(), text: 'Verify restore', checked: true, parentId: null },
      ]);
      const bytes = new TextEncoder().encode('P20 attachment bytes');
      const attachmentId = crypto.randomUUID();
      await db.notesDatabase.attachments.add({
        id: attachmentId,
        noteId: text.id,
        name: 'release-evidence.txt',
        mimeType: 'text/plain',
        size: bytes.byteLength,
        checksum: 'p20-release-checksum',
        data: new Blob([bytes], { type: 'text/plain' }),
        createdAt: Date.now(),
      });

      const exported = await backup.exportBackup();
      const prepared = await backup.inspectBackup(exported.json);

      await db.notesDatabase.transaction(
        'rw',
        [
          db.notesDatabase.notes,
          db.notesDatabase.checklistItems,
          db.notesDatabase.labels,
          db.notesDatabase.noteLabels,
          db.notesDatabase.attachments,
          db.notesDatabase.reminders,
          db.notesDatabase.revisions,
          db.notesDatabase.settings,
        ],
        async () => {
          await db.notesDatabase.noteLabels.clear();
          await db.notesDatabase.checklistItems.clear();
          await db.notesDatabase.attachments.clear();
          await db.notesDatabase.reminders.clear();
          await db.notesDatabase.revisions.clear();
          await db.notesDatabase.labels.clear();
          await db.notesDatabase.settings.clear();
          await db.notesDatabase.notes.clear();
        },
      );
      await notes.create({ title: 'P20 restore intruder', content: 'must be replaced' });

      await backup.restorePrepared(prepared);

      const [restoredText, restoredChecklist, restoredLabels, restoredReminders, attachment] =
        await Promise.all([
          db.notesDatabase.notes.get(text.id),
          db.notesDatabase.notes.get(checklist.note.id),
          labels.labelIdsForNote(text.id),
          db.notesDatabase.reminders.where('noteId').equals(text.id).toArray(),
          db.notesDatabase.attachments.get(attachmentId),
        ]);
      const intruder = (await db.notesDatabase.notes.toArray()).some(
        (note) => note.title === 'P20 restore intruder',
      );

      return {
        title: restoredText?.title ?? null,
        checklistTitle: restoredChecklist?.title ?? null,
        labelRestored: restoredLabels.includes(label.id),
        reminderCount: restoredReminders.length,
        attachmentText: attachment ? await attachment.data.text() : null,
        attachmentChecksum: attachment?.checksum ?? null,
        intruder,
      };
    });

    expect(restored.title).toBe('P20 restored knowledge');
    expect(restored.checklistTitle).toBe('P20 restored checklist');
    expect(restored.labelRestored).toBe(true);
    expect(restored.reminderCount).toBe(1);
    expect(restored.attachmentText).toBe('P20 attachment bytes');
    expect(restored.attachmentChecksum).toBe('p20-release-checksum');
    expect(restored.intruder).toBe(false);

    await page.reload();
    await page.getByRole('searchbox', { name: 'Search notes' }).fill('p20-semantic-roundtrip');
    const result = page.getByRole('button', { name: 'Open note: P20 restored knowledge' });
    await expect(result).toBeVisible();
    const card = cardFor(page, 'P20 restored knowledge');
    await expect(card.getByText('Release evidence', { exact: true })).toBeVisible();
    await expect(card.locator('.note-card-reminder')).toBeVisible();
  });

  test('keyboard-only release journey can create, organize, archive, navigate, and reopen', async ({
    page,
  }) => {
    await preparePage(page);
    await page.evaluate(async () => {
      const db = await import('/notes/src/db/index.ts');
      await new db.LabelsRepository(db.notesDatabase).create('Keyboard release');
    });
    await page.reload();
    await waitForNotesWorkspace(page);

    await page.keyboard.press('c');
    const composer = page.getByRole('form', { name: 'New note' });
    await expect(composer).toBeVisible();
    await expect(composer.getByLabel('Note text')).toBeFocused();
    await composer.getByLabel('Title').fill('P20 keyboard note');
    await composer.getByLabel('Note text').fill('Keyboard-only release path');
    const close = composer.getByRole('button', { name: 'Close' });
    await close.focus();
    await page.keyboard.press('Enter');

    const card = cardFor(page, 'P20 keyboard note');
    await expect(card).toBeVisible();
    await page.keyboard.press('j');
    await page.keyboard.press('p');
    await expect(card).toHaveAttribute('data-pinned', 'true');

    await page.keyboard.press('j');
    await page.keyboard.press('#');
    const label = card.getByLabel('Keyboard release');
    await expect(label).toBeFocused();
    await page.keyboard.press('Space');
    await expect(label).toBeChecked();
    await page.keyboard.press('Escape');

    await page.keyboard.press('j');
    await page.keyboard.press('e');
    await expect(cardFor(page, 'P20 keyboard note')).toHaveCount(0);

    await page.keyboard.press('Control+K');
    const palette = page.getByRole('dialog', { name: 'Command palette' });
    await expect(palette.getByRole('combobox', { name: 'Search commands' })).toBeFocused();
    await page.keyboard.type('archive');
    await page.keyboard.press('Enter');
    await expect(page.getByRole('heading', { name: 'Archive', level: 1 })).toBeVisible();
    await expect(cardFor(page, 'P20 keyboard note')).toBeVisible();

    await page.keyboard.press('j');
    await page.keyboard.press('Enter');
    await expect(page.getByRole('dialog', { name: 'Edit note' })).toBeVisible();
  });

  test('small-mobile release path keeps capture, navigation, and settings usable without overflow', async ({
    page,
  }) => {
    await preparePage(page, { width: 320, height: 568 });

    const mobileNavigation = page.getByRole('navigation', { name: 'Mobile navigation' });
    await mobileNavigation.getByRole('button', { name: 'New note', exact: true }).click();
    const menu = page.getByRole('dialog', { name: 'New' });
    await expect(menu).toBeVisible();
    await menu.getByRole('button', { name: 'Template', exact: true }).click();
    const templates = page.getByRole('dialog', { name: 'Templates' });
    await templates.getByRole('button', { name: /Daily/u }).click();

    const editor = page.getByRole('dialog', { name: 'Edit note' });
    await expect(editor).toBeVisible();
    await expect(page.getByRole('dialog', { name: 'More navigation' })).toHaveCount(0);
    await editor.getByRole('button', { name: 'Close' }).click();

    await mobileNavigation.getByRole('button', { name: 'Open navigation' }).click();
    const sidebar = page.getByTestId('app-sidebar');
    await sidebar.getByRole('button', { name: 'Settings', exact: true }).click();
    const settings = page.getByRole('dialog', { name: 'Settings' });
    await expect(settings).toBeVisible();
    await expect(settings.getByRole('navigation', { name: 'Settings sections' })).toBeVisible();

    const overflow = await page.evaluate(() => ({
      viewport: document.documentElement.clientWidth,
      page: document.documentElement.scrollWidth,
    }));
    expect(overflow.page).toBeLessThanOrEqual(overflow.viewport);
  });
});
