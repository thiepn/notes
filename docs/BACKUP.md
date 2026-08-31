# Backup + Recovery

P12 adds whole-library disaster recovery for the local-first Notes database. It is intentionally separate from P11 per-note revision history and from P13 external/Google Keep import.

## Scope

A P12 full backup contains every durable database-v1 table:

- `notes`
- `checklistItems`
- `labels`
- `noteLabels`
- `attachments`
- `revisions`
- `settings`

The backup does not include temporary editor/capture recovery journals or UI-only `localStorage` preferences. Those values are not part of the durable note library.

No database migration is required for P12.

## File format

Backups are self-contained UTF-8 JSON files with:

- format identifier `thiepn.notes.backup`
- backup format version `1`
- source database version `1`
- export timestamp
- all seven durable table snapshots

The file is intentionally open and inspectable instead of using an opaque proprietary container.

Binary attachment data is encoded as base64 inside the attachment record. The app preserves the attachment's original `checksum` field exactly and also adds a backup-specific lowercase SHA-256 digest (`dataSha256`) calculated from the actual exported bytes.

This makes the backup independent from whatever checksum convention the future attachment implementation uses while still detecting changed or truncated backup bytes.

## Consistent export snapshot

Export reads all seven tables inside one Dexie read transaction. A backup therefore represents one consistent database snapshot rather than a mixture of rows read at different moments while autosave is active.

Every database row is revalidated against the same Zod record schemas used by the application before it is emitted. Attachment byte length must agree with the stored attachment `size`.

The resulting backup document is validated again before download.

## Validation before restore

Selecting a backup file is always read-only. The file is parsed and fully validated before the restore button becomes available.

Validation covers:

- supported backup format/version
- supported database version
- schema validity of every row
- duplicate note/checklist/label/attachment/revision IDs
- duplicate normalized label names
- duplicate note-label pairs
- duplicate setting keys
- checklist note references
- duplicate checklist positions within a note
- checklist parent relationships, parent-before-child ordering, and supported nesting depth
- note-label references
- attachment note references
- revision note references
- base64 validity
- exact decoded attachment byte length
- SHA-256 attachment integrity

P12 deliberately treats the historical revision `payload` as opaque durable data during whole-library backup. P11 validates a revision payload when it is used. A damaged historical revision should not prevent the user from rescuing otherwise healthy current notes, attachments, labels, and lifecycle state.

The restore UI limits selected backup files to 512 MB as a browser-memory safety boundary for the current self-contained JSON format.

## Restore semantics

P12 is a **replace restore**, not a merge operation.

After validation and explicit confirmation, Notes replaces the complete local library with the selected backup. IDs, timestamps, note revisions, lifecycle state, labels, checklist relationships, attachments, revision history, and settings are preserved exactly as stored in the backup.

External merge/import behavior belongs to P13.

## Pre-restore safety backup

A destructive restore has an additional safety boundary: immediately before the replacement transaction begins, Notes exports and downloads the current device library as a separate file named with the `notes-before-restore-...json` prefix.

If the selected restore was a user mistake, that file is the recovery path back to the state that existed immediately before replacement.

If this safety export cannot be created, the destructive restore does not begin.

## Atomic replacement

Restore performs one Dexie read-write transaction spanning all seven durable tables.

The sequence is:

1. validate the entire selected backup outside the write transaction
2. reconstruct and checksum-verify every attachment Blob
3. create/download the current-device safety backup
4. open one seven-table write transaction
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

## Regression coverage

P12 verifies in real Chromium that:

- a backup file downloads successfully
- all seven database-v1 tables are represented
- archived lifecycle state survives
- checklist IDs, checked state, and parent relationships survive
- current label relationships survive
- attachment bytes survive exactly
- original attachment checksum metadata survives
- independent backup SHA-256 metadata is present
- P11 revision rows survive
- database settings survive
- the safety backup captures the pre-restore library
- replace restore removes rows created after the original backup
- corrupt/dangling backups are rejected during preview without writes
- a forced mid-restore write failure rolls the whole replacement back

Unit-level format validation additionally rejects duplicate checklist positions and child rows ordered before their parent.

## Phase boundary

P11 answers: “How do I recover an older version of this note?”

P12 answers: “How do I recover this entire Notes library or move it safely between browser installations?”

P13 will answer: “How do I import external note collections such as Google Keep Takeout into the existing library without replacing it?”
