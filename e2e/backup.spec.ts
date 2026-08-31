import { readFile } from 'node:fs/promises';

import { expect, test, type Page } from '@playwright/test';

async function waitForNotes(page: Page) {
  await expect(page.getByRole('heading', { name: 'Notes', level: 1 })).toBeVisible();
}

async function openBackup(page: Page) {
  await page.goto('./');
  await waitForNotes(page);
  await page.getByRole('button', { name: 'Backup' }).click();
  await expect(page.getByRole('heading', { name: 'Backup', level: 1 })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Back up this device' })).toBeVisible();
}

async function seedCompleteLibrary(page: Page) {
  return page.evaluate(async () => {
    const dbModule = await import('/notes/src/db/index.ts');
    const notes = new dbModule.NotesRepository(dbModule.notesDatabase);
    const checklists = new dbModule.ChecklistsRepository(dbModule.notesDatabase);
    const labels = new dbModule.LabelsRepository(dbModule.notesDatabase);
    const revisions = new dbModule.RevisionsRepository(dbModule.notesDatabase);

    let text = await notes.create({
      title: 'Backup text',
      content: 'Exact body for recovery',
      color: 'green',
    });
    const label = await labels.create('Recovery Label');
    await labels.assign(text.id, label.id);
    await revisions.checkpoint(text.id, 'edit');
    text = await notes.archive(text.id, text.revision);

    const parentId = crypto.randomUUID();
    const childId = crypto.randomUUID();
    const checklist = await checklists.create('Backup checklist', [
      { id: parentId, text: 'Parent item', checked: false, parentId: null },
      { id: childId, text: 'Child item', checked: true, parentId },
    ]);
    await revisions.checkpoint(checklist.note.id, 'edit');

    const bytes = new TextEncoder().encode('attachment payload');
    const attachmentId = crypto.randomUUID();
    await dbModule.notesDatabase.attachments.add({
      id: attachmentId,
      noteId: text.id,
      name: 'evidence.txt',
      mimeType: 'text/plain',
      size: bytes.byteLength,
      checksum: 'source-checksum',
      data: new Blob([bytes], { type: 'text/plain' }),
      createdAt: Date.now(),
    });
    await dbModule.notesDatabase.settings.put({
      key: 'backup-test-setting',
      value: 'preserve-me',
      updatedAt: Date.now(),
    });

    return {
      textId: text.id,
      checklistId: checklist.note.id,
      parentId,
      childId,
      labelId: label.id,
      attachmentId,
    };
  });
}

test('full backup round-trips every v1 table and downloads a pre-restore safety backup', async ({
  page,
}) => {
  await page.goto('./');
  await waitForNotes(page);
  const ids = await seedCompleteLibrary(page);
  await page.getByRole('button', { name: 'Backup' }).click();

  const exportDownloadPromise = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Download full backup' }).click();
  const exportDownload = await exportDownloadPromise;
  const exportPath = await exportDownload.path();
  expect(exportPath).toBeTruthy();
  const exportedJson = await readFile(exportPath!, 'utf8');
  const exported = JSON.parse(exportedJson) as {
    format: string;
    formatVersion: number;
    data: {
      notes: Array<{ id: string; title: string; archivedAt: number | null }>;
      checklistItems: Array<{ id: string; parentId: string | null; checked: boolean }>;
      labels: Array<{ id: string; name: string }>;
      noteLabels: Array<{ noteId: string; labelId: string }>;
      attachments: Array<{
        id: string;
        checksum: string;
        dataBase64: string;
        dataSha256: string;
      }>;
      revisions: Array<{ noteId: string; payload: string }>;
      settings: Array<{ key: string; value: string }>;
    };
  };

  expect(exported.format).toBe('thiepn.notes.backup');
  expect(exported.formatVersion).toBe(1);
  expect(exported.data.notes).toHaveLength(2);
  expect(exported.data.checklistItems).toHaveLength(2);
  expect(exported.data.labels).toHaveLength(1);
  expect(exported.data.noteLabels).toHaveLength(1);
  expect(exported.data.attachments).toHaveLength(1);
  expect(exported.data.revisions.length).toBeGreaterThanOrEqual(2);
  expect(exported.data.settings).toContainEqual(
    expect.objectContaining({ key: 'backup-test-setting', value: 'preserve-me' }),
  );
  expect(exported.data.attachments[0]?.checksum).toBe('source-checksum');
  expect(exported.data.attachments[0]?.dataSha256).toMatch(/^[a-f0-9]{64}$/u);

  await page.evaluate(async () => {
    const dbModule = await import('/notes/src/db/index.ts');
    await dbModule.notesDatabase.transaction(
      'rw',
      dbModule.notesDatabase.notes,
      dbModule.notesDatabase.checklistItems,
      dbModule.notesDatabase.labels,
      dbModule.notesDatabase.noteLabels,
      dbModule.notesDatabase.attachments,
      dbModule.notesDatabase.revisions,
      dbModule.notesDatabase.settings,
      async () => {
        await dbModule.notesDatabase.noteLabels.clear();
        await dbModule.notesDatabase.checklistItems.clear();
        await dbModule.notesDatabase.attachments.clear();
        await dbModule.notesDatabase.revisions.clear();
        await dbModule.notesDatabase.labels.clear();
        await dbModule.notesDatabase.settings.clear();
        await dbModule.notesDatabase.notes.clear();
      },
    );
    await new dbModule.NotesRepository(dbModule.notesDatabase).create({
      title: 'Intruder after backup',
      content: 'This must disappear after restore.',
    });
  });

  await page.getByLabel('Choose backup file').setInputFiles(exportPath!);
  await expect(page.getByText('Backup validated. No local data has been changed.')).toBeVisible();
  const preview = page.getByLabel('Validated backup preview');
  await expect(preview.getByText('Validated', { exact: true })).toBeVisible();
  await expect(preview).toContainText('Backup text');
  await preview.getByRole('checkbox').check();

  const safetyDownloadPromise = page.waitForEvent('download');
  await preview.getByRole('button', { name: 'Restore and replace local library' }).click();
  const safetyDownload = await safetyDownloadPromise;
  const safetyPath = await safetyDownload.path();
  expect(safetyPath).toBeTruthy();
  const safety = JSON.parse(await readFile(safetyPath!, 'utf8')) as {
    data: { notes: Array<{ title: string }> };
  };
  expect(safety.data.notes.map((note) => note.title)).toContain('Intruder after backup');

  await waitForNotes(page);
  const restored = await page.evaluate(async (expected) => {
    const dbModule = await import('/notes/src/db/index.ts');
    const [notes, items, labels, relations, attachments, revisions, settings] = await Promise.all([
      dbModule.notesDatabase.notes.toArray(),
      dbModule.notesDatabase.checklistItems.toArray(),
      dbModule.notesDatabase.labels.toArray(),
      dbModule.notesDatabase.noteLabels.toArray(),
      dbModule.notesDatabase.attachments.toArray(),
      dbModule.notesDatabase.revisions.toArray(),
      dbModule.notesDatabase.settings.toArray(),
    ]);
    const attachment = attachments.find((record) => record.id === expected.attachmentId);
    return {
      noteIds: notes.map((note) => note.id),
      intruderPresent: notes.some((note) => note.title === 'Intruder after backup'),
      archivedAt: notes.find((note) => note.id === expected.textId)?.archivedAt ?? null,
      items: items.map((item) => ({ id: item.id, parentId: item.parentId, checked: item.checked })),
      labelIds: labels.map((label) => label.id),
      relations: relations.map((relation) => `${relation.noteId}:${relation.labelId}`),
      attachmentText: attachment ? await attachment.data.text() : null,
      attachmentChecksum: attachment?.checksum ?? null,
      revisionNoteIds: revisions.map((revision) => revision.noteId),
      settingValue: settings.find((setting) => setting.key === 'backup-test-setting')?.value ?? null,
    };
  }, ids);

  expect(restored.noteIds).toContain(ids.textId);
  expect(restored.noteIds).toContain(ids.checklistId);
  expect(restored.intruderPresent).toBe(false);
  expect(restored.archivedAt).not.toBeNull();
  expect(restored.items).toContainEqual({ id: ids.parentId, parentId: null, checked: false });
  expect(restored.items).toContainEqual({ id: ids.childId, parentId: ids.parentId, checked: true });
  expect(restored.labelIds).toContain(ids.labelId);
  expect(restored.relations).toContain(`${ids.textId}:${ids.labelId}`);
  expect(restored.attachmentText).toBe('attachment payload');
  expect(restored.attachmentChecksum).toBe('source-checksum');
  expect(restored.revisionNoteIds).toContain(ids.textId);
  expect(restored.revisionNoteIds).toContain(ids.checklistId);
  expect(restored.settingValue).toBe('preserve-me');
});

test('corrupt backups are rejected during preview without changing the library', async ({ page }) => {
  await page.goto('./');
  await waitForNotes(page);
  await page.evaluate(async () => {
    const dbModule = await import('/notes/src/db/index.ts');
    const note = await new dbModule.NotesRepository(dbModule.notesDatabase).create({
      title: 'Safe current note',
      content: 'Keep this intact.',
    });
    const label = await new dbModule.LabelsRepository(dbModule.notesDatabase).create('Safe label');
    await new dbModule.LabelsRepository(dbModule.notesDatabase).assign(note.id, label.id);
  });

  const validJson = await page.evaluate(async () => {
    const dbModule = await import('/notes/src/db/index.ts');
    const backupModule = await import('/notes/src/features/backup/backupRepository.ts');
    return (await new backupModule.BackupRepository(dbModule.notesDatabase).exportBackup()).json;
  });
  const corrupt = JSON.parse(validJson) as {
    data: { noteLabels: Array<{ noteId: string; labelId: string }> };
  };
  corrupt.data.noteLabels[0]!.noteId = '10000000-0000-4000-8000-000000000099';

  await page.getByRole('button', { name: 'Backup' }).click();
  await page.getByLabel('Choose backup file').setInputFiles({
    name: 'corrupt-backup.json',
    mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify(corrupt)),
  });

  await expect(page.getByRole('alert')).toContainText('missing note');
  await expect(page.getByLabel('Validated backup preview')).toHaveCount(0);
  const current = await page.evaluate(async () => {
    const dbModule = await import('/notes/src/db/index.ts');
    return (await dbModule.notesDatabase.notes.toArray()).map((note) => note.title);
  });
  expect(current).toEqual(['Safe current note']);
});

