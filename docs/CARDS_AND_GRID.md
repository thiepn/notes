# Note Cards + Main Grid

P4 replaces the temporary P3 saved-note previews with the permanent Notes surface: reusable note cards, responsive Keep-style masonry, persistent list mode, pinned grouping, and a safe existing-note editor.

## Card contract

`NoteCard` is the shared rendering surface for saved notes.

- The whole card is an accessible button that opens the note.
- Cards render title, body preview, note color, and pinned state.
- Untitled notes derive their accessible label from the first meaningful body line.
- Empty existing notes remain representable instead of disappearing.
- Card body text is clamped for predictable browsing while the full content remains available in the editor.
- P5 adds lifecycle actions; P4 deliberately keeps the card interaction surface focused on opening/editing.

## Masonry layout

The grid uses ordinary CSS Grid with measured row spans instead of CSS columns or experimental native masonry.

Each masonry item observes its rendered content with `ResizeObserver`, measures the actual height, and computes the required `grid-row-end` span from the grid auto-row and gap values.

This provides variable-height Keep-style cards while preserving source order, keyboard order, and predictable responsive behavior.

Grid mode uses responsive `auto-fill` columns. At the minimum supported 320px viewport it falls back cleanly to one column without horizontal overflow.

## List mode

Users can switch between Grid and List from the Notes toolbar.

- Preference key: `notes.view-mode`
- Supported values: `grid` and `list`
- Invalid persisted values fall back to `grid`.
- List mode reuses the exact same `NoteCard` component and removes masonry row spanning.

The preference survives reloads without touching the note database because it is UI preference state rather than note data.

## Pinned grouping

Active notes are split into shallow Keep-style sections:

```text
PINNED
cards

OTHERS
cards
```

The `Others` label is shown only when a pinned section exists. If nothing is pinned, the board remains visually quiet and displays a single unlabeled note collection.

P4 displays existing persisted pin state; P5 adds the user-facing pin/unpin actions and the rest of the lifecycle controls.

## Existing-note editor

Opening a card displays a centered editor on desktop and a full-screen editor on mobile.

The editor keeps the P3 interaction contract:

- no Save button,
- optional title,
- auto-growing body,
- `Escape` closes,
- `Ctrl/Cmd+Enter` closes,
- clicking the desktop backdrop closes,
- closing waits for the latest durable write.

Body scrolling is locked behind the desktop dialog while it is open.

## Existing-note autosave

Existing-note changes use the P1 repository and the same 180ms serialized-write principle introduced in P3.

Writes are chained so a slow IndexedDB operation cannot allow a later edit to be overwritten by an older one. Every database update still uses the note's optimistic revision.

Unlike new-note capture, clearing an existing note to empty does not delete the note.

## Edit recovery journal

Existing-note edits have a separate synchronous write-ahead journal:

`notes.editor-draft.v1`

It is intentionally separate from the new-note capture journal (`notes.capture-draft.v1`).

Each edit synchronously records the note ID, title, and body before the normal IndexedDB debounce. Once the matching IndexedDB write completes and no newer text is pending, the journal is removed.

If the page reloads inside the debounce window, the Notes workspace reads the editor journal, reloads the referenced active note, reopens its editor, restores the exact text, and commits it through the normal repository path. A stale journal for a missing note is discarded.

## Colors

Cards and the editor use the P2 semantic note-color tokens. All supported note colors therefore work consistently in both light and dark themes without hard-coded component colors.

## Tests

Vitest covers:

- view-mode defaults and persistence,
- invalid view-mode fallback,
- editor-journal round-trip,
- malformed editor-journal rejection,
- editor-journal clearing.

Playwright covers:

- pinned and other section rendering,
- multi-column variable-height masonry at desktop width,
- persistent one-column list mode,
- existing-note editor opening,
- immediate-reload edit recovery inside the 180ms debounce window,
- exact IndexedDB content after recovered editing,
- 320px minimum-width overflow safety,
- all previous P1 database, P2 shell, and P3 capture regressions.

## Phase boundary

P4 owns browsing and editing saved text notes. P5 owns lifecycle interactions: pin/unpin controls, archive/unarchive, trash/restore, permanent deletion, duplication, and undo behavior.
