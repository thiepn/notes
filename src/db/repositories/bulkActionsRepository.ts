import type { NotesDatabase } from '../database';
import { nextTimestamp } from '../clock';
import { InvalidNoteStateError, NoteConflictError, NoteNotFoundError } from '../errors';
import type { NoteColor, NoteRecord } from '../types';
import { noteLabelRecordSchema, noteRecordSchema } from '../validation';

export interface BulkNoteTarget {
  id: string;
  expectedRevision: number;
}

export interface BulkLifecycleState {
  id: string;
  pinnedAt: number | null;
  archivedAt: number | null;
  trashedAt: number | null;
}

export interface BulkColorState {
  id: string;
  color: NoteColor;
}

export interface BulkLabelState {
  noteId: string;
  labelIds: string[];
}

interface BulkActionsRepositoryOptions {
  clock?: () => number;
}

type NoteMutation = (note: NoteRecord, timestamp: number) => Partial<NoteRecord> | null;

export class BulkActionsRepository {
  private readonly clock: () => number;

  constructor(
    private readonly database: NotesDatabase,
    options: BulkActionsRepositoryOptions = {},
  ) {
    this.clock = options.clock ?? Date.now;
  }

  async setPinned(targets: BulkNoteTarget[], pinned: boolean): Promise<NoteRecord[]> {
    return this.mutateNotes(targets, (note, timestamp) => {
      if (note.trashedAt !== null) {
        throw new InvalidNoteStateError(note.id, 'A trashed note cannot be pinned.');
      }
      if ((note.pinnedAt !== null) === pinned) return null;
      return { pinnedAt: pinned ? timestamp : null };
    });
  }

  async archive(targets: BulkNoteTarget[]): Promise<NoteRecord[]> {
    return this.mutateNotes(targets, (note, timestamp) => {
      if (note.trashedAt !== null) {
        throw new InvalidNoteStateError(note.id, 'A trashed note cannot be archived.');
      }
      if (note.archivedAt !== null) return null;
      return { archivedAt: timestamp, pinnedAt: null };
    });
  }

  async unarchive(targets: BulkNoteTarget[]): Promise<NoteRecord[]> {
    return this.mutateNotes(targets, (note) => {
      if (note.trashedAt !== null) {
        throw new InvalidNoteStateError(note.id, 'A trashed note cannot be unarchived.');
      }
      return note.archivedAt === null ? null : { archivedAt: null };
    });
  }

  async trash(targets: BulkNoteTarget[]): Promise<NoteRecord[]> {
    return this.mutateNotes(targets, (note, timestamp) => {
      if (note.trashedAt !== null) return null;
      return { trashedAt: timestamp, archivedAt: null, pinnedAt: null };
    });
  }

  async restore(targets: BulkNoteTarget[]): Promise<NoteRecord[]> {
    return this.mutateNotes(targets, (note) =>
      note.trashedAt === null ? null : { trashedAt: null, archivedAt: null },
    );
  }

  async setColor(targets: BulkNoteTarget[], color: NoteColor): Promise<NoteRecord[]> {
    return this.mutateNotes(targets, (note) => (note.color === color ? null : { color }));
  }

  async restoreLifecycle(states: BulkLifecycleState[]): Promise<NoteRecord[]> {
    return this.restoreFields(states, (_note, state) => ({
      pinnedAt: state.pinnedAt,
      archivedAt: state.archivedAt,
      trashedAt: state.trashedAt,
    }));
  }

  async restoreColors(states: BulkColorState[]): Promise<NoteRecord[]> {
    return this.restoreFields(states, (note, state) =>
      note.color === state.color ? null : { color: state.color },
    );
  }

  async setLabelMembership(noteIds: string[], labelId: string, assigned: boolean): Promise<void> {
    const uniqueNoteIds = uniqueIds(noteIds);
    if (uniqueNoteIds.length === 0) return;

    await this.database.transaction(
      'rw',
      this.database.notes,
      this.database.labels,
      this.database.noteLabels,
      async () => {
        const [notes, label] = await Promise.all([
          this.database.notes.bulkGet(uniqueNoteIds),
          this.database.labels.get(labelId),
        ]);
        if (notes.some((note) => note === undefined)) {
          const missingIndex = notes.findIndex((note) => note === undefined);
          throw new NoteNotFoundError(uniqueNoteIds[missingIndex] ?? 'unknown');
        }
        if (!label) throw new Error('Label not found.');

        if (!assigned) {
          await this.database.noteLabels.bulkDelete(
            uniqueNoteIds.map((noteId) => [noteId, labelId] as [string, string]),
          );
          return;
        }

        const assignedAt = this.readClock();
        const keys = uniqueNoteIds.map((noteId) => [noteId, labelId] as [string, string]);
        const existing = await this.database.noteLabels.bulkGet(keys);
        const missingLinks = uniqueNoteIds
          .filter((_, index) => existing[index] === undefined)
          .map((noteId) => noteLabelRecordSchema.parse({ noteId, labelId, assignedAt }));
        if (missingLinks.length > 0) await this.database.noteLabels.bulkAdd(missingLinks);
      },
    );
  }

