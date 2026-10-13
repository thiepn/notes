import type { SyncStatus } from './SyncContext';

export interface NotesNativeHandoff {
  format: 'thiepn.notes.native-recovery-handoff';
  version: 1;
  ownerId: string;
  createdAt: number;
  nativeStatus: SyncStatus;
  lastConfirmedNativeSync: number | null;
  manualBackupRecordedAt: number | null;
  /** Device-local BackupWorkspace marker may belong to a previous account. */
  backupOwnership: 'device-local-unattributed';
  coreDeviceRevision: number | null;
  nativeImport: 'NOT_PERFORMED';
  externalCustody: 'NOT_TESTED';
}

const ownerPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const statuses: SyncStatus[] = [
  'local',
  'connecting',
  'setup',
  'recovery',
  'syncing',
  'pending',
  'synced',
  'offline',
  'error',
];

/**
 * An owner-initiated metadata-only handoff, NOT a Notes backup, provider
 * receipt, authorization grant or synchronization confirmation.
 * Never include note titles, contents, attachments or credentials.
 */
export function createNotesNativeHandoff(
  input: {
    ownerId: string;
    nativeStatus: SyncStatus;
    lastConfirmedNativeSync: number | null;
    manualBackupRecordedAt: number | null;
    coreDeviceRevision: number | null;
  },
  now: number,
): NotesNativeHandoff {
  if (
    !ownerPattern.test(input.ownerId) ||
    !Number.isSafeInteger(now) ||
    now < 0 ||
    (input.lastConfirmedNativeSync !== null &&
      (!Number.isSafeInteger(input.lastConfirmedNativeSync) ||
        input.lastConfirmedNativeSync > now)) ||
    (input.manualBackupRecordedAt !== null &&
      (!Number.isSafeInteger(input.manualBackupRecordedAt) ||
        input.manualBackupRecordedAt > now)) ||
    (input.coreDeviceRevision !== null &&
      (!Number.isSafeInteger(input.coreDeviceRevision) || input.coreDeviceRevision < 1))
  )
    throw new Error('B17_NOTES_INVALID_NATIVE_SNAPSHOT');
  return {
    format: 'thiepn.notes.native-recovery-handoff',
    version: 1,
    ownerId: input.ownerId,
    createdAt: now,
    nativeStatus: input.nativeStatus,
    lastConfirmedNativeSync: input.lastConfirmedNativeSync,
    manualBackupRecordedAt: input.manualBackupRecordedAt,
    backupOwnership: 'device-local-unattributed',
    coreDeviceRevision: input.coreDeviceRevision,
    nativeImport: 'NOT_PERFORMED',
    externalCustody: 'NOT_TESTED',
  };
}

export function inspectNotesNativeHandoff(raw: string, expectedOwner: string, now: number) {
  if (raw.length > 4096 || !ownerPattern.test(expectedOwner) || !Number.isSafeInteger(now))
    return { status: 'invalid' as const, action: 'Use a valid native Notes device summary.' };
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return { status: 'invalid' as const, action: 'The summary is not valid JSON.' };
  }
  if (!parsed || Array.isArray(parsed) || typeof parsed !== 'object')
    return { status: 'invalid' as const, action: 'The summary format is invalid.' };
  const value = parsed as Partial<NotesNativeHandoff>;
  if (
    value.format !== 'thiepn.notes.native-recovery-handoff' ||
    value.version !== 1 ||
    !ownerPattern.test(value.ownerId ?? '') ||
    !statuses.includes(value.nativeStatus as SyncStatus) ||
    value.externalCustody !== 'NOT_TESTED' ||
    value.nativeImport !== 'NOT_PERFORMED' ||
    value.backupOwnership !== 'device-local-unattributed' ||
    !Number.isSafeInteger(value.createdAt) ||
    value.createdAt! < 0 ||
    value.createdAt! > now + 300_000 ||
    (value.lastConfirmedNativeSync !== null &&
      (!Number.isSafeInteger(value.lastConfirmedNativeSync) ||
        value.lastConfirmedNativeSync! > value.createdAt!)) ||
    (value.manualBackupRecordedAt !== null &&
      (!Number.isSafeInteger(value.manualBackupRecordedAt) ||
        value.manualBackupRecordedAt! > value.createdAt!)) ||
    (value.coreDeviceRevision !== null &&
      (!Number.isSafeInteger(value.coreDeviceRevision) || value.coreDeviceRevision! < 1))
  )
    return {
      status: 'invalid' as const,
      action: 'The summary contains inconsistent native metadata.',
    };
  if (value.ownerId !== expectedOwner)
    return {
      status: 'owner-mismatch' as const,
      action: 'This summary belongs to a different Account. Do not use it for Notes recovery.',
    };
  if (now - value.createdAt! > 86_400_000)
    return {
      status: 'stale' as const,
      action: 'The other device summary is older than 24 hours. Export a fresh summary from Notes.',
    };
  if (value.nativeStatus !== 'synced' || value.lastConfirmedNativeSync === null)
    return {
      status: 'unconfirmed' as const,
      action:
        'The other device did not report a confirmed native cloud sync. Keep original backups and inspect SyncProvider.',
    };
  return {
    status: 'candidate' as const,
    action:
      'Same-owner device reports a native sync checkpoint. This unsigned file is not proof of identical Notes data, remote durability or independent custody. Recheck original Notes SyncProvider and BackupWorkspace.',
  };
}
