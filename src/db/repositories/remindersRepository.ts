import type { NotesDatabase } from '../database';
import { InvalidNoteStateError, NoteNotFoundError } from '../errors';
import type { ReminderRecord } from '../types';
import { noteRecordSchema, reminderRecordSchema } from '../validation';

export interface SetReminderInput {
  dueAt: number;
  timeZone: string;
}

interface RemindersRepositoryOptions {
  clock?: () => number;
  idFactory?: () => string;
}

export class RemindersRepository {
  private readonly clock: () => number;
  private readonly idFactory: () => string;

  constructor(
    private readonly database: NotesDatabase,
    options: RemindersRepositoryOptions = {},
  ) {
    this.clock = options.clock ?? Date.now;
    this.idFactory = options.idFactory ?? (() => crypto.randomUUID());
  }

  async getForNote(noteId: string): Promise<ReminderRecord | undefined> {
    const row = await this.database.reminders.where('noteId').equals(noteId).first();
    return row ? reminderRecordSchema.parse(row) : undefined;
  }

  async byNoteIds(noteIds: string[]): Promise<Record<string, ReminderRecord>> {
    if (noteIds.length === 0) return {};
    const rows = await this.database.reminders.where('noteId').anyOf([...new Set(noteIds)]).toArray();
    return Object.fromEntries(
      rows.map((row) => {
        const reminder = reminderRecordSchema.parse(row);
        return [reminder.noteId, reminder];
      }),
    );
  }

  async listActive(): Promise<ReminderRecord[]> {
    const rows = await this.database.reminders.where('status').equals('active').toArray();
    return rows.map((row) => reminderRecordSchema.parse(row)).sort(compareDueAt);
  }

  async listHistory(): Promise<ReminderRecord[]> {
    const rows = await this.database.reminders.toArray();
    return rows
      .map((row) => reminderRecordSchema.parse(row))
      .filter((reminder) => reminder.status !== 'active')
      .sort((a, b) => b.updatedAt - a.updatedAt || b.createdAt - a.createdAt);
  }

  async listVisibleWithNotes(): Promise<Array<{ reminder: ReminderRecord; noteId: string }>> {
    const reminders = (await this.database.reminders.toArray()).map((row) =>
      reminderRecordSchema.parse(row),
    );
    const noteRows = await this.database.notes.bulkGet(reminders.map((reminder) => reminder.noteId));
    const result: Array<{ reminder: ReminderRecord; noteId: string }> = [];
    for (let index = 0; index < reminders.length; index += 1) {
      const reminder = reminders[index];
      const rawNote = noteRows[index];
      if (!reminder || !rawNote) continue;
      const note = noteRecordSchema.parse(rawNote);
      if (note.trashedAt !== null) continue;
      result.push({ reminder, noteId: note.id });
    }
    return result;
  }

  async set(noteId: string, input: SetReminderInput): Promise<ReminderRecord> {
    const dueAt = validateTimestamp(input.dueAt, 'Reminder time');
    const timeZone = input.timeZone.trim();
    if (!timeZone || timeZone.length > 100) throw new Error('Choose a valid time zone.');

    return this.database.transaction('rw', this.database.notes, this.database.reminders, async () => {
      const rawNote = await this.database.notes.get(noteId);
      if (!rawNote) throw new NoteNotFoundError(noteId);
      const note = noteRecordSchema.parse(rawNote);
      if (note.trashedAt !== null) {
        throw new InvalidNoteStateError(noteId, 'A trashed note cannot receive a reminder.');
      }

      const timestamp = this.readClock();
      const existingRaw = await this.database.reminders.where('noteId').equals(noteId).first();
      const existing = existingRaw ? reminderRecordSchema.parse(existingRaw) : undefined;
      const next = reminderRecordSchema.parse({
        id: existing?.id ?? this.idFactory(),
        noteId,
        dueAt,
        timeZone,
        status: 'active',
        createdAt: existing?.createdAt ?? timestamp,
        updatedAt: timestamp,
        completedAt: null,
        dismissedAt: null,
        lastNotifiedAt: null,
      });
      await this.database.reminders.put(next);
      return next;
    });
  }

