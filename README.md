# Notes

A local-first, zero-friction notes PWA designed to match Google Keep's capture speed while improving privacy, portability, recovery, search, and desktop ergonomics.

**Production target:** `https://thiepn.dev/notes/`

## Status

**V2-5 — Voice is implemented as the fifth V2 feature release.** Notes now supports local microphone recording with pause/resume, review-before-save playback, attachment-backed persistence, inline audio playback, and voice-only note capture without requiring a backend or database migration.

V1 through P15 remains the stable product foundation, V2-1 adds reminders, V2-2 adds lightweight formatting, V2-3 adds note-to-note link intelligence, V2-4 adds drawing, and V2-5 adds local voice capture while preserving the same attachment, backup, lifecycle, and offline architecture.

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

## V2-1 scope

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

## V2-2 scope

V2-2 adds lightweight formatting to **text-note bodies** while keeping the existing plain-string storage model:

- Bold, italic, strikethrough, and inline code
- HTTP/HTTPS links
- Headings
- Bulleted and numbered lists
- Block quotes
- Fenced code-block rendering for compatible Markdown content
- Selection-aware formatting toolbar in new-note capture and existing-note editing
- Ctrl/Cmd+B, Ctrl/Cmd+I, and Ctrl/Cmd+K editor shortcuts
- Explicit Preview/Edit mode
- Safe formatted rendering on note cards without arbitrary HTML execution
- Formatting-stripped accessibility labels and search indexing
- Source-compatible persistence through autosave, recovery, revision history, backup/restore, Keep import, and exports

V2-2 requires **no database migration**. Formatting remains a constrained Markdown-compatible UTF-8 string in `NoteRecord.content`; Notes never stores arbitrary rich-text HTML or uses `dangerouslySetInnerHTML` for note content.

Checklist item text remains plain in V2-2. Tables, embedded media in the text stream, font-family/font-size controls, text highlighting/colors, nested block editors, collaboration, and a heavy rich-text editor framework are deliberately excluded.

## V2-3 scope

V2-3 adds note-to-note link intelligence while continuing to store WikiLinks as ordinary source text:

- `[[Note title]]` WikiLink authoring from the text-note formatting toolbar
- Unicode-normalized, whitespace-normalized, case-insensitive exact-title resolution
- Accent-sensitive title identity
- Resolved, missing, and ambiguous target states
- Direct navigation to active or archived resolved targets
- Derived outgoing-link summaries and backlinks
- Unlinked-mention discovery across active and archived text notes
- Unicode-aware whole-mention matching rather than unsafe substring replacement
- One-click conversion of all safe mentions in a source note
- Protection for existing WikiLinks, HTTP/HTTPS Markdown links, inline code, and fenced code blocks
- Duplicate-title safeguards that disable ambiguous navigation and auto-linking
- Clean card/preview rendering without exposing raw `[[` and `]]` markers
- `has:link` search support for both internal WikiLinks and external URL links
- Immediate workspace synchronization after auto-link writes

V2-3 requires **no database migration** and stores no persistent edge table. Outgoing links, backlinks, collisions, and unlinked mentions are derived from current note content and titles, so backup/restore, import, revisions, and plain-text portability remain authoritative automatically.

V2-3 deliberately excludes graph visualization, block/section transclusion, checklist-item WikiLinks, aliases, automatic target creation, and automatic rename propagation.

## V2-4 scope

V2-4 adds local drawing and sketch capture through the existing attachment architecture:

- Responsive 1200 × 800 drawing canvas
- Mouse, touch, and stylus input through Pointer Events
- Pen and eraser tools
- Five pen colors and three stroke widths
- Whole-stroke Undo and Redo
- Clear, Cancel, and explicit Save drawing actions
- Quick drawing capture from the collapsed new-note row
- Attachment-only drawing notes without blank-note clutter when a sketch is cancelled
- Drawing actions in expanded/new text notes, existing text notes, and checklist editors
- Opaque white-background PNG export
- Immediate attachment-panel and card-thumbnail refresh after save
- Modal isolation so Escape closes Drawing without closing its parent note/checklist editor
- Existing attachment limits, SHA-256 duplicate detection, privacy processing, lifecycle cleanup, backup/restore, and offline/PWA behavior

