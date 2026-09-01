# Search System

P9 establishes a local search engine over active and archived notes. V2-7 / P27 extends that engine with bounded fuzzy matching, stronger field-aware relevance, attachment-filename and committed-OCR indexing, saved searches, and recent-search history without adding a server or parallel persistent note index.

Trash is intentionally excluded from search results; deleted notes remain discoverable only from Trash.

## Index contents

The search index is constructed locally from the existing IndexedDB tables and requires no schema migration. Each search document includes:

- note title,
- text-note body,
- checklist item text,
- assigned label names and IDs,
- attachment filenames for all attachment types,
- V2-6 reviewed OCR text that has been explicitly committed to `## Extracted text` sections,
- note type and color,
- active / pinned / archived state,
- updated timestamp,
- whether the note has an image attachment,
- whether title/body/checklist text contains an internal WikiLink or external URL,
- whether the note has an active reminder.

The index is loaded when search opens and subsequent keystrokes run against the in-memory documents. IndexedDB is reread after mutations that can change search results.

V2-7 does **not** persist a second search database or derived note index. Notes, checklist items, labels, attachments, reminders, and committed note text remain authoritative.

## Text normalization

Search text is normalized before matching:

1. Unicode NFKD normalization,
2. combining-mark removal for accent-insensitive matching,
3. NFC recomposition so scripts such as Hangul remain in normal composed form,
4. case folding,
5. `ß` → `ss`,
6. punctuation replaced with spaces,
7. repeated whitespace collapsed.

This means `uberblick` matches `Überblick` and `cafe` matches `café`, while scripts such as Korean and Japanese remain searchable as native letters.

Normalized field tokens are precomputed while the in-memory index is built so fuzzy matching does not repeatedly tokenize every note on each keystroke.

## Exact and fuzzy matching

Exact normalized matching remains the primary path. A query term first checks exact field equality, prefix matches, and substring matches.

V2-7 only attempts fuzzy matching when exact matching failed and the term is at least four characters long. Multi-word phrases are never fuzzed as one unit.

The fuzzy matcher is intentionally bounded:

- terms of 4–5 characters allow at most one edit,
- longer terms allow at most two edits,
- candidate tokens whose length differs by more than the allowed distance are skipped,
- candidates that share neither the query's first nor last character are skipped,
- bounded Levenshtein distance exits early when the active row can no longer meet the threshold.

This allows common mistakes such as `misionary` → `missionary` without turning short broad terms into unpredictable approximate searches. A short exact prefix such as `mis` can still match `missionary`; a short typo such as `mss` is not fuzzy-matched.

All free-text query terms must resolve somewhere in the same search document.

## Relevance scoring

V2-7 uses field-aware relevance rather than treating every occurrence as equivalent. The ranking order is intentionally strongest to weakest:

1. title,
2. labels,
3. attachment filenames,
4. committed OCR text,
5. checklist item text,
6. note body.

Within each field, exact matches score above prefixes, prefixes above substrings, and substrings above fuzzy matches. Full-query exact/prefix/substring title matches receive additional bonuses.

Equal scores fall back to pinned state and then latest update time.

This keeps a note titled `Missionary planning` ahead of a generic note that merely mentions `missionary` in its body while still making filename and OCR-derived text useful discovery surfaces.

## Attachment filenames

V2-7 indexes the filename of every attachment type, not only images. The attachment Blob itself is not parsed by the search engine.

For example, a note containing an attachment named `annual-budget-2026.pdf` can be found with `annual budget` even if those words do not appear in the note body.

Attachment filenames remain ordinary attachment metadata in IndexedDB; V2-7 creates no duplicate filename store.

## OCR text

V2-6 OCR results are transient until the user explicitly copies them or adds reviewed text to a text note. V2-7 preserves that privacy/persistence boundary.

Search gives dedicated OCR relevance weight to content inside committed `## Extracted text` sections. The extractor stops when it reaches the next Markdown heading at level 1 or 2.

Transient OCR results that the user did **not** add to a note are not silently persisted, cached, or indexed for search.

Because committed OCR remains normal `NoteRecord.content`, it also continues to participate in ordinary body search, revisions, backup/restore, and exports.

