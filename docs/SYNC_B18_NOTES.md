# B18 original Notes session/device recovery

SyncProvider now fences in-flight native sync work when cross-tab storage changes credentials, including a same-owner external token rotation. The original provider's epoch is advanced before accepting the replacement session, stale confirmation and prior owner's last-sync timestamps are cleared, and a new request waits for the old operation to finish before starting a new original sync. The existing SyncProvider remains the only cloud writer and handles all actual storage.

The original Settings comparison now distinguishes a remote unsigned "synced" claim against a local unconfirmed device from two devices with separate sync claims. It does not call those timestamps equal records, independent ciphertext custody, or successful restore. BackupWorkspace continues to own actual backup export/import; its device-local marker remains unattributed to owners.

B17 Notes focused + Chromium passed. B18 needs actual focused Vitest, TypeScript, lint and synthetic guest Chromium checks. Authenticated two-device conflict replay, real Account RLS, external custodian receipts and physical restoration remain NOT_TESTED/NO_GO. No migrations, production data, credentials or release.
