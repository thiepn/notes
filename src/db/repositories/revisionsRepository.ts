import { z } from 'zod';

import type { NotesDatabase } from '../database';
import { nextTimestamp } from '../clock';
import { NoteConflictError, NoteNotFoundError } from '../errors';
import type {
  ChecklistItemRecord,
  NoteColor,
  NoteRecord,
  NoteType,
  RevisionReason,
  RevisionRecord,
} from '../types';
import {
  checklistItemRecordSchema,
  noteColorSchema,
  noteRecordSchema,
  noteTypeSchema,
  revisionRecordSchema,
} from '../validation';

const MAX_REVISIONS_PER_NOTE = 50;
const RECENT_REVISIONS_TO_KEEP = 30;
const HISTORICAL_REVISIONS_TO_KEEP = MAX_REVISIONS_PER_NOTE - RECENT_REVISIONS_TO_KEEP;

const revisionChecklistItemSnapshotSchema = z
  .object({
    id: z.string().uuid(),
    text: z.string().max(100_000),
    checked: z.boolean(),
    parentId: z.string().uuid().nullable(),
  })
  .strict();

export const revisionSnapshotSchema = z
  .object({
    version: z.literal(1),
    type: noteTypeSchema,
    title: z.string().max(500),
    content: z.string().max(1_000_000),
    color: noteColorSchema,
    items: z.array(revisionChecklistItemSnapshotSchema).max(10_000),
  })
  .strict();

export interface RevisionChecklistItemSnapshot {
  id: string;
  text: string;
  checked: boolean;
  parentId: string | null;
}

export interface RevisionSnapshot {
  version: 1;
  type: NoteType;
  title: string;
  content: string;
  color: NoteColor;
  items: RevisionChecklistItemSnapshot[];
}

export interface RevisionEntry {
  record: RevisionRecord;
  snapshot: RevisionSnapshot;
}

export interface RevisionRestoreResult {
  note: NoteRecord;
  items: ChecklistItemRecord[];
  undoRevisionId: string;
}

export interface RevisionCopyResult {
  note: NoteRecord;
  items: ChecklistItemRecord[];
}

interface RevisionsRepositoryOptions {
  clock?: () => number;
  idFactory?: () => string;
}

export class RevisionsRepository {
  private readonly clock: () => number;
  private readonly idFactory: () => string;

  constructor(
    private readonly database: NotesDatabase,
    options: RevisionsRepositoryOptions = {},
  ) {
    this.clock = options.clock ?? Date.now;
    this.idFactory = options.idFactory ?? (() => crypto.randomUUID());
  }

  async checkpoint(noteId: string, reason: RevisionReason): Promise<RevisionEntry | null> {
    return this.database.transaction(
      'rw',
      this.database.notes,
      this.database.checklistItems,
      this.database.revisions,
      async () => {
        const rawNote = await this.database.notes.get(noteId);
        if (!rawNote) throw new NoteNotFoundError(noteId);
        const note = noteRecordSchema.parse(rawNote);
        const existing = await this.latestRecord(noteId);
        const snapshot = await this.snapshotForNote(note);
        const payload = serializeRevisionSnapshot(snapshot);
        if (existing?.payload === payload) return null;

        const record = await this.addRecord(note, reason, payload, existing?.createdAt ?? 0);
        await this.prune(noteId);
        return { record, snapshot };
      },
    );
  }

  async list(noteId: string): Promise<RevisionEntry[]> {
    const rows = await this.database.revisions.where('noteId').equals(noteId).toArray();
    return rows
      .map((row) => revisionRecordSchema.parse(row))
      .sort(compareRevisionRecordsDescending)
      .map((record) => ({ record, snapshot: parseRevisionPayload(record.payload) }));
  }

