import type Dexie from 'dexie';

export const DATABASE_VERSION = 1;

export const DATABASE_SCHEMA_V1 = {
  notes:
    'id, type, createdAt, updatedAt, pinnedAt, archivedAt, trashedAt, position',
  checklistItems: 'id, noteId, parentId, [noteId+position], updatedAt',
  labels: 'id, &nameNormalized, name, updatedAt',
  noteLabels: '[noteId+labelId], noteId, labelId, assignedAt',
  attachments: 'id, noteId, checksum, createdAt',
  revisions: 'id, noteId, [noteId+noteRevision], createdAt',
  settings: 'key, updatedAt',
} as const;

export function applyDatabaseVersion1(database: Dexie): void {
  database.version(DATABASE_VERSION).stores(DATABASE_SCHEMA_V1);
}
