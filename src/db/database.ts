import Dexie, { type Table } from 'dexie';

import { applyDatabaseVersion1 } from './migrations/v1';
import { applyDatabaseVersion2 } from './migrations/v2';
import type {
  AttachmentRecord,
  ChecklistItemRecord,
  LabelRecord,
  NoteLabelRecord,
  NoteRecord,
  ReminderRecord,
  RevisionRecord,
  SettingRecord,
} from './types';

export const DATABASE_NAME = 'thiepn-notes';

export class NotesDatabase extends Dexie {
  declare notes: Table<NoteRecord, string>;
  declare checklistItems: Table<ChecklistItemRecord, string>;
  declare labels: Table<LabelRecord, string>;
  declare noteLabels: Table<NoteLabelRecord, [string, string]>;
  declare attachments: Table<AttachmentRecord, string>;
  declare reminders: Table<ReminderRecord, string>;
  declare revisions: Table<RevisionRecord, string>;
  declare settings: Table<SettingRecord, string>;

  constructor(name = DATABASE_NAME) {
    super(name);
    applyDatabaseVersion1(this);
    applyDatabaseVersion2(this);
  }
}

export function createNotesDatabase(name = DATABASE_NAME): NotesDatabase {
  return new NotesDatabase(name);
}

export const notesDatabase = createNotesDatabase();

export async function deleteNotesDatabase(name: string): Promise<void> {
  await Dexie.delete(name);
}
