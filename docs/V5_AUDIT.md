# Notes V5 — Paper & Ink

## Intent

Replace the accumulated visual patchwork with a readable notebook interface. Preserve the local database, note IDs, journals, backups, and existing media tools. Add utilities only where they shorten a real task.

## Audit findings and implemented changes

| Area                  | Finding                                                                                                                        | Change                                                                                                                                                      |
| --------------------- | ------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Account form          | Native text inputs shared a checkbox-oriented row layout and overlapped their labels and actions.                              | Dedicated stacked field layout, 44px controls, readable error alerts, small-screen layout checks.                                                           |
| Cloud refresh         | Every applied cloud batch changed the root workspace key, destroying editors, navigation, and transient state.                 | Stable application identity; collections, labels, search, and reminders refresh independently.                                                              |
| Saving and focus      | Capture attempted to restore focus before the collapsed trigger committed. Rejected autosaves could create unhandled promises. | Commit-aware restoration and handled rejections; save errors and recovery journals remain visible and intact.                                               |
| Sync acknowledgement  | The shadow could acknowledge divergent final snapshots and silently stop retrying an edit made during upload.                  | Only equal content or a confirmed deletion is acknowledged. Failed, deferred, and changed-during-upload records retain their prior baseline.                |
| Large cloud libraries | Cloud reads were not paginated.                                                                                                | Ordered keyset pagination until exhaustion, including projects whose response limit is lower than the requested page size; cursor and ownership validation. |
| Active writing        | Incoming sync could replace the document being edited.                                                                         | Open notes and associated records are deferred; unrelated cloud changes still arrive. Pending changes are labelled as saved locally, not fully synced.      |
| Authentication        | Network failure on startup could discard a saved sign-in. Recovery initialization was vulnerable to effect replay.             | Keep sessions through offline startup; deduplicate callback consumption and overlapping refresh requests; enter recovery before syncing.                    |
| State accuracy        | The workspace advertised local-only storage regardless of account state. Some account failures were swallowed.                 | Actual account status in the workspace and sidebar; actionable account errors.                                                                              |
| Dialogs               | Several feature dialogs did not contain keyboard focus.                                                                        | Shared topmost-modal focus containment for writing, drawing, voice, OCR, history, image viewing, deletion, and mobile navigation.                           |
| Visual architecture   | Repeated global “polish” layers overrode earlier decisions.                                                                    | New token, shell, document, settings, and account owners. Remove obsolete global layers; consolidate adjacent attachment and backup layers.                 |
| Release evidence      | Failed browser checks did not retain screenshots or traces reliably.                                                           | Keep failure diagnostics and a dedicated responsive design and sync-integrity suite.                                                                        |

## Design contract

Paper & Ink uses warm paper surfaces, a graphite navigation rail, a restrained vermilion accent, serif document headings, and monospaced metadata. Dark mode uses graphite rather than tinted green or purple. Controls have restrained corners; hierarchy comes from type, spacing, dividers, and position rather than gradients or elevated dashboard cards.

The shell exposes search, settings, commands, capture, collection navigation, and actual sync state. The notebook exposes sorting and grid/list choices directly. Mobile navigation contains Notes, Search, New, Reminders, and More, with safe-area spacing. The navigation drawer is a keyboard-contained modal and makes the underlying workspace inert.

Core styles have explicit owners. Do not restore a late global redesign layer or use broad resets to conceal overflow. Feature-specific media and backup styles remain scoped to those features.

## Added utilities

- Persistent sorting by last edited, creation date, or title, with stable ordering and no mutation of stored records.
- Copy and download the current document as Markdown, including checklist state and indentation.
- Writing-focus mode without changing the document, autosave, or available recovery mechanisms.
- Portable Unicode-safe export filenames, including Windows reserved-name handling.

Markdown exports are text documents, not complete backups. Use the existing backup workspace to preserve attached files and all library records.

## Preserved capabilities

Text notes and rich text, checklists and nesting, labels, pinning, archive/trash/restore, undo and bulk operations, full-text/fuzzy search and filters, saved searches, related-note navigation, revisions, reminders, image and file attachments, drawing, voice recording, local OCR, privacy lock, Google Keep import, backup and recovery, offline installation, and opt-in private cloud synchronization remain in the application. Existing IndexedDB tables and production cloud ownership policies are not replaced by this redesign.

## Verification contract

Formatting, lint, TypeScript, unit tests, production build and the original entry-bundle budget remain release gates. The existing Chromium workflow and PWA/offline tests are retained. New browser coverage exercises light and dark layouts at 320, 390, 768, and 1440 pixels, actual account field geometry, navigation, draft retention during cloud refresh, exports, sorting, nested dialog focus, account errors, malformed remote records, active-editor deferral, edits during upload, and offline reconnection.

Browser sync tests use intercepted Supabase responses and synthetic local data. They must not create, delete, or modify the user's real cloud library. Passing mocked tests is not proof of live email delivery or a completed round trip across the user's physical devices.

## Remaining architectural boundaries

Sync still reconciles snapshots and resolves concurrent content changes using timestamps; it is not a CRDT or a transactional multi-device collaboration system. Same-origin Web Locks serialize participating sync calls, not arbitrary editing on other devices. Local revisions are checkpointed before incoming note replacement, but this is not a complete server-side conflict archive. Keep independent backups and avoid simultaneous editing of the same note on multiple devices until a server-side compare-and-swap protocol is implemented.

Screen privacy is not end-to-end encryption. Signing out leaves this browser's local library available, as the UI states. The backend is shared with other applications; Notes identity deletion remains guarded against deleting a shared WORDSTRIKE identity. Production schema, owner claims, other applications, and real user records were not changed for this redesign.
