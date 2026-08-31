import type { NotesDatabase } from '../database';
import { nextTimestamp } from '../clock';
import { InvalidNoteStateError, NoteConflictError, NoteNotFoundError } from '../errors';
import type { NoteRecord } from '../types';
import {
  createNoteInputSchema,
  noteRecordSchema,
  updateNoteInputSchema,
  type CreateNoteInput,
  type UpdateNoteInput,
} from '../validation';

interface NotesRepositoryOptions {
  clock?: () => number;
  idFactory?: () => string;
}

type NoteMutation = (current: NoteRecord, timestamp: number) => Partial<NoteRecord> | null;

export class NotesRepository {
  private readonly clock: () => number;
  private readonly idFactory: () => string;

  constructor(
    private readonly database: NotesDatabase,
    options: NotesRepositoryOptions = {},
  ) {
    this.clock = options.clock ?? Date.now;
    this.idFactory = options.idFactory ?? (() => crypto.randomUUID());
  }

  async create(input: CreateNoteInput = {}): Promise<NoteRecord> {
    const parsed = createNoteInputSchema.parse(input);
    const timestamp = this.readClock();
    const note = noteRecordSchema.parse({
      id: this.idFactory(),
      ...parsed,
      createdAt: timestamp,
      updatedAt: timestamp,
      pinnedAt: null,
      archivedAt: null,
      trashedAt: null,
      revision: 1,
    });

    await this.database.notes.add(note);
    return note;
  }

  async get(id: string): Promise<NoteRecord | undefined> {
    const note = await this.database.notes.get(id);
    return note ? noteRecordSchema.parse(note) : undefined;
  }

  async require(id: string): Promise<NoteRecord> {
    const note = await this.get(id);
    if (!note) {
      throw new NoteNotFoundError(id);
    }
    return note;
  }

  async listActive(): Promise<NoteRecord[]> {
    const notes = await this.database.notes.toArray();
    return notes
      .map((note) => noteRecordSchema.parse(note))
      .filter((note) => note.archivedAt === null && note.trashedAt === null)
      .sort(compareActiveNotes);
  }

  async listArchived(): Promise<NoteRecord[]> {
    const notes = await this.database.notes.toArray();
    return notes
      .map((note) => noteRecordSchema.parse(note))
      .filter((note) => note.archivedAt !== null && note.trashedAt === null)
      .sort((a, b) => (b.archivedAt ?? 0) - (a.archivedAt ?? 0));
  }

  async listTrashed(): Promise<NoteRecord[]> {
    const notes = await this.database.notes.toArray();
    return notes
      .map((note) => noteRecordSchema.parse(note))
      .filter((note) => note.trashedAt !== null)
      .sort((a, b) => (b.trashedAt ?? 0) - (a.trashedAt ?? 0));
  }

  async update(id: string, patch: UpdateNoteInput, expectedRevision?: number): Promise<NoteRecord> {
    const parsedPatch = updateNoteInputSchema.parse(patch);
    if (Object.keys(parsedPatch).length === 0) {
      return this.require(id);
    }

    return this.mutate(id, () => parsedPatch, expectedRevision);
  }

  async setPinned(id: string, pinned: boolean, expectedRevision?: number): Promise<NoteRecord> {
    return this.mutate(
      id,
      (current, timestamp) => {
        if (current.trashedAt !== null) {
          throw new InvalidNoteStateError(id, 'A trashed note cannot be pinned.');
        }

        const isPinned = current.pinnedAt !== null;
        if (isPinned === pinned) {
          return null;
        }

        return { pinnedAt: pinned ? timestamp : null };
      },
      expectedRevision,
    );
  }

  async archive(id: string, expectedRevision?: number): Promise<NoteRecord> {
    return this.mutate(
      id,
      (current, timestamp) => {
        if (current.trashedAt !== null) {
          throw new InvalidNoteStateError(id, 'A trashed note cannot be archived.');
        }
        if (current.archivedAt !== null) {
          return null;
        }
        return { archivedAt: timestamp, pinnedAt: null };
      },
      expectedRevision,
    );
  }

  async unarchive(id: string, expectedRevision?: number): Promise<NoteRecord> {
    return this.mutate(
      id,
      (current) => {
        if (current.trashedAt !== null) {
          throw new InvalidNoteStateError(id, 'A trashed note cannot be unarchived.');
        }
        return current.archivedAt === null ? null : { archivedAt: null };
      },
      expectedRevision,
    );
  }

  async trash(id: string, expectedRevision?: number): Promise<NoteRecord> {
    return this.mutate(
      id,
      (current, timestamp) => {
        if (current.trashedAt !== null) {
          return null;
        }
        return { trashedAt: timestamp, archivedAt: null, pinnedAt: null };
      },
      expectedRevision,
    );
  }

