import type { SyncStatus } from './SyncContext';
export interface NotesRecoveryState {
  ownerId: string | null;
  accessGranted: boolean;
  recoveryMode: boolean;
  status: SyncStatus;
  lastSyncedAt: number | null;
  coreConsent: boolean;
}
export interface NotesRecoveryFinding {
  state: 'local-only' | 'workspace-required' | 'password-recovery' |
    'offline' | 'needs-attention' | 'pending' | 'ready';
  action: string;
  coreScope: 'allowed-on-device' | 'not-authorized';
  isOffsiteCertified: false;
}
export function inspectNotesNativeRecovery(s: NotesRecoveryState): NotesRecoveryFinding {
  let state: NotesRecoveryFinding['state'];
  let action: string;
  if (!s.ownerId) {
    state='local-only';
    action='Notes remain locally accessible. Export a native backup before changing devices. Sign in only if you want original Notes cloud sync.';
  } else if (s.recoveryMode || s.status === 'recovery') {
    state='password-recovery';
    action='Finish original Notes password recovery before requesting synchronization. Native backup remains separately accessible.';
  } else if (!s.accessGranted || s.status === 'setup') {
    state='workspace-required';
    action='Claim and authorize the original Notes private workspace first; Core permission does not grant native Notes access.';
  } else if (s.status === 'offline') {
    state='offline';
    action='Local Notes are available. Export a native backup; reconnect and retry with Notes Sync now.';
  } else if (s.status === 'error') {
    state='needs-attention';
    action='Native Notes reported a sync error. Preserve local data, inspect its status and export a backup before retrying.';
  } else if (s.status === 'pending' || s.status === 'connecting' || s.status === 'syncing') {
    state='pending';
    action='Notes synchronization has not been confirmed. Do not interpret a Core request as cloud success. Check the original native status.';
  } else {
    state='ready';
    action=s.lastSyncedAt
      ? 'Native Notes has a previous confirmed sync time. Verify the other device and export a native backup for independent recovery.'
      : 'No confirmed native Notes sync on this device yet. Use Notes Sync now and keep a local backup.';
  }
  return {state,action,coreScope:s.coreConsent && s.ownerId && s.accessGranted
    ? 'allowed-on-device' : 'not-authorized',isOffsiteCertified:false};
}
