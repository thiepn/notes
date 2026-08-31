export {
  DATABASE_NAME,
  NotesDatabase,
  createNotesDatabase,
  deleteNotesDatabase,
  notesDatabase,
} from './database';
export { InvalidNoteStateError, NoteConflictError, NoteNotFoundError } from './errors';
export { DATABASE_SCHEMA_V1, DATABASE_VERSION } from './migrations/v1';
export {
  BulkActionsRepository,
  type BulkColorState,
  type BulkLabelState,
  type BulkLifecycleState,
  type BulkNoteTarget,
} from './repositories/bulkActionsRepository';
export {
  ChecklistsRepository,
  type ChecklistDraftItem,
  type ChecklistSnapshot,
} from './repositories/checklistsRepository';
export { LabelsRepository, normalizeLabelName } from './repositories/labelsRepository';
export { NotesRepository } from './repositories/notesRepository';
export {
  RevisionsRepository,
  parseRevisionPayload,
  revisionSnapshotSchema,
  serializeRevisionSnapshot,
  type RevisionChecklistItemSnapshot,
  type RevisionCopyResult,
  type RevisionEntry,
  type RevisionRestoreResult,
  type RevisionSnapshot,
} from './repositories/revisionsRepository';
export type {
  AttachmentRecord,
  ChecklistItemRecord,
  LabelRecord,
  NoteColor,
  NoteLabelRecord,
  NoteRecord,
  NoteType,
  RevisionReason,
  RevisionRecord,
  SettingRecord,
} from './types';
export { NOTE_COLORS, REVISION_REASONS } from './types';
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