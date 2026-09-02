# Reminders + Time-Based Notes

V2-1 adds one local reminder to any saved text note or checklist without turning Notes into a task-management system.

## Data model

Reminders are stored in the IndexedDB `reminders` table introduced by database schema v2.

Each note can have at most one reminder because `noteId` is a unique index.

A reminder stores:

- `id`
- `noteId`
- `dueAt` — absolute Unix time in milliseconds
- `timeZone` — the IANA timezone captured when the reminder was scheduled
- `status` — `active`, `completed`, or `dismissed`
- `createdAt`
- `updatedAt`
- `completedAt`
- `dismissedAt`
- `lastNotifiedAt`

The reminder is deliberately separate from `NoteRecord`. Editing reminder state therefore does not create fake text revisions or increase the note revision counter.

## Scheduling semantics

The reminder editor accepts a local calendar date and local wall-clock time. Notes converts that local value to an absolute timestamp at save time and records the current IANA timezone.

Presets are available for Today, Tomorrow, and Next week. V3.5 also adds one-click quick scheduling for In 1 hour, Tomorrow 9:00, and Next week 9:00 while leaving the date/time inputs editable. V3.5 also adds one-click quick scheduling for In 1 hour, Tomorrow 9:00, and Next week 9:00 while leaving the date/time inputs editable. V3.5 also adds one-click quick scheduling for In 1 hour, Tomorrow 9:00, and Next week 9:00 while leaving the date/time inputs editable.

### Timezones and daylight-saving time

The stored `dueAt` is an absolute instant, so changing timezone later does not move the reminder to a different instant.

The recorded IANA timezone documents the scheduling context.

Nonexistent local times during a daylight-saving spring-forward gap are rejected rather than silently shifted. For example, `2026-03-29 02:30` does not exist in `Europe/Berlin` and cannot be saved as that wall-clock value.

Autumn fallback times can be ambiguous because browsers expose the platform's local-time resolution rather than a timezone-disambiguation API. Notes accepts the browser-resolved instant and stores it as an absolute timestamp.

The E2E regression suite runs a dedicated `Europe/Berlin` timezone test for these semantics.

## Reminder lifecycle

### Active

An active reminder appears in the Reminders workspace and can be:

- changed to another date/time
- snoozed 10 minutes, one hour, or until 09:00 tomorrow
- completed
- dismissed
- removed entirely

Setting a new date/time on a previously completed or dismissed reminder reactivates the same reminder record.

### Completed

Completed reminders remain visible in `Completed & dismissed` history. `completedAt` records when the user completed the reminder.

### Dismissed

Dismissed reminders also remain in history. `dismissedAt` records when the user dismissed it.

### Removed

Remove deletes the reminder record entirely. The note itself is unchanged.

## Reminders workspace

The existing Reminders navigation destination is now backed by real database data.

Visible reminders are grouped into:

- Overdue
- Today
- Tomorrow
- Next 7 days
- Later
- Completed & dismissed

The workspace supports the normal card editor, colors, labels, duplication, and trash actions. Grid/list preference is shared with the Notes workspace.

Trashed notes are excluded even though their reminder records are preserved for restoration.

## Note lifecycle interactions

### Archive

Archiving a note preserves its reminder. The reminder remains visible in the Reminders workspace because archive is an organization state, not cancellation.

### Trash

Moving a note to Trash preserves the reminder record but hides it from the Reminders workspace and suppresses notification delivery.

Restoring the note makes the reminder visible again with its prior status and due time.

### Permanent deletion

Permanent deletion removes the reminder in the same transaction as checklist rows, note-label relationships, attachments, revisions, and the note itself.

Bulk permanent deletion follows the same rule.

### Duplication

Duplicating a note does **not** duplicate its reminder. A copied note therefore cannot accidentally create a second alert for the same time.

### Revision history

P11 revision restore changes note/checklist content state only. It does not rewind or replace reminder state.

