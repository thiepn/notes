# P8 — Privacy, Security & Device Trust

P8 hardens the existing privacy and account-security surfaces after P6 conflict safety and P7 portability. It deliberately improves the security of the current local privacy barrier without misrepresenting that barrier as encryption.

## Product goal

A Notes user who enables the device-local privacy lock should get predictable protection against casual access:

- a passcode hash with a current, intentionally expensive work factor;
- seamless strengthening of older credentials;
- bounded resistance to rapid repeated guesses through the UI;
- explicit Lock now behavior that reaches every open Notes tab in the same browser profile;
- conservative reload behavior;
- clear separation between local privacy state and cloud account sessions.

The IndexedDB library itself remains plaintext browser storage. P8 does not change that threat model.

## Credential derivation

New privacy credentials use:

- PBKDF2-HMAC-SHA256;
- a cryptographically random 16-byte salt;
- a 256-bit derived value;
- 600,000 iterations;
- constant-time comparison of derived hexadecimal values.

The raw passcode is never persisted.

The credential format remains version 1 because it already records its salt, hash, and iteration count independently. No forced reset is required.

## Opportunistic legacy upgrade

Credentials produced by earlier Notes releases may contain a lower PBKDF2 iteration count, including the previous 120,000-iteration default.

P8 verifies those credentials using their stored work factor. After a successful verification only, Notes creates a fresh salt and replaces the credential with a new 600,000-iteration credential derived from the same passcode.

This gives existing users the stronger setting the next time they successfully unlock without storing the passcode or requiring a migration screen.

Incorrect passcodes never rewrite the credential.

## Unlock-attempt throttling

Repeated incorrect unlocks now create a device-local attempt record.

Delay schedule:

| Consecutive failure | Delay |
| ---: | ---: |
| 1 | none |
| 2 | none |
| 3 | 2 seconds |
| 4 | 5 seconds |
| 5 | 15 seconds |
| 6 | 30 seconds |
| 7+ | 60 seconds maximum |

The lock screen disables both the passcode field and submit button during an active cooldown and shows the remaining delay.

Attempt state expires after 15 minutes without another failed attempt. It is also cleared after:

- successful unlock;
- enabling the lock;
- changing the passcode; or
- disabling the lock.

Attempt state is stored under `notes.privacy.attempts.v1` in device-local `localStorage`, so a reload does not immediately erase a cooldown.

This is defense in depth against rapid guesses through the application UI. A person who controls the browser profile can edit localStorage directly and remains outside the privacy-lock threat model.

## Cross-tab Lock now

Explicit **Lock now** is a user intent to hide Notes immediately on this browser profile.

P8 records a non-secret lock signal under `notes.privacy.lock-signal.v1`. Other open same-origin Notes tabs receive the browser storage event and lock their interface when a privacy credential exists.

The initiating tab locks synchronously and does not depend on receiving its own storage event.

### Why automatic locking is different

Auto-lock based on `document.visibilityState` remains local to the tab that became hidden. Broadcasting every automatic hidden-tab lock would produce a bad failure mode: a forgotten hidden Notes tab could interrupt another Notes tab that is actively being used.

Therefore:

- explicit Lock now: profile-wide across open Notes tabs;
- hidden-tab auto-lock: tab-local;
- reload with credential: locked;
- unlocking one tab: does not silently unlock another tab.

## Cross-tab credential changes

The established credential storage event behavior remains:

- enabling or replacing a credential causes sibling tabs to observe the new credential and lock;
- disabling the credential causes sibling tabs to remove the UI lock;
- unlock-attempt cooldown state is observed across tabs through its own storage key.

A legacy credential upgraded after successful unlock therefore also causes sibling tabs to observe the credential replacement conservatively.

## Cloud sessions and device trust

P8 does not introduce a second account/session system.

Existing Supabase account controls remain authoritative for cloud identity. Signed-in users can already:

- review reported sessions;
- refresh session information;
- sign out other devices;
- sign out everywhere; and
- sign out only the current device.

The local privacy passcode and Supabase account password are intentionally independent:

- privacy lock protects only the Notes UI in this browser profile;
- cloud session revocation controls server authentication;
- signing out does not erase the local IndexedDB library;
- enabling privacy lock does not revoke an authenticated cloud session.

## Existing protections retained

P8 preserves:

- hide-note-preview behavior and redacted accessible names;
- private reminder notifications;
- forced notification redaction while locked;
- configurable hidden-tab auto-lock timing;
- reload-starts-locked behavior;
- current-passcode requirement for changing/disabling the lock;
- recent-search cleanup without deleting saved searches;
- offline lock/unlock behavior;
- P6 conflict-copy and sync semantics;
- P7 exact backup and portable-archive behavior.

## Persistence boundary

P8 requires no IndexedDB or Supabase schema migration.

The following remain device-local and intentionally excluded from full backups and portable archives:

- privacy preferences;
- privacy credential hash/salt/work factor;
- unlock-attempt state;
- explicit cross-tab lock signal.

A restored or imported library therefore cannot silently configure or weaken the destination browser's privacy lock.

## Deliberate exclusions

P8 does not add:

- encryption at rest;
- end-to-end encryption;
- encrypted backups;
- Argon2/WebAssembly password hashing;
- biometric or WebAuthn unlock;
- per-note passwords;
- hidden/secret collections;
- remote wipe of local IndexedDB data;
- DRM or developer-tools resistance;
- a claim that localStorage cannot be altered by a local attacker.

Encryption would require a separately designed data migration, key hierarchy, recovery story, attachment strategy, search strategy, and multi-device key exchange. It is not safe to imply that a stronger UI passcode hash solves those problems.

## Release invariants

P8 is releasable only if:

1. Newly created privacy credentials use 600,000 PBKDF2-HMAC-SHA256 iterations.
2. Existing lower-work-factor credentials still unlock correctly.
3. Successful legacy unlock upgrades the credential using a new random salt and current work factor.
4. Incorrect unlocks never rewrite the credential.
5. Three consecutive failed unlocks begin the progressive cooldown schedule.
6. Cooldown duration is capped at 60 seconds and stale failure history expires.
7. A successful unlock clears accumulated failures.
8. Explicit Lock now locks sibling Notes tabs with the same device-local credential.
9. Automatic hidden-tab locking does not broadcast and interrupt another active tab.
10. Existing privacy, sync, backup, portability, Chromium, and offline behavior remains green.
11. No IndexedDB or backend schema change is introduced.
