# Backup + Recovery

P12 adds whole-library disaster recovery for the local-first Notes database. It is intentionally separate from P11 per-note revision history and from P13 external/Google Keep import.

V2-1 extends that established recovery contract to database schema v2 and reminder records without changing its replace-restore semantics.

## Scope

A current full backup contains every durable database-v2 table:

- `notes`
- `checklistItems`
- `labels`
- `noteLabels`
- `attachments`
- `reminders`
- `revisions`
- `settings`

The backup does not include temporary editor/capture recovery journals or UI-only `localStorage` preferences. Those values are not part of the durable note library.

P12 originally shipped against database v1. V2-1 extends export, validation, safety backup, and restore to database v2 while retaining legacy backup-v1 restore compatibility.

## File format

Backups are self-contained UTF-8 JSON files with:

- format identifier `thiepn.notes.backup`
- backup format version `2`
- source database version `2`
- export timestamp
- all eight durable table snapshots

The file is intentionally open and inspectable instead of using an opaque proprietary container.

Binary attachment data is encoded as base64 inside the attachment record. The app preserves the attachment's original `checksum` field exactly and also adds a backup-specific lowercase SHA-256 digest (`dataSha256`) calculated from the actual exported bytes.

This makes the backup independent from whatever checksum convention the future attachment implementation uses while still detecting changed or truncated backup bytes.

## Consistent export snapshot

Export reads all eight tables inside one Dexie read transaction. A backup therefore represents one consistent database snapshot rather than a mixture of rows read at different moments while autosave is active.

Every database row is revalidated against the same Zod record schemas used by the application before it is emitted. Attachment byte length must agree with the stored attachment `size`.

The resulting backup document is validated again before download.

## Validation before restore

Selecting a backup file is always read-only. The file is parsed and fully validated before the restore button becomes available.

Validation covers:

- supported backup format/version
- supported database version
- schema validity of every row
- duplicate note/checklist/label/attachment/reminder/revision IDs
- duplicate normalized label names
- duplicate note-label pairs
- duplicate setting keys
- checklist note references
- duplicate checklist positions within a note
- checklist parent relationships, parent-before-child ordering, and supported nesting depth
- note-label references
- attachment note references
- reminder note references and the one-reminder-per-note invariant
- revision note references
- base64 validity
- exact decoded attachment byte length
- SHA-256 attachment integrity

P12 deliberately treats the historical revision `payload` as opaque durable data during whole-library backup. P11 validates a revision payload when it is used. A damaged historical revision should not prevent the user from rescuing otherwise healthy current notes, attachments, labels, and lifecycle state.

The restore UI limits selected backup files to 512 MB as a browser-memory safety boundary for the current self-contained JSON format.

## Restore semantics

P12 is a **replace restore**, not a merge operation.

After validation and explicit confirmation, Notes replaces the complete local library with the selected backup. IDs, timestamps, note revisions, lifecycle state, labels, checklist relationships, attachments, reminders, revision history, and settings are preserved exactly as stored in the backup.

External merge/import behavior belongs to P13.

## Pre-restore safety backup

A destructive restore has an additional safety boundary: immediately before the replacement transaction begins, Notes exports and downloads the current device library as a separate file named with the `notes-before-restore-...json` prefix.

If the selected restore was a user mistake, that file is the recovery path back to the state that existed immediately before replacement.

If this safety export cannot be created, the destructive restore does not begin.

## Atomic replacement

Restore performs one Dexie read-write transaction spanning all eight durable tables.

The sequence is:

1. validate the entire selected backup outside the write transaction
2. reconstruct and checksum-verify every attachment Blob
3. create/download the current-device safety backup
4. open one eight-table write transaction
5. clear current table contents inside that transaction
6. insert all validated backup rows
7. commit only after every insert succeeds

Any write error aborts the transaction. Dexie/IndexedDB then rolls back the preceding table clears and partial inserts, leaving the original local library intact.

The P12 Chromium regression deliberately forces a note-table write failure after clears have begun and verifies that the original note still exists unchanged.

## User interface

Backup is a first-class primary-navigation section and is also discoverable through the command palette.

The Backup workspace provides:

- **Download full backup**
- hidden native file input behind **Choose and validate backup**
- read-only validated backup preview
- exported timestamp and table counts
- explicit replacement warning
- acknowledgement checkbox before destructive restore
- automatic pre-restore safety backup
- success/error status messaging

After a successful restore the app returns to Notes and remounts the active note workspace against the recovered database.

## V3.7 recovery-confidence polish

V3.7 does not alter P12's backup bytes, validation rules, replace-restore semantics, or database schema. It adds derived context around the existing recovery workflow so a user can make a more informed decision before exporting or replacing a local library.

The Backup workspace now shows **current backup readiness** using counts read from all eight durable IndexedDB tables in one read transaction. The compact summary includes current notes, attachments, reminders, and total database records. These counts are presentation state only; no cache/count table is persisted.

After a successful manual **Download full backup**, Notes records a small device-local activity marker under `notes.backup.last-manual.v1`. It contains only the export timestamp, downloaded filename, and JSON byte size. The marker is used to show when the last manual backup was made on this browser profile. It is not a guarantee that the user retained the downloaded file, and it is intentionally excluded from the portable Notes backup.

A validated incoming backup now exposes additional read-only context before the destructive confirmation step:

- selected JSON file size;
- normalized backup and database version;
- exact export timestamp;
- human-readable backup age/freshness;
- total database-record count; and
- a current-versus-incoming table for notes, attachments, reminders, saved versions, and all database records.

The comparison uses simple row-count deltas. It does not attempt content-level merge analysis and it never changes the current database. A negative value means the selected backup contains fewer rows in that category than the current device; a positive value means it contains more.

Current readiness counts refresh after a successful Google Keep import or full-library restore so the Backup workspace does not retain stale pre-mutation numbers.

All existing destructive-recovery gates remain mandatory: full validation first, explicit acknowledgement, a successfully generated/downloaded current-device safety backup, and one atomic eight-table replacement transaction.

V3.7 deliberately excludes scheduled/background backups, cloud backup destinations, sync, encryption, differential/incremental backups, merge restore, automatic restore, or a persistent backup-history database.

## Regression coverage

P12 verifies in real Chromium that:

- a backup file downloads successfully
- all eight database-v2 tables are represented
- archived lifecycle state survives
- checklist IDs, checked state, and parent relationships survive
- current label relationships survive
- attachment bytes survive exactly
- original attachment checksum metadata survives
- reminder due time, timezone, status, and identity survive
- independent backup SHA-256 metadata is present
- P11 revision rows survive
- database settings survive
- the safety backup captures the pre-restore library
- replace restore removes rows created after the original backup
- corrupt/dangling backups are rejected during preview without writes
- a forced mid-restore write failure rolls the whole replacement back

Unit-level format validation additionally rejects duplicate checklist positions, child rows ordered before their parent, dangling reminder references, and multiple reminders for one note.

Legacy backup-format v1/database-v1 files remain valid restore inputs. Validation normalizes them to the current v2 shape with an empty `reminders` table before the replacement transaction begins.

## Phase boundary

P11 answers: “How do I recover an older version of this note?”

P12 answers: “How do I recover this entire Notes library or move it safely between browser installations?”

P13 will answer: “How do I import external note collections such as Google Keep Takeout into the existing library without replacing it?”
