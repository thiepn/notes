import { z } from 'zod';

import {
  DATABASE_VERSION,
  attachmentRecordSchema,
  checklistItemRecordSchema,
  labelRecordSchema,
  noteLabelRecordSchema,
  noteRecordSchema,
  reminderRecordSchema,
  revisionRecordSchema,
  settingRecordSchema,
  type AttachmentRecord,
} from '../../db';

export const NOTES_BACKUP_FORMAT = 'thiepn.notes.backup';
export const NOTES_BACKUP_FORMAT_VERSION = 2;
export const MAX_BACKUP_FILE_BYTES = 512 * 1024 * 1024;

const timestampSchema = z.number().int().nonnegative();
const sha256Schema = z.string().regex(/^[a-f0-9]{64}$/u, 'Expected a lowercase SHA-256 digest.');
const base64Schema = z
  .string()
  .regex(
    /^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/u,
    'Attachment data is not valid base64.',
  );

export const backupAttachmentSchema = attachmentRecordSchema
  .omit({ data: true })
  .extend({
    dataBase64: base64Schema,
    dataSha256: sha256Schema,
  })
  .strict();

const backupDataV2Schema = z
  .object({
    notes: z.array(noteRecordSchema),
    checklistItems: z.array(checklistItemRecordSchema),
    labels: z.array(labelRecordSchema),
    noteLabels: z.array(noteLabelRecordSchema),
    attachments: z.array(backupAttachmentSchema),
    reminders: z.array(reminderRecordSchema),
    revisions: z.array(revisionRecordSchema),
    settings: z.array(settingRecordSchema),
  })
  .strict();

export const backupDocumentSchema = z
  .object({
    format: z.literal(NOTES_BACKUP_FORMAT),
    formatVersion: z.literal(NOTES_BACKUP_FORMAT_VERSION),
    databaseVersion: z.literal(DATABASE_VERSION),
    exportedAt: timestampSchema,
    data: backupDataV2Schema,
  })
  .strict();

const previousBackupDocumentSchema = z
  .object({
    format: z.literal(NOTES_BACKUP_FORMAT),
    formatVersion: z.literal(NOTES_BACKUP_FORMAT_VERSION),
    databaseVersion: z.literal(2),
    exportedAt: timestampSchema,
    data: backupDataV2Schema,
  })
  .strict();

const legacyBackupDocumentSchema = z
  .object({
    format: z.literal(NOTES_BACKUP_FORMAT),
    formatVersion: z.literal(1),
    databaseVersion: z.literal(1),
    exportedAt: timestampSchema,
    data: z
      .object({
        notes: z.array(noteRecordSchema),
        checklistItems: z.array(checklistItemRecordSchema),
        labels: z.array(labelRecordSchema),
        noteLabels: z.array(noteLabelRecordSchema),
        attachments: z.array(backupAttachmentSchema),
        revisions: z.array(revisionRecordSchema),
        settings: z.array(settingRecordSchema),
      })
      .strict(),
  })
  .strict();

export type BackupAttachment = z.infer<typeof backupAttachmentSchema>;
export type BackupDocument = z.infer<typeof backupDocumentSchema>;

export interface BackupStats {
  notes: number;
  checklistItems: number;
  labels: number;
  noteLabels: number;
  attachments: number;
  reminders: number;
  revisions: number;
  settings: number;
  totalRecords: number;
}

export interface PreparedBackup {
  document: BackupDocument;
  attachments: AttachmentRecord[];
  stats: BackupStats;
}

export function backupStats(document: BackupDocument): BackupStats {
  const stats = {
    notes: document.data.notes.length,
    checklistItems: document.data.checklistItems.length,
    labels: document.data.labels.length,
    noteLabels: document.data.noteLabels.length,
    attachments: document.data.attachments.length,
    reminders: document.data.reminders.length,
    revisions: document.data.revisions.length,
    settings: document.data.settings.length,
  };

  return {
    ...stats,
    totalRecords: Object.values(stats).reduce((total, count) => total + count, 0),
  };
}

export async function parseBackupText(text: string): Promise<PreparedBackup> {
  let raw: unknown;
  try {
    raw = JSON.parse(text) as unknown;
  } catch {
    throw new Error('This file is not valid JSON.');
  }
  return prepareBackup(raw);
}

export async function prepareBackup(raw: unknown): Promise<PreparedBackup> {
  const document = normalizeBackupDocument(raw);
  validateBackupGraph(document);

  const attachments = await Promise.all(
    document.data.attachments.map(async (attachment) => {
      const bytes = base64ToBytes(attachment.dataBase64);
      if (bytes.byteLength !== attachment.size) {
        throw new Error(`Attachment ${attachment.id} has an unexpected byte length.`);
      }
      const digest = await sha256Hex(bytes);
      if (digest !== attachment.dataSha256) {
        throw new Error(`Attachment ${attachment.id} failed its backup checksum.`);
      }

      return attachmentRecordSchema.parse({
        id: attachment.id,
        noteId: attachment.noteId,
        name: attachment.name,
        mimeType: attachment.mimeType,
        size: attachment.size,
        checksum: attachment.checksum,
        data: new Blob([ownedArrayBuffer(bytes)], { type: attachment.mimeType }),
        createdAt: attachment.createdAt,
      });
    }),
  );

  return { document, attachments, stats: backupStats(document) };
}