test('a write failure after table clearing rolls the entire replacement transaction back', async ({
  page,
}) => {
  await page.goto('./');
  await waitForNotes(page);
  const result = await page.evaluate(async () => {
    const dbModule = await import('/notes/src/db/index.ts');
    const backupModule = await import('/notes/src/features/backup/backupRepository.ts');
    const backupFormat = await import('/notes/src/features/backup/backupFormat.ts');
    const notes = new dbModule.NotesRepository(dbModule.notesDatabase);
    const current = await notes.create({ title: 'Rollback source', content: 'Must survive.' });
    const repository = new backupModule.BackupRepository(dbModule.notesDatabase);
    const exported = await repository.exportBackup();
    const raw = JSON.parse(exported.json) as backupFormat.BackupDocument;
    raw.data.notes[0]!.title = 'Replacement target';
    const prepared = await backupFormat.prepareBackup(raw);

    const table = dbModule.notesDatabase.notes as typeof dbModule.notesDatabase.notes & {
      bulkAdd: typeof dbModule.notesDatabase.notes.bulkAdd;
    };
    const originalBulkAdd = table.bulkAdd.bind(table);
    table.bulkAdd = (() => Promise.reject(new Error('forced restore write failure'))) as typeof table.bulkAdd;
    let rejected = false;
    try {
      await repository.restorePrepared(prepared);
    } catch {
      rejected = true;
    } finally {
      table.bulkAdd = originalBulkAdd;
    }

    const after = await notes.require(current.id);
    return { rejected, id: after.id, title: after.title, content: after.content };
  });

  expect(result.rejected).toBe(true);
  expect(result.title).toBe('Rollback source');
  expect(result.content).toBe('Must survive.');
});
