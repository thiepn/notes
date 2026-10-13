# B25 — Original Notes device handoff and transactional restore readback

B25 continues from B22 Notes draft PR #91 and preserves its B1–B22 stack.
The original SyncProvider, original Supabase Account authority, original
BackupRepository, Dexie transactions, private attachment bytes and existing
explicit destructive-restore dialog remain authoritative.

## Native device handoff

The Account & sync device-switch workspace now checks the **actual** latest
SyncProvider result. Failed or deferred records, unresolved editor saves and
preserved conflict copies stop any claim that the other device is current.
Original Notes sync is retried only through its existing owner-authorized
action. The browser-local manual export marker is not called a verified file.

A user can download the original full JSON backup, choose the **saved** file,
validate its actual attachments and complete graph with
`BackupRepository.inspectBackup`, and then request **Compare saved backup
with this device**. The read-only comparison uses a fresh original Dexie
transactional export and checks all eight original categories: notes,
checklists, labels, note-label links, attachments, reminders, revisions and
portable settings. It sorts canonical record representations and verifies
attachment digest metadata after the original repository has validated actual
bytes. A difference in content is reported even when record counts match.
No private note text, attachment content or IDs leave the device or appear
in comparison messages.

## Exact original restore with post-write inspection

Restore still requires the original explicit confirmation and a new
pre-restore safety download request. B25 adds an in-component lock against
double submission, restores through the original transaction, then exports
the new local Notes snapshot and compares its eight collections with the
validated incoming document. A MATCHED result is a local post-write readback,
not proof of Account convergence or independent external backup retention.
A mismatch or unavailable readback is surfaced as a warning without falsely
claiming the transactional restore was rolled back. A failed UI refresh
after committed restore is reported distinctly from an unsuccessful write.
The optional backup comparison never imports, merges or silently changes data.

B25 unit tests cover changed note content with identical counts, attachment
checksum differences, revision history changes, owner/device authorization,
failed/deferred original sync and local export timestamps. Guest Chromium
exercises actual downloaded-file inspection, non-mutating comparison and
explicit original restore with post-write readback on disposable local data.
Live two-owner/account-cloud synchronization, physical Android and independently
operated external signer, monotonic checkpoint and ciphertext custody
remain NOT_TESTED. No production writes, migration or deployment.
