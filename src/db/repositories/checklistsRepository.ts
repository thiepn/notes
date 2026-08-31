import type { NotesDatabase } from '../database';
import { nextTimestamp } from '../clock';
import { InvalidNoteStateError, NoteConflictError, NoteNotFoundError } from '../errors';
import type { ChecklistItemRecord, NoteRecord } from '../types';
import { checklistItemRecordSchema, noteRecordSchema } from '../validation';

export interface ChecklistDraftItem {
  id: string;
  text: string;
  checked: boolean;
  parentId: string | null;
}

export interface ChecklistSnapshot {
  note: NoteRecord;
  items: ChecklistItemRecord[];
}

interface ChecklistsRepositoryOptions {
  clock?: () => number;
  idFactory?: () => string;
}

export class ChecklistsRepository {
  private readonly clock: () => number;
  private readonly idFactory: () => string;

  constructor(
    private readonly database: NotesDatabase,
    options: ChecklistsRepositoryOptions = {},
  ) {
    this.clock = options.clock ?? Date.now;
    this.idFactory = options.idFactory ?? (() => crypto.randomUUID());
  }

  async itemsForNote(noteId: string): Promise<ChecklistItemRecord[]> {
    const items = await this.database.checklistItems.where('noteId').equals(noteId).toArray();
    return items.map((item) => checklistItemRecordSchema.parse(item)).sort(compareItems);
  }

  async itemsByNote(noteIds: string[]): Promise<Record<string, ChecklistItemRecord[]>> {
    const result: Record<string, ChecklistItemRecord[]> = Object.fromEntries(
      noteIds.map((noteId) => [noteId, []]),
    );
    if (noteIds.length === 0) return result;

    const noteIdSet = new Set(noteIds);
    const allItems = await this.database.checklistItems.toArray();
    for (const rawItem of allItems) {
      const item = checklistItemRecordSchema.parse(rawItem);
      if (!noteIdSet.has(item.noteId)) continue;
      result[item.noteId]?.push(item);
    }

    for (const items of Object.values(result)) items.sort(compareItems);
    return result;
  }

  async create(title = '', items: ChecklistDraftItem[] = []): Promise<ChecklistSnapshot> {
    validateDraftItems(items);
    const timestamp = this.readClock();
    const note = noteRecordSchema.parse({
      id: this.idFactory(),
      type: 'checklist',
      title,
      content: '',
      color: 'default',
      createdAt: timestamp,
      updatedAt: timestamp,
      pinnedAt: null,
      archivedAt: null,
      trashedAt: null,
      position: 0,
      revision: 1,
    });
    const records = buildItemRecords(note.id, items, timestamp, new Map());

    await this.database.transaction(
      'rw',
      this.database.notes,
      this.database.checklistItems,
      async () => {
        await this.database.notes.add(note);
        if (records.length > 0) await this.database.checklistItems.bulkAdd(records);
      },
    );

    return { note, items: records };
  }

  async save(
    noteId: string,
    title: string,
    items: ChecklistDraftItem[],
    expectedRevision?: number,
  ): Promise<ChecklistSnapshot> {
    validateDraftItems(items);

    return this.database.transaction(
      'rw',
      this.database.notes,
      this.database.checklistItems,
      async () => {
        const rawNote = await this.database.notes.get(noteId);
        if (!rawNote) throw new NoteNotFoundError(noteId);
        const current = noteRecordSchema.parse(rawNote);
        if (current.type !== 'checklist') {
          throw new InvalidNoteStateError(noteId, 'This note is not a checklist.');
        }
        if (expectedRevision !== undefined && current.revision !== expectedRevision) {
          throw new NoteConflictError(noteId, expectedRevision, current.revision);
        }

        const existingItems = (
          await this.database.checklistItems.where('noteId').equals(noteId).toArray()
        )
          .map((item) => checklistItemRecordSchema.parse(item))
          .sort(compareItems);
        const normalizedDraft = items.map((item, position) => ({ ...item, position }));
        const unchanged =
          current.title === title &&
          current.content === '' &&
          sameChecklist(existingItems, normalizedDraft);
        if (unchanged) return { note: current, items: existingItems };

        const timestamp = nextTimestamp(current.updatedAt, this.readClock());
        const existingById = new Map(existingItems.map((item) => [item.id, item]));
        const records = buildItemRecords(noteId, items, timestamp, existingById);
        const nextNote = noteRecordSchema.parse({
          ...current,
          title,
          content: '',
          updatedAt: timestamp,
          revision: current.revision + 1,
        });

        await this.database.checklistItems.where('noteId').equals(noteId).delete();
        if (records.length > 0) await this.database.checklistItems.bulkAdd(records);
        await this.database.notes.put(nextNote);
        return { note: nextNote, items: records };
      },
    );
  }

