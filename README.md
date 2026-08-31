# Notes

A local-first, zero-friction notes PWA designed to match Google Keep's capture speed while improving privacy, portability, recovery, search, and desktop ergonomics.

**Production target:** `https://thiepn.dev/notes/`

## Status

**P6 — Colors + Labels is complete.** Notes now support persistent Keep-style colors, normalized case-insensitive labels, multi-label assignment, card label chips, sidebar label navigation, label-filtered active-note views, label CRUD, and automatic label inheritance for notes created inside a label view.

**Next phase:** P7 — Checklist Engine.

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
- Accessible measured CSS Grid masonry with persistent list mode
- Existing-note editor with separate crash/reload recovery
- State-aware lifecycle actions with reversible Undo toasts
- Database-backed Notes, Archive, and Trash collections with persisted primary navigation
- Case-insensitive normalized labels backed by a many-to-many `noteLabels` relationship table
- Persistent color and label organization with label-filtered views and automatic label inheritance during capture
- Tokenized responsive design system with light/dark/system appearance
- Vite PWA / service-worker layer
- Vitest for unit tests
- Playwright for real-browser IndexedDB, capture recovery, card/grid, lifecycle, organization, responsive-shell, and end-to-end tests
- GitHub Actions for CI and deployment
- GitHub Pages-compatible build rooted at `/notes/`

See [`docs/DATABASE.md`](docs/DATABASE.md) for database invariants, [`docs/DESIGN_SYSTEM.md`](docs/DESIGN_SYSTEM.md) for the shell and styling contract, [`docs/CAPTURE.md`](docs/CAPTURE.md) for new-note capture and recovery, [`docs/CARDS_AND_GRID.md`](docs/CARDS_AND_GRID.md) for the P4 card and editor architecture, [`docs/LIFECYCLE.md`](docs/LIFECYCLE.md) for lifecycle state, Undo, Archive, Trash, duplication, and permanent deletion behavior, and [`docs/ORGANIZATION.md`](docs/ORGANIZATION.md) for P6 color, label, label-view, and organization behavior.

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
