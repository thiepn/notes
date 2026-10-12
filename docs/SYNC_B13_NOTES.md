# Notes B13 — native recovery and device grant rotation

Stacked from B12 Notes draft `fd96c40cf5dc52555c887b7a9a4493a6fa034f32`. Settings → Account & sync now has a direct **Open native backup & restore** button, using the existing `SettingsDialog.onOpenBackup` handler and actual Notes BackupWorkspace. Native 8-collection JSON, attachment digest validations, transactional restore confirmation and Supabase ownership remain exclusively in Notes.

The separate default-off per-owner/per-device Core coordination grant now carries a monotonic revision. A Core-requested native `syncNow()` captures and rechecks its revision, Account owner and Notes workspace state after completion. Revocation then reconsent cannot reauthorize a request started under the old revision. Old B12 grants remain readable with legacy revision 1; a new toggle rotates them.

No automatic Core offsite upload, second Notes sync engine, exposure of tokens/records, production Account grant or hosted external checkpoint authority. The Core synthetic transfer kit is not installed into the native Notes importer.
