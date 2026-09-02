# Notes

A local-first, zero-friction notes PWA designed to match Google Keep's capture speed while improving privacy, portability, recovery, search, and desktop ergonomics.

**Production target:** `https://thiepn.dev/notes/`

## Status

**V3.7 — Backup & Recovery UX Polish is implemented as the seventh V3 refinement release.** The existing validated full-library backup and atomic replace-restore system now exposes current-library readiness, device-local manual-backup recency, backup version/freshness, and current-vs-incoming recovery comparison without changing the backup format or database schema.

V1 through P15 remains the stable product foundation and V2-1 through V2-8 complete the feature roadmap through Privacy Enhancements. The V3 refinement track preserves that architecture while improving daily use: V3.1 polishes capture and mobile UX, V3.2 retrieval and search, V3.3 organization and navigation, V3.4 existing-note editing feedback and ergonomics, V3.5 reminder/time interaction quality, V3.6 attachment/media interaction clarity, and V3.7 backup/recovery confidence.

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
- Overdue, Today, Tomorrow, Next 7 days, Later, and Completed & dismissed reminder groups
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

## V2-6 scope

V2-6 adds local OCR for existing image attachments without creating a second persistence model:

- On-device OCR through Tesseract.js
- English, German, and French recognition packs bundled with Notes
- Local worker, WebAssembly core, and trained-language assets served from `/notes/ocr/`
- Dynamic OCR-engine loading only when recognition is requested
- PWA precaching of OCR runtime assets for offline recognition
- Recognition progress, Cancel, Run again, and language switching
- Confidence display when available
- Editable extracted-text review before any note mutation
- Copy extracted text without changing the note
- Text-note **Add to note** action that appends a deterministic `## Extracted text` section
- Checklist OCR exposed as copy-only rather than guessing checklist structure
- Conservative line-ending, trailing-whitespace, blank-line, and outer-whitespace normalization
- Nested modal focus and Escape isolation
- Real-browser OCR regression coverage against a generated image
- Production offline certification for the OCR worker, WASM core, and all three language packs

V2-6 requires **no database migration**. OCR results are transient unless the user copies them or explicitly appends reviewed output to a text note. Appended text becomes ordinary `NoteRecord.content`, so the existing autosave, recovery, revision history, search, backup/restore, export, and offline models remain authoritative.

V2-6 deliberately excludes cloud OCR, PDF OCR, handwriting recognition, automatic OCR during attachment import, bulk/background OCR, document-layout reconstruction, bounding-box overlays, table/form reconstruction, and AI correction, summarization, translation, or classification.

## V2-7 scope

V2-7 upgrades the existing local search engine without introducing a server or a second note index:

- Bounded fuzzy matching for plausible spelling mistakes
- Exact prefix/substring matching remains the fast path and short terms are not fuzzed
- Stronger relevance scoring across title, labels, attachment filenames, committed OCR, checklist text, and body text
- Search across attachment filenames for every attachment type
- Dedicated recognition of reviewed V2-6 `## Extracted text` sections
- No silent persistence of transient OCR results merely for search
- Saved searches containing query plus type/status/color/label/date filters
- Saved searches stored in the existing backed-up `settings` table
- Up to 20 canonicalized, deduplicated saved searches
- Device-local recent search history capped at eight entries
- Empty-search picker for saved and recent searches
- Header action to save the current query/filter snapshot
- Existing query operators, archive visibility, Trash exclusion, and filters preserved
- Existing 10,000-note performance certification preserved: <100 ms matching and <3 s index build on CI

V2-7 requires **no database migration**. Saved searches use the existing settings table; recent searches are disposable `localStorage` UI history. The note/checklist/label/attachment/reminder tables remain authoritative and the searchable document index remains derived in memory.

V2-7 deliberately excludes cloud search, semantic/vector/embedding search, AI query expansion, PDF/Office content extraction, a parallel durable search-index database, silently indexing transient OCR, and collaborative/shared saved searches.

## V2-8 scope

V2-8 adds device-local privacy controls for reducing accidental exposure without representing a UI lock as encryption:

