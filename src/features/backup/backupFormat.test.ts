import { describe, expect, it } from 'vitest';

import { bytesToBase64, prepareBackup, sha256Hex, type BackupDocument } from './backupFormat';

const NOTE_ID = '10000000-0000-4000-8000-000000000001';
const CHECKLIST_ID = '10000000-0000-4000-8000-000000000002';
const ITEM_ID = '10000000-0000-4000-8000-000000000003';
const LABEL_ID = '10000000-0000-4000-8000-000000000004';
const ATTACHMENT_ID = '10000000-0000-4000-8000-000000000005';
const REVISION_ID = '10000000-0000-4000-8000-000000000006';
const SECOND_ITEM_ID = '10000000-0000-4000-8000-000000000007';
const REMINDER_ID = '10000000-0000-4000-8000-000000000008';

async function validBackup(): Promise<BackupDocument> {
  const bytes = new TextEncoder().encode('attachment bytes');
  return {
    format: 'thiepn.notes.backup',
    formatVersion: 2,
    databaseVersion: 2,
    exportedAt: 123,
    data: {
      notes: [
        {
          id: NOTE_ID,
          type: 'text',
          title: 'Text',
          content: 'Body',
          color: 'default',
          createdAt: 1,
          updatedAt: 2,
          pinnedAt: null,
          archivedAt: null,
          trashedAt: null,
          position: 0,
          revision: 1,
        },
        {
          id: CHECKLIST_ID,
          type: 'checklist',
          title: 'List',
          content: '',
          color: 'blue',
          createdAt: 3,
          updatedAt: 4,
          pinnedAt: null,
          archivedAt: null,
          trashedAt: null,
          position: 1,
          revision: 2,
        },
      ],
      checklistItems: [
        {
          id: ITEM_ID,
          noteId: CHECKLIST_ID,
          text: 'Task',
          checked: false,
          parentId: null,
          position: 0,
          createdAt: 3,
          updatedAt: 4,
        },
      ],
      labels: [
        {
          id: LABEL_ID,
          name: 'Work',
          nameNormalized: 'work',
          createdAt: 1,
          updatedAt: 1,
        },
      ],
      noteLabels: [{ noteId: NOTE_ID, labelId: LABEL_ID, assignedAt: 2 }],
      attachments: [
        {
          id: ATTACHMENT_ID,
          noteId: NOTE_ID,
          name: 'file.txt',
          mimeType: 'text/plain',
          size: bytes.byteLength,
          checksum: 'legacy-checksum',
          dataBase64: bytesToBase64(bytes),
          dataSha256: await sha256Hex(bytes),
          createdAt: 2,
        },
      ],
      reminders: [
        {
          id: REMINDER_ID,
          noteId: NOTE_ID,
          dueAt: 1_800_000,
          timeZone: 'Europe/Berlin',
          status: 'active',
          createdAt: 2,
          updatedAt: 2,
          completedAt: null,
          dismissedAt: null,
          lastNotifiedAt: null,
        },
      ],
      revisions: [
        {
          id: REVISION_ID,
          noteId: NOTE_ID,
          noteRevision: 1,
          reason: 'edit',
          payload: '{"opaque":"preserved"}',
          createdAt: 2,
        },
      ],
      settings: [{ key: 'example', value: 'value', updatedAt: 2 }],
    },
  };
}

describe('backup format', () => {
  it('prepares every table, reminders included, and reconstructs attachment blobs losslessly', async () => {
    const backup = await validBackup();
    const prepared = await prepareBackup(backup);

    expect(prepared.stats).toEqual({
      notes: 2,
      checklistItems: 1,
      labels: 1,
      noteLabels: 1,
      attachments: 1,
      reminders: 1,
      revisions: 1,
      settings: 1,
      totalRecords: 9,
    });
    expect(prepared.document.data.reminders[0]).toEqual(backup.data.reminders[0]);
    expect(await prepared.attachments[0]?.data.text()).toBe('attachment bytes');
    expect(prepared.attachments[0]?.checksum).toBe('legacy-checksum');
  });

  it('accepts a legacy V1 backup and upgrades it with an empty reminder table', async () => {
    const current = await validBackup();
    const legacy = {
      format: current.format,
      formatVersion: 1,
      databaseVersion: 1,
      exportedAt: current.exportedAt,
      data: {
        notes: current.data.notes,
        checklistItems: current.data.checklistItems,
        labels: current.data.labels,
        noteLabels: current.data.noteLabels,
        attachments: current.data.attachments,
        revisions: current.data.revisions,
        settings: current.data.settings,
      },
    };

    const prepared = await prepareBackup(legacy);
    expect(prepared.document.formatVersion).toBe(2);
    expect(prepared.document.databaseVersion).toBe(2);
    expect(prepared.document.data.reminders).toEqual([]);
    expect(prepared.stats.reminders).toBe(0);
  });

  it('rejects a reminder that references a missing note', async () => {
    const backup = await validBackup();
    backup.data.reminders[0]!.noteId = '10000000-0000-4000-8000-000000000099';
    await expect(prepareBackup(backup)).rejects.toThrow('Reminder');
  });

  it('rejects more than one reminder for the same note', async () => {
    const backup = await validBackup();
    backup.data.reminders.push({
      ...backup.data.reminders[0]!,
      id: '10000000-0000-4000-8000-000000000099',
    });
    await expect(prepareBackup(backup)).rejects.toThrow('duplicate reminder note ID');
  });

  it('rejects attachment bytes that do not match the backup SHA-256', async () => {
    const backup = await validBackup();
    backup.data.attachments[0]!.dataSha256 = '0'.repeat(64);
    await expect(prepareBackup(backup)).rejects.toThrow('failed its backup checksum');
  });

  it('rejects dangling relationships before restore can begin', async () => {
    const backup = await validBackup();
    backup.data.noteLabels[0]!.noteId = '10000000-0000-4000-8000-000000000099';
    await expect(prepareBackup(backup)).rejects.toThrow('missing note');
  });

  it('rejects duplicate semantic keys even when individual rows are valid', async () => {
    const backup = await validBackup();
    backup.data.labels.push({
      ...backup.data.labels[0]!,
      id: '10000000-0000-4000-8000-000000000088',
    });
    await expect(prepareBackup(backup)).rejects.toThrow('duplicate normalized label name');
  });

  it('rejects duplicate checklist positions within one note', async () => {
    const backup = await validBackup();
    backup.data.checklistItems.push({
      ...backup.data.checklistItems[0]!,
      id: SECOND_ITEM_ID,
      text: 'Second task',
    });
    await expect(prepareBackup(backup)).rejects.toThrow('duplicate item position');
  });

  it('rejects a nested checklist item ordered before its parent', async () => {
    const backup = await validBackup();
    backup.data.checklistItems[0]!.position = 1;
    backup.data.checklistItems.push({
      ...backup.data.checklistItems[0]!,
      id: SECOND_ITEM_ID,
      text: 'Child task',
      parentId: ITEM_ID,
      position: 0,
    });
    await expect(prepareBackup(backup)).rejects.toThrow('must appear after its parent');
  });
});
