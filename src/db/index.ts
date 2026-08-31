export {
  DATABASE_NAME,
  NotesDatabase,
  createNotesDatabase,
  deleteNotesDatabase,
  notesDatabase,
} from './database';
export {
  InvalidNoteStateError,
  NoteConflictError,
  NoteNotFoundError,
} from './errors';
export { DATABASE_SCHEMA_V1, DATABASE_VERSION } from './migrations/v1';
export { NotesRepository } from './repositories/notesRepository';
export type {
  AttachmentRecord,
  ChecklistItemRecord,
  LabelRecord,
  NoteColor,
  NoteLabelRecord,
  NoteRecord,
  NoteType,
  RevisionRecord,
  SettingRecord,
} from './types';
export {
  attachmentRecordSchema,
  checklistItemRecordSchema,
  createNoteInputSchema,
  labelRecordSchema,
  noteLabelRecordSchema,
  noteRecordSchema,
  revisionRecordSchema,
  settingRecordSchema,
  updateNoteInputSchema,
} from './validation';
export type { CreateNoteInput, UpdateNoteInput } from './validation';
