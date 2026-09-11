import { describe, expect, it } from 'vitest';

import { DATABASE_SCHEMA_V1, DATABASE_VERSION as VERSION_1 } from './v1';
import { DATABASE_SCHEMA_V2, DATABASE_VERSION as VERSION_2 } from './v2';
import { DATABASE_SCHEMA_V3, DATABASE_VERSION as VERSION_3 } from './v3';

describe('database migration contract', () => {
  it('keeps schema versions strictly monotonic', () => {
    expect([VERSION_1, VERSION_2, VERSION_3]).toEqual([1, 2, 3]);
  });

  it('v2 preserves every v1 store and adds reminders', () => {
    for (const [store, schema] of Object.entries(DATABASE_SCHEMA_V1)) {
      expect(DATABASE_SCHEMA_V2[store as keyof typeof DATABASE_SCHEMA_V2]).toBe(schema);
    }
    expect(DATABASE_SCHEMA_V2.reminders).toContain('&noteId');
  });

  it('v3 preserves every v2 store while only extending attachment indexes', () => {
    for (const [store, schema] of Object.entries(DATABASE_SCHEMA_V2)) {
      if (store === 'attachments') continue;
      expect(DATABASE_SCHEMA_V3[store as keyof typeof DATABASE_SCHEMA_V3]).toBe(schema);
    }

    expect(DATABASE_SCHEMA_V3.attachments).toContain('id, noteId, checksum, createdAt');
    expect(DATABASE_SCHEMA_V3.attachments).toContain('[noteId+name]');
    expect(DATABASE_SCHEMA_V3.attachments).toContain('[noteId+mimeType]');
  });
});
