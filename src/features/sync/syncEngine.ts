import { dispatchAppEvent } from '../../app/events';
import { notesDatabase, RevisionsRepository } from '../../db';
import {
  attachmentRecordSchema,
  noteRecordSchema,
  checklistItemRecordSchema,
  labelRecordSchema,
  noteLabelRecordSchema,
  reminderRecordSchema,
  revisionRecordSchema,
} from '../../db/validation';
import {
  immutableAttachmentStoragePath,
  isSupportedAttachmentStoragePath,
  sha256Blob,
  uploadImmutableAttachment,
} from './attachmentStorage';
import { preserveSyncConflictCopy, type ConflictCopySource } from './conflictPreservation';
import { acknowledgedShadow, type SyncShadow } from './syncState';
import type { AttachmentRecord } from '../../db';
import {
  deleteAttachmentObject,
  downloadAttachment,
  type SupabaseSession,
  type SyncEntityType,
} from './supabaseApi';
import {
  listVersionedRemoteRecords,
  SyncWriteConflictError,
  type VersionedRemoteSyncRecord,
  writeVersionedRemoteRecord,
} from './versionedSyncApi';

const SYNC_SHADOW_KEY = 'sync.supabase.shadow.v2';
const MAX_CAS_RECONCILIATION_ROUNDS = 3;

interface LocalEntity {
  key: string;
  type: SyncEntityType;
  id: string;
  payload: Record<string, unknown>;
  hash: string;
  updatedAt: number;
  attachment?: AttachmentRecord;
}

export interface SyncResult {
  uploaded: number;
  downloaded: number;
  deletedRemote: number;
  deletedLocal: number;
  conflicts: number;
  conflictCopies: number;
  failed: number;
  deferred: number;
}

export async function synchronizeNotes(
  session: SupabaseSession,
  isCurrent: () => boolean = () => true,
): Promise<SyncResult> {
  if (navigator.locks)
    return navigator.locks.request(`notes-sync:${session.user.id}`, () =>
      synchronizeUnlocked(session, isCurrent),
    );
  return synchronizeUnlocked(session, isCurrent);
}

async function synchronizeUnlocked(
  session: SupabaseSession,
  isCurrent: () => boolean,
): Promise<SyncResult> {
  if (!isCurrent()) throw new Error('Sync cancelled because the account changed.');
  const result: SyncResult = {
    uploaded: 0,
    downloaded: 0,
    deletedRemote: 0,
    deletedLocal: 0,
    conflicts: 0,
    conflictCopies: 0,
    failed: 0,
    deferred: 0,
  };
  const failedKeys = new Set<string>();
  const shadow = await readShadow(session.user.id);

  for (let round = 0; round < MAX_CAS_RECONCILIATION_ROUNDS; round += 1) {
    if (!isCurrent()) throw new Error('Sync cancelled because the account changed.');

    // Every retry round begins from a newly observed remote snapshot. A rejected write is never
    // replayed blindly: the decision is recomputed against the current server version and local state.
    const remoteRecords = await listVersionedRemoteRecords(session);
    const localEntities = await buildLocalSnapshot(session.user.id, remoteRecords);
    const localByKey = new Map(localEntities.map((entity) => [entity.key, entity]));
    const remoteByKey = new Map(remoteRecords.map((record) => [recordKey(record), record]));
    const keys = new Set([...localByKey.keys(), ...remoteByKey.keys(), ...Object.keys(shadow)]);
    const casKeys = new Set<string>();
    const blockedNoteIds = new Set<string>();
    const blockedKeys = new Set<string>();

    for (const key of [...keys].sort(compareSyncKeys)) {
      if (failedKeys.has(key)) continue;
      const local = localByKey.get(key);
      const remote = remoteByKey.get(key);
      const previous = shadow[key];
      if (!isCurrent()) throw new Error('Sync cancelled because the account changed.');

      const noteId = noteIdFor(local, remote);
      const isNoteEntity = local?.type === 'note' || remote?.entity_type === 'note';
      if (typeof noteId === 'string' && blockedNoteIds.has(noteId) && !isNoteEntity) {
        blockedKeys.add(key);
        continue;
      }
      if (typeof noteId === 'string' && isNoteBeingEdited(noteId)) {
        failedKeys.add(key);
        result.deferred += 1;
        continue;
      }

      try {
        await reconcileObserved(session, local, remote, previous, remoteRecords, result);
      } catch (error) {
        if (error instanceof SyncWriteConflictError) {
          casKeys.add(key);
          if (typeof noteId === 'string' && isNoteEntity) blockedNoteIds.add(noteId);
          result.conflicts += 1;
          continue;
        }
        failedKeys.add(key);
        console.error(`Notes sync could not reconcile ${key}.`, error);
        result.failed += 1;
      }
    }

    if (casKeys.size === 0) break;
    if (round === MAX_CAS_RECONCILIATION_ROUNDS - 1) {
      for (const key of new Set([...casKeys, ...blockedKeys])) {
        if (failedKeys.has(key)) continue;
        failedKeys.add(key);
        result.deferred += 1;
      }
    }
  }

  const finalRemote = await listVersionedRemoteRecords(session);
  const finalLocal = await buildLocalSnapshot(session.user.id, finalRemote);
  if (!isCurrent()) throw new Error('Sync cancelled because the account changed.');
  const observed = createShadow(finalLocal, finalRemote);
  for (const [key, entry] of Object.entries(observed)) {
    const agrees =
      entry.localHash === entry.remoteHash ||
      (entry.localHash === null && entry.remoteHash?.startsWith('deleted:'));
    if (!agrees && !failedKeys.has(key)) result.deferred += 1;
  }
  const nextShadow = acknowledgedShadow(observed, shadow, failedKeys);
  await writeShadow(session.user.id, nextShadow);

  if (result.downloaded > 0 || result.deletedLocal > 0 || result.conflictCopies > 0) {
    dispatchAppEvent('cloudSyncApplied');
  }
  return result;
}

