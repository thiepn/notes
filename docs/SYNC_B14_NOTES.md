# Notes B14 native consent exit and visible recovery

Parent Notes B13 draft exact `0a451ed0a161b0e25320c55bfd6615280393da2f`.

Notes Account & sync exposes the current **local** Core permission revision and an explicit immediate revocation control. Account exit (local or everywhere) and Notes cloud deletion/account deletion revoke and rotate the Core request grant _before_ the native action proceeds; original account/session and Supabase engines remain authoritative. Native Notes backup/import remains directly accessible through the B13 handoff and original BackupWorkspace; no Core-owned Notes row or binary attachment transport exists.

The local device receipt is only a UI observation, **not** independently operated signer/proof. Signed-in Account data, original sync status, confirmed sync timing and server deletion receipts are not exposed to Core. No live rollout, migration, credentials or production writes. Focused synthetic owner-revision and guest Chromium checks must qualify the source.
