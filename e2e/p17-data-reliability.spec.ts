import { expect, test, type BrowserContext, type Page } from '@playwright/test';

async function preparePage(page: Page) {
  await page.addInitScript(() => {
    window.localStorage.setItem('notes.onboarding.quickstart.v1', 'done');
  });
  await page.goto('./');
}

async function openPeer(context: BrowserContext): Promise<Page> {
  const peer = await context.newPage();
  await preparePage(peer);
  return peer;
}

async function seedTextNote(page: Page, title: string, content: string): Promise<string> {
  return page.evaluate(
    async ({ noteTitle, noteContent }) => {
      const db = await import('/notes/src/db/index.ts');
      const repository = new db.NotesRepository(db.notesDatabase);
      return (await repository.create({ title: noteTitle, content: noteContent })).id;
    },
    { noteTitle: title, noteContent: content },
  );
}

async function openTextEditor(page: Page, noteId: string) {
  await page.locator(`[data-note-id="${noteId}"] .note-card-open`).click();
  const editor = page.getByRole('dialog', { name: 'Edit note' });
  await expect(editor).toBeVisible();
  return editor;
}

test('a durable text edit refreshes another open tab without reloading', async ({ page, context }) => {
  await preparePage(page);
  const noteId = await seedTextNote(page, 'Cross-tab note', 'Before peer refresh');
  await page.reload();
  const peer = await openPeer(context);

  const peerCard = peer.locator(`[data-note-id="${noteId}"]`);
  await expect(peerCard).toContainText('Before peer refresh');

  const editor = await openTextEditor(page, noteId);
  await editor.getByLabel('Edit note text').fill('After peer refresh');

  await expect(peerCard).toContainText('After peer refresh', { timeout: 7_000 });
  await peer.close();
});

test('a stale tab cannot overwrite a newer revision and keeps its recovery draft', async ({
  page,
  context,
}) => {
  await preparePage(page);
  const noteId = await seedTextNote(page, 'Concurrent edit', 'Original');
  await page.reload();
  const peer = await openPeer(context);

  const editorA = await openTextEditor(page, noteId);
  const editorB = await openTextEditor(peer, noteId);

  await editorA.getByLabel('Edit note text').fill('Saved by tab A');
  await expect
    .poll(() =>
      page.evaluate(async (id) => {
        const db = await import('/notes/src/db/index.ts');
        return (await db.notesDatabase.notes.get(id))?.content ?? null;
      }, noteId),
    )
    .toBe('Saved by tab A');

  await editorB.getByLabel('Edit note text').fill('Unsaved stale tab B');
  await expect(editorB).toContainText(/changed from revision 1 to 2/u, { timeout: 7_000 });

  const state = await peer.evaluate(async (id) => {
    const db = await import('/notes/src/db/index.ts');
    return {
      durableContent: (await db.notesDatabase.notes.get(id))?.content ?? null,
      journal: window.localStorage.getItem(`notes.editor-draft.v2:${id}`),
    };
  }, noteId);
  expect(state.durableContent).toBe('Saved by tab A');
  expect(state.journal).toContain('Unsaved stale tab B');
  await peer.close();
});

test('portable backup excludes sync shadows and a failed restore rolls back atomically', async ({
  page,
}) => {
  await preparePage(page);

  const result = await page.evaluate(async () => {
    const db = await import('/notes/src/db/index.ts');
    const { BackupRepository } = await import('/notes/src/features/backup/backupRepository.ts');
    const repository = new BackupRepository(db.notesDatabase);
    const notes = new db.NotesRepository(db.notesDatabase);
    const labels = new db.LabelsRepository(db.notesDatabase);

    const backupNote = await notes.create({ title: 'Backup note', content: 'Portable content' });
    const backupLabel = await labels.create('Portable label');
    await labels.assign(backupNote.id, backupLabel.id);
    await db.notesDatabase.settings.bulkPut([
      { key: 'appearance.theme', value: 'dark', updatedAt: 1 },
      { key: 'sync.supabase.shadow.v2:user-a', value: '{}', updatedAt: 2 },
      { key: 'sync.supabase.shadow.v3:user-b', value: '{}', updatedAt: 3 },
    ]);

    const exported = await repository.exportBackup();
    const exportedSettingKeys = exported.document.data.settings.map((setting) => setting.key);
    const backupWithOldShadow = {
      ...exported.document,
      data: {
        ...exported.document.data,
        settings: [
          ...exported.document.data.settings,
          { key: 'sync.supabase.shadow.v2:restored-user', value: '{}', updatedAt: 4 },
        ],
      },
    };
    const prepared = await repository.inspectBackup(JSON.stringify(backupWithOldShadow));

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
        await Promise.all([
          db.notesDatabase.notes.clear(),
          db.notesDatabase.checklistItems.clear(),
          db.notesDatabase.labels.clear(),
          db.notesDatabase.noteLabels.clear(),
          db.notesDatabase.attachments.clear(),
          db.notesDatabase.reminders.clear(),
          db.notesDatabase.revisions.clear(),
          db.notesDatabase.settings.clear(),
        ]);
      },
    );
    const localNote = await notes.create({ title: 'Local survives', content: 'Do not erase' });
    await db.notesDatabase.settings.bulkPut([
      { key: 'local.keep', value: 'yes', updatedAt: 10 },
      { key: 'sync.supabase.shadow.v2:local-user', value: '{}', updatedAt: 11 },
    ]);

    const labelTable = db.notesDatabase.labels;
    const originalBulkAdd = labelTable.bulkAdd;
    Object.defineProperty(labelTable, 'bulkAdd', {
      configurable: true,
      value: () => Promise.reject(new Error('simulated mid-restore failure')),
    });
    let restoreFailed = false;
    try {
      await repository.restorePrepared(prepared);
    } catch {
      restoreFailed = true;
    } finally {
      Object.defineProperty(labelTable, 'bulkAdd', {
        configurable: true,
        value: originalBulkAdd,
      });
    }

    const afterFailureNotes = await db.notesDatabase.notes.toArray();
    const afterFailureSettings = await db.notesDatabase.settings.toArray();

    const restoredStats = await repository.restorePrepared(prepared);
    const afterSuccessNotes = await db.notesDatabase.notes.toArray();
    const afterSuccessSettings = await db.notesDatabase.settings.toArray();

    return {
      exportedSettingKeys,
      restoreFailed,
      localNoteId: localNote.id,
      afterFailureNoteIds: afterFailureNotes.map((note) => note.id),
      afterFailureSettingKeys: afterFailureSettings.map((setting) => setting.key),
      afterSuccessTitles: afterSuccessNotes.map((note) => note.title),
      afterSuccessSettingKeys: afterSuccessSettings.map((setting) => setting.key),
      restoredSettingCount: restoredStats.settings,
    };
  });

  expect(result.exportedSettingKeys).toEqual(['appearance.theme']);
  expect(result.restoreFailed).toBe(true);
  expect(result.afterFailureNoteIds).toContain(result.localNoteId);
  expect(result.afterFailureSettingKeys).toContain('local.keep');
  expect(result.afterFailureSettingKeys).toContain('sync.supabase.shadow.v2:local-user');
  expect(result.afterSuccessTitles).toContain('Backup note');
  expect(result.afterSuccessSettingKeys).toEqual(['appearance.theme']);
  expect(result.restoredSettingCount).toBe(1);
});
