import { NotesRepository, notesDatabase, type NoteRecord, type ReminderRecord } from '../db';

export interface NotesHubSummary {
  schema: 'thiepn:notes-hub-local';
  version: 1;
  source: 'notes-local-device';
  generatedAt: string;
  activeCount: number;
  notes: { id: string; title: string; updatedAt: string; pinned: boolean }[];
  reminders: { id: string; noteId: string; title: string; dueAt: string }[];
}

function safeTitle(value: string): string {
  return (value.trim() || 'Untitled note').replace(/[\u0000-\u001f\u007f]/g, ' ').slice(0, 160);
}

export function projectNotesHubSummary(
  notes: readonly NoteRecord[],
  reminders: readonly ReminderRecord[],
  now = new Date(),
): NotesHubSummary {
  const active = notes.filter((note) => note.trashedAt === null && note.archivedAt === null);
  const recent = [...active].sort((a, b) => b.updatedAt - a.updatedAt || a.id.localeCompare(b.id));
  const noteById = new Map(active.map((note) => [note.id, note]));
  const due = reminders
    .filter((reminder) => reminder.status === 'active' && noteById.has(reminder.noteId))
    .sort((a, b) => a.dueAt - b.dueAt || a.id.localeCompare(b.id));

  return {
    schema: 'thiepn:notes-hub-local',
    version: 1,
    source: 'notes-local-device',
    generatedAt: now.toISOString(),
    activeCount: active.length,
    notes: recent.slice(0, 8).map((note) => ({
      id: note.id,
      title: safeTitle(note.title),
      updatedAt: new Date(note.updatedAt).toISOString(),
      pinned: note.pinnedAt !== null,
    })),
    reminders: due.slice(0, 6).map((reminder) => ({
      id: reminder.id,
      noteId: reminder.noteId,
      title: safeTitle(noteById.get(reminder.noteId)?.title ?? ''),
      dueAt: new Date(reminder.dueAt).toISOString(),
    })),
  };
}

/** Only the Notes owner may read its own local database. No Hub consumer writes, raw
 * bodies, cloud sync rows, checklists, attachments or account credentials leave Notes. */
export async function createNotesHubSummary(): Promise<NotesHubSummary> {
  const repository = new NotesRepository(notesDatabase);
  const [notes, reminders] = await Promise.all([
    repository.listActive(),
    notesDatabase.reminders.toArray(),
  ]);
  const summary = projectNotesHubSummary(notes, reminders);
  if (JSON.stringify(summary).length > 24_000) {
    throw new Error('The Notes summary is too large to share.');
  }
  return summary;
}