async function reconcileObserved(
  session: SupabaseSession,
  local: LocalEntity | undefined,
  remote: VersionedRemoteSyncRecord | undefined,
  previous: SyncShadow[string] | undefined,
  remoteRecords: VersionedRemoteSyncRecord[],
  result: SyncResult,
): Promise<void> {
  // A later CAS round re-observes writes that already succeeded earlier in this synchronization.
  // Treat already-converged state as settled even though the pre-sync shadow is intentionally unchanged.
  if (local && remote?.deleted_at === null && local.hash === remote.payload_hash) return;
  if (!local && (!remote || remote.deleted_at !== null)) return;

  if (!previous) {
    await reconcileInitial(session, local, remote, remoteRecords, result);
    return;
  }

  const localSignature = local?.hash ?? null;
  const remoteSignature = remote ? signatureForRemote(remote) : null;
  const localChanged = localSignature !== previous.localHash;
  const remoteChanged = remoteSignature !== previous.remoteHash;
  if (!localChanged && !remoteChanged) return;

  if (localChanged && !remoteChanged) {
    if (local) {
      await pushLocal(session, local, remote?.version ?? null);
      result.uploaded += 1;
    } else if (remote && remote.deleted_at === null) {
      await tombstoneRemote(session, remote);
      result.deletedRemote += 1;
    }
    return;
  }

  if (!localChanged && remoteChanged) {
    if (!remote) {
      if (local) {
        await pushLocal(session, local, null);
        result.uploaded += 1;
      }
    } else if (remote.deleted_at !== null) {
      if (local) {
        await deleteLocalEntity(local.type, local.id);
        result.deletedLocal += 1;
      }
    } else {
      await applyRemote(session, remote);
      result.downloaded += 1;
    }
    return;
  }

  result.conflicts += 1;
  await resolveConcurrentChange(session, local, remote, remoteRecords, result);
}

async function reconcileInitial(
  session: SupabaseSession,
  local: LocalEntity | undefined,
  remote: VersionedRemoteSyncRecord | undefined,
  remoteRecords: VersionedRemoteSyncRecord[],
  result: SyncResult,
): Promise<void> {
  if (local && !remote) {
    await pushLocal(session, local, null);
    result.uploaded += 1;
    return;
  }
  if (!local && remote?.deleted_at === null) {
    await applyRemote(session, remote);
    result.downloaded += 1;
    return;
  }
  if (!local || !remote) return;

  if (remote.deleted_at !== null) {
    if (local.updatedAt > remote.client_updated_at) {
      await pushLocal(session, local, remote.version);
      result.uploaded += 1;
    } else {
      await deleteLocalEntity(local.type, local.id);
      result.deletedLocal += 1;
    }
    return;
  }

  if (local.hash === remote.payload_hash) return;
  result.conflicts += 1;
  const localWins = local.updatedAt > remote.client_updated_at;
  await preserveNoteConflict(
    session.user.id,
    local,
    remote,
    remoteRecords,
    localWins ? 'cloud' : 'this-device',
    result,
  );
  if (localWins) {
    await pushLocal(session, local, remote.version);
    result.uploaded += 1;
  } else {
    await applyRemote(session, remote);
    result.downloaded += 1;
  }
}