## Query operators

Search supports:

- `label:study`
- `label:"Bible Study"`
- `is:pinned`
- `is:active`
- `is:archived`
- `is:text`
- `is:checklist`
- `has:image`
- `has:link`
- `has:reminder`
- `before:YYYY-MM-DD`
- `after:YYYY-MM-DD`

Date operators and date filters use `updatedAt`. `before:` is exclusive at local midnight; `after:` is inclusive at local midnight.

Unknown operators remain ordinary search text. Invalid before/after dates produce a visible query warning instead of throwing.

## Filter panel

The header filter button opens filters for:

- type: Any / Text / Checklist,
- status: Active + archived / Active / Pinned / Archived,
- one or more note colors,
- one or more labels,
- after-updated date,
- before-updated date.

Multiple selected colors are OR conditions. Multiple selected labels are AND conditions: a result must carry every selected label. UI filters intersect with query operators rather than replacing them.

Search can run with filters and no free-text query.

## Saved searches

V2-7 can save the current search from the header. A saved search captures:

- query string,
- type filter,
- status filter,
- selected colors,
- selected label IDs,
- after date,
- before date.

Saved searches are stored in the existing IndexedDB `settings` table under the versioned key `search.saved.v1`.

Consequences:

- no database migration is required,
- full-library backup/restore already preserves saved searches because `settings` is an existing backup table,
- no additional lifecycle or deletion cascade is required,
- saved searches do not duplicate note/index data.

The list is capped at 20. Canonically identical snapshots are deduplicated; color and label selection order does not make two searches distinct.

Focusing an empty search field shows saved searches. Selecting one restores both its query and filter snapshot. Saved searches can be removed independently without affecting notes.

## Recent searches

Recent searches are intentionally lighter-weight than saved searches.

They are:

- device-local,
- stored in `localStorage` under `notes.search.recent.v1`,
- capped at eight entries,
- deduplicated by the same query/filter signature used for saved searches,
- recorded after a short debounce rather than every keystroke,
- clearable as a group.

Recent searches are **not** part of library backup/restore. They are disposable UI history, not user-authored library data.

Focusing an empty search field shows recent searches beneath saved searches when either exists.

## Keyboard and navigation

Pressing `/` outside an editable control focuses the header search field. Escape inside a non-empty search field clears only the query text. The Reset control clears query, filters, and the open filter panel.

Navigating to Notes, a label, Archive, Trash, or Reminders exits search and restores the normal workspace context.

## Result behavior

Search spans active and archived notes and groups them separately when both are present. Search result cards remain editable and retain normal single-note lifecycle, color, and label controls.

P8 selection intentionally does not activate inside mixed-lifecycle search results. Bulk selection remains scoped to normal Notes, label, Archive, and Trash collections where one lifecycle mode applies to the entire selection.

## Performance

The search engine remains dependency-free and uses a normalized linear in-memory scan. V2-7 deliberately avoids adding MiniSearch, embeddings, a worker-side persistent index, or server search while measured local performance remains within the existing budget.

A 10,000-note Chromium regression builds the local index and then searches it for a unique multi-term query. The permanent gate requires:

- exactly 10,000 indexed notes,
- exact result correctness,
- in-memory matching under 100 ms,
- index construction under 3 seconds on the CI runner.

The fuzzy path is bounded and candidate-pruned specifically so adding typo tolerance does not invalidate this performance contract.

## Privacy and phase boundary

Search remains fully local. V2-7 sends no note text, OCR text, filename, query, saved-search snapshot, or recent-search history to a server.

V2-7 owns:

- fuzzy matching,
- field-aware relevance scoring,
- attachment-filename indexing,
- committed-OCR indexing/scoring,
- saved searches,
- recent searches,
- advanced-search regression and performance coverage.

V2-7 deliberately excludes:

- cloud or hosted search,
- semantic/vector/embedding search,
- AI query expansion,
- silently persisting transient OCR output,
- parsing PDF/Office attachment contents for search,
- a parallel durable search-index database,
- collaborative/shared saved searches.

P10 continues to own the command palette and broader keyboard command system.
