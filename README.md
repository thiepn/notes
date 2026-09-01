# Notes

A local-first, zero-friction notes PWA designed to match Google Keep's capture speed while improving privacy, portability, recovery, search, and desktop ergonomics.

**Production target:** `https://thiepn.dev/notes/`

## Status

**V2-1 — Reminders & Time-Based Notes is implemented as the first V2 feature release.** Notes now supports one local reminder per saved text note or checklist, reminder lifecycle/history, a dedicated Reminders workspace, `has:reminder` search, timezone-aware scheduling with DST-gap rejection, conservative Google Keep reminder migration, backup-format v2 preservation, and best-effort local browser notifications.

V1 through P15 remains the stable product foundation. V2-1 preserves the local-first/offline-first architecture: reminder data works without a backend, while closed-app scheduled push delivery is explicitly not promised by a static GitHub Pages PWA.

## V1 scope

V1 includes:

- Text notes and checklists
- Auto-save
- Pinning, colors, labels, archive, and trash
- Grid and list views
- Fast local search
- Image attachments
- Revision history
- Backup and restore
- Markdown and JSON export
- Google Keep Takeout import
- Offline-first PWA installation
- Responsive desktop, tablet, and mobile UX

V1 explicitly excludes cloud sync, accounts, collaboration, AI, OCR, voice notes, drawings, nested folders, databases, project management, and plugin systems.

## V2 scope

V2-1 adds:

- One reminder per saved text note or checklist
- Local date/time scheduling stored as an absolute UTC instant plus the scheduling IANA timezone
- Active, completed, dismissed, snoozed, and removed reminder states
- Overdue, Today, Upcoming, and Completed & dismissed reminder groups
- Reminder chips on note cards and live `has:reminder` search
- Archive preservation, Trash suppression/restoration, and transactional permanent-delete cleanup
- Backup format v2 with reminder round-trip and legacy-v1 restore compatibility
- Conservative Google Keep absolute-reminder import
- Optional best-effort browser notifications while Notes is open or returns to the foreground

V2-1 deliberately excludes recurring reminders, location reminders, accounts, server push, cloud scheduling, and reliable alerts while every Notes tab/PWA window is fully closed.

## Architecture

- React + TypeScript + Vite
- IndexedDB through Dexie
- Local-first data model
- Zod validation at data boundaries
- Repository-only write access for application features
- Optimistic per-note revision checks
- Transaction-safe multi-table operations
- Serialized text autosave with synchronous recovery journals
- Transactional checklist snapshot persistence with independent capture/editor recovery journals
- Normalized checklist item rows with stable IDs, ordering, check state, and parent relationships
- Native attachment repository over the existing IndexedDB attachment table with SHA-256 duplicate suppression
- Privacy-safe static-image re-encoding, 4096 px bounded processing, and animation-preserving GIF privacy-metadata stripping
- Picker, drag/drop, clipboard, and mobile-camera image capture shared by text and checklist notes
- Attachment-only capture preservation across close/reload recovery
- Lazy near-viewport attachment lookup with derived 720 px card thumbnails and masonry remeasurement
- Responsive attachment grids, local image lightbox, explicit removal confirmation, and imported-file downloads
- Bounded semantic per-note revision history with validated v1 snapshot payloads and 50-version pruning
- Transactional reversible history restore that preserves current lifecycle, labels, and attachments across text/checklist type changes
- Normalized one-reminder-per-note storage in the database-v2 `reminders` table with independent active/completed/dismissed lifecycle
- Absolute reminder timestamps plus recorded IANA scheduling timezone, including explicit DST-gap rejection
- Best-effort local notification coordination with due-time de-duplication and no false closed-app push guarantee
- Versioned eight-table full-library JSON backups taken from one consistent IndexedDB read transaction
- Base64 attachment preservation with independent SHA-256 backup integrity checks
- Read-only backup validation and recovery preview before any destructive database write
- Automatic current-device safety backup before full-library restore
- Atomic eight-table replacement recovery with IndexedDB rollback on write failure
- Direct local parsing of single- or multi-part Google Keep Takeout ZIP archives
- Read-only Keep import preview before database writes, with recoverable-note warnings instead of silent truncation
- Non-destructive eight-table Keep migration that never clears or replaces existing Notes data
- Normalized Keep-label merge, source lifecycle/timestamp preservation, and attachment SHA-256 ingestion
- Durable Google Keep source ledger for repeat-import suppression, preserved automatically by P12 backups
- Initial P11 `import` revision for every migrated Keep note and atomic rollback of the complete import on failure
- Accessible measured CSS Grid masonry with persistent list mode
- Existing-note editor with separate crash/reload recovery
- State-aware lifecycle actions with reversible Undo toasts
- Context-scoped card selection with modifier, range, explicit-control, and touch long-press entry
- Transactional bulk lifecycle/color/label mutations with field-scoped Undo snapshots
- Dependency-free in-memory search over a normalized IndexedDB-derived document index
- Accent-insensitive multilingual normalization with title/label/checklist/body relevance weighting
- Search filters and query operators for type, status, color, labels, dates, images, and links
- Searchable command palette with global navigation, creation, organization, view, appearance, backup/recovery, and Google Keep import commands
- Real DOM card focus for J/K navigation and native Enter activation
- Shortcut safety guards for editable controls, composers, and modal dialogs
- Database-backed Notes, Archive, Trash, and Backup destinations with persisted primary navigation
- Case-insensitive normalized labels backed by a many-to-many `noteLabels` relationship table
- Persistent color and label organization with label-filtered views and automatic label inheritance during capture
- Tokenized responsive design system with light/dark/system appearance
- Installable PWA manifest with 192 px, 512 px, maskable, Apple touch, and favicon assets
- Explicit prompt-based service-worker updates that never force-reload an active editing session
- Exact `/notes/` service-worker scope and navigation fallback for safe coexistence with other apps on the same domain
- Informational offline/offline-ready states without disabling local IndexedDB operations
- Production-only offline certification using `vite preview`, separate from dev-server browser tests
- Vitest for unit tests
- Playwright for real-browser IndexedDB, capture recovery, card/grid, lifecycle, organization, checklist, selection/bulk, search, revision-history/recovery, backup/disaster-recovery, Google Keep migration, image/attachment capture and viewing, command/keyboard, responsive-shell, end-to-end, and production PWA/offline certification
- GitHub Actions for CI and deployment
- GitHub Pages-compatible build rooted at `/notes/`

