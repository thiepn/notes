# P5 — Search, Navigation Intelligence & Knowledge Linking

P5 turns the retrieval systems already present in Notes into one coherent navigation layer. It deliberately builds on the local search worker, saved-search repository, command palette, WikiLink resolver, backlinks, and unlinked-mention engine rather than introducing a second index, graph database, or routing model.

## Product goal

A note should be reachable by memory of its title, by a saved query, by a link from another note, or by ordinary full-text search without forcing the user to remember which surface owns that retrieval path.

P5 therefore treats search, navigation, and linking as complementary entry points:

- `/` remains the full local search path for content, metadata, labels, attachment filenames, committed OCR, reminders, lifecycle filters, and advanced query operators.
- `Ctrl/Cmd+K` becomes the fast navigation path for commands, labels, saved queries, and note titles.
- `[[WikiLinks]]`, backlinks, and unlinked mentions remain derived knowledge relationships inside note editing.
- Saved searches become **smart collections** conceptually: durable reusable query/filter snapshots that can be opened from the command palette as well as the search-history surface.

## Universal quick-open

The command palette loads active and archived note metadata only while the palette is open. Notes are not added to the empty palette wholesale. Once the user types a meaningful title query, P5 ranks and exposes at most 12 matching note-title targets.

Ranking is intentionally deterministic and lightweight:

1. exact normalized title,
2. title prefix,
3. title phrase containment,
4. per-word title-prefix matches,
5. broad all-term title containment,
6. active notes receive a small tie preference,
7. recency breaks equal relevance.

Navigation-intent words such as `open`, `find`, `note`, and `go to` are ignored by the title ranker so phrases like `open project atlas` behave as expected.

Normalization mirrors the useful parts of search normalization: Unicode decomposition, combining-mark removal, case folding, `ß` → `ss`, punctuation collapsing, and whitespace normalization. This keeps quick-open accent-insensitive without adding fuzzy matching to the command surface.

The command palette does **not** become a second full-text search engine. Body, checklist, label, OCR, attachment, and reminder retrieval remains owned by Search.

## Smart collections

P5 reuses the existing `search.saved.v1` setting records. No schema or settings migration is introduced.

Every saved query/filter snapshot is exposed in the command palette under **Smart collections**. Running one reuses the existing search-history apply path, so the exact stored query and all filters are restored by the same code that already handles saved-search clicks.

The existing search-history UI and its accessible labels remain compatible. P5 adds stable saved-search IDs to the apply controls so navigation can target a specific saved snapshot without duplicating query state.

Consequences:

- backup/restore behavior is unchanged,
- missing-label pruning is unchanged,
- saved-search limits and deduplication are unchanged,
- there is no second smart-collection store,
- command-palette navigation cannot drift from the saved search itself.

## Actionable missing WikiLinks

Previously, a missing `[[WikiLink]]` was visible but inert. P5 adds an explicit **Create note** action in Connections.

Creation is guarded:

1. save the current source note first,
2. reload active + archived notes,
3. resolve the target title again against fresh data,
4. create only when it is still genuinely missing,
5. refuse to create when the target has become resolved or ambiguous,
6. create one normal active text note using the WikiLink title,
7. reuse normal note navigation to open the created target.

The source WikiLink remains ordinary editable text. No edge row is persisted and no automatic rename propagation is introduced.

## Existing search remains authoritative

P5 does not replace or fork the search engine. The existing local search path continues to own:

- title and body text,
- checklist item text,
- labels,
- attachment filenames,
- committed OCR text,
- note type and color,
- active / pinned / archived state,
- `has:image`, `has:link`, and `has:reminder`,
- before/after date filters,
- saved-search snapshots,
- recent device-local search history,
- worker-side query execution and performance budgets.

Full search remains the right tool when the user remembers content or metadata rather than a note title.

## Persistence and privacy boundary

P5 requires no IndexedDB migration and no backend schema change.

- Notes remain authoritative in the existing notes table.
- WikiLinks remain text inside note content.
- Backlinks and missing-link states remain derived.
- Saved searches remain existing settings records.
- Quick-open candidates are transient in-memory palette state.
- No note title, query, link, or collection is sent to a new service.

## Phase boundaries

P5 deliberately excludes:

- semantic/vector/embedding search,
- AI query expansion,
- graph visualization,
- block transclusion,
- `[[Target|Alias]]` syntax,
- automatic WikiLink rename propagation,
- persistent relationship tables,
- a second durable search index,
- arbitrary folder hierarchies,
- cloud-only navigation state.

Those features can be evaluated later without weakening the deterministic local-first contracts established here.

## Release invariants

P5 is releasable only if:

1. `Ctrl/Cmd+K` can quick-open active and archived notes by title.
2. Quick-open never surfaces trashed notes and never renders thousands of note commands for an empty query.
3. Saved searches remain backward-compatible and can run as smart collections from the palette.
4. A missing WikiLink can create exactly one target note through an explicit user action.
5. Target creation re-resolves fresh library state before writing, preventing obvious duplicate-target races.
6. Existing resolved, missing, ambiguous, backlink, and unlinked-mention semantics remain intact.
7. Search remains local and preserves its existing worker/index/performance model.
8. P1–P4 behavior, the full Chromium suite, and PWA/offline certification remain green.
9. No IndexedDB migration, backend schema change, second search store, or graph store is introduced.