export async function attachmentToBackup(record: AttachmentRecord): Promise<BackupAttachment> {
  const parsed = attachmentRecordSchema.parse(record);
  const bytes = new Uint8Array(await parsed.data.arrayBuffer());
  if (bytes.byteLength !== parsed.size) {
    throw new Error(`Attachment ${parsed.id} has an unexpected byte length.`);
  }

  return backupAttachmentSchema.parse({
    id: parsed.id,
    noteId: parsed.noteId,
    name: parsed.name,
    mimeType: parsed.mimeType,
    size: parsed.size,
    checksum: parsed.checksum,
    dataBase64: bytesToBase64(bytes),
    dataSha256: await sha256Hex(bytes),
    createdAt: parsed.createdAt,
  });
}

export function bytesToBase64(bytes: Uint8Array): string {
  const chunkSize = 0x8000;
  let binary = '';
  for (let index = 0; index < bytes.length; index += chunkSize) {
    const chunk = bytes.subarray(index, Math.min(index + chunkSize, bytes.length));
    binary += String.fromCharCode(...chunk);
  }
  return btoa(binary);
}

export function base64ToBytes(value: string): Uint8Array {
  if (!base64Schema.safeParse(value).success) {
    throw new Error('Attachment data is not valid base64.');
  }
  const binary = atob(value);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return bytes;
}

export async function sha256Hex(bytes: Uint8Array): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', ownedArrayBuffer(bytes));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('');
}

function normalizeBackupDocument(raw: unknown): BackupDocument {
  const current = backupDocumentSchema.safeParse(raw);
  if (current.success) return current.data;

  const previous = previousBackupDocumentSchema.safeParse(raw);
  if (previous.success) {
    return backupDocumentSchema.parse({ ...previous.data, databaseVersion: DATABASE_VERSION });
  }

  const legacy = legacyBackupDocumentSchema.parse(raw);
  return backupDocumentSchema.parse({
    ...legacy,
    formatVersion: NOTES_BACKUP_FORMAT_VERSION,
    databaseVersion: DATABASE_VERSION,
    data: { ...legacy.data, reminders: [] },
  });
}

function ownedArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  return Uint8Array.from(bytes).buffer;
}

function validateBackupGraph(document: BackupDocument): void {
  const { notes, checklistItems, labels, noteLabels, attachments, reminders, revisions, settings } =
    document.data;

  assertUnique(
    notes.map((note) => note.id),
    'note ID',
  );
  assertUnique(
    checklistItems.map((item) => item.id),
    'checklist item ID',
  );
  assertUnique(
    labels.map((label) => label.id),
    'label ID',
  );
  assertUnique(
    labels.map((label) => label.nameNormalized),
    'normalized label name',
  );
  assertUnique(
    noteLabels.map((record) => `${record.noteId}:${record.labelId}`),
    'note-label pair',
  );
  assertUnique(
    attachments.map((attachment) => attachment.id),
    'attachment ID',
  );
  assertUnique(
    reminders.map((reminder) => reminder.id),
    'reminder ID',
  );
  assertUnique(
    reminders.map((reminder) => reminder.noteId),
    'reminder note ID',
  );
  assertUnique(
    revisions.map((revision) => revision.id),
    'revision ID',
  );
  assertUnique(
    settings.map((setting) => setting.key),
    'setting key',
  );

  const noteById = new Map(notes.map((note) => [note.id, note]));
  const itemById = new Map(checklistItems.map((item) => [item.id, item]));
  const labelIds = new Set(labels.map((label) => label.id));
  const positionsByNote = new Map<string, Set<number>>();

  for (const item of checklistItems) {
    const note = noteById.get(item.noteId);
    if (!note) throw new Error(`Checklist item ${item.id} references a missing note.`);
    if (note.type !== 'checklist') {
      throw new Error(`Checklist item ${item.id} belongs to a text note.`);
    }

    const positions = positionsByNote.get(item.noteId) ?? new Set<number>();
    if (positions.has(item.position)) {
      throw new Error(`Checklist note ${item.noteId} contains a duplicate item position.`);
    }
    positions.add(item.position);
    positionsByNote.set(item.noteId, positions);

    if (item.parentId === item.id) {
      throw new Error(`Checklist item ${item.id} cannot parent itself.`);
    }
    if (item.parentId !== null) {
      const parent = itemById.get(item.parentId);
      if (!parent || parent.noteId !== item.noteId) {
        throw new Error(`Checklist item ${item.id} references an invalid parent.`);
      }
      if (parent.parentId !== null) {
        throw new Error(`Checklist item ${item.id} exceeds the supported nesting depth.`);
      }
      if (parent.position >= item.position) {
        throw new Error(`Checklist item ${item.id} must appear after its parent.`);
      }
    }
  }

  for (const relation of noteLabels) {
    if (!noteById.has(relation.noteId)) {
      throw new Error('A note-label relationship references a missing note.');
    }
    if (!labelIds.has(relation.labelId)) {
      throw new Error('A note-label relationship references a missing label.');
    }
  }

  for (const attachment of attachments) {
    if (!noteById.has(attachment.noteId)) {
      throw new Error(`Attachment ${attachment.id} references a missing note.`);
    }
  }

  for (const reminder of reminders) {
    if (!noteById.has(reminder.noteId)) {
      throw new Error(`Reminder ${reminder.id} references a missing note.`);
    }
  }

  for (const revision of revisions) {
    if (!noteById.has(revision.noteId)) {
      throw new Error(`Revision ${revision.id} references a missing note.`);
    }
  }
}

function assertUnique(values: string[], label: string): void {
  const seen = new Set<string>();
  for (const value of values) {
    if (seen.has(value)) throw new Error(`Backup contains a duplicate ${label}: ${value}`);
    seen.add(value);
  }
}
