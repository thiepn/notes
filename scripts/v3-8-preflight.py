from pathlib import Path

readme = Path('README.md')
text = readme.read_text()
old_status = """**V3.7 — Backup & Recovery UX Polish is implemented as the seventh V3 refinement release.** The existing validated full-library backup and atomic replace-restore system now exposes current-library readiness, device-local manual-backup recency, backup version/freshness, and current-vs-incoming recovery comparison without changing the backup format or database schema.

V1 through P15 remains the stable product foundation and V2-1 through V2-8 complete the feature roadmap through Privacy Enhancements. The V3 refinement track preserves that architecture while improving daily use: V3.1 polishes capture and mobile UX, V3.2 retrieval and search, V3.3 organization and navigation, V3.4 existing-note editing feedback and ergonomics, V3.5 reminder/time interaction quality, V3.6 attachment/media interaction clarity, and V3.7 backup/recovery confidence.
"""
new_status = """**V3.8 — Privacy & Security UX Polish is implemented as the eighth V3 refinement release.** Existing V2-8 device-local privacy controls now expose clearer protection status, a fast preview-privacy toggle, search-history suppression while privacy mode is active, and safer lock-screen retry ergonomics without changing the credential model or claiming encryption.

V1 through P15 remains the stable product foundation and V2-1 through V2-8 complete the feature roadmap through Privacy Enhancements. The V3 refinement track preserves that architecture while improving daily use: V3.1 polishes capture and mobile UX, V3.2 retrieval and search, V3.3 organization and navigation, V3.4 existing-note editing feedback and ergonomics, V3.5 reminder/time interaction quality, V3.6 attachment/media interaction clarity, V3.7 backup/recovery confidence, and V3.8 privacy-state clarity and passive-leak reduction.
"""
if old_status not in text:
    raise SystemExit('README V3.7 status marker changed.')
text = text.replace(old_status, new_status, 1)

boundary = """See [`docs/BACKUP.md`](docs/BACKUP.md) for the P12/V3.7 backup format, validation, recovery-confidence UI, safety snapshot, and atomic replacement contract.

## Architecture
"""
addition = """See [`docs/BACKUP.md`](docs/BACKUP.md) for the P12/V3.7 backup format, validation, recovery-confidence UI, safety snapshot, and atomic replacement contract.

## V3.8 scope

V3.8 refines the existing V2-8 privacy controls without expanding their threat model:

- Explicit protection summary showing whether privacy lock, hidden previews, and private notifications are on or off
- Clear auto-lock policy wording derived from the existing visibility timer preference
- Fast header-menu action to hide or show note previews without opening the full settings dialog
- Saved/recent search-history suggestions are not rendered while Hide note previews is active
- New recent-search entries are not recorded while Hide note previews is active
- Search field explicitly indicates when history suggestions are suppressed
- Existing saved searches remain intact; privacy mode hides suggestions rather than silently deleting user-authored searches
- Lock screen can temporarily show/hide the entered passcode
- Caps Lock status is surfaced while typing on the lock screen
- Failed unlock clears the entered passcode before retry
- Existing lock credential, PBKDF2 derivation, localStorage keys, notification redaction, cross-tab state, and auto-lock behavior are preserved

V3.8 requires **no database migration and no credential-format change**. It adds presentation and passive-disclosure safeguards around the existing V2-8 device-local controls. The privacy lock remains a UI access barrier rather than encryption of IndexedDB or exported backups.

V3.8 deliberately excludes encryption at rest, encrypted backups, WebAuthn/biometrics, remote wipe, account authentication, per-note passwords, server policies, security claims against browser-profile access, or deleting saved searches merely because privacy mode is enabled.

See [`docs/PRIVACY.md`](docs/PRIVACY.md) for the V2-8/V3.8 threat-model boundary, lock behavior, privacy-mode search suppression, notification redaction, and local-trace behavior.

## Architecture
"""
if boundary not in text:
    raise SystemExit('README V3.7/Architecture boundary changed.')
text = text.replace(boundary, addition, 1)

old_arch = """- Device-local privacy context for UI lock, preview masking, notification redaction, and auto-lock state
- PBKDF2-SHA-256 privacy-lock credential derivation with random salt and no plaintext credential persistence
- Explicit security boundary: privacy lock masks the application UI but does not encrypt IndexedDB or exported backups
"""
new_arch = """- Device-local privacy context for UI lock, preview masking, notification redaction, and auto-lock state
- Derived privacy protection summary plus quick preview-privacy toggle without a new persistence model
- Search-history suggestion/recording suppression while preview privacy is active, preserving saved searches without passive disclosure
- PBKDF2-SHA-256 privacy-lock credential derivation with random salt and no plaintext credential persistence
- Lock-screen passcode visibility/Caps Lock feedback with retry input clearing and unchanged credential verification
- Explicit security boundary: privacy lock masks the application UI but does not encrypt IndexedDB or exported backups
"""
if old_arch not in text:
    raise SystemExit('README privacy architecture block changed.')
text = text.replace(old_arch, new_arch, 1)

text = text.replace(
    'See [`docs/PRIVACY.md`](docs/PRIVACY.md) for V2-8 lock, preview masking, notification redaction, local-trace cleanup, and the privacy/security boundary.',
    'See [`docs/PRIVACY.md`](docs/PRIVACY.md) for V2-8/V3.8 lock, preview masking, privacy-mode search suppression, notification redaction, local-trace cleanup, and the privacy/security boundary.',
    1,
)
readme.write_text(text)

privacy = Path('docs/PRIVACY.md')
doc = privacy.read_text()
doc = doc.replace('# V2-8 Privacy Enhancements', '# V2-8 Privacy Enhancements + V3.8 UX Polish', 1)
marker = '## Deliberate exclusions\n'
section = """## V3.8 privacy and security UX polish

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

"""
if '## V3.8 privacy and security UX polish' not in doc:
    if marker not in doc:
        raise SystemExit('PRIVACY.md deliberate exclusions marker changed.')
    doc = doc.replace(marker, section + marker, 1)
privacy.write_text(doc)

e2e = Path('e2e/privacy.spec.ts')
e2e_text = e2e.read_text().replace(
    '1 of 3 passive privacy controls are on', '1 of 3 passive privacy controls is on'
)
e2e.write_text(e2e_text)
