# Privacy & Device Security

Notes provides device-local controls that reduce accidental exposure without changing the app's local-first persistence architecture. P8 hardens the existing privacy lock and coordinates explicit locking across open Notes tabs.

## Security boundary

Privacy controls are deliberately **not encryption**. Notes content, checklist rows, labels, attachments, reminders, revisions, and settings remain stored in the established IndexedDB database exactly as before. A person with access to the browser profile, developer tools, filesystem, browser storage, or an exported backup may still be able to read that data.

The privacy lock is therefore a UI access barrier for casual device sharing and shoulder-surfing. It is not a substitute for operating-system login security, full-disk encryption, an encrypted vault, or a password manager.

P8 does not introduce cloud key escrow, encrypted note blobs, a new persistence database, or a claim that the local library is cryptographically protected at rest.

## Privacy lock

Privacy lock is optional and device-local.

When enabled:

- the passcode itself is never stored;
- the browser stores a random 16-byte salt and a PBKDF2-HMAC-SHA256 derived hash;
- new credentials use **600,000 PBKDF2 iterations**;
- a lock screen replaces the Notes application UI while locked;
- reloading Notes starts locked when a credential exists;
- **Lock now** is available from the header menu;
- failed unlock attempts do not modify the credential or Notes data;
- changing or disabling the lock requires the current passcode.

The credential is kept in `localStorage` under `notes.privacy.credential.v1`. It is intentionally separate from the backed-up IndexedDB settings table because the lock is a property of the current browser profile rather than portable Notes content.

If Web Crypto is unavailable, the lock cannot be enabled.

## P8 work-factor upgrade

Earlier Notes versions created privacy credentials with 120,000 PBKDF2-HMAC-SHA256 iterations. The credential already stores its own work factor, so P8 preserves compatibility instead of invalidating existing passcodes.

On a successful unlock:

1. Notes verifies the passcode using the credential's stored iteration count.
2. If that count is below the current 600,000-iteration target, Notes generates a fresh random salt and derives a replacement credential using the current work factor.
3. The stronger credential replaces the old local credential.
4. The user is unlocked normally.

Incorrect passcodes never trigger credential replacement. New credentials and passcode changes always use the current work factor.

This follows the normal password-hashing migration pattern of increasing the work factor when the user next successfully authenticates.

## Repeated unlock attempts

P8 adds a bounded, device-local delay after repeated incorrect unlock attempts.

The first two failed attempts have no artificial delay. Further consecutive failures use:

- third failure: 2 seconds;
- fourth failure: 5 seconds;
- fifth failure: 15 seconds;
- sixth failure: 30 seconds;
- seventh and later failures: 60 seconds maximum.

Attempt state is stored separately in `localStorage` under `notes.privacy.attempts.v1` so a simple reload does not immediately erase a cooldown. The failure history expires after 15 minutes without another failed attempt and is cleared immediately after a successful unlock, passcode replacement, lock enable, or lock disable.

The delay is defense in depth for the UI barrier. It is not presented as protection against a person who controls the browser profile or can edit browser storage directly.

## Cross-tab explicit locking

Before P8, changing or creating the privacy credential propagated through browser storage events, but pressing **Lock now** affected only the current React tree.

P8 adds a device-local lock signal under `notes.privacy.lock-signal.v1`. When the user explicitly chooses **Lock now**, every open Notes tab in the same browser profile that observes the signal locks its interface.

Automatic hidden-tab locking remains local to the tab that became hidden. This is intentional: one stale hidden Notes tab must not unexpectedly interrupt a different Notes tab that the user is actively using.

Unlocking one tab also does not unlock sibling tabs automatically. Each locked tab requires deliberate authentication.

## Automatic locking

When privacy lock is enabled, the user can choose to lock after Notes has been hidden for:

- immediately;
- 1 minute;
- 5 minutes;
- 15 minutes;
- 30 minutes; or
- never.

The default is 5 minutes.

The timer uses page visibility as a best-effort browser signal. It does not claim operating-system-level background execution. Reloading is always conservative: an enabled lock starts locked regardless of the auto-lock choice.

## Hide note previews

**Hide note previews** is a shoulder-surfing mode for note cards. While enabled, a card no longer renders:

- its title;
- text-note body content;
- checklist item text;
- labels;
- reminder state/time;
- image or other attachment preview content.

Instead, the card renders a neutral **Preview hidden** placeholder.

Accessibility/action labels also use **Hidden note** instead of deriving a label from the note title, body, or checklist text, preventing hidden content from being exposed through card ARIA labels.

The card remains deliberately openable. Opening the note is an explicit user action and shows the normal editor content. Preview hiding therefore protects passive browsing of the notes grid/list; it is not per-note encryption or an editor redaction feature.

The preference is stored device-locally in `localStorage` under `notes.privacy.preferences.v1`.

## Private reminder notifications

Private reminder notifications default to enabled.

With privacy-safe notifications enabled, notification copy is always:

- title: `Notes reminder`
- body: `Open Notes to view this reminder.`

When the user disables notification redaction, normal reminder title/body previews may be used while Notes is unlocked. **While Notes is locked, notifications are always redacted regardless of that preference.**

Reminder scheduling, status, due-time de-duplication, archive/trash behavior, and notification delivery remain owned by the existing reminders repository. Privacy controls change only the displayed copy.

## Local traces

Recent searches are disposable device-local `localStorage` history. Privacy settings expose **Clear recent searches**.

This action intentionally does **not** remove saved searches. Saved searches are user-created Notes data stored in the existing IndexedDB `settings` table and remain part of the normal backup/restore model.

## Cloud sessions and device trust

Cloud authentication remains owned by the existing Supabase account layer. Signed-in users can review reported sessions and use the existing controls to:

- refresh the session list;
- sign out other devices;
- sign out everywhere; or
- sign out only this device.

The local privacy passcode is separate from the Supabase account password and session tokens. Enabling the privacy lock does not revoke a cloud session, and revoking a cloud session does not erase the browser's local IndexedDB library.

## Persistence and backup compatibility

P8 requires no database migration.

The existing IndexedDB data model remains authoritative:

- notes remain notes;
- checklists remain normalized checklist rows;
- attachments remain Blob attachment records;
- reminders remain reminder records;
- revisions remain revision snapshots;
- saved searches remain settings records;
- backup/restore format and integrity checks are unchanged.

Privacy preferences, credential hashes, attempt-state records, and explicit lock signals are intentionally not copied into a Notes backup or P7 portable archive. Restoring or importing content therefore cannot silently alter the destination device's privacy lock.

## Offline behavior

All local privacy-lock behavior works offline:

- Web Crypto passcode verification runs locally;
- work-factor migration runs locally;
- repeated-attempt throttling is local;
- cross-tab explicit lock signals use browser storage events;
- preview masking is local UI state;
- auto-lock uses browser visibility/timers;
- notification redaction is local;
- recent-search deletion is local.

No privacy-lock action requires a server request.

## Deliberate exclusions

P8 does not add:

- encryption at rest;
- end-to-end encryption;
- encrypted backups;
- biometric/WebAuthn unlock;
- per-note passwords;
- hidden or secret note collections;
- remote wipe of browser-local data;
- protection against browser developer tools;
- guarantees against someone who controls the local device/browser profile.

Those require a different threat model and, for encryption, a dedicated migration and key-management architecture rather than presenting a UI lock as cryptographic protection.