This matches reminders' independent lifecycle: restoring an old text version must not unexpectedly reschedule an alarm.

## Search

`has:reminder` matches notes with an **active** reminder.

Completed and dismissed reminder history does not match `has:reminder`.

The search index listens for reminder changes and updates without requiring a page reload.

## Local notifications

Browser notifications are optional and are requested only after the user chooses **Enable notifications**.

When permission is granted, Notes checks due reminders:

- while the app is visible
- about once per minute
- when the window regains focus
- when Notes becomes visible again
- after reminder state changes

When a `/notes/` service-worker registration exists, notification display uses that registration. Otherwise Notes falls back to the browser Notification API when available.

`lastNotifiedAt` prevents the same due time from being emitted repeatedly. Snoozing or rescheduling clears the notification marker so the new due time can alert again.

### Browser limitation

V2-1 does not claim reliable scheduled notifications while every Notes tab/PWA window is fully closed.

A static local-first GitHub Pages PWA has no server push scheduler, and standard service workers do not provide a portable cross-browser API for arbitrary future alarms. Reminder data itself remains correct and will be surfaced when the app is opened or returns to the foreground.

## Backup and recovery

Backup format v2 includes the complete `reminders` table.

A current full backup therefore preserves:

- due times
- scheduling timezone
- active/completed/dismissed state
- completion/dismissal timestamps
- notification de-duplication state

Legacy Notes backup format v1 files remain restorable. They are normalized during validation to database v2 with an empty reminder table.

Backup graph validation rejects:

- reminder rows referencing missing notes
- duplicate reminder IDs
- more than one reminder referencing the same note

## Google Keep migration

P13 import is extended conservatively for reminder metadata.

Notes recognizes exported absolute reminder timestamps only when they appear in known timestamp-like fields. Recognized values become active reminders with the imported instant preserved.

Because the Keep export may not include enough timezone context to reconstruct the original wall-clock scheduling zone, recognized absolute timestamps are stored with `timeZone: "UTC"` rather than inventing a local zone.

If reminder-like metadata exists but no recognized timestamp can be extracted, Notes emits a warning and imports the note without a reminder. It does not guess.

## Regression gates

V2-1 adds automated coverage for:

- database v1 → v2 opening
- unique reminder-per-note enforcement
- scheduling/update/reactivation
- snooze
- completion and dismissal
- notification de-duplication
- trash suppression
- single and bulk permanent-delete cleanup
- duplication without reminder copying
- reminder card chips
- Reminders workspace grouping
- trash/restore reminder preservation
- live `has:reminder` search behavior
- backup format v2 and legacy-v1 compatibility
- conservative Google Keep reminder migration
- Europe/Berlin DST-gap handling

## V3.5 reminder/time UX polish

V3.5 is a presentation and interaction refinement over the same reminder rows introduced in V2-1.

Scheduling gains three fast paths: In 1 hour, Tomorrow at 09:00, and Next week at 09:00. These presets populate the existing local date/time draft and therefore still pass through the same DST validation and `RemindersRepository.set()` write path as manual scheduling.

Active reminders gain three snooze targets: 10 minutes, one hour, and 09:00 tomorrow. Snooze still calls the existing repository method, keeps the reminder active, and clears `lastNotifiedAt` so the new due time can notify once.

The Reminders workspace now derives five active time buckets from the stored absolute timestamp: Overdue, Today, Tomorrow, Next 7 days, and Later. Calendar-day distance is computed from local year/month/day values rather than dividing elapsed milliseconds by 24 hours, so a DST transition does not move a reminder into the wrong local-date section.

Reminder cards and compact editor controls now use explicit overdue wording. The card chip also exposes `data-overdue` for visual treatment without changing reminder state.

Section counts and the workspace active/history summary are derived UI state only. No count, bucket, or relative-time value is persisted.

## Phase boundary

V2-1 adds local time-based reminders without introducing accounts, cloud sync, background servers, task projects, recurring schedules, location reminders, or collaboration.
