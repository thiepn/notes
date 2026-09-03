# Current Product Contract

## Product statement

Notes is a local-first, zero-friction notes application for `thiepn.dev/notes/`. It aims to preserve Google Keep's capture speed while improving local ownership, recovery, portability, search, privacy controls, and desktop ergonomics.

## Core product

- Text notes and checklists with automatic saving
- Pinning, colors, labels, archive, trash, grid/list views, and bulk actions
- Fast local search with filters, operators, saved searches, attachment-name indexing, OCR text indexing, and typo tolerance
- Image/file attachments, voice recordings, drawings, and optional local OCR
- Note links/connections and revision history
- Reminders with optional best-effort browser notifications
- Full backup/restore plus Markdown/JSON export and Google Keep Takeout import
- Offline-first PWA behavior
- Responsive desktop, tablet, and mobile UX
- Device-local privacy controls and optional UI privacy lock

## Deliberate exclusions

- Cloud sync
- Accounts and server authentication
- Collaboration
- Server-side AI features
- Nested folders
- Notion-style databases
- Project-management systems
- Plugin systems
- Claims of encryption at rest or end-to-end encryption

## Product rules

1. Capture is always one interaction away.
2. Notes auto-save; normal editing has no save button.
3. Organization remains shallow and optional.
4. Search must make heavy organization unnecessary.
5. Local data integrity is a release blocker.
6. Core workflows must work without a network connection.
7. User data must remain exportable in open formats.
8. Advanced features may not increase core capture friction.
9. Local-only storage durability and backup health are product responsibilities, not implementation details.
10. Scale regressions in search, rendering, attachments, or backups must be treated as reliability defects.

## Release hierarchy

1. Capture quality
2. Data integrity and storage durability
3. Retrieval
4. Portability and recovery
5. Responsive/polished interaction
6. Performance at realistic library scale
7. Advanced features
