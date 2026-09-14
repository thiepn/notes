# P28 — Backup, Import & Recovery Interaction Refinement

## Goal

P28 hardens the existing backup, Google Keep import, and local disaster-recovery workflows without changing the database model, backup format, import semantics, or restore transaction architecture.

The phase focuses on making long-running and destructive data operations explicit, keyboard-safe, retryable, and truthful from inspection through completion.

## Backup inspection and export

The existing full JSON backup and portable ZIP export formats remain authoritative. P28 adds interaction continuity around them:

- the backup workspace exposes its async state through `aria-busy`;
- backup file controls are locked while an export, validation, or restore operation is running;
- a successfully validated restore file moves keyboard focus to the validated preview;
- validation failures are announced and receive focus instead of leaving the user at a stale file control;
- selecting a new backup clears any stale destructive confirmation state from the previous file.

Validation remains read-only. No local data changes merely because a backup has been selected or inspected.

## Replacement restore confirmation

Replacing the complete local Notes library is the most destructive portability action. P28 therefore adds a final confirmation layer after the existing acknowledgement checkbox:

- the checked acknowledgement enables **Review restore** rather than immediately mutating the database;
- **Review restore** opens an `alertdialog` with safe initial focus on Cancel;
- Escape and backdrop dismissal work before the operation starts and return focus to the opener;
- once restoration starts, the dialog exposes `aria-busy`;
- Cancel and Restore are disabled while restoration is running;
- Escape and backdrop dismissal are ignored while the replacement transaction is in flight;
- the destructive action changes to **Restoring…**;
- Notes still downloads the current-device safety backup before the replacement attempt begins;
- a failed restore leaves the validated backup and dialog in place, announces the failure inline, and permits retry without reselecting the file;
- a successful restore returns through the existing authoritative library-refresh path and navigates back to Notes only after the replacement transaction succeeds.

The underlying restore remains one atomic database replacement transaction. P28 does not introduce partial restore, merge restore, or a new rollback format.

## Google Keep import continuity

Google Keep import remains additive and device-local. P28 strengthens its interaction states:

- a successfully inspected Keep source moves focus to the import preview;
- the import surface exposes `aria-busy` while scanning or importing;
- source inputs, lifecycle-selection controls, attachment selection, and the primary import action cannot be changed while an import is running;
- inspection/import failures are announced and receive focus;
- the prepared import remains available after a failed import so the operation can be corrected or retried;
- after successful persistence and parent-library refresh, focus moves to the import result summary.

Keep parsing, metadata mapping, label merging, lifecycle preservation, attachment handling, source de-duplication, and repeat-import protection are unchanged.

## Permanent regression coverage

`e2e/p28-backup-import-recovery-refinement.spec.ts` verifies:

- validated-backup focus and destructive-confirmation focus restoration;
- restore busy locking and Escape protection;
- inline restore failure followed by retry without reselecting the backup;
- pre-restore safety-backup download on each destructive attempt;
- successful replacement through the normal Notes workspace refresh;
- Google Keep preview focus, in-flight option locking, and completion focus.

Run the focused suite with:

```text
npm run e2e:p28
```

The complete release regression suite remains authoritative before merge.

## Preserved boundaries

P28 does **not** change:

- IndexedDB schema or version;
- persisted note, checklist, label, attachment, reminder, revision, or settings records;
- the full JSON backup format or format version;
- portable Markdown/ZIP format or manifest semantics;
- backup validation or attachment checksum rules;
- the 512 MB restore/import browser safety limits;
- atomic replacement-restore semantics;
- Google Keep parsing, metadata mapping, lifecycle mapping, label merging, duplicate detection, or source fingerprints;
- account, sync, conflict, or cloud-copy protocols;
- privacy-lock storage;
- search, reminder, lifecycle, or revision-history semantics;
- service-worker, offline, or PWA architecture.

P28 is an interaction-quality layer over the existing portability and recovery model.