V2-4 requires **no database migration**. Saved drawings are normal `image/png` attachments, so the established attachment table remains the single persisted source of truth.

V2-4 deliberately excludes reopening saved PNGs as editable vector strokes, shape/text/layer tools, handwriting recognition, OCR, collaborative drawing, and cloud-specific drawing synchronization.

## V2-5 scope

V2-5 adds local voice recording through the same attachment architecture:

- In-browser microphone capture through `getUserMedia` and `MediaRecorder`
- Browser-capability-based WebM/Opus, Ogg/Opus, and MP4 recording-format negotiation
- Pause, Resume, Stop, and a 30-minute recording-session safety limit
- Review playback before persistence
- Record again, Cancel, and explicit Save recording actions
- Permission-denied, missing-microphone, busy-device, unsupported-browser, and insecure-context error states
- Quick voice-note capture from the collapsed new-note row
- Attachment-only voice notes with no phantom blank note when capture is cancelled or permission is denied
- Voice actions in expanded/new text notes, existing text notes, and checklist editors
- Dedicated inline voice rows with native playback, download, and remove controls
- Voice-recording counts on audio-only note cards
- 50 MB per-recording limit plus the existing 50-attachment and 250 MB per-note safety limits
- SHA-256 duplicate detection and Trash write protection
- Existing attachment lifecycle cleanup, backup/restore, and offline/PWA behavior

V2-5 requires **no database migration**. Saved recordings remain ordinary Blob attachments in the established `attachments` table; a separate repository handles audio validation so voice data never enters the image re-encoding pipeline.

V2-5 deliberately excludes speech-to-text/transcription, AI summarization, cloud speech processing, waveform editing, trimming/effects, recording-device selection UI, background recording after Notes closes, collaboration, and a separate voice database.

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
- Picker, drag/drop, clipboard, mobile-camera, drawing, and voice capture integrated with the note attachment model
- Attachment-only capture preservation across close/reload recovery
- Lazy near-viewport attachment lookup with derived 720 px card thumbnails and masonry remeasurement
- Responsive attachment grids, local image lightbox, inline local-audio playback, explicit removal confirmation, and attachment downloads
- Fixed-logical-coordinate 1200 × 800 drawing canvas scaled responsively for desktop and mobile
- Pointer Events drawing path shared by mouse, touch, and stylus input
- In-session stroke history with pen/eraser compositing, whole-stroke undo/redo, and PNG flattening on save
- Drawing persistence through ordinary attachment ingestion with no vector-source schema or parallel drawing database
- MediaRecorder/getUserMedia voice capture with explicit browser-format negotiation and local-only Blob persistence
- Separate voice-attachment validation over the shared attachment table, with no audio transcoding or voice-specific schema
- Review-before-save audio object URLs with lifecycle-safe revocation and inline native playback after persistence
- Bounded semantic per-note revision history with validated v1 snapshot payloads and 50-version pruning
- Transactional reversible history restore that preserves current lifecycle, labels, and attachments across text/checklist type changes
- Normalized one-reminder-per-note storage in the database-v2 `reminders` table with independent active/completed/dismissed lifecycle
- Absolute reminder timestamps plus recorded IANA scheduling timezone, including explicit DST-gap rejection
- Best-effort local notification coordination with due-time de-duplication and no false closed-app push guarantee
- Constrained Markdown-compatible rich-text source stored in the existing text-note `content` field without a schema migration
- Selection-aware native-textarea formatting that preserves the existing autosave, cursor, crash-recovery, and history model
- Safe rich-text parsing into React elements with no arbitrary HTML execution and non-interactive links inside button-based note cards
- Formatting-neutral search/accessibility text derived from visible rich-text content while preserving URLs for link detection
- Derived WikiLink relationship analysis with no persistent graph/edge table
- Deterministic unique-title link resolution with explicit missing/ambiguous states instead of arbitrary target selection
- Unicode-aware unlinked-mention scanning with syntax-protected ranges and optimistic repository writes
- Internal-link navigation that reuses the existing Notes/Archive workspace and card-opening behavior
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
- Shortcut safety guards for editable controls, composers, and modal dialogs, with editor-local rich-text chords handled before global commands
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
- Playwright for real-browser IndexedDB, capture recovery, card/grid, lifecycle, organization, checklist, selection/bulk, search, revision-history/recovery, backup/disaster-recovery, Google Keep migration, image/attachment capture and viewing, command/keyboard, rich-text editing/rendering/search, link intelligence/navigation/auto-linking, drawing/pointer/PNG/modal integration, voice/microphone/audio/persistence/permission integration, responsive-shell, end-to-end, and production PWA/offline certification
- GitHub Actions for CI and deployment
- GitHub Pages-compatible build rooted at `/notes/`

