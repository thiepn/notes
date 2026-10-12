# B10 Notes owner-visible coordination control

Stacked on B9 Notes draft at `bbd42a38aae792f12e355b9f0020f4a952966693`. Native Notes SyncProvider and its 15-second foreground synchronization are unchanged. Settings adds an explicit, disabled-by-default **per-owner, per-device** Core coordination grant. The B9 request port now verifies the saved grant itself before delegating to the original sync engine; revocation blocks future Core requests but never disables native Notes sync. The UI displays the original Notes status, pending/error and last successful timestamp, and marks coordination as *requested*, not confirmed.

No tokens, native rich Notes records, attachments, authorization claims, or cloud backup credentials are exported. No production use without explicit integration and full acceptance. Offsite copy work remains separate from native Notes cloud sync.