- Optional privacy lock with manual **Lock now** action
- Salted PBKDF2-SHA-256 passcode verification with no plaintext passcode storage
- Conservative locked-on-reload behavior whenever a local credential exists
- Auto-lock after Notes is hidden: immediately, 1, 5, 15, or 30 minutes, or never
- Hide-note-previews mode that suppresses card titles, bodies, checklist text, labels, reminders, and attachment previews
- Privacy-safe card accessibility labels that do not expose hidden title/body text
- Generic reminder notification copy by default and always while Notes is locked
- Explicit recent-search-history cleanup without deleting backed-up saved searches
- Device-local privacy preferences and credential kept outside portable Notes backups
- Cross-tab credential-state coordination through browser storage events
- Full offline operation with no privacy server or account dependency

V2-8 requires **no database migration**. Notes, checklist rows, attachments, reminders, revisions, saved searches, and backups remain unchanged and authoritative in the established IndexedDB model. Privacy preferences and the local credential belong to the current browser profile rather than the portable library.

V2-8 deliberately does **not** claim encryption at rest. It excludes encrypted note blobs/backups, end-to-end encryption, biometrics/WebAuthn, per-note passwords, remote wipe, cloud authentication, and protection against someone who controls the local browser profile or developer tools.

## V3.3 scope

V3.3 improves navigation around the existing Notes, Reminders, Archive, Trash, and label model:

- Live sidebar counts for active Notes, active visible Reminders, Archive, and Trash
- Active-note counts beside every label
- Count-aware workspace headings for collections and label views
- Case-insensitive **Find labels** filtering when the expanded sidebar has six or more labels
- Temporary label filtering that clears after navigation rather than becoming hidden persistent state
- Direct command-palette destinations for every current label
- Count context in label command-palette entries
- Live count refresh through normal capture, lifecycle, label, bulk-refresh, restore, and reminder-change paths
- Compact-sidebar behavior that remains icon-first without count or search clutter
- Derived navigation state computed from the existing repositories rather than persisted separately

V3.3 requires **no database migration**. Notes, checklist rows, label relationships, reminders, attachments, revisions, search data, privacy settings, and backups keep their existing authority and formats. Navigation counts are disposable derived UI state and a count-refresh failure cannot block access to stored notes.

V3.3 deliberately excludes folders, nested hierarchy, smart folders, a persistent count/cache table, a second search index, new lifecycle states, and changes to backup/restore semantics.

## V3.4 scope

V3.4 improves existing-note editor feedback without changing the underlying persistence model:

- Visible **Waiting to save…**, **Saving…**, **Saved**, and **Save failed** states tied to the actual serialized persistence path
- Last successfully persisted update time shown from the saved record's `updatedAt`
- Formatting-neutral visible word and character metrics for text notes
- Meaningful-item and completion metrics for checklists
- Shared editor status presentation across text and checklist editors
- Existing retry behavior retained when persistence fails
- Discoverable Ctrl/Cmd+Enter close-and-save affordance with `aria-keyshortcuts` and tooltip metadata
- Larger-screen shortcut hint while keeping the mobile footer compact
- Recovery-journal drafts settling through the same persistence-backed save-state model after reload

V3.4 requires **no database migration**. The 180 ms autosave delay, serialized save chains, optimistic revisions, recovery journals, revision-history checkpoints, normalized checklist rows, attachments, reminders, backup/restore formats, and offline/PWA behavior remain unchanged.

Metrics and save-feedback state are transient UI state. V3.4 deliberately excludes a new editor framework, document statistics persistence, manual-save mode, new revision semantics, alternate storage formats, and changes to crash-recovery authority.

## V3.5 scope

V3.5 refines the existing V2-1 reminder system without adding another persistence model:

- Quick scheduling for **In 1 hour**, **Tomorrow 9:00**, and **Next week 9:00**
- Existing Today / Tomorrow / Next week date-only presets retained for manual time selection
- Snooze choices for **10 minutes**, **1 hour**, and **Tomorrow 9:00**
- Clear `Overdue · …` wording on active reminder chips and editor summaries
- Card-level overdue state exposed for restrained visual emphasis
- Local-calendar grouping into Overdue, Today, Tomorrow, Next 7 days, and Later
- Section-level reminder counts plus active/history totals in the Reminders workspace
- DST-safe local-day grouping derived from calendar dates instead of elapsed 24-hour windows
- Existing absolute `dueAt` timestamp + scheduling timezone storage preserved
- Snooze continues to reactivate the existing reminder record and clear notification de-duplication state

V3.5 requires **no database migration**. It deliberately excludes recurring reminders, location reminders, task projects, cloud scheduling, background servers, and any new claim of reliable notification delivery while every Notes tab/PWA window is closed.

