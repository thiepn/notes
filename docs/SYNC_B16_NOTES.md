# Notes B16 — Source-native recovery history

Settings → Account & sync → Recover this Notes workspace includes a bounded, in-memory, owner-scoped incident list. Each real UI action records the original SyncProvider status, device/Core-consent revision and last native confirmed cloud-sync time. Core grant enable/revoke, recovery inspection, native retry requested and original BackupWorkspace opened are separately distinguished. A request or backup-page navigation is never counted as a successful native sync or export.

The original Notes SyncProvider and BackupWorkspace continue to own data, rich notes, attachments, cloud writes, backup export/import and native results. There is no second sync engine, shared Core data writer or new persistent content store.

Local browser and synthetic witnesses cannot establish externally independent ciphertext custody, signer/root control, true offsite retention/deletion or two-device authenticated Account continuity. These remain NOT_TESTED / NO_GO. No real Account data, merges, migrations, deployment or billing changes.
