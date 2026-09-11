# P16 — Capture Everywhere

P16 makes capture faster from more sources while preserving the existing local-first note model.

## Goals

- keep blank text and checklist capture exactly as fast as before,
- add low-friction capture from clipboard text and web links,
- add a few useful built-in text-note templates without inventing a template database,
- refine PWA share-target handling for URL-only shares,
- preserve active-label context when capture starts from a label view,
- avoid putting private note content in URLs,
- keep all captured content in the existing Notes/Labels repositories.

## Capture sheet

The existing six primary actions remain unchanged:

- Text note
- Checklist
- Image
- Scan
- Drawing
- Voice

P16 adds a visually secondary **Quick start** row:

- **Clipboard** — reads plain clipboard text after an explicit user click. A URL-only clipboard payload becomes a bookmark capture; ordinary text remains ordinary note content.
- **Web link** — validates HTTP/HTTPS URLs, derives a compact hostname title, creates a normal text note, then opens the standard editor.
- **Template** — exposes three built-in structures: Meeting, Study, and Daily note.

The extra paths do not add another top-level navigation destination or another capture store.

## Prefilled capture contract

Clipboard, Web link, and Template captures create ordinary text notes through `NotesRepository`.

After creation:

1. the current active label is assigned through `LabelsRepository` when capture started inside a label-filtered Notes collection,
2. the normal library refresh path is dispatched,
3. the note opens in the existing editor,
4. the current label view is preserved when possible,
5. captures started from Search, Reminders, Archive, or another destination route back to Notes through the normal internal-note navigation path.

A label-assignment failure is treated as convenience-state failure rather than a reason to lose a successfully created note.

## Clipboard privacy

P16 does not monitor the clipboard.

Clipboard text is read only after the user explicitly presses **Clipboard**. If the browser blocks clipboard access, the capture sheet shows an error and no note is created.

Clipboard content is never added to the page URL, query string, fragment, local analytics, or an external service.

## URL/bookmark capture

Only `http:` and `https:` URLs are accepted.

For a URL such as:

```text
https://www.example.com/article
```

P16 creates:

```text
Title: example.com
Body:  https://www.example.com/article
```

The user can immediately edit both fields in the standard editor.

## Built-in templates

Templates are intentionally code-defined and small. They create normal text notes and do not introduce a new persisted template model.

### Meeting

- Agenda
- Notes
- Decisions
- Actions

### Study

- Key ideas
- Questions
- Review

### Daily note

- Today
- Highlights
- Next

Titles include the local calendar date so repeated captures do not all create the same generic title.

## PWA share target refinement

The existing POST share target and one-time Cache Storage handoff remain unchanged.

P16 only improves payload presentation: when an external application shares a URL without a title, Notes derives a hostname title locally. Shared content still never enters the URL.

## Preserved boundaries

P16 intentionally does not add:

- a new IndexedDB table,
- a new note type,
- user-defined persistent templates,
- clipboard background monitoring,
- URL metadata scraping,
- remote bookmark previews,
- automatic web requests,
- external AI,
- a second autosave model,
- a second navigation/router system.

Existing text/checklist autosave, sync, backup/import/export, revision history, privacy lock, search, and PWA/offline contracts remain authoritative.

## Release requirements

The release must prove:

- normal clipboard text creates a normal text note,
- URL-only clipboard text becomes a titled bookmark,
- invalid or non-HTTP(S) links are rejected,
- Web link capture opens the standard editor with the expected title/body,
- all built-in templates create editable text notes,
- prefilled captures inherit an active label and remain in that collection,
- URL-only PWA shares receive a useful hostname title,
- formatting, lint, TypeScript, unit, production build/performance, cross-browser, full Chromium E2E, and PWA/offline gates remain green.
