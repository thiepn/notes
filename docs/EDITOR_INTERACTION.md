# Editor Interaction Polish

V3.4 improves the feedback and ergonomics of existing-note editing without changing what Notes stores or how autosave works.

## Scope

Both text-note and checklist editors now expose a compact status line that reports:

- the current autosave state;
- the last successfully persisted update time;
- useful content metrics;
- the existing retry path when persistence fails.

The Close action also exposes the already-supported Ctrl/Cmd+Enter keyboard shortcut directly in the editor UI.

## Save-state contract

The status indicator is tied to the existing repository save chain rather than to elapsed time.

Possible states are:

- **Waiting to save…** — the editor contains a newer draft than the last successfully persisted snapshot;
- **Saving…** — the serialized repository write is running;
- **Saved** — the latest draft known to the editor has completed its persistence path;
- **Save failed** — persistence failed and the existing local recovery journal remains the fallback.

The indicator must never switch to **Saved** merely because the 180 ms debounce timer elapsed. A newer draft that arrives while an earlier write is in progress remains pending until that newer draft is persisted.

`lastSavedAt` advances only from the `updatedAt` value returned by the successful note/checklist persistence path. The displayed `Updated HH:mm` value is therefore descriptive UI state, not a second timestamp authority.

## Text-note metrics

Text-note metrics are derived from the same formatting-neutral plain-text conversion already used by rich-text accessibility/search behavior.

The editor displays:

- visible word count;
- visible character count.

Markdown-compatible formatting markers handled by the Notes rich-text parser are not counted as visible characters. Word matching is Unicode-aware and supports letters/numbers plus ordinary apostrophes inside words.

Metrics are transient UI calculations. They are never persisted to IndexedDB or backups.

## Checklist metrics

Checklist editors display:

- number of nonblank checklist items;
- number of completed nonblank items.

Blank placeholder rows do not inflate either count. Metrics derive directly from the in-memory checklist draft and do not create aggregate database fields.

## Keyboard close affordance

Text and checklist editors already support Ctrl/Cmd+Enter to save/finish editing. V3.4 makes that behavior discoverable by:

- exposing `aria-keyshortcuts="Control+Enter Meta+Enter"` on the Close action;
- adding a `Close and save (Ctrl/Cmd+Enter)` tooltip;
- showing a restrained `Ctrl/⌘ ↵` hint on larger screens.

The underlying keyboard handler is unchanged. Escape retains its existing semantics, including closing open editor menus first.

## Persistence boundary

V3.4 does **not** change:

- the 180 ms autosave delay;
- serialized save-chain ordering;
- optimistic revision checks;
- text-note `NoteRecord.content` storage;
- normalized checklist rows;
- recovery journal formats;
- revision-history checkpoints;
- attachment or reminder persistence;
- backup/restore formats;
- IndexedDB schema version;
- offline/PWA behavior.

No database migration is required.

## Recovery behavior

Recovery journals remain authoritative for unsaved editor state after a reload/crash. A recovered draft is fed through the same existing persistence path. The V3.4 status indicator settles to **Saved** only after that recovered draft has completed persistence successfully.

A status-display failure or metric-calculation issue must never prevent editing, saving, closing, or recovering a note.

## Testing

V3.4 adds unit coverage for:

- formatting-neutral text metrics;
- meaningful checklist metrics;
- save-state labeling.

Real-browser coverage certifies:

- saved-state rendering and last-saved timestamp;
- live text metrics;
- persistence-backed transition back to Saved;
- Ctrl/Cmd+Enter close behavior;
- checklist item/completion metrics;
- checklist autosave feedback;
- immediate-reload recovery continuing to settle through the existing save path.

The complete existing regression suite and production PWA/offline certification remain mandatory before release closeout.
