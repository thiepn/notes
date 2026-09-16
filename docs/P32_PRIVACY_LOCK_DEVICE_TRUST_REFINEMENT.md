# P32 — Privacy, Lock & Device Trust Refinement

## Goal

P32 refines the existing device-local privacy system without changing its threat model, credential format, IndexedDB schema, notification architecture, or cloud-account model.

The phase focuses on interaction correctness and trust:

- unlock attempts must have deterministic busy/error/cooldown focus behavior;
- passcode values must not remain editable while PBKDF2 verification is running;
- Privacy Settings must not disappear or accept competing changes while a credential mutation is in flight;
- validation, cryptographic, and incorrect-current-passcode failures must stay visible and retryable;
- auto-lock must measure the time Notes has actually remained hidden, even if its timeout preference changes while hidden;
- the UI must clearly explain the difference between reload locking, hidden-tab auto-lock, and cross-tab **Lock now** behavior.

## Lock-screen interaction recovery

`PrivacyGate` now treats passcode verification as an explicit transaction.

While a passcode is being checked:

- the form exposes `aria-busy`;
- the passcode field is disabled so the submitted value cannot drift during PBKDF2 work;
- the unlock action remains disabled;
- the existing lock screen remains mounted.

After an incorrect passcode:

- the field is cleared;
- the failure receives focus;
- repeated-attempt throttling remains authoritative.

When the local cooldown begins:

- the cooldown status receives focus;
- the passcode field remains disabled;
- the existing countdown remains visible.

When the cooldown expires, focus returns to the passcode field automatically so keyboard users have an immediate retry point. The stale **Incorrect passcode** message is not reintroduced after the cooldown ends.

## Privacy Settings transaction safety

Passcode enable/change/disable operations now have a single active mutation state.

While a credential mutation is running:

- the dialog exposes `aria-busy`;
- Escape cannot dismiss the dialog;
- backdrop dismissal is ignored;
- the Close button is disabled;
- passcode fields are disabled;
- preview, notification, auto-lock, Lock now, and local-trace controls cannot start competing changes;
- action labels expose **Enabling…**, **Changing…**, or **Disabling…** where appropriate.

This keeps the visible form values aligned with the exact values being verified or derived.

## Feedback focus and failure recovery

Privacy Settings validation and operation feedback is now keyboard deterministic.

- validation errors receive focus;
- incorrect-current-passcode failures receive focus;
- unexpected crypto failures receive focus;
- successful enable/change/disable results receive focus;
- successful local-history cleanup receives focus;
- failed operations leave the user-entered values available for correction and retry unless the operation completed successfully.

P32 also adds missing exception handling around privacy-lock disable so an unexpected Web Crypto failure is surfaced instead of becoming an unhandled asynchronous rejection.

## Auto-lock elapsed-time correctness

The existing hidden-tab auto-lock behavior remains intentionally tab-local.

P32 fixes one timing edge case: if the auto-lock preference changes while Notes is already hidden, the provider now preserves the original hidden timestamp instead of restarting the hidden-time clock.

Example:

1. Notes has been hidden for two minutes with a five-minute timeout.
2. Another open Notes tab changes the timeout to one minute.
3. The hidden tab receives the device-local preference update.
4. Because it has already been hidden longer than one minute, it locks immediately.

Before P32, re-running the auto-lock effect could reset the hidden timestamp and incorrectly grant a fresh one-minute grace period.

## Device-trust clarity

Privacy Settings now explains the existing boundaries directly:

- reloading Notes always starts locked when a privacy credential exists;
- hidden-tab auto-lock applies only to the tab that was hidden;
- **Lock now** also sends the existing lock signal to sibling Notes tabs in the same browser profile.

P32 does not change those semantics.

## Existing privacy behavior retained

P32 preserves:

- device-local credential storage in `localStorage`;
- PBKDF2-HMAC-SHA256 credential derivation;
- the 600,000-iteration current work factor;
- legacy credential upgrade after successful unlock;
- bounded repeated-attempt cooldowns;
- explicit cross-tab lock signaling;
- tab-local automatic hidden-state locking;
- hidden note-card preview semantics;
- locked-state notification redaction;
- device-local privacy preferences;
- recent-search cleanup semantics;
- the non-encryption security boundary documented in `docs/PRIVACY.md`.

## Explicit non-goals

P32 does not add:

- encryption at rest;
- end-to-end encryption;
- biometric or WebAuthn unlock;
- passcode recovery or cloud escrow;
- per-note passwords;
- remote device wipe;
- a new trusted-device registry;
- account/session-token changes;
- database migrations;
- backup-format changes.

## Regression coverage

`e2e/p32-privacy-lock-device-trust-refinement.spec.ts` verifies:

- validation errors receive focus;
- successful lock enable feedback receives focus;
- device-trust behavior is explained in the UI;
- incorrect unlock failures receive focus;
- cooldown state receives focus and disables passcode entry;
- cooldown expiry returns focus to the passcode field;
- a stricter auto-lock timeout applied while hidden uses already elapsed hidden time instead of restarting the clock.

Run the focused suite with:

```text
npm run e2e:p32
```

The complete no-retry release regression remains authoritative before merge.
