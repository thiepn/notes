# Checklist Engine

P7 adds first-class checklist notes while preserving the same local-first lifecycle, labels, colors, masonry, recovery, and export-ready data model used by text notes.

## Storage model

P7 keeps database schema version 1 unchanged. Checklist notes use the existing `notes.type = "checklist"` discriminator and normalized `checklistItems` rows:

- `id`
- `noteId`
- `text`
- `checked`
- `parentId`
- `position`
- timestamps

The visual editor supports one visible subtask level in V1. The database parent model remains capable of deeper trees for future migration/import compatibility.

## Atomic snapshot saves

Checklist editing is persisted as one transaction containing:

1. the note title/revision,
2. the complete ordered checklist row set,
3. item checkbox and parent state.

A save therefore cannot leave only half of a reorder, nesting change, or checkbox batch persisted. Existing optimistic note revisions still protect against stale writers.

## Capture and recovery

The Notes capture bar exposes a real checklist quick action. New checklist capture uses a separate synchronous recovery journal:

`notes.checklist-capture.v1`

Existing checklist edits use:

`notes.checklist-editor.v1`

Both journals are independent from P3/P4 text-note journals. A reload inside the normal 180 ms IndexedDB autosave window restores the exact title, item text, order, check state, and nesting state before the normal repository save resumes.

Empty checklist capture is discarded instead of leaving blank notes behind.

## Editing behavior

Checklist rows support:

- Enter: insert a new item after the current item,
- Backspace on an empty row: remove it and focus the previous item,
- Tab: indent beneath the preceding item,
- Shift+Tab: outdent,
- checkbox toggle,
- explicit delete,
- drag reorder,
- move up/down button fallback,
- automatic movement of checked items downward,
- hide/show completed,
- clear completed.

Moving a top-level row also moves its immediate child block so nesting is not silently detached. Touch and keyboard users can use the explicit move controls instead of drag-and-drop.

## Conversion

Text notes can be converted to checklists from the text editor. Each non-empty body line becomes an unchecked checklist item.

Checklist notes can be converted back to text. Item order and text are preserved, and child items use two-space indentation. Checkbox state is intentionally removed because plain text has no checkbox-state field.

## Card previews

Checklist cards render a compact non-interactive preview of the first seven items, including check state and one-level indentation. Longer lists display a remaining-item count. The full checklist remains editable only after opening the card.

## Existing systems

Checklist notes participate in all existing systems without a parallel navigation path:

- pin/archive/trash/restore,
- duplication,
- colors,
- labels and label-filtered views,
- grid/list masonry,
- Archive editing,
- read-only Trash preview.

`NotesRepository.duplicate()` already remaps checklist parent IDs, so duplicate checklist structure remains intact.

## Tests

Vitest covers checklist ordering and nesting model behavior.

Playwright covers:

- checklist creation and card preview,
- Enter/Backspace keyboard behavior,
- Tab nesting,
- drag reorder,
- completed-item move/hide/show/clear,
- text to checklist conversion and back,
- immediate-reload checklist edit recovery,
- 100-item atomic persistence across IndexedDB close/reopen,
- all P1-P6 regressions.

## Phase boundary

P7 owns checklist capture, editing, nesting, ordering, completed-item controls, conversion, preview rendering, and crash/reload recovery. P8 owns selection mode and bulk actions across cards.
