import { describe, expect, it } from 'vitest';

import { bytesToBase64, sha256Hex, type BackupDocument } from './backupFormat';
import {
  NOTES_PORTABLE_FORMAT,
  buildPortableArchive,
  portableArchiveFilename,
  portableNoteFilename,
} from './portableArchive';

const TEXT_NOTE = '11111111-1111-4111-8111-111111111111';
const CHECKLIST_NOTE = '22222222-2222-4222-8222-222222222222';
const PARENT = '33333333-3333-4333-8333-333333333333';
const CHILD = '44444444-4444-4444-8444-444444444444';
const LABEL = '55555555-5555-4555-8555-555555555555';
const ATTACHMENT = '66666666-6666-4666-8666-666666666666';
const REMINDER = '77777777-7777-4777-8777-777777777777';

async function fixture(): Promise<BackupDocument> {
  const bytes = new Uint8Array([1, 2, 3, 4, 5]);
  return {
    format: 'thiepn.notes.backup',
    formatVersion: 2,
    databaseVersion: 3,
    exportedAt: Date.UTC(2026, 8, 9, 21, 30, 0),
    data: {
      notes: [
        {
          id: TEXT_NOTE,
          type: 'text',
          title: 'Travel / ideas',
          content: 'Portable body with [[links]].',
          color: 'blue',
          createdAt: 100,
          updatedAt: 200,
          pinnedAt: 150,
          archivedAt: null,
          trashedAt: null,
          position: 0,
          revision: 2,
        },
        {
          id: CHECKLIST_NOTE,
          type: 'checklist',
          title: 'Archived checklist',
          content: '',
          color: 'default',
          createdAt: 300,
          updatedAt: 400,
          pinnedAt: null,
          archivedAt: 450,
          trashedAt: null,
          position: 0,
          revision: 1,
        },
      ],
      checklistItems: [
        {
          id: PARENT,
          noteId: CHECKLIST_NOTE,
          text: 'Parent task',
          checked: true,
          parentId: null,
          position: 0,
          createdAt: 310,
          updatedAt: 410,
        },
        {
          id: CHILD,
          noteId: CHECKLIST_NOTE,
          text: 'Child task',
          checked: false,
          parentId: PARENT,
          position: 1,
          createdAt: 320,
          updatedAt: 420,
        },
      ],
      labels: [
        {
          id: LABEL,
          name: 'Reference',
          nameNormalized: 'reference',
          createdAt: 50,
          updatedAt: 50,
        },
      ],
      noteLabels: [{ noteId: TEXT_NOTE, labelId: LABEL, assignedAt: 160 }],
      attachments: [
        {
          id: ATTACHMENT,
          noteId: TEXT_NOTE,
          name: 'photo?.png',
          mimeType: 'image/png',
          size: bytes.byteLength,
          checksum: 'source-checksum',
          dataBase64: bytesToBase64(bytes),
          dataSha256: await sha256Hex(bytes),
          createdAt: 170,
        },
      ],
      reminders: [
        {
          id: REMINDER,
          noteId: TEXT_NOTE,
          dueAt: 1_800_000_000_000,
          timeZone: 'Europe/Berlin',
          status: 'active',
          createdAt: 180,
          updatedAt: 180,
          completedAt: null,
          dismissedAt: null,
          lastNotifiedAt: null,
        },
      ],
      revisions: [],
      settings: [],
    },
  };
}

describe('portable library archive', () => {
  it('exports every note, lifecycle metadata, labels, reminders, and original attachment bytes', async () => {
    const built = await buildPortableArchive(await fixture());
    const decoder = new TextDecoder();

    expect(built.manifest.format).toBe(NOTES_PORTABLE_FORMAT);
    expect(built.manifest.counts).toMatchObject({
      notes: 2,
      active: 1,
      archived: 1,
      trashed: 0,
      checklistItems: 2,
      labels: 1,
      attachments: 1,
      reminders: 1,
    });

    const textEntry = built.manifest.notes.find((note) => note.id === TEXT_NOTE)!;
    expect(textEntry.labels).toEqual(['Reference']);
    expect(textEntry.reminder).toMatchObject({ timeZone: 'Europe/Berlin', status: 'active' });
    expect(textEntry.attachments).toHaveLength(1);
    expect(textEntry.path).toBe(`notes/Travel - ideas--${TEXT_NOTE.slice(0, 8)}.md`);
    expect(textEntry.attachments[0]?.path).toBe(`attachments/${TEXT_NOTE}/photo-.png`);
    expect(Array.from(built.files[textEntry.attachments[0]!.path]!)).toEqual([1, 2, 3, 4, 5]);

    const textMarkdown = decoder.decode(built.files[textEntry.path]);
    expect(textMarkdown).toContain('lifecycle: "active"');
    expect(textMarkdown).toContain('labels: ["Reference"]');
    expect(textMarkdown).toContain('Portable body with [[links]].');
    expect(textMarkdown).toContain(`](../attachments/${TEXT_NOTE}/photo-.png)`);

    const checklistEntry = built.manifest.notes.find((note) => note.id === CHECKLIST_NOTE)!;
    expect(checklistEntry.lifecycle).toBe('archived');
    const checklistMarkdown = decoder.decode(built.files[checklistEntry.path]);
    expect(checklistMarkdown).toContain('- [x] Parent task');
    expect(checklistMarkdown).toContain('  - [ ] Child task');

    const manifestFile = JSON.parse(decoder.decode(built.files['manifest.json'])) as {
      format: string;
      notes: unknown[];
    };
    expect(manifestFile.format).toBe(NOTES_PORTABLE_FORMAT);
    expect(manifestFile.notes).toHaveLength(2);
    expect(decoder.decode(built.files['README.md'])).toContain('human-readable export');
  });

  it('uses portable, collision-resistant note names and timestamped archive names', () => {
    expect(portableNoteFilename('CON', TEXT_NOTE)).toBe(`Note-CON--${TEXT_NOTE.slice(0, 8)}.md`);
    expect(portableNoteFilename('A/B:C*D?', TEXT_NOTE)).toBe(
      `A-B-C-D---${TEXT_NOTE.slice(0, 8)}.md`,
    );
    expect(portableArchiveFilename(Date.UTC(2026, 8, 9, 21, 30, 0))).toBe(
      'notes-portable-2026-09-09T21-30-00-000Z.zip',
    );
  });
});
