import { expect, test } from '@playwright/test';

function testDatabaseName(prefix: string): string {
  return `notes-e2e-${prefix}-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

test('persists notes across database reopen and protects revisions', async ({ page }) => {
  await page.goto('./');
  const databaseName = testDatabaseName('persist');

  const result = await page.evaluate(async (name) => {
    const dbModule = await import('/notes/src/db/index.ts');
    const database = dbModule.createNotesDatabase(name);
    const repository = new dbModule.NotesRepository(database);

    try {
      const created = await repository.create({ title: 'First note' });
      const updated = await repository.update(
        created.id,
        { content: 'Persisted body' },
        created.revision,
      );

      database.close();
      const reopenedDatabase = dbModule.createNotesDatabase(name);
      const reopenedRepository = new dbModule.NotesRepository(reopenedDatabase);
      const reopened = await reopenedRepository.require(created.id);

      let conflictName = '';
      try {
        await reopenedRepository.update(created.id, { title: 'Stale edit' }, created.revision);
      } catch (error) {
        conflictName = error instanceof Error ? error.name : 'unknown';
      }

      reopenedDatabase.close();
      return {
        content: reopened.content,
        revision: reopened.revision,
        updatedRevision: updated.revision,
        conflictName,
      };
    } finally {
      database.close();
      await dbModule.deleteNotesDatabase(name);
    }
  }, databaseName);

  expect(result.content).toBe('Persisted body');
  expect(result.revision).toBe(2);
  expect(result.updatedRevision).toBe(2);
  expect(result.conflictName).toBe('NoteConflictError');
});

test('enforces lifecycle transitions and active-note ordering', async ({ page }) => {
  await page.goto('./');
  const databaseName = testDatabaseName('lifecycle');

  const result = await page.evaluate(async (name) => {
    const dbModule = await import('/notes/src/db/index.ts');
    const database = dbModule.createNotesDatabase(name);
    let tick = 1_000;
    const repository = new dbModule.NotesRepository(database, {
      clock: () => tick++,
    });

    try {
      const first = await repository.create({ title: 'First' });
      const second = await repository.create({ title: 'Second' });
      await repository.setPinned(first.id, true);

      const ordered = await repository.listActive();
      const archived = await repository.archive(first.id);
      const archiveCount = (await repository.listArchived()).length;
      const unarchived = await repository.unarchive(first.id);
      const trashed = await repository.trash(second.id);
      const trashCount = (await repository.listTrashed()).length;
      const restored = await repository.restore(second.id);

      return {
        orderedTitles: ordered.map((note) => note.title),
        archivedAt: archived.archivedAt,
        archivedPinnedAt: archived.pinnedAt,
        archiveCount,
        unarchivedAt: unarchived.archivedAt,
        trashedAt: trashed.trashedAt,
        trashCount,
        restoredAt: restored.trashedAt,
      };
    } finally {
      database.close();
      await dbModule.deleteNotesDatabase(name);
    }
  }, databaseName);

  expect(result.orderedTitles[0]).toBe('First');
  expect(result.archivedAt).not.toBeNull();
  expect(result.archivedPinnedAt).toBeNull();
  expect(result.archiveCount).toBe(1);
  expect(result.unarchivedAt).toBeNull();
  expect(result.trashedAt).not.toBeNull();
  expect(result.trashCount).toBe(1);
  expect(result.restoredAt).toBeNull();
});

test('rolls back failed transactions and cascades permanent deletion', async ({ page }) => {
  await page.goto('./');
  const databaseName = testDatabaseName('atomic');

  const result = await page.evaluate(async (name) => {
    const dbModule = await import('/notes/src/db/index.ts');
    const database = dbModule.createNotesDatabase(name);
    const repository = new dbModule.NotesRepository(database);

    try {
      const rollbackId = crypto.randomUUID();
      try {
        await database.transaction('rw', database.notes, async () => {
          await database.notes.add({
            id: rollbackId,
            type: 'text',
            title: 'Rollback',
            content: '',
            color: 'default',
            createdAt: 1,
            updatedAt: 1,
            pinnedAt: null,
            archivedAt: null,
            trashedAt: null,
            position: 0,
            revision: 1,
          });
          throw new Error('Force rollback');
        });
      } catch {
        // Expected: Dexie aborts the transaction.
      }

      const rolledBack = (await database.notes.get(rollbackId)) === undefined;

      const note = await repository.create({
        type: 'checklist',
        title: 'Cascade',
      });
      const labelId = crypto.randomUUID();
      await database.labels.add({
        id: labelId,
        name: 'Test',
        nameNormalized: 'test',
        createdAt: 10,
        updatedAt: 10,
      });
      await database.checklistItems.add({
        id: crypto.randomUUID(),
        noteId: note.id,
        text: 'Item',
        checked: false,
        parentId: null,
        position: 0,
        createdAt: 10,
        updatedAt: 10,
      });
      await database.noteLabels.add({
        noteId: note.id,
        labelId,
        assignedAt: 10,
      });
      await database.attachments.add({
        id: crypto.randomUUID(),
        noteId: note.id,
        name: 'test.txt',
        mimeType: 'text/plain',
        size: 4,
        checksum: 'test-checksum',
        data: new Blob(['test'], { type: 'text/plain' }),
        createdAt: 10,
      });
      await database.revisions.add({
        id: crypto.randomUUID(),
        noteId: note.id,
        noteRevision: 1,
        reason: 'edit',
        payload: '{}',
        createdAt: 10,
      });

      const deleted = await repository.deletePermanently(note.id);

      return {
        rolledBack,
        deleted,
        noteCount: await database.notes.count(),
        checklistCount: await database.checklistItems.count(),
        relationCount: await database.noteLabels.count(),
        attachmentCount: await database.attachments.count(),
        revisionCount: await database.revisions.count(),
        labelCount: await database.labels.count(),
      };
    } finally {
      database.close();
      await dbModule.deleteNotesDatabase(name);
    }
  }, databaseName);

  expect(result).toEqual({
    rolledBack: true,
    deleted: true,
    noteCount: 0,
    checklistCount: 0,
    relationCount: 0,
    attachmentCount: 0,
    revisionCount: 0,
    labelCount: 1,
  });
});

test('duplicates dependent note data without copying lifecycle state', async ({ page }) => {
  await page.goto('./');
  const databaseName = testDatabaseName('duplicate');

  const result = await page.evaluate(async (name) => {
    const dbModule = await import('/notes/src/db/index.ts');
    const database = dbModule.createNotesDatabase(name);
    const repository = new dbModule.NotesRepository(database);

    try {
      const source = await repository.create({
        type: 'checklist',
        title: 'Source',
      });
      const labelId = crypto.randomUUID();
      const sourceParentId = crypto.randomUUID();
      const sourceChildId = crypto.randomUUID();
      await database.labels.add({
        id: labelId,
        name: 'Copied',
        nameNormalized: 'copied',
        createdAt: 20,
        updatedAt: 20,
      });
      await database.checklistItems.bulkAdd([
        {
          id: sourceParentId,
          noteId: source.id,
          text: 'Parent',
          checked: false,
          parentId: null,
          position: 0,
          createdAt: 20,
          updatedAt: 20,
        },
        {
          id: sourceChildId,
          noteId: source.id,
          text: 'Child',
          checked: false,
          parentId: sourceParentId,
          position: 1,
          createdAt: 20,
          updatedAt: 20,
        },
      ]);
      await database.noteLabels.add({
        noteId: source.id,
        labelId,
        assignedAt: 20,
      });
      await database.attachments.add({
        id: crypto.randomUUID(),
        noteId: source.id,
        name: null,
        mimeType: 'text/plain',
        size: 1,
        checksum: 'x',
        data: new Blob(['x']),
        createdAt: 20,
      });
      await repository.setPinned(source.id, true);

      const duplicate = await repository.duplicate(source.id);
      const duplicatedItems = await database.checklistItems
        .where('noteId')
        .equals(duplicate.id)
        .sortBy('position');
      const [duplicatedParent, duplicatedChild] = duplicatedItems;

      return {
        sourceId: source.id,
        sourceParentId,
        sourceChildId,
        duplicate,
        duplicatedParentId: duplicatedParent?.id ?? null,
        duplicatedChildId: duplicatedChild?.id ?? null,
        duplicatedChildParentId: duplicatedChild?.parentId ?? null,
        items: duplicatedItems.length,
        labels: await database.noteLabels.where('noteId').equals(duplicate.id).count(),
        attachments: await database.attachments.where('noteId').equals(duplicate.id).count(),
      };
    } finally {
      database.close();
      await dbModule.deleteNotesDatabase(name);
    }
  }, databaseName);

  expect(result.duplicate.id).not.toBe(result.sourceId);
  expect(result.duplicate.revision).toBe(1);
  expect(result.duplicate.pinnedAt).toBeNull();
  expect(result.duplicate.archivedAt).toBeNull();
  expect(result.duplicate.trashedAt).toBeNull();
  expect(result.items).toBe(2);
  expect(result.duplicatedParentId).not.toBe(result.sourceParentId);
  expect(result.duplicatedChildId).not.toBe(result.sourceChildId);
  expect(result.duplicatedChildParentId).toBe(result.duplicatedParentId);
  expect(result.labels).toBe(1);
  expect(result.attachments).toBe(1);
});
