# Command Palette + Keyboard UX

P10 adds a desktop-first keyboard command layer without changing the underlying note persistence or lifecycle rules. Commands invoke the same existing UI actions used by mouse and touch so repository validation, optimistic revisions, Undo, and recovery remain authoritative.

## Command palette

Open the palette with `Ctrl+K` on Windows/Linux or `⌘K` on macOS, or use the command button in the header.

The palette supports:

- incremental command filtering,
- Arrow Up / Arrow Down navigation,
- Home / End,
- Enter to execute,
- Escape to close,
- grouped command categories,
- displayed shortcut hints.

Initial P10 commands include:

- New text note,
- New checklist,
- Search notes,
- Open Notes,
- Open Archive,
- Open Trash,
- Create or manage labels,
- Grid view,
- List view,
- Cycle appearance.

The Backup/Export command is intentionally not exposed yet because P12 owns the actual backup engine. P10 does not create a dead command that pretends export already exists.

## Global shortcuts

Outside editable controls and dialogs:

- `C` — new text note,
- `/` — focus global search,
- `J` — focus next visible note card,
- `K` — focus previous visible note card,
- `Enter` — open the focused card through native button activation,
- `P` — pin/unpin the focused active note,
- `E` — archive/unarchive the focused note,
- `#` — open labels for the focused note,
- `Delete` — move the focused active/archive note to Trash,
- `Ctrl/⌘+K` — command palette.

`J` and `K` wrap at the first/last visible card and work with normal collection cards as well as search result cards. Trash cards are read-only and are not part of open-card keyboard navigation.

## V2-2 editor-local formatting shortcuts

V2-2 intentionally reuses several familiar chords **inside a text-note body editor**:

- `Ctrl/⌘+B` — bold the selection,
- `Ctrl/⌘+I` — italicize the selection,
- `Ctrl/⌘+K` — insert/edit a Markdown-compatible link around the selection.

These are local editor commands, not global application commands. In particular, when focus is inside a text-note body, `Ctrl/⌘+K` belongs to rich-text link insertion and **must not open the command palette**. Outside editable surfaces, the same chord retains its P10 command-palette behavior.

## Safety suppression

Global single-key commands and the global palette action are suppressed while interaction belongs to:

- `<input>`,
- `<textarea>`,
- `<select>`,
- contenteditable elements,
- note/checklist composers,
- editor dialogs,
- label-manager dialogs,
- confirmation dialogs,
- the command palette itself.

V2-2 editor-local formatting chords are the explicit exception: they are handled by the rich-text editor itself after the global command layer has yielded to the editable control.

This prevents ordinary typing such as `p`, `e`, `c`, `j`, `k`, `#`, or `Delete` from invoking application commands while the user is editing text or operating a modal surface.

Search keeps its existing `/` shortcut but follows the same editable/dialog suppression boundary.

## Focused-card actions

Focused-card shortcuts intentionally trigger the card's existing action buttons rather than calling database repositories directly. That keeps keyboard behavior identical to pointer behavior, including lifecycle Undo, color/label UI, and any future policy added to those controls.

`#` opens the focused card's label picker and transfers focus into the picker so keyboard users can immediately change label membership.

Permanent deletion is not bound to a single-key shortcut. `Delete` only moves an active/archive note to Trash; irreversible deletion still requires the existing explicit confirmation flow from Trash.

## Navigation semantics

Card focus is real DOM focus, not an invisible internal cursor. This provides:

- native Enter activation,
- visible focus indication,
- screen-reader compatibility,
- predictable Tab interaction after J/K navigation,
- no duplicate keyboard-only selection state.

## Phase boundary

P10 owns the command palette and the global desktop keyboard command contract. V2-2 adds editor-local formatting chords without changing that global contract. P11 owns revision-history UI and recovery history; P12 owns backup/export, at which point its real export command can be registered in the palette.