  async restore(
    noteId: string,
    revisionId: string,
    expectedRevision?: number,
  ): Promise<RevisionRestoreResult> {
    return this.database.transaction(
      'rw',
      this.database.notes,
      this.database.checklistItems,
      this.database.revisions,
      async () => {
        const rawRevision = await this.database.revisions.get(revisionId);
        if (!rawRevision) throw new Error('This revision no longer exists.');
        const revision = revisionRecordSchema.parse(rawRevision);
        if (revision.noteId !== noteId) throw new Error('This revision belongs to a different note.');
        const snapshot = parseRevisionPayload(revision.payload);

        const rawCurrent = await this.database.notes.get(noteId);
        if (!rawCurrent) throw new NoteNotFoundError(noteId);
        const current = noteRecordSchema.parse(rawCurrent);
        if (expectedRevision !== undefined && current.revision !== expectedRevision) {
          throw new NoteConflictError(noteId, expectedRevision, current.revision);
        }

        const currentSnapshot = await this.snapshotForNote(current);
        const currentPayload = serializeRevisionSnapshot(currentSnapshot);
        const latest = await this.latestRecord(noteId);
        const undoRecord =
          latest?.payload === currentPayload
            ? latest
            : await this.addRecord(current, 'restore', currentPayload, latest?.createdAt ?? 0);

        const timestamp = nextTimestamp(current.updatedAt, this.readClock());
        const restoredNote = noteRecordSchema.parse({
          ...current,
          type: snapshot.type,
          title: snapshot.title,
          content: snapshot.type === 'text' ? snapshot.content : '',
          color: snapshot.color,
          updatedAt: timestamp,
          revision: current.revision + 1,
        });
        const restoredItems =
          snapshot.type === 'checklist'
            ? buildRestoredItems(noteId, snapshot.items, timestamp, false, this.idFactory)
            : [];

        await this.database.checklistItems.where('noteId').equals(noteId).delete();
        if (restoredItems.length > 0) await this.database.checklistItems.bulkAdd(restoredItems);
        await this.database.notes.put(restoredNote);
        await this.prune(noteId);

        return { note: restoredNote, items: restoredItems, undoRevisionId: undoRecord.id };
      },
    );
  }

  async copyAsNew(revisionId: string): Promise<RevisionCopyResult> {
    return this.database.transaction(
      'rw',
      this.database.notes,
      this.database.checklistItems,
      this.database.revisions,
      async () => {
        const rawRevision = await this.database.revisions.get(revisionId);
        if (!rawRevision) throw new Error('This revision no longer exists.');
        const revision = revisionRecordSchema.parse(rawRevision);
        const snapshot = parseRevisionPayload(revision.payload);
        const timestamp = this.readClock();
        const note = noteRecordSchema.parse({
          id: this.idFactory(),
          type: snapshot.type,
          title: snapshot.title,
          content: snapshot.type === 'text' ? snapshot.content : '',
          color: snapshot.color,
          createdAt: timestamp,
          updatedAt: timestamp,
          pinnedAt: null,
          archivedAt: null,
          trashedAt: null,
          position: 0,
          revision: 1,
        });
        const items =
          snapshot.type === 'checklist'
            ? buildRestoredItems(note.id, snapshot.items, timestamp, true, this.idFactory)
            : [];

        await this.database.notes.add(note);
        if (items.length > 0) await this.database.checklistItems.bulkAdd(items);
        return { note, items };
      },
    );
  }

  private async snapshotForNote(note: NoteRecord): Promise<RevisionSnapshot> {
    const items =
      note.type === 'checklist'
        ? (
            await this.database.checklistItems.where('noteId').equals(note.id).toArray()
          )
            .map((item) => checklistItemRecordSchema.parse(item))
            .sort((a, b) => a.position - b.position || a.createdAt - b.createdAt)
            .map((item) => ({
              id: item.id,
              text: item.text,
              checked: item.checked,
              parentId: item.parentId,
            }))
        : [];

    return revisionSnapshotSchema.parse({
      version: 1,
      type: note.type,
      title: note.title,
      content: note.type === 'text' ? note.content : '',
      color: note.color,
      items,
    });
  }

  private async latestRecord(noteId: string): Promise<RevisionRecord | null> {
    const rows = await this.database.revisions.where('noteId').equals(noteId).toArray();
    if (rows.length === 0) return null;
    return rows
      .map((row) => revisionRecordSchema.parse(row))
      .sort(compareRevisionRecordsDescending)[0] ?? null;
  }

