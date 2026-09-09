# Notes Product Contract — P1 Foundation

## Product statement

Notes is a private, local-first personal notebook at `thiepn.dev/notes/`. It is designed to make capture immediate, writing calm, retrieval fast, and recovery trustworthy. IndexedDB remains the immediate working store; optional authenticated Supabase sync keeps the same library available across devices without making the network a prerequisite for normal note work.

## Permanent product rules

1. **Notes are the primary object.** The product does not revolve around dashboards, projects, databases, or configuration.
2. **Capture is one interaction away.** Advanced capability may never add friction to creating a normal note or checklist.
3. **Organization is shallow and optional.** Labels, pinning, archive, saved searches, and links help when useful; users are not required to maintain a taxonomy.
4. **Retrieval beats filing.** Search, saved queries, links, and recent context should make manual browsing unnecessary for large libraries.
5. **Local-first is a behavior, not a slogan.** Creating, reading, editing, searching, attachments, reminders, history, backup, and recovery remain useful without network access after the PWA is cached.
6. **Background work may not interrupt writing.** Sync, indexing, notifications, lazy loading, and service-worker updates preserve an active editor and its draft.
7. **No silent data loss.** Import, restore, migration, sync reconciliation, and destructive operations use recoverable semantics.
8. **Portability is mandatory.** User data remains exportable through human-readable formats and a complete restorable backup.
9. **Advanced features are progressively disclosed.** The default workspace remains a notebook, not an admin surface.
10. **Reliability and performance are release gates.** A visually polished build that regresses storage, offline behavior, large-library performance, or accessibility does not ship.

## Current product surface

- Text notes, rich text, checklists, nesting, pinning, colors, labels, archive, trash, grid/list views, selection, and bulk actions.
- Fast local search with operators, filters, saved/recent searches, attachment-name indexing, OCR indexing, and typo tolerance.
- Wiki-style links, related-note navigation, revisions, reminders, image/file attachments, drawings, voice recordings, and local OCR.
- Google Keep import, full-library backup/restore, Markdown/JSON export, privacy controls, and an offline PWA.
- Email/password account management and **optional private cloud synchronization** through Supabase, while local data remains independently usable.

## Deliberate exclusions for this foundation

- Multi-user collaboration or shared notebooks.
- Notion-style databases or project-management systems.
- Nested folder hierarchies as a required organizational model.
- A plugin marketplace.
- Built-in generative AI or semantic/vector search in the core product.
- Claims of end-to-end encryption; the current privacy lock is a UI/privacy control, not encrypted local storage.
- CRDT-style simultaneous editing. Current sync is conservative record reconciliation and must preserve conflicts rather than pretending to be collaborative editing.

## Source-of-truth model

- **IndexedDB:** immediate local working state and the source used by the UI.
- **Supabase:** optional authenticated synchronized replica for cross-device availability.
- **Revision/capture journals:** short- and medium-term recovery for document edits.
- **Full backup:** independent disaster-recovery boundary.

No one layer is allowed to silently erase another merely because it is newer or remote.

## Release hierarchy

1. Data integrity and draft safety.
2. Capture and writing quality.
3. Retrieval and navigation.
4. Sync correctness and recovery.
5. Portability and backup.
6. Responsive and accessible interaction.
7. Performance at realistic library scale.
8. Advanced features.
