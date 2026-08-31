export const NOTE_TYPES = ['text', 'checklist'] as const;
export type NoteType = (typeof NOTE_TYPES)[number];

export const NOTE_COLORS = [
  'default',
  'red',
  'orange',
  'yellow',
  'green',
  'teal',
  'blue',
  'purple',
  'pink',
  'brown',
  'gray',
] as const;
export type NoteColor = (typeof NOTE_COLORS)[number];

export const REVISION_REASONS = ['edit', 'close', 'import', 'restore', 'conversion'] as const;
export type RevisionReason = (typeof REVISION_REASONS)[number];

export const REMINDER_STATUSES = ['active', 'completed', 'dismissed'] as const;
export type ReminderStatus = (typeof REMINDER_STATUSES)[number];

export interface NoteRecord {
  id: string;
  type: NoteType;
  title: string;
  content: string;
  color: NoteColor;
  createdAt: number;
  updatedAt: number;
  pinnedAt: number | null;
  archivedAt: number | null;
  trashedAt: number | null;
  position: number;
  revision: number;
}

export interface ChecklistItemRecord {
  id: string;
  noteId: string;
  text: string;
  checked: boolean;
  parentId: string | null;
  position: number;
  createdAt: number;
  updatedAt: number;
}

export interface LabelRecord {
  id: string;
  name: string;
  nameNormalized: string;
  createdAt: number;
  updatedAt: number;
}

export interface NoteLabelRecord {
  noteId: string;
  labelId: string;
  assignedAt: number;
}

export interface AttachmentRecord {
  id: string;
  noteId: string;
  name: string | null;
  mimeType: string;
  size: number;
  checksum: string;
  data: Blob;
  createdAt: number;
}

export interface ReminderRecord {
  id: string;
  noteId: string;
  dueAt: number;
  timeZone: string;
  status: ReminderStatus;
  createdAt: number;
  updatedAt: number;
  completedAt: number | null;
  dismissedAt: number | null;
  lastNotifiedAt: number | null;
}

export interface RevisionRecord {
  id: string;
  noteId: string;
  noteRevision: number;
  reason: RevisionReason;
  payload: string;
  createdAt: number;
}

export interface SettingRecord {
  key: string;
  value: string;
  updatedAt: number;
}