See [`docs/DATABASE.md`](docs/DATABASE.md) for database invariants, [`docs/DESIGN_SYSTEM.md`](docs/DESIGN_SYSTEM.md) for the shell and styling contract, [`docs/CAPTURE.md`](docs/CAPTURE.md) for new-note capture and recovery, [`docs/CARDS_AND_GRID.md`](docs/CARDS_AND_GRID.md) for the P4 card and editor architecture, [`docs/LIFECYCLE.md`](docs/LIFECYCLE.md) for lifecycle state, Undo, Archive, Trash, duplication, and permanent deletion behavior, [`docs/ORGANIZATION.md`](docs/ORGANIZATION.md) for P6 color, label, label-view, and organization behavior, [`docs/CHECKLISTS.md`](docs/CHECKLISTS.md) for P7 checklist storage, interaction, conversion, and recovery behavior, [`docs/SELECTION_AND_BULK.md`](docs/SELECTION_AND_BULK.md) for P8 selection scope, bulk toolbar behavior, transactional batch mutations, and Undo semantics, [`docs/SEARCH.md`](docs/SEARCH.md) for P9 indexing, normalization, ranking, filters, query operators, and performance behavior, [`docs/KEYBOARD.md`](docs/KEYBOARD.md) for P10 command palette, shortcut safety, and focused-card keyboard behavior, [`docs/HISTORY.md`](docs/HISTORY.md) for P11 checkpoint, restore, Undo, copy, pruning, payload-validation, and cross-type recovery semantics, [`docs/BACKUP.md`](docs/BACKUP.md) for P12 full-library backup format, validation, safety snapshot, atomic replacement, and disaster-recovery behavior, [`docs/GOOGLE_KEEP_IMPORT.md`](docs/GOOGLE_KEEP_IMPORT.md) for P13 Takeout parsing, mapping, preview, repeat-import protection, and atomic additive migration behavior, [`docs/IMAGES.md`](docs/IMAGES.md) for P14 native image capture, privacy processing, thumbnails, viewer behavior, imported attachment handling, and storage limits, [`docs/PWA_OFFLINE.md`](docs/PWA_OFFLINE.md) for P15 installability, service-worker update policy, production offline behavior, and certification requirements, [`docs/REMINDERS.md`](docs/REMINDERS.md) for V2-1 reminder storage, scheduling, lifecycle, notification limits, backup/import integration, and regression requirements, [`docs/RICH_TEXT.md`](docs/RICH_TEXT.md) for V2-2 source syntax, editor behavior, rendering safety, search compatibility, scope boundaries, and regression requirements, [`docs/LINK_INTELLIGENCE.md`](docs/LINK_INTELLIGENCE.md) for V2-3 title resolution, WikiLink navigation, backlinks, unlinked mentions, safe auto-linking, and regression requirements, [`docs/DRAWING.md`](docs/DRAWING.md) for V2-4 drawing input, canvas tools, PNG persistence, modal isolation, capture integration, and regression requirements, and [`docs/VOICE.md`](docs/VOICE.md) for V2-5 microphone capture, format negotiation, local persistence, playback, privacy boundaries, and regression requirements.

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
