export {
  DATABASE_NAME,
  NotesDatabase,
  createNotesDatabase,
  deleteNotesDatabase,
  notesDatabase,
} from './database';
export { InvalidNoteStateError, NoteConflictError, NoteNotFoundError } from './errors';
export { DATABASE_SCHEMA_V1 } from './migrations/v1';
export { DATABASE_SCHEMA_V2, DATABASE_VERSION } from './migrations/v2';
export {
  AttachmentsRepository,
  isPreviewableImageMimeType,
  MAX_ATTACHMENTS_PER_NOTE,
  MAX_NATIVE_IMAGE_BYTES,
  MAX_NATIVE_IMAGE_DIMENSION,
  MAX_TOTAL_ATTACHMENT_BYTES_PER_NOTE,
  NATIVE_IMAGE_ACCEPT,
  type AddImagesResult,
} from './repositories/attachmentsRepository';
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
export { RemindersRepository, type SetReminderInput } from './repositories/remindersRepository';
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
export {
  isVoiceAudioMimeType,
  MAX_NATIVE_AUDIO_BYTES,
  VoiceAttachmentsRepository,
  type AddVoiceRecordingResult,
} from './repositories/voiceAttachmentsRepository';
export type {
  AttachmentRecord,
  ChecklistItemRecord,
  LabelRecord,
  NoteColor,
  NoteLabelRecord,
  NoteRecord,
  NoteType,
  ReminderRecord,
  ReminderStatus,
  RevisionReason,
  RevisionRecord,
  SettingRecord,
} from './types';
export { NOTE_COLORS, REMINDER_STATUSES, REVISION_REASONS } from './types';
export {
  attachmentRecordSchema,
  checklistItemRecordSchema,
  createNoteInputSchema,
  labelRecordSchema,
  noteLabelRecordSchema,
  noteRecordSchema,
  reminderRecordSchema,
  revisionRecordSchema,
  settingRecordSchema,
  updateNoteInputSchema,
} from './validation';
export type { CreateNoteInput, UpdateNoteInput } from './validation';