async function resolveConcurrentChange(
  session: SupabaseSession,
  local: LocalEntity | undefined,
  remote: VersionedRemoteSyncRecord | undefined,
  remoteRecords: VersionedRemoteSyncRecord[],
  result: SyncResult,
): Promise<void> {
  // When one side deleted while the other side changed, preserve the surviving content.
  // This intentionally favors recovery over destructive conflict resolution.
  if (!local && remote?.deleted_at === null) {
    await applyRemote(session, remote);
    result.downloaded += 1;
    return;
  }
  if (local && (!remote || remote.deleted_at !== null)) {
    await pushLocal(session, local, remote?.version ?? null);
    result.uploaded += 1;
    return;
  }
  if (!local || !remote || remote.deleted_at !== null) return;

  const localWins = local.updatedAt > remote.client_updated_at;
  await preserveNoteConflict(
    session.user.id,
    local,
    remote,
    remoteRecords,
    localWins ? 'cloud' : 'this-device',
    result,
  );
  if (localWins) {
    await pushLocal(session, local, remote.version);
    result.uploaded += 1;
  } else {
    await applyRemote(session, remote);
    result.downloaded += 1;
  }
}

async function preserveNoteConflict(
  userId: string,
  local: LocalEntity,
  remote: VersionedRemoteSyncRecord,
  remoteRecords: VersionedRemoteSyncRecord[],
  source: ConflictCopySource,
  result: SyncResult,
): Promise<void> {
  if (local.type !== 'note' || remote.entity_type !== 'note') return;
  await preserveSyncConflictCopy({
    noteId: local.id,
    source,
    expectedUserId: userId,
    remoteNote: remote,
    remoteRecords,
  });
  result.conflictCopies += 1;
}

async function pushLocal(
  session: SupabaseSession,
  local: LocalEntity,
  expectedVersion: number | null,
): Promise<void> {
  let payload = local.payload;
  if (local.type === 'attachment' && local.attachment) {
    const storagePath = await uploadImmutableAttachment(
      session,
      local.attachment.id,
      local.attachment.checksum,
      local.attachment.data,
    );
    payload = { ...payload, storagePath };
  }

  const payloadHash = await hashPayload(payload);
  await writeVersionedRemoteRecord(
    session,
    {
      user_id: session.user.id,
      entity_type: local.type,
      entity_id: local.id,
      payload,
      payload_hash: payloadHash,
      client_updated_at: local.updatedAt,
      deleted_at: null,
    },
    expectedVersion,
  );
}

async function tombstoneRemote(
  session: SupabaseSession,
  remote: VersionedRemoteSyncRecord,
): Promise<void> {
  const timestamp = Date.now();
  await writeVersionedRemoteRecord(
    session,
    {
      user_id: session.user.id,
      entity_type: remote.entity_type,
      entity_id: remote.entity_id,
      payload: null,
      payload_hash: null,
      client_updated_at: timestamp,
      deleted_at: timestamp,
    },
    remote.version,
  );

  // Metadata CAS is authoritative. Binary cleanup happens only after it succeeds and only for a
  // path that belongs to this exact attachment identity/content generation.
  if (remote.entity_type === 'attachment' && remote.payload) {
    const storagePath = remote.payload.storagePath;
    const checksum = remote.payload.checksum;
    if (
      typeof storagePath === 'string' &&
      typeof checksum === 'string' &&
      isSupportedAttachmentStoragePath(session.user.id, remote.entity_id, checksum, storagePath)
    ) {
      try {
        await deleteAttachmentObject(session, storagePath);
      } catch (error) {
        // The database tombstone is authoritative; a failed binary cleanup can be retried manually.
        console.warn('A deleted attachment object could not be removed from cloud storage.', error);
      }
    }
  }
}