  async remove(noteId: string): Promise<boolean> {
    return this.database.transaction('rw', this.database.reminders, async () => {
      const existing = await this.database.reminders.where('noteId').equals(noteId).first();
      if (!existing) return false;
      await this.database.reminders.delete(reminderRecordSchema.parse(existing).id);
      return true;
    });
  }

  async complete(noteId: string): Promise<ReminderRecord> {
    return this.transition(noteId, 'completed');
  }

  async dismiss(noteId: string): Promise<ReminderRecord> {
    return this.transition(noteId, 'dismissed');
  }

  async snooze(noteId: string, dueAt: number): Promise<ReminderRecord> {
    const nextDueAt = validateTimestamp(dueAt, 'Snooze time');
    return this.database.transaction('rw', this.database.reminders, async () => {
      const current = await this.requireForNote(noteId);
      const timestamp = this.readClock();
      const next = reminderRecordSchema.parse({
        ...current,
        dueAt: nextDueAt,
        status: 'active',
        updatedAt: timestamp,
        completedAt: null,
        dismissedAt: null,
        lastNotifiedAt: null,
      });
      await this.database.reminders.put(next);
      return next;
    });
  }

  async markNotified(noteId: string, notifiedAt = this.readClock()): Promise<ReminderRecord> {
    return this.database.transaction('rw', this.database.reminders, async () => {
      const current = await this.requireForNote(noteId);
      if (current.status !== 'active') return current;
      const next = reminderRecordSchema.parse({
        ...current,
        lastNotifiedAt: validateTimestamp(notifiedAt, 'Notification time'),
        updatedAt: Math.max(current.updatedAt, notifiedAt),
      });
      await this.database.reminders.put(next);
      return next;
    });
  }

  async dueForNotification(now = this.readClock()): Promise<ReminderRecord[]> {
    const timestamp = validateTimestamp(now, 'Current time');
    const active = await this.database.reminders.where('status').equals('active').toArray();
    const due = active
      .map((row) => reminderRecordSchema.parse(row))
      .filter(
        (reminder) =>
          reminder.dueAt <= timestamp &&
          (reminder.lastNotifiedAt === null || reminder.lastNotifiedAt < reminder.dueAt),
      )
      .sort(compareDueAt);
    if (due.length === 0) return [];

    const rawNotes = await this.database.notes.bulkGet(due.map((reminder) => reminder.noteId));
    return due.filter((_, index) => {
      const rawNote = rawNotes[index];
      return rawNote ? noteRecordSchema.parse(rawNote).trashedAt === null : false;
    });
  }

  private async transition(
    noteId: string,
    status: 'completed' | 'dismissed',
  ): Promise<ReminderRecord> {
    return this.database.transaction('rw', this.database.reminders, async () => {
      const current = await this.requireForNote(noteId);
      const timestamp = this.readClock();
      const next = reminderRecordSchema.parse({
        ...current,
        status,
        updatedAt: timestamp,
        completedAt: status === 'completed' ? timestamp : null,
        dismissedAt: status === 'dismissed' ? timestamp : null,
      });
      await this.database.reminders.put(next);
      return next;
    });
  }

  private async requireForNote(noteId: string): Promise<ReminderRecord> {
    const reminder = await this.getForNote(noteId);
    if (!reminder) throw new Error('This note has no reminder.');
    return reminder;
  }

  private readClock(): number {
    return validateTimestamp(this.clock(), 'Reminder clock');
  }
}

function validateTimestamp(value: number, label: string): number {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new RangeError(`${label} must be a non-negative safe integer timestamp.`);
  }
  return value;
}

function compareDueAt(a: ReminderRecord, b: ReminderRecord): number {
  return a.dueAt - b.dueAt || a.createdAt - b.createdAt || a.id.localeCompare(b.id);
}