  async restoreLabels(states: BulkLabelState[]): Promise<void> {
    const byNote = new Map<string, string[]>();
    for (const state of states) byNote.set(state.noteId, [...new Set(state.labelIds)]);
    if (byNote.size === 0) return;

    const noteIds = [...byNote.keys()];
    const labelIds = [...new Set([...byNote.values()].flat())];

    await this.database.transaction(
      'rw',
      this.database.notes,
      this.database.labels,
      this.database.noteLabels,
      async () => {
        const notes = await this.database.notes.bulkGet(noteIds);
        if (notes.some((note) => note === undefined)) {
          const missingIndex = notes.findIndex((note) => note === undefined);
          throw new NoteNotFoundError(noteIds[missingIndex] ?? 'unknown');
        }
        if (labelIds.length > 0) {
          const labels = await this.database.labels.bulkGet(labelIds);
          if (labels.some((label) => label === undefined)) {
            throw new Error('One or more labels no longer exist.');
          }
        }

        for (const noteId of noteIds) {
          await this.database.noteLabels.where('noteId').equals(noteId).delete();
        }

        const assignedAt = this.readClock();
        const links = noteIds.flatMap((noteId) =>
          (byNote.get(noteId) ?? []).map((labelId) =>
            noteLabelRecordSchema.parse({ noteId, labelId, assignedAt }),
          ),
        );
        if (links.length > 0) await this.database.noteLabels.bulkAdd(links);
      },
    );
  }

  async deletePermanently(noteIds: string[]): Promise<number> {
    const uniqueNoteIds = uniqueIds(noteIds);
    if (uniqueNoteIds.length === 0) return 0;

    return this.database.transaction(
      'rw',
      [
        this.database.notes,
        this.database.checklistItems,
        this.database.noteLabels,
        this.database.attachments,
        this.database.reminders,
        this.database.revisions,
      ],
      async () => {
        const rawNotes = await this.database.notes.bulkGet(uniqueNoteIds);
        const notes = rawNotes.map((rawNote, index) => {
          if (!rawNote) throw new NoteNotFoundError(uniqueNoteIds[index] ?? 'unknown');
          return noteRecordSchema.parse(rawNote);
        });
        const nonTrashed = notes.find((note) => note.trashedAt === null);
        if (nonTrashed) {
          throw new InvalidNoteStateError(
            nonTrashed.id,
            'Only notes already in trash can be permanently deleted in bulk.',
          );
        }

        await Promise.all([
          this.database.checklistItems.where('noteId').anyOf(uniqueNoteIds).delete(),
          this.database.noteLabels.where('noteId').anyOf(uniqueNoteIds).delete(),
          this.database.attachments.where('noteId').anyOf(uniqueNoteIds).delete(),
          this.database.reminders.where('noteId').anyOf(uniqueNoteIds).delete(),
          this.database.revisions.where('noteId').anyOf(uniqueNoteIds).delete(),
        ]);
        await this.database.notes.bulkDelete(uniqueNoteIds);
        return uniqueNoteIds.length;
      },
    );
  }

  private async mutateNotes(
    targets: BulkNoteTarget[],
    mutation: NoteMutation,
  ): Promise<NoteRecord[]> {
    const uniqueTargets = uniqueTargetsById(targets);
    if (uniqueTargets.length === 0) return [];

    return this.database.transaction('rw', this.database.notes, async () => {
      const notes = await this.readTargets(uniqueTargets);
      const operationTime = this.readClock();
      const changed: NoteRecord[] = [];

      for (const note of notes) {
        const timestamp = nextTimestamp(note.updatedAt, operationTime);
        const patch = mutation(note, timestamp);
        if (patch === null) {
          changed.push(note);
          continue;
        }
        const next = noteRecordSchema.parse({
          ...note,
          ...patch,
          updatedAt: timestamp,
          revision: note.revision + 1,
        });
        await this.database.notes.put(next);
        changed.push(next);
      }
      return changed;
    });
  }

  private async restoreFields<T extends { id: string }>(
    states: T[],
    patcher: (note: NoteRecord, state: T) => Partial<NoteRecord> | null,
  ): Promise<NoteRecord[]> {
    const uniqueStates = [...new Map(states.map((state) => [state.id, state])).values()];
    if (uniqueStates.length === 0) return [];

    return this.database.transaction('rw', this.database.notes, async () => {
      const rawNotes = await this.database.notes.bulkGet(uniqueStates.map((state) => state.id));
      const operationTime = this.readClock();
      const restored: NoteRecord[] = [];

      for (let index = 0; index < uniqueStates.length; index += 1) {
        const state = uniqueStates[index];
        const rawNote = rawNotes[index];
        if (!state || !rawNote) throw new NoteNotFoundError(state?.id ?? 'unknown');
        const note = noteRecordSchema.parse(rawNote);
        const patch = patcher(note, state);
        if (patch === null) {
          restored.push(note);
          continue;
        }
        const next = noteRecordSchema.parse({
          ...note,
          ...patch,
          updatedAt: nextTimestamp(note.updatedAt, operationTime),
          revision: note.revision + 1,
        });
        await this.database.notes.put(next);
        restored.push(next);
      }
      return restored;
    });
  }

  private async readTargets(targets: BulkNoteTarget[]): Promise<NoteRecord[]> {
    const rawNotes = await this.database.notes.bulkGet(targets.map((target) => target.id));
    return rawNotes.map((rawNote, index) => {
      const target = targets[index];
      if (!target || !rawNote) throw new NoteNotFoundError(target?.id ?? 'unknown');
      const note = noteRecordSchema.parse(rawNote);
      if (note.revision !== target.expectedRevision) {
        throw new NoteConflictError(note.id, target.expectedRevision, note.revision);
      }
      return note;
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

function uniqueIds(ids: string[]): string[] {
  return [...new Set(ids)];
}

function uniqueTargetsById(targets: BulkNoteTarget[]): BulkNoteTarget[] {
  const byId = new Map<string, BulkNoteTarget>();
  for (const target of targets) byId.set(target.id, target);
  return [...byId.values()];
}
