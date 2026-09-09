# Notes Architecture — P1 Foundation

## Runtime and hosting

Notes is a React/TypeScript static PWA rooted at `/notes/` and deployed to `https://thiepn.dev/notes/` through GitHub Pages. Core note work continues without a network connection after the application is cached.

## Source-of-truth boundaries

### Local working state

Dexie/IndexedDB is the immediate data source used by the UI. The current durable database is version 3 and contains eight tables: `notes`, `checklistItems`, `labels`, `noteLabels`, `attachments`, `reminders`, `revisions`, and `settings`.

P1 intentionally introduces **no database migration**. Existing IDs, records, blobs, settings, revisions, reminder rows, and sync metadata must reopen unchanged.

### Cloud synchronization

Supabase Auth, Postgres, and private Storage provide optional cross-device synchronization. Cloud state is a synchronized replica, not a prerequisite for editing. Sync code is loaded separately from the initial note-writing path and may not remount the application or replace an actively edited note.

### Recovery

- Capture/editor journals protect edits around autosave and reload boundaries.
- Revisions protect meaningful historical document states.
- Full-library backups protect the complete durable dataset independently of browser storage and cloud synchronization.

## Approved stack

React 19, TypeScript 6, Vite 8, Dexie 4/IndexedDB, Zod at import and remote-data boundaries, fflate for local ZIP processing, Lucide icons, Vite PWA/Workbox, Supabase HTTP APIs for optional authenticated sync, Vitest, Playwright, ESLint, and Prettier.

A new dependency requires a concrete product or reliability benefit. Avoid large UI/state frameworks merely to reorganize existing code.

## Feature boundaries

`src/app/` owns application composition and cross-feature contracts. `src/db/` owns durable local storage, validation, repositories, and migrations. Product capability lives under `src/features/<domain>/`; reusable interaction primitives live under `src/components/ui/`; theme and visual primitives live under `src/theme/` and `src/styles/`.

Cross-feature browser events are declared only in `src/app/events.ts`. Features do not create new global `notes-*` string literals ad hoc. This keeps refresh/sync/reminder/settings coupling discoverable and replaceable.

UI components prefer repositories/domain functions over direct IndexedDB table access. Derived counts, search indexes, and UI state are rebuildable; durable note content is not.

## Styling boundary

There is one global CSS entry point and one semantic token contract. Feature styles own their selectors. Later `polish`, `fix`, and `final` override layers are forbidden because they obscure ownership and create specificity regressions.

## Reliability invariants

1. Database migrations are explicit, versioned, and tested against existing data.
2. Import and full restore validate before mutation and use transactional writes.
3. Background cloud changes do not replace active drafts.
4. Failed or divergent sync records remain retryable rather than being acknowledged as synchronized.
5. Attachments remain blobs locally and private user-scoped objects in cloud storage.
6. Service-worker updates do not justify discarding in-progress work.
7. Derived-state failures may degrade convenience but do not block access to durable notes.
8. Backup files remain portable independently of the cloud account.

## Performance boundaries

Search scoring is worker-backed, large note collections mount progressively, OCR remains deferred from the initial path, and heavyweight surfaces are lazy-loaded. Existing JavaScript performance budgets remain release gates; P1 does not raise them to accommodate architecture cleanup.

## Release contract

A foundation change is complete only when formatting, the foundation contract, lint, TypeScript, unit tests, production build/performance, full Chromium regression, and PWA/offline certification pass on the exact merge candidate.

## P2 shell and responsive boundary

Responsive shell state is owned by `AppShell` and normalized through `src/app/shellLayout.ts`. The three supported modes are mobile (<=767px), tablet (768–1100px), and desktop (>=1101px). Only the desktop expanded/compact preference persists. Tablet expansion and the mobile drawer are transient UI state and may never leak into durable note data or cloud synchronization.

The sidebar remains a rendering boundary: it receives active destination, counts, responsive density, and action callbacks. It does not query viewport state or mutate navigation persistence itself. This keeps later editor routing and split-pane work independent from the shell's responsive mechanics.

## P3 organization model

Search, labels, Archive, and Trash share the lifecycle/collection contract in `src/features/organization/collectionModel.ts`. `AppShell` resolves Notes, a label projection, Archive, or Trash into that contract before rendering the notes workspace; Search reuses the same lifecycle classification and remains a derived Notes + Archive index that excludes Trash.

Label catalog refresh is also a cross-surface reconciliation point: stale label IDs are removed from current, saved, and recent searches, and an open Search workspace rebuilds label metadata after rename/delete. Search lifecycle and label mutations notify the shell's derived navigation counts just like mutations from the normal notes workspace.

P3 introduces no durable table, no database migration, no folder hierarchy, and no secondary search store. Whole-Trash Restore all and Empty trash use the existing bulk repository transactions; permanent deletion remains confirmation-gated.
