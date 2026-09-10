# P12 — Editor V2

P12 upgrades the existing text-note writing surface without replacing the note model, autosave pipeline, recovery journal, revision history, or sync architecture. The phase focuses on editing mechanics that reduce friction during normal writing.

## Goals

- make common block structures fast to create from the keyboard;
- keep users in the writing surface instead of forcing repeated toolbar trips;
- make Enter behave naturally inside lists and quotes;
- make selected-text URL pasting useful by default;
- give programmatic editor transformations predictable session undo/redo;
- preserve the existing plain-text/Markdown-compatible storage model and rendering behavior;
- keep all new interactions touch-safe and accessible.

## Editor V2 mechanics

### Slash commands

Typing `/` at the start of the current line opens a local insert menu. The command list can be filtered by typing and currently provides:

- Heading
- Bulleted list
- Numbered list
- Quote
- Code block
- Wiki link

Arrow Up/Down changes the active command. Enter or Tab applies it. Escape dismisses the insert menu without closing the parent composer or editor.

Slash commands are deterministic local text transformations. They do not call a network service and do not introduce a new document format.

### Empty-line block creation

Block commands now work when the caret is on an empty line. Previously, line transforms could leave an empty line unchanged, which made toolbar block actions appear unresponsive.

The new behavior inserts the relevant marker and leaves the caret ready for input:

- Heading: `## `
- Bulleted list: `- `
- Numbered list: `1. `
- Quote: `> `

### Smart Enter behavior

Enter continues the active lightweight block when the caret is at the end of a matching line:

- `- item` continues with `- `;
- `4. item` continues with `5. `;
- `> quote` continues with `> `.

Pressing Enter on an otherwise empty list or quote marker removes that marker, exiting the block cleanly instead of creating an endless chain of empty items.

Shift+Enter and modified Enter combinations keep their existing behavior and are not intercepted by this continuation path.

### Fenced code blocks

`Code block` is now a first-class editor command. It wraps selected content in triple-backtick fences, or inserts a fenced block with an editable `code` placeholder when no text is selected.

This uses the fenced-code representation that the existing `RichTextContent` renderer already understands, so no storage or rendering migration is required.

### Paste URL over selected text

When a single-line text selection is active and the clipboard contains an `http://` or `https://` URL, pasting creates a Markdown link:

`docs` + `https://example.com` → `[docs](https://example.com)`

Normal paste behavior remains unchanged when there is no selection, the selection spans multiple lines, or the clipboard text is not an HTTP(S) URL.

### Session undo and redo

Editor V2 adds bounded in-session history for editor changes that the browser's native textarea history cannot reliably represent, especially slash commands and toolbar text transformations.

- maximum history entries: 100;
- adjacent typing edits within 650 ms are grouped;
- programmatic transformations receive their own history entry;
- Ctrl/⌘+Z performs Undo;
- Ctrl/⌘+Shift+Z performs Redo;
- Ctrl+Y also performs Redo;
- touch-accessible Undo and Redo buttons are available in the editor controls;
- restoring an entry also restores its caret/selection range.

This session history is deliberately separate from durable **Note history**. Existing revisions remain the long-term recovery/audit mechanism; P12 session Undo/Redo only covers the currently mounted writing session.

### Additional keyboard formatting

Editor V2 retains the existing Bold, Italic, Link, preview, and formatting controls and adds keyboard paths for:

- Ctrl/⌘+Shift+X — strikethrough;
- Ctrl/⌘+Shift+7 — numbered list;
- Ctrl/⌘+Shift+8 — bulleted list.

The formatting surface also exposes the new fenced Code block action.

## Accessibility and touch behavior

The slash insert surface is exposed as an `Insert block` menu with menu items and keyboard navigation. Its open state is connected to the textarea with ARIA state/ownership attributes.

On mobile:

- compact editor controls retain at least 44 px touch targets;
- slash command rows are at least 44 px high;
- desktop-only `/ blocks` helper copy is hidden while the functionality remains available;
- the parent composer/editor remains open when the slash menu consumes Escape.

## Preserved architecture

P12 deliberately does **not** change:

- IndexedDB schema or migrations;
- note/checklist/reminder/attachment data models;
- `NotesRepository` persistence semantics;
- existing 180 ms editor autosave timing;
- the editor crash/recovery journal;
- revision creation or durable History format;
- Supabase schema, RLS, authentication, or sync protocol;
- conflict preservation behavior;
- backup/import/export formats;
- search indexing/ranking semantics;
- privacy lock or privacy preferences;
- PWA installation, offline caching, or share-target behavior.

## Regression coverage

P12 adds pure unit coverage for the text transformations and dedicated browser workflows covering:

1. slash-command heading creation and formatted preview;
2. bullet continuation and clean list exit;
3. URL paste over selected text;
4. undo/redo of a programmatic slash transformation;
5. fenced code block insertion/editing/preview;
6. mobile touch-target sizing for Editor V2 controls and slash commands.

The complete repository release gate remains authoritative. P12 may merge only after formatting, foundation checks, lint, TypeScript, unit tests, production build/performance budgets, browser compatibility, the full Chromium E2E suite, and PWA/offline certification all pass on the exact final branch head.
