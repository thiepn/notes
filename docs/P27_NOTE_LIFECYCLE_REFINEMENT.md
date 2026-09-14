# P27 — Note Lifecycle & Destructive Action Refinement

## Goal

P27 hardens the existing Notes, Archive, and Trash lifecycle interactions without changing lifecycle semantics, persistence, or repository transactions.

The phase focuses on deterministic keyboard focus after lifecycle mutations remove controls from the document and on keeping destructive confirmation state truthful while permanent deletion is still in flight.

## Lifecycle focus continuity

Archive, unarchive, move-to-trash, and restore already mutate the correct persisted lifecycle fields. P27 adds an interaction contract around those existing mutations:

- before a lifecycle action removes one or more cards, the workspace identifies the nearest remaining mounted note;
- after the collection refreshes, focus moves to that remaining note's primary control;
- the next note is preferred for a single-card action, with the previous note used when there is no later card;
- bulk lifecycle actions return focus to the first remaining note after the selection toolbar and selected cards disappear;
- restoring the final Trash note and **Restore all** move focus to the resulting empty-state surface;
- the focus handoff does not alter note ordering, selected IDs, lifecycle timestamps, or undo snapshots.

This makes card removal a continuous keyboard workflow instead of leaving focus on `document.body` after the originating control unmounts.

## Permanent deletion confirmation

Single-note deletion, bulk deletion, and **Empty trash** keep the existing permanent-delete repository paths and confirmation copy while strengthening their transient UI state:

- the confirmation stays mounted until the delete transaction settles;
- the dialog exposes `aria-busy` while deletion is running;
- Cancel and Delete are disabled while busy;
- Escape and backdrop dismissal are ignored while busy;
- the destructive action changes to **Deleting…** while work is in progress;
- a failed deletion keeps the dialog open, announces an inline error, and permits retry;
- successful deletion closes only after the authoritative collection refresh;
- cancellation still restores focus to the opener through the shared modal focus contract;
- successful deletion moves focus to the nearest surviving note, or to the empty state when nothing remains.

A failed destructive request therefore never looks as though deletion has already completed, and the user does not need to reopen the confirmation just to retry the same action.

## Bulk and Trash parity

P27 applies the same interaction rules to:

- Archive selected notes;
- Move selected notes to Notes;
- Move selected notes to trash;
- Restore selected notes;
- Delete selected notes permanently;
- Restore all Trash notes;
- Empty trash.

Bulk selection still clears only after a successful lifecycle mutation. A failed permanent delete keeps the current selection and confirmation context intact.

## Permanent regression coverage

`e2e/p27-note-lifecycle-refinement.spec.ts` verifies:

- nearest-note focus after a single lifecycle removal;
- Trash restore focus continuity and final empty-state focus;
- permanent-delete busy locking and Escape protection;
- inline failure state followed by a successful retry;
- focus continuity after successful permanent deletion;
- bulk permanent-delete cancellation restoring the toolbar trigger;
- Empty Trash ending on the Trash empty-state surface.

Run the focused suite with:

```text
npm run e2e:p27
```

The complete release regression suite remains authoritative before merge.

## Preserved boundaries

P27 does **not** change:

- IndexedDB schema or version;
- `NoteRecord` format or lifecycle field meaning;
- archive, unarchive, trash, restore, or permanent-delete repository semantics;
- bulk transaction atomicity or undo snapshots;
- note ordering rules;
- revision/history behavior;
- search ranking, indexing, operators, or saved-search formats;
- reminders;
- sync, conflict, account, or operations protocols;
- backup/import/export formats;
- privacy behavior;
- service-worker or PWA architecture.

P27 is an interaction-quality phase over the existing authoritative lifecycle model.