See [`docs/DATABASE.md`](docs/DATABASE.md) for database invariants, [`docs/DESIGN_SYSTEM.md`](docs/DESIGN_SYSTEM.md) for the shell and styling contract, [`docs/CAPTURE.md`](docs/CAPTURE.md) for new-note capture and recovery, [`docs/CARDS_AND_GRID.md`](docs/CARDS_AND_GRID.md) for the P4 card and editor architecture, [`docs/LIFECYCLE.md`](docs/LIFECYCLE.md) for lifecycle state, Undo, Archive, Trash, duplication, and permanent deletion behavior, [`docs/ORGANIZATION.md`](docs/ORGANIZATION.md) for P6 color, label, label-view, and organization behavior, [`docs/CHECKLISTS.md`](docs/CHECKLISTS.md) for P7 checklist storage, interaction, conversion, and recovery behavior, [`docs/SELECTION_AND_BULK.md`](docs/SELECTION_AND_BULK.md) for P8 selection scope, bulk toolbar behavior, transactional batch mutations, and Undo semantics, [`docs/SEARCH.md`](docs/SEARCH.md) for P9 indexing, normalization, ranking, filters, query operators, and performance behavior, [`docs/KEYBOARD.md`](docs/KEYBOARD.md) for P10 command palette, shortcut safety, and focused-card keyboard behavior, [`docs/HISTORY.md`](docs/HISTORY.md) for P11 checkpoint, restore, Undo, copy, pruning, payload-validation, and cross-type recovery semantics, [`docs/BACKUP.md`](docs/BACKUP.md) for P12 full-library backup format, validation, safety snapshot, atomic replacement, and disaster-recovery behavior, [`docs/GOOGLE_KEEP_IMPORT.md`](docs/GOOGLE_KEEP_IMPORT.md) for P13 Takeout parsing, mapping, preview, repeat-import protection, and atomic additive migration behavior, [`docs/IMAGES.md`](docs/IMAGES.md) for P14 native image capture, privacy processing, thumbnails, viewer behavior, imported attachment handling, and storage limits, [`docs/PWA_OFFLINE.md`](docs/PWA_OFFLINE.md) for P15 installability, service-worker update policy, production offline behavior, and certification requirements, and [`docs/REMINDERS.md`](docs/REMINDERS.md) for V2-1 reminder storage, scheduling, lifecycle, notification limits, backup/import integration, and regression requirements.

## Principles

1. Capture is one interaction away.
2. Auto-save is the default; there is no save button.
3. Organization is optional; search, labels, colors, pins, archive, and trash stay shallow.
4. Local data integrity is release-critical.
5. The app remains usable offline and independent of any backend.
6. Every user should be able to export their data in open formats.
7. Advanced features never make basic capture slower.

## Development

```bash
npm install
npm run dev
npm run typecheck
npm run lint
npm run test
npm run e2e
npm run build
npm run e2e:pwa
```

`npm run e2e` uses the development server for the ordinary browser regression suite. `npm run e2e:pwa` must run after `npm run build`; it uses the production preview server so the generated service worker and manifest are the same artifacts that ship.

## License

MIT
