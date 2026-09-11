# P13 — Search & Command System V2

P13 makes search and commands behave like one retrieval system while preserving the existing local-first architecture.

## Goals

- make `Ctrl/Cmd+K` useful for commands, note titles, saved searches, and arbitrary full-content queries
- improve command discovery without changing established shortcut behavior
- expose advanced search operators at the point of use instead of requiring documentation recall
- keep saved and recent searches discoverable while the user is typing
- preserve fast local worker-based search, existing ranking, persistence, privacy, sync, and offline behavior

## Command palette V2

The palette still opens with `Ctrl/Cmd+K` and keeps its existing keyboard model: Arrow Up/Down, Home/End, Enter, and Escape.

P13 adds deterministic relevance ranking across static actions, navigation, labels, saved searches, and quick-open note titles. Exact label matches and prefixes rank ahead of weaker metadata matches, while small typos in longer terms can still discover the intended command.

When a query does not map cleanly to an action, the palette exposes a `Search notes for …` result. This hands the query to the existing global search surface, so body text, checklist text, labels, attachment names, OCR text, active notes, and archived notes remain searchable from the same entry point.

Strong command matches remain first. For example, typing `archive` still prioritizes **Open Archive** rather than turning the query into a content search.

## Search assist

Focusing the header search now opens a search-assist surface rather than an empty-query-only history popover.

With an empty query it offers common local searches:

- `is:pinned`
- `has:reminder`
- `has:image`
- `is:checklist`

While typing supported operators it offers completions:

- `is:` → pinned, active, archived, text, checklist
- `has:` → reminder, image, link
- `label:` → matching labels from the local label catalog

Labels containing spaces are inserted with quotes, for example `label:"Project Alpha"`.

Saved and recent searches remain available while typing and are filtered by relevance. A search already present in Saved searches is suppressed from Recent searches to avoid duplicate suggestions.

## Keyboard behavior

From the search input:

- `/` focuses global search when no editor/dialog is consuming text input
- Arrow Down moves into the first visible search-assist item; if no assist item is available, it moves to the first result card
- Arrow Up/Down cycle through primary search-assist actions
- Escape clears an active query first; with no query it closes the assist surface before falling back to the existing filter/reset/blur behavior

Search-assist primary targets remain at least 44 px tall, with larger targets on narrow mobile layouts.

## Architecture boundaries

P13 does **not** change:

- IndexedDB schema
- note/checklist/attachment data models
- search index document format
- search worker protocol
- core `searchDocuments` weighting or fuzzy matching
- saved-search storage format
- recent-search storage format
- repository save semantics
- editor recovery or revision history
- Supabase/RLS or sync protocol
- conflict handling
- backup/import/export formats
- privacy-lock behavior
- PWA install/share/offline behavior

The new command ranking and search-assist generation are deterministic local helpers. No network search, cloud AI, embeddings, analytics, or external search provider is introduced.

## Acceptance coverage

P13 adds focused unit coverage for command ranking, typo tolerance, operator completion, label quoting, live history filtering, and saved/recent deduplication.

Dedicated browser coverage verifies:

- exact command priority is preserved
- arbitrary palette text reaches full-content search
- typo-tolerant command discovery
- keyboard traversal of operator suggestions
- quoted label completion
- saved searches remain discoverable while typing
- mobile search-assist targets satisfy touch sizing

The existing complete CI, cross-browser, Chromium regression, and PWA/offline gates remain the release requirement.
