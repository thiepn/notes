import { LabelsRepository, NotesRepository, RemindersRepository, notesDatabase } from '../../db';

export interface NavigationStats {
  notes: number;
  pinned: number;
  unlabeled: number;
  reminders: number;
  archive: number;
  trash: number;
  labels: Record<string, number>;
  labelUsage: Record<string, number>;
}

export const EMPTY_NAVIGATION_STATS: NavigationStats = {
  notes: 0,
  pinned: 0,
  unlabeled: 0,
  reminders: 0,
  archive: 0,
  trash: 0,
  labels: {},
  labelUsage: {},
};

const notesRepository = new NotesRepository(notesDatabase);
const labelsRepository = new LabelsRepository(notesDatabase);
const remindersRepository = new RemindersRepository(notesDatabase);

export async function loadNavigationStats(): Promise<NavigationStats> {
  const [activeNotes, archivedNotes, trashedNotes, visibleReminders] = await Promise.all([
    notesRepository.listActive(),
    notesRepository.listArchived(),
    notesRepository.listTrashed(),
    remindersRepository.listVisibleWithNotes(),
  ]);

  const activeNoteIds = activeNotes.map((note) => note.id);
  const libraryNoteIds = [...activeNoteIds, ...archivedNotes.map((note) => note.id)];
  const [labelIdsByActiveNote, labelIdsByLibraryNote] = await Promise.all([
    labelsRepository.labelIdsByNote(activeNoteIds),
    labelsRepository.labelIdsByNote(libraryNoteIds),
  ]);

  return {
    notes: activeNotes.length,
    pinned: activeNotes.filter((note) => note.pinnedAt !== null).length,
    unlabeled: activeNotes.filter((note) => (labelIdsByActiveNote[note.id] ?? []).length === 0).length,
    reminders: visibleReminders.filter(({ reminder }) => reminder.status === 'active').length,
    archive: archivedNotes.length,
    trash: trashedNotes.length,
    labels: countLabels(labelIdsByActiveNote),
    labelUsage: countLabels(labelIdsByLibraryNote),
  };
}

export function countLabels(labelIdsByNote: Record<string, string[]>): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const labelIds of Object.values(labelIdsByNote)) {
    for (const labelId of new Set(labelIds)) {
      counts[labelId] = (counts[labelId] ?? 0) + 1;
    }
  }
  return counts;
}
