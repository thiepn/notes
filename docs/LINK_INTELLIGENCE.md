# Link Intelligence

V2-3 turns lightweight `[[WikiLinks]]` into navigable, inspectable relationships without adding a separate graph database or persistent edge table.

## Storage and derivation model

V2-3 requires **no database migration**.

Internal links remain ordinary text inside the existing text-note `content` field:

```text
Review [[Project Atlas]] before Friday.
```

Outgoing links, backlinks, title collisions, and unlinked mentions are derived from the current note library when an existing text note is edited. There is no second source of truth that can become stale after restore, import, revision recovery, or ordinary note edits.

This preserves compatibility with:

- text autosave and crash recovery,
- P11 revision history,
- P12 backup/restore,
- P13 Google Keep import,
- Markdown/JSON export,
- local search,
- the existing IndexedDB schema,
- offline/PWA operation.

## Title identity

A WikiLink targets a note title.

For resolution, titles are:

- Unicode-normalized with NFKC,
- trimmed,
- collapsed to single internal spaces,
- compared case-insensitively.

Accents remain meaningful. For example, `Cafe` and `Café` are not treated as the same title.

Only non-trashed notes participate in resolution. Active and archived notes can both be targets.

## Resolution states

Every WikiLink has one of three semantic states:

### Resolved

Exactly one non-trashed note has the normalized target title.

Resolved links can navigate directly to that note. If the target is archived, navigation moves to Archive before opening it.

### Missing

No non-trashed note has the target title.

The link remains visible but is not silently redirected or auto-created.

### Ambiguous

More than one non-trashed note has the normalized target title.

V2-3 never chooses one duplicate arbitrarily. Navigation and automatic mention linking remain disabled until the conflicting titles become unique.

## Authoring

Text-note editors expose a **Wiki link** formatting action. It wraps the current selection as:

```text
[[Selected title]]
```

With no selection, the editor inserts a `[[Note title]]` placeholder and selects the placeholder text for replacement.

WikiLink source remains directly editable because the V2-2 textarea/source model remains authoritative.

## Rendering

WikiLinks render as their visible note title rather than exposing raw `[[` and `]]` markers on cards or formatted previews.

In an existing-note formatted preview:

- resolved targets are interactive internal-note buttons,
- missing targets receive a missing state,
- ambiguous targets receive an ambiguity state.

Inside note cards, WikiLinks are non-interactive because the whole card is already a button. This avoids nested interactive controls while still rendering clean visible text.

No arbitrary HTML is executed.

## Connections panel

Existing text-note editors include a **Connections** section derived from the active + archived note library.

It can show:

- **Links from this note** — unique outgoing WikiLink targets and occurrence counts,
- **Backlinks** — other notes whose resolved WikiLinks point to the current note,
- **Unlinked mentions** — other text notes that mention the current note's unique title in plain text but do not already link that occurrence.

Backlinks require the current note to have a unique non-empty title.

Unlinked-mention discovery additionally ignores target titles shorter than three characters to avoid high-noise matches.

## Unlinked-mention safety

The mention scanner is Unicode-aware and uses word-like boundaries rather than raw substring replacement.

It never proposes or rewrites occurrences that are already inside:

- an existing `[[WikiLink]]`,
- a Markdown HTTP/HTTPS link,
- inline code,
- fenced code blocks.

When a source note contains multiple safe plain-text mentions of the same target title, one action converts all safe occurrences in that source note.

The source note is written through the normal Notes repository with optimistic revision checking. If the source changed concurrently, the action fails instead of overwriting newer content.

Successful auto-link changes are surfaced through the normal workspace `onSaved` path so the visible note card and editor library stay synchronized immediately.

## Navigation

V2-3 reuses the application's existing Notes and Archive navigation instead of adding a second router or hidden navigation state.

Opening a resolved internal link:

1. saves the current editor draft,
2. creates the normal close history checkpoint when possible,
3. closes the current editor,
4. navigates to Notes or Archive based on the target lifecycle,
5. opens the target through its existing note-card action.

Trashed notes are never opened through WikiLinks.

## Search

Visible WikiLink labels are included in formatting-neutral text indexing, so a note containing `[[Project Atlas]]` is searchable for `Project Atlas` without requiring the brackets.

`has:link` treats both external URL links and internal WikiLinks as links.

## Phase boundary

V2-3 intentionally excludes:

- graph visualization,
- block or section transclusion,
- `![[embed]]` behavior,
- checklist-item WikiLinks,
- aliases or `[[Target|Label]]` syntax,
- automatic target creation,
- automatic rename propagation,
- persistent edge/index tables,
- cloud link synchronization beyond the existing local data model.

Those capabilities can build on the V2-3 resolver later without weakening this phase's deterministic title-resolution contract.

## Regression requirements

A V2-3 release must prove that:

- WikiLink parsing ignores inline and fenced code,
- unique titles resolve deterministically,
- missing and duplicate targets remain explicit,
- backlinks are derived from current content,
- unlinked mentions exclude protected syntax ranges,
- one-click linking preserves protected ranges and updates every safe occurrence,
- text-note toolbar authoring creates valid WikiLink source,
- note cards render WikiLink labels without raw brackets,
- resolved preview links open their target note,
- missing and ambiguous preview links do not navigate,
- auto-link writes persist correctly in IndexedDB,
- workspace cards stay synchronized after auto-link writes,
- `has:link` includes internal links,
- the full existing Chromium suite remains green,
- production PWA/offline certification remains green.
