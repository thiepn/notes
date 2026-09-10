# P10 — Final Product Polish, Local Intelligence & Release Hardening

P10 closes the P1–P10 overhaul with changes that improve everyday entry, knowledge retrieval, install behavior, and release confidence without weakening the local-first model established by the earlier phases.

## Product outcomes

### First-run usability

- Empty libraries receive a small, dismissible quick-start card instead of a blocking tutorial.
- The coach points directly to the primary action: create the first note.
- It also exposes the two highest-value keyboard entry points: `/` for search and `Ctrl/⌘ K` for commands.
- The coach does not appear when a library already contains notes and does not compete with an already-open editor or dialog.

### Launch and deep-link contract

Notes accepts the following launch intents at `/notes/`:

| Intent            | URL contract                                                |
| ----------------- | ----------------------------------------------------------- |
| New text note     | `?capture=text`                                             |
| New checklist     | `?capture=checklist`                                        |
| Search            | `?view=search`                                              |
| Search with query | `?view=search&q=<query>` or `?q=<query>`                    |
| Open note         | `?note=<uuid>`                                              |
| Open label        | `?label=<uuid>`                                             |
| Open workspace    | `?view=notes`, `reminders`, `archive`, `trash`, or `backup` |

Launch parameters are treated as commands, not permanent application state. After a launch intent has been handled, Notes removes the consumed parameters from the address bar while preserving unrelated URL state.

Note and label identifiers are validated as UUIDs before they can affect navigation. Shared/search text is bounded before use.

### Installed-app shortcuts

The web app manifest exposes shortcuts for:

- New note
- New checklist
- Search notes

These reuse the same launch-intent contract as normal deep links rather than creating a parallel navigation system.

### Private PWA share target

Installed Notes can receive text, title, and URL shares using a `POST` web share target.

The handoff deliberately avoids putting shared note content in the URL:

1. the service worker receives the share,
2. it stores the payload in a small device-local Cache Storage handoff under a random UUID,
3. the browser is redirected with only `#share=<uuid>`,
4. the application validates the token and reads the payload directly from the local cache,
5. the note is created through the existing `NotesRepository`, and
6. the one-time cached payload and launch token are removed after successful consumption.

At most a small number of pending share payloads are retained. Failed note writes leave the active token available for a reload retry rather than silently discarding the share.

### Local related-note intelligence

The existing Connections panel now also surfaces related notes that are not already explicit outgoing links or backlinks.

The ranking is deterministic and entirely local. It uses normalized Unicode terms, title weighting, weighted overlap, containment, and duplicate thresholds. It supports non-Latin note text and marks exact or very high-overlap matches as possible duplicates.

This is intentionally lightweight retrieval intelligence rather than a cloud semantic service. It introduces no external requests, embeddings, tracking, or model dependency.

## Simplification decisions

P10 does **not** add another settings hierarchy, another search surface, or another knowledge sidebar. It reuses existing systems:

- Connections for local intelligence
- AppShell search and capture for launch intents
- NotesRepository for imported shares
- the existing PWA install/update surface
- the existing privacy, sync, backup, and recovery controls

No IndexedDB schema, backup schema, cloud sync protocol, Supabase schema, or RLS policy is changed by P10.

## Explicitly deferred

Cloud LLM features such as “Ask Notes”, remote embeddings, automatic summarization, or model-generated labels are not part of this release. They would require a separate provider/consent boundary, clear disclosure of what note content leaves the device, failure and cost controls, and a privacy design consistent with the local-first product promise.

P10 also does not claim end-to-end encryption beyond the protections already documented by the existing privacy and sync architecture.

## P10 automated acceptance coverage

Unit coverage includes:

- launch-intent validation
- one-time share-token parsing
- shared-payload sanitization
- related-note ranking
- duplicate recognition
- multilingual token handling

Chromium end-to-end coverage includes:

- direct text-capture launch
- search deep links with query propagation
- direct note deep links
- empty-library onboarding
- related-note discovery inside the editor

Production PWA coverage includes:

- manifest shortcuts
- POST share-target metadata
- installed-service-worker share reception
- local share payload creation
- automatic editor opening
- one-time share-payload deletion

## Release gate

The local static gate is:

```sh
npm run release:check
```

It covers formatting, foundation-contract validation, linting, unit tests, TypeScript, production build, OCR asset preparation, and the bundle performance budget.

The browser gates remain explicit because they use separate Playwright environments:

```sh
npm run e2e
npm run e2e:compat
npm run e2e:pwa
```

A P10 release is acceptable only when all four commands are green on the P10 head, including the P1–P9 regression suites.

## Production smoke contract

After deployment, verify at minimum:

1. `/notes/` loads without a runtime recovery boundary.
2. Creating, editing, reloading, searching, archiving, and restoring a note still work.
3. `?capture=text`, `?capture=checklist`, `?view=search`, and `?note=<uuid>` resolve correctly.
4. The installed PWA launches offline after one controlled online load.
5. A supported OS share into Notes creates exactly one note and leaves no pending share payload after success.
6. Service-worker update UI remains opt-in and does not force a destructive reload while editing.
7. Existing backups, imported libraries, privacy lock state, and sync state remain readable.

## Release boundary

P10 is an additive, schema-neutral closeout phase. The release should be blocked by regressions in data integrity, backup/restore, privacy lock, sync conflict preservation, offline startup, cross-browser compatibility, or the established performance budget even if the new P10 features themselves pass.
