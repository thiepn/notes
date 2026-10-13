# B19 original Notes recovery

The original SyncProvider now scopes session-list reads to BOTH the native Account owner and credential epoch/access token before and after network calls, preventing old responses from replacing current device sessions after sign-out or same-owner cross-tab token rotation. Post-sync session list loads use the live original session token and check the epoch after awaiting original synchronization. The B18 in-flight fencing and its conservative original sync writer remain authoritative; Core receives no private Notes content.

The original native Notes Account & sync screen now shows concrete device-switch steps: inspect the original pending/conflict status, verify a real BackupWorkspace download before restoring, and request original sync on the new device. Its locally recorded backup timestamp remains explicitly unattributed, not owner-verified. B17/B18 device-summary compare remains unsigned, size-bounded and never a replacement for actual backup or sync.

External custody independent of the app, actual two authenticated devices, live database RLS and physical restoration NOT TESTED. No merge, production data or credentials.
