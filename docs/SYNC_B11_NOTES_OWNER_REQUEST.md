# B11 Notes owner-controlled Core request handoff

Source-only B10 child. Notes remains the sole native cloud sync and rich v2/DB3 data authority. This phase introduces an actual request lifecycle around the existing SyncProvider: the owner and per-device Core coordination consent are read before and after calling native syncNow, a second overlapping Core request is denied, and revocation or identity switching during the request returns `revoked-during-request`. It never falsely reports a completed remote commit when the native SyncProvider merely accepted a request.

Settings now distinguishes accepted request, denied, busy and consent-revoked mid-flight, while native Notes status, conflict-copy protection and private cloud continue to be displayed by the original UI. The per-owner grant still defaults off and can be revoked without stopping Notes' original 15-second foreground sync.

No remote grant, tokens, app-owned records, migrations, deployments or production writes.
