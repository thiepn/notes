# Note Lifecycle

P5 turns the P4 card surface into a complete local note lifecycle: pinning, archive, trash, restore, permanent deletion, duplication, and reversible routine actions.

## Lifecycle states

A note is in exactly one primary collection:

```text
Notes   archivedAt = null, trashedAt = null
Archive archivedAt != null, trashedAt = null
Trash   trashedAt != null
```

Pinned state is available only in Notes. Archiving or trashing clears `pinnedAt`, matching the existing repository invariants.

## Card actions

### Notes

- Pin / unpin
- Archive
- Duplicate
- Move to trash
- Open and edit

### Archive

- Unarchive
- Duplicate
- Move to trash
- Open and edit

### Trash

- Restore to Notes
- Delete permanently
- Read-only card content

Trash intentionally does not allow editing. A note must be restored before its content can change.

## Undo contract

Routine lifecycle actions show a seven-second toast with Undo where an inverse operation is safe.

Undo is state-aware rather than merely visibility-aware:

- pin → restores the previous pin state,
- archive → unarchives and restores a prior pin when needed,
- unarchive → archives again,
- trash → restores the prior collection and prior pin state,
- restore → moves the note back to trash,
- duplicate → permanently removes only the newly created copy.

Permanent deletion is the exception: it cannot be undone and therefore requires explicit confirmation.

## Archive and Trash views

The existing sidebar destinations are now real database-backed views instead of placeholders.

- Archive reads `listArchived()`.
- Trash reads `listTrashed()`.
- Grid/List preference is shared across Notes, Archive, and Trash.
- Archive notes remain editable.
- Trash cards remain read-only until restored.

The active primary section is persisted under `notes.active-section`. This is important for P4 edit recovery: if an archived note is being edited when the page reloads inside the autosave debounce window, the app returns to Archive first, then restores the correct editor journal.

## Permanent deletion

Permanent deletion is only exposed from Trash.

The confirmation dialog is required before the repository's transactional `deletePermanently()` operation runs. The P1 repository then removes the note and all dependent checklist, label-link, attachment, and revision rows in one transaction.

## Tests

Playwright now covers:

- pin and unpin behavior,
- archive with Undo restoring prior pinned state,
- functional Archive navigation,
- active-section persistence across reload,
- unarchive to Notes,
- trash Undo restoring Archive state,
- restore from Trash,
- permanent-delete confirmation and removal,
- duplicate plus Undo,
- all previous database, shell, capture, masonry, list-mode, and editor-recovery regressions.

## Phase boundary

P5 owns lifecycle state and reversible lifecycle actions. P6 owns visual organization through note colors and labels, including label creation, assignment, filtering, rename, and deletion semantics.