## V3.6 scope

V3.6 refines the existing attachment experience without adding another media persistence model:

- Attachment-panel count plus total byte size
- Mixed-media breakdown across images, voice recordings, and other files
- Image-tile filename, friendly type, byte size, and direct download action
- Lightbox filename, decoded pixel dimensions, friendly type, and byte size
- Voice-recording duration when native browser metadata is finite and available
- Friendly common file labels such as PDF document, Text document, MP3 audio, or PNG image
- Existing image lightbox keyboard navigation, removal confirmation, downloads, capture sources, privacy processing, and offline behavior preserved

V3.6 requires **no database migration**. Width, height, duration, friendly type labels, totals, and media breakdowns are derived in memory from existing attachment records and local browser decoders; none are written back to IndexedDB.

V3.6 deliberately excludes cloud media hosting, server processing, transcoding, waveform/image editing, attachment-folder/order persistence, EXIF/location display, and persistent media-dimension/duration columns.

See [`docs/ATTACHMENTS_MEDIA.md`](docs/ATTACHMENTS_MEDIA.md) for the V3.6 interaction and persistence contract.

## V3.7 scope

V3.7 improves confidence and clarity around the existing P12 full-library backup/restore system:

- Current-library readiness counts before a manual backup
- Device-local memory of the most recent successful manual backup, including filename, time, age, and file size
- Validated backup file size, backup/database version, export timestamp, and human-readable freshness
- Current-vs-incoming comparison for notes, attachments, reminders, saved versions, and all database records before replacement
- Clear numeric deltas showing what the selected restore would add or remove
- Existing read-only validation before restore preserved
- Existing explicit destructive-restore acknowledgement preserved
- Existing automatic pre-restore safety backup preserved
- Existing atomic eight-table rollback semantics preserved
- Current-library counts refresh after successful Google Keep import or full restore

V3.7 requires **no database migration and no backup-format change**. Current counts and comparison rows are derived from the existing eight IndexedDB tables. The last-manual-backup marker is disposable browser-local activity metadata in `localStorage`; it is intentionally not portable library data and is not written into Notes backups.

V3.7 deliberately excludes scheduled/background backups, cloud backup destinations, sync, encryption, differential/incremental backups, merge restore, automatic restore, and any weakening of P12 validation or replacement safety gates.

See [`docs/BACKUP.md`](docs/BACKUP.md) for the P12/V3.7 backup format, validation, recovery-confidence UI, safety snapshot, and atomic replacement contract.

## Architecture

- React + TypeScript + Vite
- IndexedDB through Dexie
- Local-first data model
- Device-local privacy context for UI lock, preview masking, notification redaction, and auto-lock state
- PBKDF2-SHA-256 privacy-lock credential derivation with random salt and no plaintext credential persistence
- Explicit security boundary: privacy lock masks the application UI but does not encrypt IndexedDB or exported backups
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
- Tesseract.js OCR dynamically imported only for user-triggered recognition
- Build-time local packaging of OCR worker, Tesseract WebAssembly core variants, and English/German/French trained data
- Service-worker precaching of OCR JavaScript, WASM, and compressed language assets for offline recognition
- Transient OCR review with explicit copy or text-note append, avoiding an OCR side table or persistent recognition cache
- OCR text-note insertion through ordinary Markdown-compatible `content`, inheriting existing autosave/history/search/backup behavior
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
- Derived current-library counts plus current-vs-incoming recovery comparison before replacement
- Device-local last-manual-backup activity marker kept outside portable library backups
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
- Accent-insensitive multilingual normalization plus bounded candidate-pruned Levenshtein typo matching
- Field-aware relevance weighting across title, labels, attachment filenames, committed OCR, checklist text, and body text
- Attachment-filename indexing without parsing or duplicating attachment Blob contents
- V2-6 committed `## Extracted text` recognition without persisting transient OCR output
- Backed-up saved-search snapshots in the existing settings table plus capped device-local recent search history
- Search filters and query operators for type, status, color, labels, dates, images, links, and reminders
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
- Playwright for real-browser IndexedDB, capture recovery, card/grid, lifecycle, organization, checklist, selection/bulk, advanced fuzzy/saved/recent/filename/OCR search, revision-history/recovery, backup/disaster-recovery, Google Keep migration, image/attachment capture and viewing, command/keyboard, rich-text editing/rendering/search, link intelligence/navigation/auto-linking, drawing/pointer/PNG/modal integration, voice/microphone/audio/persistence/permission integration, real local OCR recognition/text insertion, responsive-shell, end-to-end, and production PWA/offline/OCR-asset certification
- GitHub Actions for CI and deployment
- GitHub Pages-compatible build rooted at `/notes/`

