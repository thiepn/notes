import type Dexie from 'dexie';

import { DATABASE_SCHEMA_V1 } from './v1';

export const DATABASE_VERSION = 2;

export const DATABASE_SCHEMA_V2 = {
  ...DATABASE_SCHEMA_V1,
  reminders: 'id, &noteId, dueAt, status, updatedAt',
} as const;

export function applyDatabaseVersion2(database: Dexie): void {
  database.version(DATABASE_VERSION).stores(DATABASE_SCHEMA_V2);
}