async function applyRemote(
  session: SupabaseSession,
  remote: VersionedRemoteSyncRecord,
): Promise<void> {
  if (!remote.payload) return;
  const payload = remote.payload;
  if (remote.user_id !== session.user.id)
    throw new Error('Cloud record belongs to a different account.');
  const payloadId =
    remote.entity_type === 'note_label' ? `${payload.noteId}::${payload.labelId}` : payload.id;
  if (payloadId !== remote.entity_id)
    throw new Error('Cloud record identity does not match its payload.');
  if ((await hashPayload(payload)) !== remote.payload_hash)
    throw new Error('Cloud record checksum failed. Local data was kept.');

  switch (remote.entity_type) {
    case 'note': {
      const valid = noteRecordSchema.parse(payload);
      const previous = await notesDatabase.notes.get(valid.id);
      if (
        previous &&
        (previous.title !== valid.title ||
          previous.content !== valid.content ||
          previous.type !== valid.type)
      ) {
        await new RevisionsRepository(notesDatabase).checkpoint(valid.id, 'edit');
      }
      if (valid.type !== 'checklist') {
        await notesDatabase.checklistItems.where('noteId').equals(valid.id).delete();
      }
      await notesDatabase.notes.put(valid);
      return;
    }

    case 'checklist_item':
      await notesDatabase.checklistItems.put(checklistItemRecordSchema.parse(payload));
      return;
    case 'label':
      await notesDatabase.labels.put(labelRecordSchema.parse(payload));
      return;
    case 'note_label':
      await notesDatabase.noteLabels.put(noteLabelRecordSchema.parse(payload));
      return;
    case 'reminder':
      await notesDatabase.reminders.put(reminderRecordSchema.parse(payload));
      return;
    case 'revision':
      await notesDatabase.revisions.put(revisionRecordSchema.parse(payload));
      return;
    case 'attachment': {
      const storagePath = payload.storagePath;
      const checksum = payload.checksum;
      if (
        typeof storagePath !== 'string' ||
        typeof checksum !== 'string' ||
        !isSupportedAttachmentStoragePath(session.user.id, remote.entity_id, checksum, storagePath)
      ) {
        throw new Error('Cloud attachment has an invalid storage path.');
      }
      const data = await downloadAttachment(session, storagePath);
      const { storagePath: _storagePath, ...metadata } = payload;
      void _storagePath;
      const attachment = attachmentRecordSchema.parse({ ...metadata, data });
      if (data.size !== attachment.size)
        throw new Error('Cloud attachment size did not match. Please retry.');
      if ((await sha256Blob(data)) !== attachment.checksum) {
        throw new Error('Cloud attachment bytes failed checksum validation. Local data was kept.');
      }
      await notesDatabase.attachments.put(attachment);
      return;
    }
  }
}

async function deleteLocalEntity(type: SyncEntityType, id: string): Promise<void> {
  switch (type) {
    case 'note':
      await notesDatabase.notes.delete(id);
      return;
    case 'checklist_item':
      await notesDatabase.checklistItems.delete(id);
      return;
    case 'label':
      await notesDatabase.labels.delete(id);
      return;
    case 'note_label': {
      const [noteId, labelId] = splitCompositeId(id);
      await notesDatabase.noteLabels.delete([noteId, labelId]);
      return;
    }
    case 'attachment':
      await notesDatabase.attachments.delete(id);
      return;
    case 'reminder':
      await notesDatabase.reminders.delete(id);
      return;
    case 'revision':
      await notesDatabase.revisions.delete(id);
      return;
  }
}

async function buildLocalSnapshot(
  userId: string,
  remoteRecords: VersionedRemoteSyncRecord[],
): Promise<LocalEntity[]> {
  const [notes, checklistItems, labels, noteLabels, attachments, reminders, revisions] =
    await Promise.all([
      notesDatabase.notes.toArray(),
      notesDatabase.checklistItems.toArray(),
      notesDatabase.labels.toArray(),
      notesDatabase.noteLabels.toArray(),
      notesDatabase.attachments.toArray(),
      notesDatabase.reminders.toArray(),
      notesDatabase.revisions.toArray(),
    ]);

  const remoteAttachments = new Map(
    remoteRecords
      .filter((record) => record.entity_type === 'attachment' && record.deleted_at === null)
      .map((record) => [record.entity_id, record]),
  );
  const entities: LocalEntity[] = [];
  for (const note of notes) entities.push(await entity('note', note.id, note, note.updatedAt));
  for (const item of checklistItems)
    entities.push(await entity('checklist_item', item.id, item, item.updatedAt));
  for (const label of labels)
    entities.push(await entity('label', label.id, label, label.updatedAt));
  for (const link of noteLabels) {
    const id = compositeId(link.noteId, link.labelId);
    entities.push(await entity('note_label', id, link, link.assignedAt));
  }
  for (const attachment of attachments) {
    const remote = remoteAttachments.get(attachment.id);
    const remotePath = remote?.payload?.storagePath;
    const remoteChecksum = remote?.payload?.checksum;
    const storagePath =
      typeof remotePath === 'string' &&
      remoteChecksum === attachment.checksum &&
      isSupportedAttachmentStoragePath(userId, attachment.id, attachment.checksum, remotePath)
        ? remotePath
        : immutableAttachmentStoragePath(userId, attachment.id, attachment.checksum);
    const payload = {
      id: attachment.id,
      noteId: attachment.noteId,
      name: attachment.name,
      mimeType: attachment.mimeType,
      size: attachment.size,
      checksum: attachment.checksum,
      createdAt: attachment.createdAt,
      storagePath,
    };
    entities.push({
      ...(await entity('attachment', attachment.id, payload, attachment.createdAt)),
      attachment,
    });
  }
  for (const reminder of reminders)
    entities.push(await entity('reminder', reminder.id, reminder, reminder.updatedAt));
  for (const revision of revisions)
    entities.push(await entity('revision', revision.id, revision, revision.createdAt));
  return entities;
}

