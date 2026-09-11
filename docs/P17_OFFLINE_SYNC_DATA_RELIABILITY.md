# P17 — Offline, Sync & Data Reliability Audit

## Goal

P17 hardens existing local-first behavior against crashes, stale tabs, interrupted restores, offline/online transitions, and sync coordination mistakes. It deliberately avoids new product features and does not change the IndexedDB schema or cloud schema.

## Audit findings and fixes

### 1. Existing editor crash recovery could collide across tabs

Text notes previously used one `localStorage` key (`notes.editor-draft.v1`) for every existing-note draft. Checklist editors had the same single-slot pattern. Editing a second note in another tab could therefore overwrite the first note's recovery copy before either write reached IndexedDB.

P17 moves existing-note recovery to per-note v2 keys:

- `notes.editor-draft.v2:<noteId>`
- `notes.checklist-editor.v2:<noteId>`

The old v1 slots remain readable for backward-compatible recovery. Cleanup is scoped to the journal last read/written by the current tab or an explicitly supplied note ID; another tab's pending draft is not deleted.

Checklist *capture* remains a single global journal because there is only one in-progress new-checklist capture surface per tab; the change applies to existing-note editors.

### 2. IndexedDB was safe against stale writes, but peer tabs could remain visually stale

Notes and checklists already use optimistic note revisions. A stale editor cannot silently overwrite a newer revision: the repository throws `NoteConflictError`, and the editor keeps the failed draft in its recovery journal.

P17 adds a `BroadcastChannel` bridge for data-invalidation app events. A durable text autosave notifies peer tabs without forcing the current editor to reload. Checklist durability boundaries also notify peers. Existing cloud/reminder/search invalidation events can cross tabs while `openSyncSettings` remains local-only.

The channel only dispatches the local DOM event on receipt and never rebroadcasts received messages, preventing event loops.

### 3. Portable backups incorrectly included cloud-sync acknowledgement state

The Supabase sync engine stores per-account reconciliation shadows in IndexedDB settings under `sync.supabase.shadow.*`. These values are device/account coordination metadata, not user library data.

P17 makes the full backup portable-setting policy explicit:

- ordinary settings remain in backups;
- all `sync.supabase.shadow.*` settings are excluded from current backup statistics and exports;
- older backups containing shadow settings can still be inspected, but restore ignores those shadow records;
- restore clears existing settings before applying portable settings, so any old local sync shadow is invalidated and the next sync reconciles from observed local/remote data.

No Supabase table, RLS policy, authentication flow, or cloud record format changes are required.

### 4. Restore atomicity and migration assumptions are now executable contracts

Backup restore already verifies the complete backup before mutation and replaces all local tables inside one Dexie read-write transaction. P17 adds browser coverage that injects a failure during restore after destructive work begins and verifies the original library remains intact.

Migration tests also certify the existing v1 → v2 → v3 chain as monotonic and non-destructive:

- v2 preserves v1 stores and adds reminders;
- v3 preserves v2 stores and extends attachment indexes only.

## Regression scenarios

P17 adds focused coverage for:

- two text-note recovery journals coexisting;
- two checklist recovery journals coexisting;
- legacy v1 draft recovery;
- scoped cleanup that preserves another tab's draft;
- future `sync.supabase.shadow.*` namespaces remaining non-portable;
- database migration schema invariants;
- live two-tab refresh after a durable edit;
- stale editor revision rejection with its unsaved draft retained;
- sync-shadow exclusion from export and restore;
- rollback of a simulated mid-restore failure.

The existing global release gate continues to cover offline cold reloads, offline writes, PWA share-target handling, reminders while offline, cross-browser compatibility, and the complete application regression suite.

## Preserved boundaries

P17 intentionally makes no changes to:

- IndexedDB database version or store schema;
- note/checklist/attachment/reminder record formats;
- Supabase schema, RLS, authentication, or storage bucket rules;
- sync remote entity format or conflict-copy format;
- backup JSON format version;
- search indexing/ranking;
- editor formatting behavior;
- privacy lock behavior;
- PWA service-worker transport contracts.