  private async addRecord(
    note: NoteRecord,
    reason: RevisionReason,
    payload: string,
    previousCreatedAt: number,
  ): Promise<RevisionRecord> {
    const createdAt = nextTimestamp(previousCreatedAt, this.readClock());
    const record = revisionRecordSchema.parse({
      id: this.idFactory(),
      noteId: note.id,
      noteRevision: note.revision,
      reason,
      payload,
      createdAt,
    });
    await this.database.revisions.add(record);
    return record;
  }

  private async prune(noteId: string): Promise<void> {
    const rows = (await this.database.revisions.where('noteId').equals(noteId).toArray())
      .map((row) => revisionRecordSchema.parse(row))
      .sort(compareRevisionRecordsDescending);
    if (rows.length <= MAX_REVISIONS_PER_NOTE) return;

    const recent = rows.slice(0, RECENT_REVISIONS_TO_KEEP);
    const historical = rows.slice(RECENT_REVISIONS_TO_KEEP).reverse();
    const historicalKept = sampleAcrossHistory(historical, HISTORICAL_REVISIONS_TO_KEEP);
    const keepIds = new Set([...recent, ...historicalKept].map((row) => row.id));
    const deleteIds = rows.filter((row) => !keepIds.has(row.id)).map((row) => row.id);
    if (deleteIds.length > 0) await this.database.revisions.bulkDelete(deleteIds);
  }

  private readClock(): number {
    const timestamp = this.clock();
    if (!Number.isSafeInteger(timestamp) || timestamp < 0) {
      throw new RangeError('The database clock must return a non-negative safe integer.');
    }
    return timestamp;
  }
}

export function serializeRevisionSnapshot(snapshot: RevisionSnapshot): string {
  return JSON.stringify(revisionSnapshotSchema.parse(snapshot));
}

export function parseRevisionPayload(payload: string): RevisionSnapshot {
  let decoded: unknown;
  try {
    decoded = JSON.parse(payload);
  } catch {
    throw new Error('This revision is corrupted and cannot be read.');
  }
  const snapshot = revisionSnapshotSchema.parse(decoded);
  validateSnapshotRelationships(snapshot);
  return snapshot;
}

function validateSnapshotRelationships(snapshot: RevisionSnapshot): void {
  const ids = new Set<string>();
  for (const item of snapshot.items) {
    if (ids.has(item.id)) throw new Error(`Revision contains duplicate checklist item ${item.id}.`);
    if (item.parentId === item.id) throw new Error('Revision contains a self-parent checklist item.');
    if (item.parentId !== null && !ids.has(item.parentId)) {
      throw new Error('Revision checklist parent must appear before its child.');
    }
    ids.add(item.id);
  }
  if (snapshot.type === 'text' && snapshot.items.length > 0) {
    throw new Error('A text-note revision cannot contain checklist items.');
  }
}

function buildRestoredItems(
  noteId: string,
  items: RevisionChecklistItemSnapshot[],
  timestamp: number,
  remapIds: boolean,
  idFactory: () => string,
): ChecklistItemRecord[] {
  const idMap = remapIds ? new Map(items.map((item) => [item.id, idFactory()])) : null;
  return items.map((item, position) => {
    const id = idMap?.get(item.id) ?? item.id;
    const parentId =
      item.parentId === null ? null : (idMap?.get(item.parentId) ?? item.parentId);
    return checklistItemRecordSchema.parse({
      id,
      noteId,
      text: item.text,
      checked: item.checked,
      parentId,
      position,
      createdAt: timestamp,
      updatedAt: timestamp,
    });
  });
}

function compareRevisionRecordsDescending(a: RevisionRecord, b: RevisionRecord): number {
  return b.createdAt - a.createdAt || b.noteRevision - a.noteRevision || b.id.localeCompare(a.id);
}

function sampleAcrossHistory(rows: RevisionRecord[], limit: number): RevisionRecord[] {
  if (rows.length <= limit) return rows;
  if (limit <= 1) return rows.length > 0 ? [rows[0]!] : [];

  const selected = new Map<string, RevisionRecord>();
  for (let index = 0; index < limit; index += 1) {
    const sourceIndex = Math.round((index * (rows.length - 1)) / (limit - 1));
    const row = rows[sourceIndex];
    if (row) selected.set(row.id, row);
  }
  return [...selected.values()];
}
