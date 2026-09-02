import {
  LabelsRepository,
  NotesRepository,
  RemindersRepository,
  notesDatabase,
} from '../../db';

export interface NavigationStats {
  notes: number;
  reminders: number;
  archive: number;
  trash: number;
  labels: Record<string, number>;
}

export const EMPTY_NAVIGATION_STATS: NavigationStats = {
  notes: 0,
  reminders: 0,
  archive: 0,
  trash: 0,
  labels: {},
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

  const labelIdsByNote = await labelsRepository.labelIdsByNote(
    activeNotes.map((note) => note.id),
  );

  return {
    notes: activeNotes.length,
    reminders: visibleReminders.filter(({ reminder }) => reminder.status === 'active').length,
    archive: archivedNotes.length,
    trash: trashedNotes.length,
    labels: countLabels(labelIdsByNote),
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
