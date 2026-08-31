# Text Note Capture

P3 establishes the first complete user-facing note workflow: open the composer, type immediately, close without a save button, and recover the exact draft after reload or interruption.

## Capture contract

1. The collapsed composer is one click from typing.
2. Title is optional.
3. The body receives focus when the composer opens.
4. There is no save button; `Close`, clicking outside, `Escape`, or `Ctrl/Cmd+Enter` finishes capture.
5. Empty captures are discarded instead of creating blank notes.
6. Notes are written through the P1 `NotesRepository`; UI code never writes raw IndexedDB records.

## Autosave

Text changes are locally responsive and schedule an IndexedDB save after 180 ms of inactivity. Saves are serialized so rapid edits cannot race one another or apply stale note revisions out of order.

The repository's optimistic `revision` check remains active on every update.

## Write-ahead recovery journal

The IndexedDB database remains the durable source of truth, but a tiny synchronous `localStorage` journal (`notes.capture-draft.v1`) sits in front of the debounce window.

On every title/body change the journal records:

- current note ID when one exists,
- current title,
- current body,
- journal version and timestamp.

Once the corresponding IndexedDB write completes and no newer text is pending, the journal is cleared.

This solves the important debounce edge case:

```text
user types
→ synchronous recovery journal
→ 180 ms IndexedDB debounce
→ durable IndexedDB write
→ journal cleared
```

If the tab reloads or crashes before the database write finishes, the next mount restores the exact draft from the journal and commits it through the normal repository path. A stale journal that points at already-durable identical content does not create a duplicate note.

## Lifecycle behavior

- First meaningful draft: create one text note.
- Later edits: update the same note using its latest revision.
- Draft cleared to empty and then closed: remove the in-progress note if one had already been created.
- Save failure: keep the recovery journal and leave the composer open with a retry action.
- Page becomes hidden: request an immediate repository flush in addition to the synchronous journal.

## Current rendering

P3 shows persisted notes in a simple temporary linear preview beneath the composer. The note currently being captured is hidden from that preview so it is not displayed twice.

P4 replaces this temporary rendering with the permanent note-card, masonry/grid, list-view, and editor-opening system.

## Tests

Vitest covers recovery-journal parsing, round-tripping, clearing, and meaningful-draft rules.

Playwright covers:

- create → close → reload persistence,
- immediate reload inside the autosave debounce window,
- empty-capture discard,
- rapid typing followed by `Ctrl+Enter`,
- all existing P1 IndexedDB and P2 responsive-shell regressions.
