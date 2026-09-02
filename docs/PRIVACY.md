# V2-8 Privacy Enhancements + V3.8 UX Polish

V2-8 adds device-local controls that reduce accidental exposure of Notes content without changing the app's local-first persistence architecture.

## Security boundary

Privacy Enhancements are deliberately **not encryption**. Notes content, checklist rows, labels, attachments, reminders, revisions, and settings remain stored in the established IndexedDB database exactly as before. A person with access to the browser profile, developer tools, filesystem, browser storage, or an exported backup may still be able to read that data.

The privacy lock is therefore a UI access barrier for casual device sharing and shoulder-surfing. It is not a substitute for operating-system login security, full-disk encryption, an encrypted vault, or a password manager.

V2-8 does not introduce accounts, a backend, cloud key escrow, server authentication, encrypted note blobs, or a new persistence database.

## Privacy lock

Privacy lock is optional and device-local.

When enabled:

- the passcode itself is never stored;
- the browser stores a random 16-byte salt and a PBKDF2-SHA-256 derived hash;
- PBKDF2 uses 120,000 iterations;
- a lock screen replaces the Notes application UI while locked;
- reloading Notes starts locked when a credential exists;
- **Lock now** is available from the header menu;
- failed unlock attempts do not modify the credential or Notes data;
- changing or disabling the lock requires the current passcode;
- another tab that observes a newly created credential locks itself through the browser `storage` event.

The credential is kept in `localStorage` under `notes.privacy.credential.v1`. It is intentionally separate from the backed-up IndexedDB settings table because the lock is a property of the current browser/device rather than portable Notes content.

If Web Crypto is unavailable, the lock cannot be enabled.

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

Accessibility/action labels also use **Hidden note** instead of deriving a label from the note title, body, or checklist text, preventing the hidden content from being exposed through card ARIA labels.

The card remains deliberately openable. Opening the note is an explicit user action and shows the normal editor content. Preview hiding therefore protects passive browsing of the notes grid/list; it is not per-note encryption or an editor redaction feature.

The preference is stored device-locally in `localStorage` under `notes.privacy.preferences.v1`.

## Private reminder notifications

Private reminder notifications default to enabled.

With privacy-safe notifications enabled, notification copy is always:

- title: `Notes reminder`
- body: `Open Notes to view this reminder.`

When the user disables notification redaction, normal reminder title/body previews may be used while Notes is unlocked. **While Notes is locked, notifications are always redacted regardless of that preference.**

Reminder scheduling, status, due-time de-duplication, archive/trash behavior, and notification delivery remain owned by the existing reminders repository. V2-8 changes only the displayed copy.

## Local traces

V2-7 recent searches are disposable device-local `localStorage` history. V2-8 exposes **Clear recent searches** from Privacy settings.

This action intentionally does **not** remove saved searches. Saved searches are user-created Notes data stored in the existing IndexedDB `settings` table and remain part of the normal backup/restore model.

## Persistence and backup compatibility

V2-8 requires no database migration.

The existing IndexedDB data model remains authoritative:

- notes remain notes;
- checklists remain normalized checklist rows;
- attachments remain Blob attachment records;
- reminders remain reminder records;
- revisions remain revision snapshots;
- saved searches remain settings records;
- backup/restore format and integrity checks are unchanged.

Privacy preferences and the local lock credential are intentionally not copied into a Notes backup. Restoring a library therefore cannot silently enable, disable, or change the privacy lock of the destination browser profile.

## Offline behavior

All V2-8 behavior is local and works offline:

- Web Crypto passcode verification runs locally;
- preview masking is local UI state;
- auto-lock uses browser visibility/timers;
- notification redaction is local;
- recent-search deletion is local.

No privacy action requires a server request.

## V3.8 privacy and security UX polish

V3.8 keeps V2-8's security boundary unchanged and improves privacy-state visibility plus passive-disclosure behavior.

Privacy settings now show a derived **passive privacy controls** summary for three existing controls: privacy lock, hidden note previews, and private reminder notifications. The summary is descriptive UI state only. It does not calculate a cryptographic security score and does not imply that enabling all three encrypts stored Notes data.

The header More menu now exposes a fast **Hide note previews / Show note previews** toggle. This uses the existing `hidePreviews` preference; no new privacy-mode credential or database field exists.

While Hide note previews is enabled, Notes also reduces passive search disclosure:

- saved/recent search-history suggestions are not rendered when the empty search field receives focus;
- new recent-search entries are not written to `notes.search.recent.v1`;
- the search field indicates that history suggestions are hidden;
- existing recent history remains device-local and can still be explicitly cleared from Privacy settings; and
- existing saved searches remain in the normal backed-up settings table and are not deleted or modified.

This behavior intentionally targets passive history exposure. An actively typed search query remains visible in the search box because entering it is a deliberate user action.

The lock screen now offers a temporary show/hide control for the entered passcode and reports Caps Lock while typing. After a failed verification, the entered value is cleared before retry. These are interaction improvements only; credential storage and verification remain the same PBKDF2-SHA-256 model established in V2-8.

The auto-lock selector now includes a plain-language description of the effective hidden-page policy. The visibility/timer implementation itself is unchanged.

V3.8 requires no database migration, no backup-format change, and no credential-format change. It deliberately does not add encryption at rest, encrypted backups, biometrics/WebAuthn, remote wipe, account authentication, per-note secrets, or protection against someone who controls the local browser profile or developer tools.

## Deliberate exclusions

V2-8 does not add:

- encryption at rest;
- end-to-end encryption;
- encrypted backups;
- biometric/WebAuthn unlock;
- per-note passwords;
- hidden or secret note collections;
- remote wipe;
- cloud account authentication;
- server-side security policies;
- DRM or protection against browser developer tools;
- guarantees against someone who controls the local device/browser profile.

Those would require a different threat model and, for encryption, a carefully designed migration and key-management architecture rather than presenting a UI lock as cryptographic protection.
