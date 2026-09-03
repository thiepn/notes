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

      await reopenedDatabase.open();
      const databaseVersion = reopenedDatabase.verno;
      const hasReminderStore = reopenedDatabase.tables.some((table) => table.name === 'reminders');
      reopenedDatabase.close();
      return {
        content: reopened.content,
        revision: reopened.revision,
        updatedRevision: updated.revision,
        conflictName,
        databaseVersion,
        hasReminderStore,
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
  expect(result.databaseVersion).toBe(3);
  expect(result.hasReminderStore).toBe(true);
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

test('stores, transitions, snoozes, and deduplicates one reminder per note', async ({ page }) => {
  await page.goto('./');
  const databaseName = testDatabaseName('reminders');

  const result = await page.evaluate(async (name) => {
    const dbModule = await import('/notes/src/db/index.ts');
    const database = dbModule.createNotesDatabase(name);
    let tick = 10_000;
    const notes = new dbModule.NotesRepository(database, { clock: () => tick++ });
    const reminders = new dbModule.RemindersRepository(database, { clock: () => tick++ });

    try {
      const note = await notes.create({ title: 'Call mom' });
      const first = await reminders.set(note.id, { dueAt: 20_000, timeZone: 'Europe/Berlin' });
      const changed = await reminders.set(note.id, { dueAt: 25_000, timeZone: 'Europe/Berlin' });
      const reminderCount = await database.reminders.where('noteId').equals(note.id).count();
      const dueBeforeNotify = (await reminders.dueForNotification(30_000)).length;
      const notified = await reminders.markNotified(note.id, 30_000);
      const dueAfterNotify = (await reminders.dueForNotification(30_000)).length;
      const snoozed = await reminders.snooze(note.id, 40_000);
      const completed = await reminders.complete(note.id);
      const reactivated = await reminders.set(note.id, {
        dueAt: 50_000,
        timeZone: 'Europe/Berlin',
      });
      const dismissed = await reminders.dismiss(note.id);

      await notes.trash(note.id);
      const dueWhileTrashed = (await reminders.dueForNotification(100_000)).length;
      let trashedSetError = '';
      try {
        await reminders.set(note.id, { dueAt: 60_000, timeZone: 'Europe/Berlin' });
      } catch (error) {
        trashedSetError = error instanceof Error ? error.name : 'unknown';
      }

      return {
        sameId: first.id === changed.id,
        changedDueAt: changed.dueAt,
        reminderCount,
        dueBeforeNotify,
        notifiedAt: notified.lastNotifiedAt,
        dueAfterNotify,
        snoozedStatus: snoozed.status,
        snoozedDueAt: snoozed.dueAt,
        completedStatus: completed.status,
        completedAt: completed.completedAt,
        reactivatedStatus: reactivated.status,
        reactivatedCompletedAt: reactivated.completedAt,
        dismissedStatus: dismissed.status,
        dismissedAt: dismissed.dismissedAt,
        dueWhileTrashed,
        trashedSetError,
      };
    } finally {
      database.close();
      await dbModule.deleteNotesDatabase(name);
    }
  }, databaseName);

  expect(result.sameId).toBe(true);
  expect(result.changedDueAt).toBe(25_000);
  expect(result.reminderCount).toBe(1);
  expect(result.dueBeforeNotify).toBe(1);
  expect(result.notifiedAt).toBe(30_000);
  expect(result.dueAfterNotify).toBe(0);
  expect(result.snoozedStatus).toBe('active');
  expect(result.snoozedDueAt).toBe(40_000);
  expect(result.completedStatus).toBe('completed');
  expect(result.completedAt).not.toBeNull();
  expect(result.reactivatedStatus).toBe('active');
  expect(result.reactivatedCompletedAt).toBeNull();
  expect(result.dismissedStatus).toBe('dismissed');
  expect(result.dismissedAt).not.toBeNull();
  expect(result.dueWhileTrashed).toBe(0);
  expect(result.trashedSetError).toBe('InvalidNoteStateError');
});

test('rolls back failed transactions and cascades permanent deletion', async ({ page }) => {
  await page.goto('./');
  const databaseName = testDatabaseName('atomic');

  const result = await page.evaluate(async (name) => {
    const dbModule = await import('/notes/src/db/index.ts');
    const database = dbModule.createNotesDatabase(name);
    const repository = new dbModule.NotesRepository(database);
    const reminders = new dbModule.RemindersRepository(database);

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
      await reminders.set(note.id, { dueAt: 100_000, timeZone: 'Europe/Berlin' });
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
        reminderCount: await database.reminders.count(),
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
    reminderCount: 0,
    revisionCount: 0,
    labelCount: 1,
  });
});

test('duplicates dependent note data without copying lifecycle state or reminders', async ({
  page,
}) => {
  await page.goto('./');
  const databaseName = testDatabaseName('duplicate');

  const result = await page.evaluate(async (name) => {
    const dbModule = await import('/notes/src/db/index.ts');
    const database = dbModule.createNotesDatabase(name);
    const repository = new dbModule.NotesRepository(database);
    const reminders = new dbModule.RemindersRepository(database);

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
      await reminders.set(source.id, {
        dueAt: Date.now() + 60_000,
        timeZone: 'Europe/Berlin',
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
        reminders: await database.reminders.where('noteId').equals(duplicate.id).count(),
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
  expect(result.reminders).toBe(0);
});

test('bulk permanent deletion also removes reminder rows', async ({ page }) => {
  await page.goto('./');
  const databaseName = testDatabaseName('bulk-reminders');

  const result = await page.evaluate(async (name) => {
    const dbModule = await import('/notes/src/db/index.ts');
    const database = dbModule.createNotesDatabase(name);
    const notes = new dbModule.NotesRepository(database);
    const reminders = new dbModule.RemindersRepository(database);
    const bulk = new dbModule.BulkActionsRepository(database);

    try {
      const first = await notes.create({ title: 'First reminder' });
      const second = await notes.create({ title: 'Second reminder' });
      await reminders.set(first.id, { dueAt: 10_000, timeZone: 'UTC' });
      await reminders.set(second.id, { dueAt: 20_000, timeZone: 'UTC' });
      await notes.trash(first.id);
      await notes.trash(second.id);
      const deleted = await bulk.deletePermanently([first.id, second.id]);
      return {
        deleted,
        noteCount: await database.notes.count(),
        reminderCount: await database.reminders.count(),
      };
    } finally {
      database.close();
      await dbModule.deleteNotesDatabase(name);
    }
  }, databaseName);

  expect(result).toEqual({ deleted: 2, noteCount: 0, reminderCount: 0 });
});
