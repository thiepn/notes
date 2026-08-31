# Selection + Bulk Actions

P8 adds one selection model across Notes, label-filtered Notes, Archive, and Trash. Selection is UI state only; it is never persisted into the note database.

## Selection entry

Desktop supports:

- Ctrl/Cmd-click: toggle one card into or out of selection,
- Shift-click: select the contiguous visible range from the current anchor,
- the card selection control: explicit mouse/keyboard selection,
- ordinary card clicks while selection mode is active: toggle that card.

Touch and pen support a 480 ms long press on the card surface to enter selection. The long press consumes the following click so opening the editor cannot happen accidentally.

Escape exits selection when no selection popover or confirmation dialog is open.

## Selection scope

Selection belongs to the currently visible collection context:

- Notes,
- a specific label-filtered Notes view,
- Archive,
- Trash.

Changing collection context does not carry selected IDs into the new view. `Select all` selects only the currently visible collection, not hidden Archive/Trash notes or notes excluded by a label filter.

## Toolbar

Selection replaces the normal Grid/List toolbar with a sticky bulk toolbar.

Notes:

- pin/unpin,
- color,
- labels,
- archive,
- trash.

Archive:

- color,
- labels,
- move to Notes,
- trash.

Trash:

- restore,
- permanent delete.

Individual card action buttons are removed from the focus order while selection mode is active, leaving one unambiguous action surface.

## Bulk transaction contract

`BulkActionsRepository` performs each batch mutation in one Dexie transaction. A stale or missing note causes the entire mutation to fail rather than partially updating the selection.

Bulk mutations use each selected note's expected revision. Pin, archive, unarchive, trash, restore, and color changes increment normal note revisions and preserve monotonic `updatedAt` timestamps.

Permanent bulk deletion is additionally guarded in the repository: every target must already be in Trash. The transaction cascades checklist items, note-label links, attachments, and revisions before deleting the note rows. Labels themselves are never deleted.

## Undo

Reversible actions capture only the state they own:

- lifecycle actions snapshot `pinnedAt`, `archivedAt`, and `trashedAt`,
- color actions snapshot only `color`,
- label actions snapshot only each note's label IDs.

Undo restores those fields transactionally without replacing title, content, checklist rows, or unrelated metadata.

This avoids the common bulk-undo bug where restoring an old full note object overwrites a later edit to an unrelated field.

## Bulk labels

The label panel represents three states per label:

- all selected notes have it,
- some selected notes have it,
- none have it.

Clicking a label present on all removes it from all selected notes. Clicking a mixed or absent label adds it to all selected notes. Other labels on those notes are preserved.

## Performance gate

P8 includes a real Chromium regression with 500 locally stored notes. It selects all 500, applies one color mutation transactionally, verifies all 500 IndexedDB records, and exits selection again. This is a permanent regression gate against bulk-selection freezes or partial writes.

## Phase boundary

P8 owns card selection, range selection, touch long press, the bulk toolbar, batch lifecycle/color/label operations, batch permanent deletion, and bulk Undo. P9 owns search, filters, and query operators.
