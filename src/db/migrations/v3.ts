import type Dexie from 'dexie';

import { DATABASE_SCHEMA_V2 } from './v2';

export const DATABASE_VERSION = 3;

export const DATABASE_SCHEMA_V3 = {
  ...DATABASE_SCHEMA_V2,
  attachments: 'id, noteId, checksum, createdAt, [noteId+name], [noteId+mimeType]',
} as const;

export function applyDatabaseVersion3(database: Dexie): void {
  database.version(DATABASE_VERSION).stores(DATABASE_SCHEMA_V3);
}
