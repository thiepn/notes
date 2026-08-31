# Revision History + Recovery

P11 activates the existing database-v1 `revisions` table as a user-facing recovery system for text notes and checklists. No database migration is required.

## Revision snapshot

Each revision row stores a validated JSON payload with payload version `1`:

- note type (`text` or `checklist`),
- title,
- text body for text notes,
- note color,
- ordered checklist rows for checklist notes,
- checklist item ID, text, checked state, and parent ID.

Checklist item IDs remain stable when a revision is restored into the same note. Copying a historical version into a new note remaps item IDs and parent IDs so the copy is independent from the source.

Revision payloads intentionally do not snapshot labels, lifecycle fields, or attachments. Restoring old wording or checklist state must not unexpectedly unarchive a note, resurrect an old label assignment, discard a current attachment, or change the note's place in the current workspace.

## Meaningful checkpoints

P11 does not create a revision for every 180 ms autosave. Autosave remains the fast durability path; history records meaningful recovery boundaries instead.

Checkpoints are created for:

- the state present when an editor session opens (`edit`),
- the final state when an editor session closes (`close`),
- text/checklist conversion results (`conversion`),
- the current state immediately before a historical restore (`restore`).

Identical consecutive snapshot payloads are suppressed. Opening and closing a note without changing its recoverable content therefore does not create duplicate history noise.

## Restore transaction

A restore is one transaction over the live note, checklist rows, and revision history.

Before mutating the note, P11:

1. validates the selected revision record and payload,
2. verifies that the revision belongs to the requested note,
3. applies the expected live-note revision guard when supplied,
4. captures the current recoverable state as an undo checkpoint when it is not already the latest identical checkpoint.

The transaction then restores title, note type/content, color, and checklist rows, increments the live note revision, and commits atomically.

A restore preserves the current note's:

- `createdAt`,
- position,
- pin state,
- archive state,
- trash state,
- label relationships,
- attachment rows.

If parsing or validation fails before the transaction can commit, the live note remains unchanged.

## Undo restore

After a restore, History exposes **Undo restore**. The undo operation is itself a normal revision restore against the pre-restore checkpoint, so it receives the same optimistic-revision validation and transactional checklist behavior as any other restore.

Restore results are staged inside the open history session rather than immediately replacing the parent editor. This matters across type boundaries: a checklist can be restored while the current editor is a text editor (or vice versa), History remains open, and Undo remains available. The final staged state is published to the card collection only when History closes.

This staging also prevents a stale editor instance from autosaving its pre-restore draft over a restored cross-type note.

## Historical copy

**Copy as new note** creates a new active note without modifying the source note.

The copy receives:

- historical type/title/content/color,
- historical checklist structure when applicable,
- remapped checklist IDs,
- the source note's current label memberships.

The copy does not inherit the source note's pin/archive/trash lifecycle state. It starts as an ordinary active note.

## Retention and pruning

Revision history is bounded to **50 versions per note**.

P11 preserves:

- the newest **30** checkpoints exactly and contiguously,
- up to **20** older checkpoints sampled across the remaining lifetime of the note.

The historical sample includes long-range endpoints so an old note retains both recent fine-grained recovery and representative long-term checkpoints rather than allowing recent edits to erase the entire early history.

Pruning runs as part of checkpoint/restore maintenance and does not affect the live note.

## Payload integrity

Revision payloads are Zod-validated. Checklist snapshots additionally reject:

- duplicate checklist item IDs,
- self-parent relationships,
- children whose parent does not appear earlier in the ordered snapshot,
- checklist rows inside a text-note snapshot.

Malformed JSON is rejected before live-note mutation. The real-browser recovery regression injects a corrupt revision deliberately and verifies that the attempted restore fails while the current note remains unchanged.

## Editor UI

Both text and checklist editors expose **History**.

The responsive history dialog provides:

- chronological saved-version navigation,
- checkpoint reason and timestamp,
- text/checklist preview,
- note-color preview,
- Restore this version,
- Undo restore,
- Copy as new note.

On mobile, History becomes a full-screen recovery surface.

## Checklist integrity regression found during P11

P11 recovery testing exposed an older checklist-engine bug: checking a nested child with “move completed down” enabled could reinsert an only-child row before its parent, violating the normalized checklist ordering invariant. P11 fixes the helper so completed children remain after their parent and after any sibling group, and adds permanent unit coverage for both the only-child and multi-sibling cases.

## Regression coverage

P11 permanently verifies in Chromium:

- text revision preview,
- text restore,
- Undo restore,
- checklist text/check-state/hierarchy restore,
- historical copy,
- label preservation on copied history,
- current label preservation during restore,
- archive-state preservation during restore,
- corrupt-payload rollback,
- 50-version pruning,
- exact retention of the newest 30 checkpoints,
- retention of the oldest long-term checkpoint,
- checklist → text → historical checklist restore,
- cross-type Undo while History remains open,
- immediate checklist-row availability after a cross-type restore.

## Phase boundary

P11 owns per-note local revision history and recovery. P12 owns whole-library backup, export, validation, restore, and disaster-recovery workflows. Revision history is one data source P12 must preserve in full backups rather than a substitute for backups themselves.