See [`docs/EDITOR_INTERACTION.md`](docs/EDITOR_INTERACTION.md) for V3.4 autosave feedback, editor metrics, keyboard-close affordances, and the persistence/recovery boundary.

See [`docs/PRIVACY.md`](docs/PRIVACY.md) for V2-8 lock, preview masking, notification redaction, local-trace cleanup, and the privacy/security boundary.

See [`docs/DATABASE.md`](docs/DATABASE.md) for database invariants, [`docs/DESIGN_SYSTEM.md`](docs/DESIGN_SYSTEM.md) for the shell and styling contract, [`docs/CAPTURE.md`](docs/CAPTURE.md) for new-note capture and recovery, [`docs/CARDS_AND_GRID.md`](docs/CARDS_AND_GRID.md) for the P4 card and editor architecture, [`docs/LIFECYCLE.md`](docs/LIFECYCLE.md) for lifecycle state, Undo, Archive, Trash, duplication, and permanent deletion behavior, [`docs/ORGANIZATION.md`](docs/ORGANIZATION.md) for P6 color, label, label-view, and organization behavior, [`docs/CHECKLISTS.md`](docs/CHECKLISTS.md) for P7 checklist storage, interaction, conversion, and recovery behavior, [`docs/SELECTION_AND_BULK.md`](docs/SELECTION_AND_BULK.md) for P8 selection scope, bulk toolbar behavior, transactional batch mutations, and Undo semantics, [`docs/SEARCH.md`](docs/SEARCH.md) for P9/V2-7 indexing, normalization, fuzzy matching, relevance scoring, filename/OCR discovery, saved/recent searches, query operators, and performance behavior, [`docs/KEYBOARD.md`](docs/KEYBOARD.md) for P10 command palette, shortcut safety, and focused-card keyboard behavior, [`docs/HISTORY.md`](docs/HISTORY.md) for P11 checkpoint, restore, Undo, copy, pruning, payload-validation, and cross-type recovery semantics, [`docs/BACKUP.md`](docs/BACKUP.md) for P12 full-library backup format, validation, safety snapshot, atomic replacement, and disaster-recovery behavior, [`docs/GOOGLE_KEEP_IMPORT.md`](docs/GOOGLE_KEEP_IMPORT.md) for P13 Takeout parsing, mapping, preview, repeat-import protection, and atomic additive migration behavior, [`docs/IMAGES.md`](docs/IMAGES.md) for P14 native image capture, privacy processing, thumbnails, viewer behavior, imported attachment handling, and storage limits, [`docs/PWA_OFFLINE.md`](docs/PWA_OFFLINE.md) for P15 installability, service-worker update policy, production offline behavior, and certification requirements, [`docs/REMINDERS.md`](docs/REMINDERS.md) for V2-1 reminder storage, scheduling, lifecycle, notification limits, backup/import integration, and regression requirements, [`docs/RICH_TEXT.md`](docs/RICH_TEXT.md) for V2-2 source syntax, editor behavior, rendering safety, search compatibility, scope boundaries, and regression requirements, [`docs/LINK_INTELLIGENCE.md`](docs/LINK_INTELLIGENCE.md) for V2-3 title resolution, WikiLink navigation, backlinks, unlinked mentions, safe auto-linking, and regression requirements, [`docs/DRAWING.md`](docs/DRAWING.md) for V2-4 drawing input, canvas tools, PNG persistence, modal isolation, capture integration, and regression requirements, [`docs/VOICE.md`](docs/VOICE.md) for V2-5 microphone capture, format negotiation, local persistence, playback, privacy boundaries, and regression requirements, and [`docs/OCR.md`](docs/OCR.md) for V2-6 local recognition, offline runtime packaging, text insertion, privacy boundaries, limitations, and regression requirements.

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

`npm run e2e` uses the development server for the ordinary browser regression suite. `npm run e2e:pwa` must run after `npm run build`; it uses the production preview server so the generated service worker and manifest are the same artifacts that ship. `npm run dev` and `npm run build` prepare the local OCR runtime assets automatically.

## License

MIT