  async convertTextToChecklist(
    noteId: string,
    expectedRevision?: number,
  ): Promise<ChecklistSnapshot> {
    return this.database.transaction(
      'rw',
      this.database.notes,
      this.database.checklistItems,
      async () => {
        const rawNote = await this.database.notes.get(noteId);
        if (!rawNote) throw new NoteNotFoundError(noteId);
        const current = noteRecordSchema.parse(rawNote);
        if (current.type === 'checklist') {
          return { note: current, items: await this.itemsForNote(noteId) };
        }
        if (expectedRevision !== undefined && current.revision !== expectedRevision) {
          throw new NoteConflictError(noteId, expectedRevision, current.revision);
        }

        const lines = current.content
          .split(/\r?\n/u)
          .map((line) => line.trim())
          .filter(Boolean);
        const draftItems: ChecklistDraftItem[] = (lines.length > 0 ? lines : ['']).map((text) => ({
          id: this.idFactory(),
          text,
          checked: false,
          parentId: null,
        }));
        const timestamp = nextTimestamp(current.updatedAt, this.readClock());
        const items = buildItemRecords(noteId, draftItems, timestamp, new Map());
        const note = noteRecordSchema.parse({
          ...current,
          type: 'checklist',
          content: '',
          updatedAt: timestamp,
          revision: current.revision + 1,
        });

        await this.database.checklistItems.where('noteId').equals(noteId).delete();
        if (items.length > 0) await this.database.checklistItems.bulkAdd(items);
        await this.database.notes.put(note);
        return { note, items };
      },
    );
  }

  async convertChecklistToText(noteId: string, expectedRevision?: number): Promise<NoteRecord> {
    return this.database.transaction(
      'rw',
      this.database.notes,
      this.database.checklistItems,
      async () => {
        const rawNote = await this.database.notes.get(noteId);
        if (!rawNote) throw new NoteNotFoundError(noteId);
        const current = noteRecordSchema.parse(rawNote);
        if (current.type !== 'checklist') return current;
        if (expectedRevision !== undefined && current.revision !== expectedRevision) {
          throw new NoteConflictError(noteId, expectedRevision, current.revision);
        }

        const items = (await this.database.checklistItems.where('noteId').equals(noteId).toArray())
          .map((item) => checklistItemRecordSchema.parse(item))
          .sort(compareItems);
        const itemById = new Map(items.map((item) => [item.id, item]));
        const content = items
          .map((item) => `${'  '.repeat(itemDepth(item, itemById))}${item.text}`)
          .join('\n');
        const timestamp = nextTimestamp(current.updatedAt, this.readClock());
        const note = noteRecordSchema.parse({
          ...current,
          type: 'text',
          content,
          updatedAt: timestamp,
          revision: current.revision + 1,
        });

        await this.database.checklistItems.where('noteId').equals(noteId).delete();
        await this.database.notes.put(note);
        return note;
      },
    );
  }

  private readClock(): number {
    const timestamp = this.clock();
    if (!Number.isSafeInteger(timestamp) || timestamp < 0) {
      throw new RangeError('The database clock must return a non-negative safe integer.');
    }
    return timestamp;
  }
}

function buildItemRecords(
  noteId: string,
  items: ChecklistDraftItem[],
  timestamp: number,
  existingById: Map<string, ChecklistItemRecord>,
): ChecklistItemRecord[] {
  return items.map((item, position) => {
    const existing = existingById.get(item.id);
    const changed =
      !existing ||
      existing.text !== item.text ||
      existing.checked !== item.checked ||
      existing.parentId !== item.parentId ||
      existing.position !== position;
    return checklistItemRecordSchema.parse({
      id: item.id,
      noteId,
      text: item.text,
      checked: item.checked,
      parentId: item.parentId,
      position,
      createdAt: existing?.createdAt ?? timestamp,
      updatedAt: existing
        ? changed
          ? nextTimestamp(existing.updatedAt, timestamp)
          : existing.updatedAt
        : timestamp,
    });
  });
}

function validateDraftItems(items: ChecklistDraftItem[]): void {
  if (items.length > 10_000)
    throw new RangeError('A checklist cannot contain more than 10,000 items.');
  const seen = new Set<string>();
  for (const item of items) {
    if (seen.has(item.id)) throw new Error(`Duplicate checklist item ID: ${item.id}`);
    checklistItemRecordSchema
      .pick({ id: true, text: true, checked: true, parentId: true })
      .parse(item);
    if (item.parentId === item.id) throw new Error('A checklist item cannot be its own parent.');
    if (item.parentId !== null && !seen.has(item.parentId)) {
      throw new Error('A checklist parent must appear before its child.');
    }
    seen.add(item.id);
  }
}

function sameChecklist(
  existing: ChecklistItemRecord[],
  draft: Array<ChecklistDraftItem & { position: number }>,
): boolean {
  if (existing.length !== draft.length) return false;
  return existing.every((item, index) => {
    const next = draft[index];
    return Boolean(
      next &&
      item.id === next.id &&
      item.text === next.text &&
      item.checked === next.checked &&
      item.parentId === next.parentId &&
      item.position === next.position,
    );
  });
}

function itemDepth(item: ChecklistItemRecord, itemById: Map<string, ChecklistItemRecord>): number {
  let depth = 0;
  let current = item;
  const visited = new Set<string>();
  while (current.parentId !== null && depth < 8) {
    if (visited.has(current.id)) break;
    visited.add(current.id);
    const parent = itemById.get(current.parentId);
    if (!parent) break;
    depth += 1;
    current = parent;
  }
  return depth;
}

function compareItems(a: ChecklistItemRecord, b: ChecklistItemRecord): number {
  return a.position - b.position || a.createdAt - b.createdAt;
}
