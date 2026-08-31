# Notes

A local-first, zero-friction notes PWA designed to match Google Keep's capture speed while improving privacy, portability, recovery, search, and desktop ergonomics.

**Production target:** `https://thiepn.dev/notes/`

## Status

**P2 — App Shell + Design System is complete.** The app now has a production-style responsive shell, desktop/medium/mobile navigation modes, a tokenized light/dark design system, system-theme persistence without flash, accessible shared controls, and permanent breakpoint regression coverage.

**Next phase:** P3 — Text Note Capture.

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
- Tokenized responsive design system with light/dark/system appearance
- Vite PWA / service-worker layer
- Vitest for unit tests
- Playwright for real-browser IndexedDB, responsive-shell, and end-to-end tests
- GitHub Actions for CI and deployment
- GitHub Pages-compatible build rooted at `/notes/`

See [`docs/DATABASE.md`](docs/DATABASE.md) for database invariants and [`docs/DESIGN_SYSTEM.md`](docs/DESIGN_SYSTEM.md) for the shell and styling contract.

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
