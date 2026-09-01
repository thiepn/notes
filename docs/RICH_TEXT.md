# Rich Text

V2-2 adds lightweight formatting to text notes without changing Notes into a document editor or introducing opaque rich-text storage.

## Storage model

Text-note `content` remains a plain UTF-8 string in the existing `notes` table. Formatting uses a constrained Markdown-compatible source syntax inside that field.

V2-2 therefore requires **no database migration** and preserves compatibility with:

- existing V1 and V2-1 notes
- autosave and synchronous recovery journals
- P11 revision history and restore
- P12 backup/restore
- P13 Google Keep import
- local search
- Markdown/JSON export
- offline/PWA behavior

The application never stores arbitrary HTML for note content and never uses `dangerouslySetInnerHTML` to render rich text.

## Supported formatting

V2-2 supports:

- bold: `**text**`
- italic: `*text*`
- strikethrough: `~~text~~`
- inline code: `` `code` ``
- links: `[label](https://example.com)`
- headings: `## Heading` and rendered compatibility for `### Heading`
- bulleted lists: `- item`
- numbered lists: `1. item`
- block quotes: `> quote`
- fenced code-block rendering for compatible imported or manually typed Markdown

Toolbar actions operate on the current textarea selection. Bold, italic, and link also expose Ctrl/Cmd+B, Ctrl/Cmd+I, and Ctrl/Cmd+K shortcuts.

## Editing model

The source remains directly editable. A Preview/Edit toggle provides a formatted view without replacing the mature textarea autosave and recovery path with a contenteditable framework.

This is intentional:

- typing latency stays close to the original plain-text editor
- cursor and selection behavior remain native
- crash recovery continues to save one deterministic string
- revision history remains exact and portable
- source formatting remains inspectable outside Notes

## Rendering

Formatted content is parsed into React elements from the constrained syntax.

- No arbitrary HTML is executed.
- Normal preview links use `target="_blank"` with `rel="noreferrer"`.
- Card links render as non-interactive styled text because note cards themselves are buttons; this avoids invalid nested interactive controls.
- Accessibility labels derive from formatting-stripped plain text instead of raw Markdown markers.

## Search

Search indexes formatting-stripped text for text-note bodies. Users search for the visible words rather than Markdown punctuation.

Link detection still sees the URL preserved by the plain-text normalization layer, so `has:link` remains compatible with V2-2 links.

## Scope boundary

Rich text applies to **text-note bodies**. Checklist item text remains plain in V2-2 so the mature checklist editing, nesting, conversion, and Google Keep mapping contracts are not destabilized.

V2-2 deliberately excludes:

- arbitrary HTML
- tables
- embedded media inside the text stream
- font family or font size controls
- text colors/highlights
- nested document/block editors
- collaborative cursors or realtime editing
- a heavy third-party rich-text editor framework

Those features would add substantial complexity to a product whose primary interaction remains fast note capture.

## Regression gate

V2-2 must prove that:

- toolbar commands preserve selected text and cursor ranges
- block commands transform selected lines deterministically
- plain-text normalization strips formatting markers without losing meaningful content
- new-note capture can create formatted content
- existing notes can edit and preview formatted content
- autosave persists the exact source string
- note cards render formatting without raw markers
- rich-text words remain searchable
- keyboard shortcuts work without triggering note close
- the full existing Chromium and production offline/PWA suites remain green
