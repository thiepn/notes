# Notes B17 — Cross-device native recovery handoff

The original Notes Settings recovery view provides an owner-initiated, read-only **device continuity summary** and a comparer for the counterpart device. The JSON is bounded to 4096 characters on import and includes only Account owner ID, original SyncProvider status/last confirmed sync timestamp, original BackupWorkspace manual-backup timestamp if locally recorded, optional Core device-consent revision and explicit NOT_TESTED / NOT_PERFORMED claims. It contains no Notes content, rich-data/attachments, session token, credential, signer key or new progress writer.

Comparison is owner-scoped, freshness-bounded to 24 hours and deliberately **unsigned**. An apparently valid same-owner device summary is a **candidate observation**, not cryptographic proof of a matching cloud snapshot, offsite storage or external custodian. An owner mismatch, stale timestamp, unconfirmed pending/offline status or malformed claim stops qualification. Users continue through the original SyncProvider and BackupWorkspace for all actual sync, export/import and restore.

B16 focused source + disposable Chromium passed on #38321544086. Real authenticated two-device Notes, independently persisted external ciphertext, physical phone, provider durability and deletion receipts remain NOT_TESTED/NO_GO. No production or new authority.
