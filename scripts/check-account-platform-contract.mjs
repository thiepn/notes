import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

const root = process.cwd();
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');
const fail = (message) => {
  console.error(`A5 NOTES ACCOUNT PLATFORM FAIL: ${message}`);
  process.exitCode = 1;
};
const check = (condition, message) => {
  if (!condition) fail(message);
};

const adapter = read('src/features/sync/thiepnAccountPlatform.ts');
const supabase = read('src/features/sync/supabaseApi.ts');
const provider = read('src/features/sync/SyncProvider.tsx');
const packageJson = JSON.parse(read('package.json'));

check(
  adapter.includes("THIEPN_ACCOUNT_SDK_VERSION = '1.2.0'"),
  'Account SDK must remain pinned to 1.2.0 for this cutover.',
);
check(
  adapter.includes("THIEPN_ACCOUNT_PLATFORM_VERSION = '1.0.0'"),
  'Platform contract must remain 1.0.0.',
);
check(
  adapter.includes("'124221f39a932d50f9a86ad5c3da2d8fd1fe50af'"),
  'Certified A4 source SHA pin changed.',
);
check(adapter.includes("NOTES_PLATFORM_APP_ID = 'notes'"), 'Notes platform app id changed.');
check(
  adapter.includes("THIEPN_ACCOUNT_SESSION_KEY = 'sb-hycegznamzjhwinegaai-auth-token'"),
  'Canonical account session key changed.',
);
check(adapter.includes('recordNotesAccountActivity'), 'A4 app activity adapter missing.');
check(adapter.includes('getNotesAccountHandoffState'), 'A3 MFA account handoff state missing.');

check(
  supabase.includes("from './thiepnAccountPlatform'"),
  'supabaseApi is not delegated to the shared account adapter.',
);
check(
  supabase.includes('readAccountPlatformSession(LEGACY_NOTES_SESSION_STORAGE_KEY)'),
  'stored session reads are not delegated.',
);
check(
  supabase.includes('storeAccountPlatformSession(session, LEGACY_NOTES_SESSION_STORAGE_KEY)'),
  'stored session writes are not delegated.',
);
check(
  supabase.includes('signInAccountWithPassword(email, password)'),
  'password sign-in is not delegated.',
);
check(supabase.includes('refreshAccountPlatformSession(session)'), 'refresh is not delegated.');
check(
  supabase.includes('signOutAccountPlatformSession(session)'),
  'local sign-out is not delegated.',
);
check(
  supabase.includes('const refreshRequests = new Map<string, Promise<SupabaseSession>>()'),
  'refresh-token request coalescing was removed.',
);
check(
  supabase.includes('void recordNotesAccountActivity(session);'),
  'real signed-in Notes usage no longer records ecosystem activity.',
);

// Guard the mature Notes data engine against accidental account-platform scope creep.
for (const required of [
  'hasNotesSyncAccess',
  'claimNotesSyncAccess',
  'listRemoteRecords',
  'upsertRemoteRecord',
  'uploadAttachment',
  'downloadAttachment',
  'deleteAttachmentObject',
]) {
  check(
    supabase.includes(`function ${required}`) ||
      supabase.includes(`function ${required}(`) ||
      supabase.includes(`async function ${required}`) ||
      supabase.includes(`async function ${required}(`),
    `${required} disappeared during account cutover.`,
  );
}
check(
  provider.includes('const AUTO_SYNC_MS = 15_000;'),
  'Notes auto-sync cadence changed during account cutover.',
);
check(
  provider.includes("window.addEventListener('online', handleOnline)"),
  'offline reconnect behavior changed.',
);
check(
  provider.includes("window.addEventListener('focus', handleFocus)"),
  'focus reconnect behavior changed.',
);

check(
  packageJson.scripts['account-platform:contract'] ===
    'node scripts/check-account-platform-contract.mjs',
  'permanent account-platform contract command missing.',
);
check(
  packageJson.scripts['release:check']?.includes('account-platform:contract'),
  'Notes release check does not include the A5 contract.',
);

for (const [file, content] of [
  ['thiepnAccountPlatform.ts', adapter],
  ['supabaseApi.ts', supabase],
]) {
  check(!/service[_-]?role/i.test(content), `${file} contains a service-role reference.`);
  check(!/sb_secret_/i.test(content), `${file} contains a secret Supabase key.`);
}

if (!process.exitCode) console.log('A5 Notes THIEPN Account platform contract: PASS');