  async restore(id: string, expectedRevision?: number): Promise<NoteRecord> {
    return this.mutate(
      id,
      (current) => (current.trashedAt === null ? null : { trashedAt: null, archivedAt: null }),
      expectedRevision,
    );
  }

  async duplicate(id: string): Promise<NoteRecord> {
    return this.database.transaction(
      'rw',
      this.database.notes,
      this.database.checklistItems,
      this.database.noteLabels,
      this.database.attachments,
      async () => {
        const source = await this.database.notes.get(id);
        if (!source) {
          throw new NoteNotFoundError(id);
        }

        const parsedSource = noteRecordSchema.parse(source);
        const timestamp = this.readClock();
        const duplicate = noteRecordSchema.parse({
          ...parsedSource,
          id: this.idFactory(),
          createdAt: timestamp,
          updatedAt: timestamp,
          pinnedAt: null,
          archivedAt: null,
          trashedAt: null,
          revision: 1,
        });

        const [items, labels, attachments] = await Promise.all([
          this.database.checklistItems.where('noteId').equals(id).toArray(),
          this.database.noteLabels.where('noteId').equals(id).toArray(),
          this.database.attachments.where('noteId').equals(id).toArray(),
        ]);

        await this.database.notes.add(duplicate);

        if (items.length > 0) {
          await this.database.checklistItems.bulkAdd(
            items.map((item) => ({
              ...item,
              id: this.idFactory(),
              noteId: duplicate.id,
              parentId: null,
              createdAt: timestamp,
              updatedAt: timestamp,
            })),
          );
        }

        if (labels.length > 0) {
          await this.database.noteLabels.bulkAdd(
            labels.map((label) => ({
              ...label,
              noteId: duplicate.id,
              assignedAt: timestamp,
            })),
          );
        }

        if (attachments.length > 0) {
          await this.database.attachments.bulkAdd(
            attachments.map((attachment) => ({
              ...attachment,
              id: this.idFactory(),
              noteId: duplicate.id,
              createdAt: timestamp,
            })),
          );
        }

        return duplicate;
      },
    );
  }

  async deletePermanently(id: string): Promise<boolean> {
    return this.database.transaction(
      'rw',
      this.database.notes,
      this.database.checklistItems,
      this.database.noteLabels,
      this.database.attachments,
      this.database.revisions,
      async () => {
        const note = await this.database.notes.get(id);
        if (!note) {
          return false;
        }

        await Promise.all([
          this.database.checklistItems.where('noteId').equals(id).delete(),
          this.database.noteLabels.where('noteId').equals(id).delete(),
          this.database.attachments.where('noteId').equals(id).delete(),
          this.database.revisions.where('noteId').equals(id).delete(),
        ]);
        await this.database.notes.delete(id);
        return true;
      },
    );
  }

  private async mutate(
    id: string,
    mutation: NoteMutation,
    expectedRevision?: number,
  ): Promise<NoteRecord> {
    return this.database.transaction('rw', this.database.notes, async () => {
      const rawCurrent = await this.database.notes.get(id);
      if (!rawCurrent) {
        throw new NoteNotFoundError(id);
      }

      const current = noteRecordSchema.parse(rawCurrent);
      if (expectedRevision !== undefined && current.revision !== expectedRevision) {
        throw new NoteConflictError(id, expectedRevision, current.revision);
      }

      const timestamp = nextTimestamp(current.updatedAt, this.readClock());
      const changes = mutation(current, timestamp);
      if (changes === null) {
        return current;
      }

      const next = noteRecordSchema.parse({
        ...current,
        ...changes,
        updatedAt: timestamp,
        revision: current.revision + 1,
      });

      await this.database.notes.put(next);
      return next;
    });
  }

  private readClock(): number {
    const timestamp = this.clock();
    if (!Number.isSafeInteger(timestamp) || timestamp < 0) {
      throw new RangeError('The database clock must return a non-negative safe integer.');
    }
    return timestamp;
  }
}

function compareActiveNotes(a: NoteRecord, b: NoteRecord): number {
  const aPinned = a.pinnedAt !== null;
  const bPinned = b.pinnedAt !== null;

  if (aPinned !== bPinned) {
    return aPinned ? -1 : 1;
  }

  if (aPinned && bPinned && a.pinnedAt !== b.pinnedAt) {
    return (b.pinnedAt ?? 0) - (a.pinnedAt ?? 0);
  }

  return b.updatedAt - a.updatedAt || b.createdAt - a.createdAt;
}
