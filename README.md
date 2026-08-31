# Notes

A local-first, zero-friction notes PWA designed to match Google Keep's capture speed while improving privacy, portability, recovery, search, and desktop ergonomics.

**Production target:** `https://thiepn.dev/notes/`

## Status

**P13 — Google Keep Import is complete.** Notes now accepts Google Takeout ZIP files directly, including multi-part exports, builds a local read-only preview, maps Keep text/checklists/colors/labels/lifecycle/timestamps/attachments into the existing library, merges normalized labels, records an initial recovery revision and durable source ledger for each imported note, suppresses repeat imports, and commits the entire additive migration atomically without replacing local notes.

**Next phase:** P14 — Images.

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
- Bounded semantic per-note revision history with validated v1 snapshot payloads and 50-version pruning
- Transactional reversible history restore that preserves current lifecycle, labels, and attachments across text/checklist type changes
- Versioned seven-table full-library JSON backups taken from one consistent IndexedDB read transaction
- Base64 attachment preservation with independent SHA-256 backup integrity checks
- Read-only backup validation and recovery preview before any destructive database write
- Automatic current-device safety backup before full-library restore
- Atomic seven-table replacement recovery with IndexedDB rollback on write failure
- Direct local parsing of single- or multi-part Google Keep Takeout ZIP archives
- Read-only Keep import preview before database writes, with recoverable-note warnings instead of silent truncation
- Non-destructive seven-table Keep migration that never clears or replaces existing Notes data
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
- Vite PWA / service-worker layer
- Vitest for unit tests
- Playwright for real-browser IndexedDB, capture recovery, card/grid, lifecycle, organization, checklist, selection/bulk, search, revision-history/recovery, backup/disaster-recovery, Google Keep migration, command/keyboard, responsive-shell, and end-to-end tests
- GitHub Actions for CI and deployment
- GitHub Pages-compatible build rooted at `/notes/`

See [`docs/DATABASE.md`](docs/DATABASE.md) for database invariants, [`docs/DESIGN_SYSTEM.md`](docs/DESIGN_SYSTEM.md) for the shell and styling contract, [`docs/CAPTURE.md`](docs/CAPTURE.md) for new-note capture and recovery, [`docs/CARDS_AND_GRID.md`](docs/CARDS_AND_GRID.md) for the P4 card and editor architecture, [`docs/LIFECYCLE.md`](docs/LIFECYCLE.md) for lifecycle state, Undo, Archive, Trash, duplication, and permanent deletion behavior, [`docs/ORGANIZATION.md`](docs/ORGANIZATION.md) for P6 color, label, label-view, and organization behavior, [`docs/CHECKLISTS.md`](docs/CHECKLISTS.md) for P7 checklist storage, interaction, conversion, and recovery behavior, [`docs/SELECTION_AND_BULK.md`](docs/SELECTION_AND_BULK.md) for P8 selection scope, bulk toolbar behavior, transactional batch mutations, and Undo semantics, [`docs/SEARCH.md`](docs/SEARCH.md) for P9 indexing, normalization, ranking, filters, query operators, and performance behavior, [`docs/KEYBOARD.md`](docs/KEYBOARD.md) for P10 command palette, shortcut safety, and focused-card keyboard behavior, [`docs/HISTORY.md`](docs/HISTORY.md) for P11 checkpoint, restore, Undo, copy, pruning, payload-validation, and cross-type recovery semantics, [`docs/BACKUP.md`](docs/BACKUP.md) for P12 full-library backup format, validation, safety snapshot, atomic replacement, and disaster-recovery behavior, and [`docs/GOOGLE_KEEP_IMPORT.md`](docs/GOOGLE_KEEP_IMPORT.md) for P13 Takeout ZIP parsing, mapping, preview, repeat-import protection, and atomic additive migration behavior.

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
```

## License

MIT
