import { expect, test, type Page } from '@playwright/test';

async function waitForNotesWorkspace(page: Page) {
  await expect(page.getByRole('heading', { name: 'Notes', level: 1 })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Create a text note' })).toBeVisible();
}

async function createTextNote(page: Page, title: string, body: string) {
  await page.goto('./');
  await waitForNotesWorkspace(page);
  await page.getByRole('button', { name: 'Create a text note' }).click();
  const composer = page.getByRole('form', { name: 'New note' });
  await composer.getByLabel('Title').fill(title);
  await composer.getByLabel('Note text').fill(body);
  await composer.getByRole('button', { name: 'Close' }).click();
  const card = page.locator('[data-note-card]').filter({ hasText: title });
  await expect(card).toBeVisible();
  return card;
}

async function createChecklist(page: Page, title: string, items: string[]) {
  await page.goto('./');
  await waitForNotesWorkspace(page);
  await page.getByRole('button', { name: 'Create a checklist' }).click();
  const form = page.getByRole('form', { name: 'New checklist' });
  await form.getByLabel('Checklist title').fill(title);
  await form.getByLabel('Checklist item 1').fill(items[0] ?? '');
  for (let index = 1; index < items.length; index += 1) {
    await form.getByLabel(`Checklist item ${index}`).press('Enter');
    await form.getByLabel(`Checklist item ${index + 1}`).fill(items[index] ?? '');
  }
  await form.getByRole('button', { name: 'Close' }).click();
  const card = page.locator('[data-note-type="checklist"]').filter({ hasText: title });
  await expect(card).toBeVisible();
  return card;
}

async function waitForBaselineRevision(page: Page, noteId: string) {
  await expect
    .poll(() =>
      page.evaluate(async (id) => {
        const dbModule = await import('/notes/src/db/index.ts');
        return dbModule.notesDatabase.revisions.where('noteId').equals(id).count();
      }, noteId),
    )
    .toBeGreaterThan(0);
}

test('text history previews an older version, restores it, and supports Undo restore', async ({
  page,
}) => {
  const card = await createTextNote(page, 'History text', 'Original body');
  const noteId = await card.getAttribute('data-note-id');
  expect(noteId).toBeTruthy();

  await card.getByRole('button', { name: 'Open note: History text' }).click();
  await waitForBaselineRevision(page, noteId!);
  const editor = page.getByRole('dialog', { name: 'Edit note' });
  await editor.getByLabel('Edit note text').fill('Revised body');
  await editor.getByRole('button', { name: 'Close' }).click();
  await expect(editor).toHaveCount(0);

  await page.getByRole('button', { name: 'Open note: History text' }).click();
  await page
    .getByRole('dialog', { name: 'Edit note' })
    .getByRole('button', { name: 'History' })
    .click();
  const history = page.getByRole('dialog', { name: 'Version history' });
  await expect(history).toBeVisible();
  await expect(history.locator('.revision-history-item')).toHaveCount(2);

  await history.locator('.revision-history-item').last().click();
  await expect(history.getByText('Original body', { exact: true })).toBeVisible();
  await history.getByRole('button', { name: 'Restore this version' }).click();
  await expect(history.getByRole('status')).toContainText('Version restored');

  const restoredBody = await page.evaluate(async (id) => {
    const dbModule = await import('/notes/src/db/index.ts');
    return (await new dbModule.NotesRepository(dbModule.notesDatabase).require(id)).content;
  }, noteId!);
  expect(restoredBody).toBe('Original body');

  await history.getByRole('button', { name: 'Undo restore' }).click();
  await expect(history.getByRole('status')).toContainText('Restore undone');
  const undoneBody = await page.evaluate(async (id) => {
    const dbModule = await import('/notes/src/db/index.ts');
    return (await new dbModule.NotesRepository(dbModule.notesDatabase).require(id)).content;
  }, noteId!);
  expect(undoneBody).toBe('Revised body');

  await history.getByRole('button', { name: 'Close version history' }).click();
  await expect(page.getByRole('dialog', { name: 'Edit note' })).toHaveCount(0);
  await expect(page.locator(`[data-note-id="${noteId}"]`)).toContainText('Revised body');
});

test('checklist history restores item text, check state, and hierarchy atomically', async ({
  page,
}) => {
  const card = await createChecklist(page, 'History checklist', ['Parent', 'Child']);
  const noteId = await card.getAttribute('data-note-id');
  expect(noteId).toBeTruthy();

  await card.getByRole('button', { name: 'Open note: History checklist' }).click();
  await waitForBaselineRevision(page, noteId!);
  let editor = page.getByRole('dialog', { name: 'Edit checklist' });
  await editor.getByLabel('Checklist item 2').press('Tab');
  await editor.getByLabel('Checklist item 1').fill('Changed parent');
  await editor.getByRole('checkbox', { name: 'Mark item 2 complete' }).check();
  await editor.getByRole('button', { name: 'Close' }).click();
  await expect(editor).toHaveCount(0);

  await page.getByRole('button', { name: 'Open note: History checklist' }).click();
  editor = page.getByRole('dialog', { name: 'Edit checklist' });
  await editor.getByRole('button', { name: 'History' }).click();
  const history = page.getByRole('dialog', { name: 'Version history' });
  await expect(history.locator('.revision-history-item')).toHaveCount(2);
  await history.locator('.revision-history-item').last().click();
  await expect(history.getByText('Parent', { exact: true })).toBeVisible();
  await expect(history.getByText('Child', { exact: true })).toBeVisible();
  await history.getByRole('button', { name: 'Restore this version' }).click();
  await history.getByRole('button', { name: 'Close version history' }).click();
  await expect(page.getByRole('dialog', { name: 'Edit checklist' })).toHaveCount(0);

  const stored = await page.evaluate(async (id) => {
    const dbModule = await import('/notes/src/db/index.ts');
    const items = await new dbModule.ChecklistsRepository(dbModule.notesDatabase).itemsForNote(id);
    return items.map((item) => ({
      text: item.text,
      checked: item.checked,
      parentId: item.parentId,
      id: item.id,
    }));
  }, noteId!);
  expect(stored[0]?.text).toBe('Parent');
  expect(stored[0]?.checked).toBe(false);
  expect(stored[1]?.text).toBe('Child');
  expect(stored[1]?.checked).toBe(false);
  expect(stored[1]?.parentId).toBeNull();
});

test('copying a historical version creates an active copy and preserves current labels', async ({
  page,
}) => {
  const card = await createTextNote(page, 'Copy history', 'Old copy body');
  const noteId = await card.getAttribute('data-note-id');
  expect(noteId).toBeTruthy();

  const labelId = await page.evaluate(async (id) => {
    const dbModule = await import('/notes/src/db/index.ts');
    const labels = new dbModule.LabelsRepository(dbModule.notesDatabase);
    const label = await labels.create('History Label');
    await labels.assign(id, label.id);
    return label.id;
  }, noteId!);

  await card.getByRole('button', { name: 'Open note: Copy history' }).click();
  await waitForBaselineRevision(page, noteId!);
  let editor = page.getByRole('dialog', { name: 'Edit note' });
  await editor.getByLabel('Edit note text').fill('Current copy body');
  await editor.getByRole('button', { name: 'Close' }).click();
  await expect(editor).toHaveCount(0);

  await page.getByRole('button', { name: 'Open note: Copy history' }).click();
  editor = page.getByRole('dialog', { name: 'Edit note' });
  await editor.getByRole('button', { name: 'History' }).click();
  const history = page.getByRole('dialog', { name: 'Version history' });
  await history.locator('.revision-history-item').last().click();
  await history.getByRole('button', { name: 'Copy as new note' }).click();
  await expect(history.getByRole('status')).toContainText('copied');

  const copies = await page.evaluate(
    async ({ originalId, expectedLabelId }) => {
      const dbModule = await import('/notes/src/db/index.ts');
      const notes = await new dbModule.NotesRepository(dbModule.notesDatabase).listActive();
      const copy = notes.find((note) => note.id !== originalId && note.title === 'Copy history');
      if (!copy) return null;
      const labels = await new dbModule.LabelsRepository(dbModule.notesDatabase).labelIdsForNote(
        copy.id,
      );
      return { content: copy.content, labels, expectedLabelId };
    },
    { originalId: noteId!, expectedLabelId: labelId },
  );
  expect(copies?.content).toBe('Old copy body');
  expect(copies?.labels).toContain(labelId);
});

test('revision pruning preserves recent detail and long-term reach while corrupt restore rolls back', async ({
  page,
}) => {
  await page.goto('./');
  await waitForNotesWorkspace(page);
  const result = await page.evaluate(async () => {
    const dbModule = await import('/notes/src/db/index.ts');
    const notes = new dbModule.NotesRepository(dbModule.notesDatabase);
    const revisions = new dbModule.RevisionsRepository(dbModule.notesDatabase);
    let note = await notes.create({ title: 'Pruning', content: 'v0' });
    await revisions.checkpoint(note.id, 'edit');
    for (let index = 1; index <= 80; index += 1) {
      note = await notes.update(note.id, { content: `v${index}` }, note.revision);
      await revisions.checkpoint(note.id, 'close');
    }

    const entries = await revisions.list(note.id);
    const recentContents = entries.slice(0, 30).map((entry) => entry.snapshot.content);
    const corruptId = crypto.randomUUID();
    await dbModule.notesDatabase.revisions.add({
      id: corruptId,
      noteId: note.id,
      noteRevision: note.revision,
      reason: 'restore',
      payload: '{broken-json',
      createdAt: Date.now() + 100_000,
    });
    let corruptionRejected = false;
    try {
      await revisions.restore(note.id, corruptId, note.revision);
    } catch {
      corruptionRejected = true;
    }
    const afterCorrupt = await notes.require(note.id);

    const label = await new dbModule.LabelsRepository(dbModule.notesDatabase).create('Preserved');
    await new dbModule.LabelsRepository(dbModule.notesDatabase).assign(note.id, label.id);
    const oldest = entries.at(-1)!;
    const archived = await notes.archive(note.id, afterCorrupt.revision);
    const restored = await revisions.restore(note.id, oldest.record.id, archived.revision);
    const labelsAfterRestore = await new dbModule.LabelsRepository(
      dbModule.notesDatabase,
    ).labelIdsForNote(note.id);

    return {
      count: entries.length,
      recentContents,
      newest: entries[0]?.snapshot.content,
      oldest: entries.at(-1)?.snapshot.content,
      corruptionRejected,
      afterCorruptContent: afterCorrupt.content,
      restoredContent: restored.note.content,
      archivedPreserved: restored.note.archivedAt !== null,
      labelPreserved: labelsAfterRestore.includes(label.id),
    };
  });

  expect(result.count).toBe(50);
  expect(result.recentContents).toEqual(
    Array.from({ length: 30 }, (_, index) => `v${80 - index}`),
  );
  expect(result.newest).toBe('v80');
  expect(result.oldest).toBe('v0');
  expect(result.corruptionRejected).toBe(true);
  expect(result.afterCorruptContent).toBe('v80');
  expect(result.restoredContent).toBe('v0');
  expect(result.archivedPreserved).toBe(true);
  expect(result.labelPreserved).toBe(true);
});
