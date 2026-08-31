# Search System

P9 adds a local search engine over active and archived notes. Trash is intentionally excluded from search results; deleted notes remain discoverable only from Trash.

## Index contents

The search index is constructed locally from the existing database-v1 tables and requires no schema migration. Each search document includes:

- note title,
- note body,
- checklist item text,
- assigned label names and IDs,
- note type and color,
- active / pinned / archived state,
- updated timestamp,
- whether the note has an image attachment,
- whether title/body/checklist text contains a URL.

The index is loaded when search opens and subsequent keystrokes run against the in-memory documents. IndexedDB is reread after mutations that can change search results.

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

All free-text query terms must be present somewhere in the note search document. Matching title text receives the strongest ranking weight, followed by labels, checklist text, and body text. Equal scores fall back to pinned state and then latest update time.

## Query operators

P9 supports:

- `label:study`
- `label:"Bible Study"`
- `is:pinned`
- `is:active`
- `is:archived`
- `is:text`
- `is:checklist`
- `has:image`
- `has:link`
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

## Keyboard and navigation

Pressing `/` outside an editable control focuses the header search field. Escape inside a non-empty search field clears only the query text. The Reset control clears query, filters, and the open filter panel.

Navigating to Notes, a label, Archive, Trash, or Reminders exits search and restores the normal workspace context.

## Result behavior

Search spans active and archived notes and groups them separately when both are present. Search result cards remain editable and retain normal single-note lifecycle, color, and label controls.

P8 selection intentionally does not activate inside mixed-lifecycle search results. Bulk selection remains scoped to normal Notes, label, Archive, and Trash collections where one lifecycle mode applies to the entire selection.

## Performance

P9 keeps the matcher dependency-free. A 10,000-note Chromium regression builds the local index and then searches it for a unique term. The permanent gate requires:

- exactly 10,000 indexed notes,
- exact result correctness,
- in-memory matching under 100 ms,
- index construction under 3 seconds on the CI runner.

This phase does not add MiniSearch yet. The current normalized linear matcher is kept until measured performance demonstrates a real need for a heavier index.

## Phase boundary

P9 owns header search, local indexing, normalization, ranking, filters, operators, search-result rendering, and search performance regression coverage. P10 owns the command palette and broader keyboard command system.
