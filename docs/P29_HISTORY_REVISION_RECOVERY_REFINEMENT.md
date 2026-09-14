# P29 — History & Revision Recovery Refinement

## Goal

P29 refines the existing per-note revision-history and recovery experience without changing revision payloads, retention policy, checkpoint semantics, restore transactions, or copy semantics.

The phase makes historical recovery easier to understand, safer during asynchronous mutation, and more truthful when a recovery succeeds but secondary UI refresh work fails.

## Current-version clarity

History now treats the most recent checkpoint present when the recovery surface opens as the current recoverable snapshot. That is valid because both editors create or confirm a final `close` checkpoint before opening History, while identical consecutive snapshots remain suppressed.

The recovery surface therefore:

- marks the current recoverable checkpoint with a **Current** badge;
- focuses the initially selected current checkpoint after history loads;
- explains that the current snapshot already matches the live recoverable state;
- disables restore for the current snapshot instead of performing a no-op revision increment;
- moves the current-state marker to the exact snapshot produced by a successful restore or undo, including text ↔ checklist recovery.

P29 tracks the current snapshot by recoverable payload, not merely by revision-row ID. If pruning or refresh changes which row represents an equivalent snapshot, current-state recognition remains semantically correct.

## Saved-version keyboard navigation

Saved versions remain ordinary buttons and retain their existing chronological order. P29 adds deterministic keyboard traversal:

- **Arrow Down** selects/focuses the next saved version;
- **Arrow Up** selects/focuses the previous saved version;
- **Home** moves to the newest saved version;
- **End** moves to the oldest displayed saved version.

Selecting a different version clears stale operation messaging while leaving any available **Undo restore** recovery path intact.

## Restore preview clarity

The preview now explicitly distinguishes:

- the current recoverable version;
- a historical version with the same note type;
- a historical version that will change the note type.

Before restoration, History states which recoverable fields will be replaced. The persistent footer separately states which live metadata remains current: labels, attachments, pin/archive/trash state, and note position.

This is explanatory only. P29 does not add an unnecessary second confirmation step because revision restore is already transactional and immediately reversible through **Undo restore**.

## In-flight interaction lock

Restore, Undo restore, and Copy as new note now expose a single authoritative busy state through `aria-busy`.

While one of those operations is running:

- the saved-version list cannot change selection;
- Close is disabled;
- all recovery actions are disabled;
- Escape and backdrop dismissal are ignored;
- the active action uses an explicit label: **Restoring…**, **Undoing…**, or **Copying…**.

This prevents the visible preview from drifting away from the snapshot actually being mutated or copied.

## Completion and error focus

Recovery state transitions now have deterministic focus behavior:

- initial history load focuses the selected saved version;
- a failed action focuses its inline alert while leaving the selected version available for retry;
- a successful restore focuses **Undo restore**;
- a successful undo focuses the completion status;
- a successful historical copy focuses its non-destructive completion status.

The dialog continues using the shared modal focus trap. Escape closes History only while no recovery mutation is in flight.

## Truthful post-restore refresh failures

The restore transaction and the subsequent history-list refresh are now treated as separate outcomes.

If the restore transaction commits successfully but reloading the saved-version list fails:

- the parent editor still receives the committed restore result;
- History still records the restored snapshot as current;
- **Undo restore** remains available;
- the success status continues to say that the version was restored;
- a separate alert explains that only the saved-version list failed to refresh.

The same distinction applies to Undo restore. A secondary read failure can no longer misreport a committed recovery mutation as though the restore itself failed.

## Permanent regression coverage

`e2e/p29-history-revision-recovery-refinement.spec.ts` verifies:

- explicit current-version marking and no-op restore prevention;
- initial saved-version focus;
- Arrow/Home/End history navigation;
- restore busy locking and Escape protection;
- failed restore focus and retry without losing selection;
- successful restore state and Undo focus;
- successful Undo restore and completion focus;
- truthful handling of a synthetic post-restore history refresh failure;
- historical-copy busy locking, Escape protection, completion focus, and source-note preservation.

Run the focused suite with:

```text
npm run e2e:p29
```

The complete no-retry release regression remains authoritative before merge.

## Preserved boundaries

P29 does **not** change:

- IndexedDB schema or database version;
- revision payload version or payload fields;
- `edit`, `close`, `import`, `restore`, or `conversion` checkpoint meanings;
- duplicate-snapshot suppression;
- 50-version retention policy;
- newest-30 exact retention or long-term historical sampling;
- atomic restore transaction behavior;
- optimistic live-note revision guards;
- checklist item-ID preservation during same-note restore;
- checklist item-ID remapping during historical copy;
- label preservation behavior;
- attachment preservation behavior;
- pin/archive/trash/position preservation behavior;
- backup/export formats;
- sync, account, privacy, reminder, search, lifecycle, or PWA architecture.

P29 is an interaction and recovery-truthfulness layer over the existing revision engine.