async function entity(
  type: SyncEntityType,
  id: string,
  payload: object,
  updatedAt: number,
): Promise<LocalEntity> {
  const normalized = payload as Record<string, unknown>;
  return {
    key: entityKey(type, id),
    type,
    id,
    payload: normalized,
    hash: await hashPayload(normalized),
    updatedAt,
  };
}

function createShadow(local: LocalEntity[], remote: VersionedRemoteSyncRecord[]): SyncShadow {
  const localMap = new Map(local.map((item) => [item.key, item]));
  const remoteMap = new Map(remote.map((item) => [recordKey(item), item]));
  const keys = new Set([...localMap.keys(), ...remoteMap.keys()]);
  const shadow: SyncShadow = {};
  for (const key of keys) {
    const remoteRecord = remoteMap.get(key);
    shadow[key] = {
      localHash: localMap.get(key)?.hash ?? null,
      remoteHash: remoteRecord ? signatureForRemote(remoteRecord) : null,
      remoteVersion: remoteRecord?.version ?? null,
    };
  }
  return shadow;
}

async function readShadow(userId: string): Promise<SyncShadow> {
  const setting = await notesDatabase.settings.get(`${SYNC_SHADOW_KEY}:${userId}`);
  if (!setting) return {};
  try {
    const parsed = JSON.parse(setting.value) as unknown;
    return parsed && typeof parsed === 'object' ? (parsed as SyncShadow) : {};
  } catch {
    return {};
  }
}

async function writeShadow(userId: string, shadow: SyncShadow): Promise<void> {
  await notesDatabase.settings.put({
    key: `${SYNC_SHADOW_KEY}:${userId}`,
    value: JSON.stringify(shadow),
    updatedAt: Date.now(),
  });
}

function noteIdFor(
  local: LocalEntity | undefined,
  remote: VersionedRemoteSyncRecord | undefined,
): string | undefined {
  const noteId =
    local?.type === 'note'
      ? local.id
      : remote?.entity_type === 'note'
        ? remote.entity_id
        : (local?.payload.noteId ?? remote?.payload?.noteId);
  return typeof noteId === 'string' ? noteId : undefined;
}

function isNoteBeingEdited(noteId: string): boolean {
  return Array.from(document.querySelectorAll<HTMLElement>('[data-editing-note]')).some(
    (node) => node.dataset.editingNote === noteId,
  );
}

function recordKey(record: Pick<VersionedRemoteSyncRecord, 'entity_type' | 'entity_id'>): string {
  return entityKey(record.entity_type, record.entity_id);
}

function entityKey(type: SyncEntityType, id: string): string {
  return `${type}:${id}`;
}

function signatureForRemote(record: VersionedRemoteSyncRecord): string {
  return record.deleted_at === null
    ? (record.payload_hash ?? 'missing-hash')
    : `deleted:${record.deleted_at}`;
}

function compositeId(noteId: string, labelId: string): string {
  return `${noteId}::${labelId}`;
}

function splitCompositeId(id: string): [string, string] {
  const separator = id.indexOf('::');
  if (separator < 0) throw new Error('Invalid synced note-label identifier.');
  return [id.slice(0, separator), id.slice(separator + 2)];
}

function compareSyncKeys(a: string, b: string): number {
  const order: Record<string, number> = {
    note: 0,
    label: 1,
    checklist_item: 2,
    note_label: 3,
    reminder: 4,
    revision: 5,
    attachment: 6,
  };
  const aType = a.slice(0, a.indexOf(':'));
  const bType = b.slice(0, b.indexOf(':'));
  return (order[aType] ?? 99) - (order[bType] ?? 99) || a.localeCompare(b);
}

async function hashPayload(payload: Record<string, unknown>): Promise<string> {
  const bytes = new TextEncoder().encode(stableStringify(payload));
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

function stableStringify(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`;
  const record = value as Record<string, unknown>;
  return `{${Object.keys(record)
    .sort()
    .map((key) => `${JSON.stringify(key)}:${stableStringify(record[key])}`)
    .join(',')}}`;
}
