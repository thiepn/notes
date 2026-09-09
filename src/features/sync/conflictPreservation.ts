import type { ChecklistItemRecord, NoteRecord } from '../../db';
import { notesDatabase } from '../../db';
import { checklistItemRecordSchema, noteRecordSchema } from '../../db/validation';
import type { RemoteSyncRecord } from './supabaseApi';

export type ConflictCopySource = 'this-device' | 'cloud';

interface ConflictDocumentSnapshot {
  note: NoteRecord;
  items: ChecklistItemRecord[];
}

interface PreserveConflictCopyOptions {
  noteId: string;
  source: ConflictCopySource;
  expectedUserId: string;
  remoteNote: RemoteSyncRecord;
  remoteRecords: RemoteSyncRecord[];
  now?: () => number;
  idFactory?: () => string;
}

export interface PreservedConflictCopy {
  note: NoteRecord;
  items: ChecklistItemRecord[];
  source: ConflictCopySource;
}

export async function preserveSyncConflictCopy({
  noteId,
  source,
  expectedUserId,
  remoteNote,
  remoteRecords,
  now = Date.now,
  idFactory = () => crypto.randomUUID(),
}: PreserveConflictCopyOptions): Promise<PreservedConflictCopy> {
  const snapshot =
    source === 'this-device'
      ? await readLocalSnapshot(noteId)
      : await readRemoteSnapshot(expectedUserId, remoteNote, remoteRecords);
  if (snapshot.note.id !== noteId) {
    throw new Error('Conflict snapshot belongs to a different note.');
  }

  const timestamp = now();
  if (!Number.isSafeInteger(timestamp) || timestamp < 0) {
    throw new RangeError('Conflict-copy clock must return a non-negative safe integer.');
  }
  const noteIdCopy = idFactory();
  const note = noteRecordSchema.parse({
    ...snapshot.note,
    id: noteIdCopy,
    title: conflictCopyTitle(snapshot.note.title, source, timestamp),
    content: snapshot.note.type === 'text' ? snapshot.note.content : '',
    createdAt: timestamp,
    updatedAt: timestamp,
    pinnedAt: null,
    archivedAt: null,
    trashedAt: null,
    position: 0,
    revision: 1,
  });

  const idMap = new Map(snapshot.items.map((item) => [item.id, idFactory()]));
  const items =
    snapshot.note.type === 'checklist'
      ? snapshot.items.map((item, position) =>
          checklistItemRecordSchema.parse({
            ...item,
            id: idMap.get(item.id),
            noteId: note.id,
            parentId: item.parentId ? (idMap.get(item.parentId) ?? null) : null,
            position,
            createdAt: timestamp,
            updatedAt: timestamp,
          }),
        )
      : [];

  await notesDatabase.transaction(
    'rw',
    notesDatabase.notes,
    notesDatabase.checklistItems,
    async () => {
      await notesDatabase.notes.add(note);
      if (items.length > 0) await notesDatabase.checklistItems.bulkAdd(items);
    },
  );

  return { note, items, source };
}

export function conflictCopyTitle(
  title: string,
  source: ConflictCopySource,
  timestamp: number,
): string {
  const sourceLabel = source === 'this-device' ? 'this device' : 'cloud';
  const date = new Date(timestamp).toISOString().replace('T', ' ').replace('.000Z', 'Z');
  const suffix = ` — conflict copy (${sourceLabel}, ${date})`;
  const base = title.trim() || 'Untitled';
  return `${base.slice(0, Math.max(0, 500 - suffix.length))}${suffix}`;
}

async function readLocalSnapshot(noteId: string): Promise<ConflictDocumentSnapshot> {
  const rawNote = await notesDatabase.notes.get(noteId);
  if (!rawNote) throw new Error('The local conflict version no longer exists.');
  const note = noteRecordSchema.parse(rawNote);
  const items =
    note.type === 'checklist'
      ? (await notesDatabase.checklistItems.where('noteId').equals(noteId).toArray())
          .map((item) => checklistItemRecordSchema.parse(item))
          .sort(compareChecklistItems)
      : [];
  return { note, items };
}

async function readRemoteSnapshot(
  expectedUserId: string,
  remoteNote: RemoteSyncRecord,
  remoteRecords: RemoteSyncRecord[],
): Promise<ConflictDocumentSnapshot> {
  await validateRemoteRecord(remoteNote, expectedUserId, 'note');
  const note = noteRecordSchema.parse(remoteNote.payload);
  const items: ChecklistItemRecord[] = [];

  if (note.type === 'checklist') {
    const candidates = remoteRecords.filter(
      (record) =>
        record.entity_type === 'checklist_item' &&
        record.deleted_at === null &&
        record.payload?.noteId === note.id,
    );
    for (const record of candidates) {
      await validateRemoteRecord(record, expectedUserId, 'checklist_item');
      items.push(checklistItemRecordSchema.parse(record.payload));
    }
    items.sort(compareChecklistItems);
  }

  return { note, items };
}

async function validateRemoteRecord(
  record: RemoteSyncRecord,
  expectedUserId: string,
  expectedType: 'note' | 'checklist_item',
): Promise<void> {
  if (record.user_id !== expectedUserId) {
    throw new Error('Conflict source belongs to a different account.');
  }
  if (record.entity_type !== expectedType || record.deleted_at !== null || !record.payload) {
    throw new Error('Conflict source is not an active document record.');
  }
  const payloadId = record.payload.id;
  if (payloadId !== record.entity_id) {
    throw new Error('Conflict source identity does not match its payload.');
  }
  const hash = await hashPayload(record.payload);
  if (hash !== record.payload_hash) {
    throw new Error('Conflict source checksum failed. Local data was kept.');
  }
}

function compareChecklistItems(a: ChecklistItemRecord, b: ChecklistItemRecord): number {
  return a.position - b.position || a.createdAt - b.createdAt || a.id.localeCompare(b.id);
}

async function hashPayload(payload: Record<string, unknown>): Promise<string> {
  const bytes = new TextEncoder().encode(stableStringify(payload));
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

function stableStringify(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`;
  const record = value as Record<string, unknown>;
  return `{${Object.keys(record)
    .sort()
    .map((key) => `${JSON.stringify(key)}:${stableStringify(record[key])}`)
    .join(',')}}`;
}
