# P15 — Connections & Local Intelligence V2

P15 deepens the existing Connections system without adding a graph database, embeddings, external AI, analytics, or another durable intelligence store.

## Product goal

Connections should answer a few practical questions while a note is open:

- What explicitly links to or from this note?
- What other notes are probably about the same thing?
- Is this note likely a duplicate?
- Where is this note mentioned without a WikiLink?
- Which existing labels are likely useful here?
- What recurring local topics surround this note?

The feature remains an optional editor surface under **More → Connections** so normal capture and editing stay uncluttered.

## Combined local signals

P10 related-note discovery used deterministic lexical overlap. P15 retains that baseline and combines it with existing library metadata:

1. **Text** — weighted title/body terms remain the primary signal.
2. **Labels** — shared existing label membership can strengthen relatedness.
3. **Resolved WikiLinks** — notes pointing to the same uniquely resolved targets receive a local-neighborhood boost.
4. **Explicit graph relationships** — outgoing links/backlinks continue to be derived separately and are excluded from the ordinary Related notes list so Connections does not repeat the same relationship twice.

No signal is persisted. The score is recomputed from the current active + archived library when Connections is opened or refreshed.

## Related notes

Related-note ranking remains deterministic and bounded.

P15 explanations prefer the clearest available evidence:

- shared label,
- shared resolved link target,
- shared lexical terms.

Trashed notes remain excluded. Explicitly linked/backlink notes remain in their dedicated groups rather than being repeated as ordinary related notes.

## Duplicate detection

P15 separates **Possible duplicates** from Related notes.

Duplicate classification no longer relies on only one combined similarity score. It considers:

- exact normalized title + content,
- identical substantial content,
- title similarity,
- body similarity,
- body containment.

A shared generic title by itself is not enough to classify two unrelated notes as duplicates.

The panel explains the classification with concise reasons such as:

- `Same title and content`
- `Same content`
- `Very similar title and content`

P15 does not automatically merge or delete duplicates.

## Backlink quality

Backlinks now include a short context snippet around the first resolved WikiLink and prioritize sources with more links before merely newer sources.

This preserves the existing deterministic title resolver and makes the Backlinks group useful without opening every source note.

## Unlinked mentions

The P15 mention scanner preserves all existing safety boundaries:

- existing WikiLinks are excluded,
- Markdown HTTP/HTTPS links are excluded,
- inline code is excluded,
- fenced code is excluded,
- ambiguous note titles suppress automatic mention linking.

Sources with more safe unlinked mentions are ranked ahead of sources with only one mention, then by recency.

One action still links every safe occurrence inside that source note through the normal optimistic-revision Notes repository path.

## Suggested labels

P15 only suggests **labels that already exist in the user's library**. It never invents or silently creates a label.

A label can become a suggestion when:

- its normalized name appears directly in the current note, or
- multiple sufficiently related notes use that label, or
- one strong group of related evidence crosses the deterministic support threshold.

Current labels are excluded from suggestions.

Selecting a suggestion:

1. saves the current note draft,
2. assigns the existing label through `LabelsRepository`,
3. updates the in-editor intelligence context,
4. triggers the existing library refresh path so cards, navigation counts, filters, and search do not remain stale.

Label membership remains the existing `noteLabels` relation. No new label metadata is introduced.

## Local topics

Local topics are transient summaries, not entities.

P15 looks across the current note and its strongest non-duplicate related notes and can surface:

- recurring existing labels,
- recurring shared lexical terms.

A topic requires support from more than one note. The topic chips create no setting rows, tags, collections, embeddings, or durable cluster records.

## Storage and privacy

P15 introduces no storage migration.

Unchanged durable sources of truth:

- `notes`
- `labels`
- `noteLabels`
- note content containing WikiLinks
- existing revision/history data

There are no calls to hosted AI, vector services, analytics, or network search. All ranking, suggestions, snippets, and topics are computed in-browser from local library data.

## Preserved boundaries

P15 does **not** add:

- a graph database or stored edge table,
- embeddings or semantic/vector search,
- external LLM calls,
- automatically created labels,
- automatic duplicate merging,
- graph visualization,
- clustering records or topic persistence,
- WikiLink aliases/transclusion,
- automatic rename propagation,
- changes to sync, backup, import/export, privacy-lock, or PWA contracts.

## Release requirements

P15 must prove that:

- old WikiLink parsing/resolution behavior remains deterministic,
- backlink snippets identify linking context,
- stronger backlink and mention evidence is ranked first,
- shared labels can strengthen related-note ranking,
- shared resolved link targets are exposed as relationship evidence,
- generic matching titles alone do not create false duplicate classifications,
- possible duplicates are separate from Related notes in the editor,
- existing labels can be suggested without creating new labels,
- applying a suggested label persists through the normal label repository and refreshes visible card state,
- local topics create no new persistent topic objects,
- formatting, lint, TypeScript, unit, production build/performance, cross-browser, full Chromium E2E, and PWA/offline certification all remain green.
