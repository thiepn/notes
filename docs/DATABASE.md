# Database Architecture

P1 established the clean V1 IndexedDB schema at database version 1 without artificial pre-release migration history.

V2-1 is the first post-V1 schema change and introduces explicit database version 2 for reminders.

## Source of truth

The browser's IndexedDB database is the source of truth for user data. Dexie is the storage adapter. React components must never issue raw IndexedDB writes; feature code uses repository APIs.

## Database

- Name: `thiepn-notes`
- Version: `2`
- Schema definitions: `src/db/migrations/v1.ts` and `src/db/migrations/v2.ts`
- Runtime database: `src/db/database.ts`

## Tables

### `notes`

Owns note identity, content, lifecycle state, ordering, timestamps, and optimistic-concurrency revision.

### `checklistItems`

Stores checklist rows separately so item ordering and future nested checklist operations do not require rewriting an entire note payload.

### `labels`

Stores canonical labels. `nameNormalized` is unique to prevent duplicate labels that differ only by normalization policy.

### `noteLabels`

Many-to-many join table with compound primary key `[noteId+labelId]`.

### `attachments`

Stores local attachment metadata and Blob payloads. Attachment behavior is implemented in a later phase, but the v1 schema reserves the final table now so pre-release builds do not manufacture migration history.

### `reminders`

Introduced by schema v2. Stores at most one reminder per note using a unique `noteId` index, with absolute due time, scheduling timezone, lifecycle status, and notification de-duplication metadata. Reminder state is intentionally independent from note revision history.

### `revisions`

Stores bounded note-history snapshots used by P11 revision recovery.

### `settings`

Simple string-keyed local settings table. Complex values are serialized explicitly rather than hidden inside framework state.

## Invariants

1. IDs are UUIDs generated client-side.
2. Stored records are validated with Zod at repository boundaries.
3. Note `revision` begins at `1` and increments on every meaningful mutation.
4. `updatedAt` is strictly monotonic per note, even when two writes occur within the same millisecond.
5. Archive and trash are lifecycle state, not separate copies of a note.
6. Trashing a note removes archive and pin state; restoring returns it to active notes.
7. Permanent note deletion cascades to checklist items, note-label relations, attachments, reminders, and revisions in one Dexie transaction. Labels themselves survive.
8. Multi-table operations are transactional and must roll back completely on failure.
9. Repository reads validate persisted records so corrupt data fails loudly rather than silently propagating.
10. UI code must not bypass repositories for writes.

## Concurrency

Repository mutations may accept an `expectedRevision`. If another edit has already advanced the note revision, the write fails with `NoteConflictError` instead of silently overwriting a newer value.

This is sufficient for a single-device local-first application and also leaves a clean path for future conflict-aware sync without changing note identity.

## Migration policy

V1 shipped with schema version 1. V2-1 adds schema version 2 as a real forward migration that preserves existing V1 data and adds the `reminders` table.

Every future schema change must continue to use an explicit forward migration with automated tests against representative older databases. Implementation phase numbers alone are not a reason to create a database version.

## Testing

- Vitest validates record schemas and pure timestamp invariants.
- Playwright runs the real repository code against Chromium IndexedDB.
- Persistence tests cover v1→v2 opening, reopen, lifecycle transitions, optimistic concurrency, transaction rollback, reminder uniqueness/lifecycle, cascade deletion, and duplication of dependent records.
