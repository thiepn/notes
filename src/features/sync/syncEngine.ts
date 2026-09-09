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
import { acknowledgedShadow, type SyncShadow } from './syncState';
import type { AttachmentRecord } from '../../db';
import {
  deleteAttachmentObject,
  downloadAttachment,
  listRemoteRecords,
  type RemoteSyncRecord,
  type SupabaseSession,
  type SyncEntityType,
  uploadAttachment,
  upsertRemoteRecord,
} from './supabaseApi';

const SYNC_SHADOW_KEY = 'sync.supabase.shadow.v2';

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
    failed: 0,
    deferred: 0,
  };
  const failedKeys = new Set<string>();

  const [localEntities, remoteRecords, shadow] = await Promise.all([
    buildLocalSnapshot(session.user.id),
    listRemoteRecords(session),
    readShadow(session.user.id),
  ]);

  const localByKey = new Map(localEntities.map((entity) => [entity.key, entity]));
  const remoteByKey = new Map(remoteRecords.map((record) => [recordKey(record), record]));
  const keys = new Set([...localByKey.keys(), ...remoteByKey.keys(), ...Object.keys(shadow)]);

  for (const key of [...keys].sort(compareSyncKeys)) {
    const local = localByKey.get(key);
    const remote = remoteByKey.get(key);
    const previous = shadow[key];
    if (!isCurrent()) throw new Error('Sync cancelled because the account changed.');
    const noteId =
      local?.type === 'note'
        ? local.id
        : remote?.entity_type === 'note'
          ? remote.entity_id
          : (local?.payload.noteId ?? remote?.payload?.noteId);
    if (
      typeof noteId === 'string' &&
      Array.from(document.querySelectorAll<HTMLElement>('[data-editing-note]')).some(
        (node) => node.dataset.editingNote === noteId,
      )
    ) {
      failedKeys.add(key);
      result.deferred += 1;
      continue;
    }
    const localSignature = local?.hash ?? null;
    const remoteSignature = remote ? signatureForRemote(remote) : null;

    try {
      if (!previous) {
        await reconcileInitial(session, local, remote, result);
        continue;
      }

      const localChanged = localSignature !== previous.localHash;
      const remoteChanged = remoteSignature !== previous.remoteHash;
      if (!localChanged && !remoteChanged) continue;

      if (localChanged && !remoteChanged) {
        if (local) {
          await pushLocal(session, local);
          result.uploaded += 1;
        } else if (remote && remote.deleted_at === null) {
          await tombstoneRemote(session, remote);
          result.deletedRemote += 1;
        }
        continue;
      }

      if (!localChanged && remoteChanged) {
        if (!remote) {
          if (local) {
            await pushLocal(session, local);
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
        continue;
      }

      result.conflicts += 1;
      await resolveConcurrentChange(session, local, remote, result);
    } catch (error) {
      // Keep the prior shadow for this key so a later sync retries it instead of silently accepting loss.
      failedKeys.add(key);
      console.error(`Notes sync could not reconcile ${key}.`, error);
      result.failed += 1;
    }
  }

  const [finalLocal, finalRemote] = await Promise.all([
    buildLocalSnapshot(session.user.id),
    listRemoteRecords(session),
  ]);
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

  if (result.downloaded > 0 || result.deletedLocal > 0) {
    window.dispatchEvent(new CustomEvent('notes-cloud-sync-applied'));
  }
  return result;
}

async function reconcileInitial(
  session: SupabaseSession,
  local: LocalEntity | undefined,
  remote: RemoteSyncRecord | undefined,
  result: SyncResult,
): Promise<void> {
  if (local && !remote) {
    await pushLocal(session, local);
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
      await pushLocal(session, local);
      result.uploaded += 1;
    } else {
      await deleteLocalEntity(local.type, local.id);
      result.deletedLocal += 1;
    }
    return;
  }

  if (local.hash === remote.payload_hash) return;
  result.conflicts += 1;
  if (local.updatedAt > remote.client_updated_at) {
    await pushLocal(session, local);
    result.uploaded += 1;
  } else {
    await applyRemote(session, remote);
    result.downloaded += 1;
  }
}

async function resolveConcurrentChange(
  session: SupabaseSession,
  local: LocalEntity | undefined,
  remote: RemoteSyncRecord | undefined,
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
    await pushLocal(session, local);
    result.uploaded += 1;
    return;
  }
  if (!local || !remote || remote.deleted_at !== null) return;

  if (local.updatedAt > remote.client_updated_at) {
    await pushLocal(session, local);
    result.uploaded += 1;
  } else {
    await applyRemote(session, remote);
    result.downloaded += 1;
  }
}

async function pushLocal(session: SupabaseSession, local: LocalEntity): Promise<void> {
  let payload = local.payload;
  if (local.type === 'attachment' && local.attachment) {
    const storagePath = await uploadAttachment(session, local.attachment.id, local.attachment.data);
    payload = { ...payload, storagePath };
  }

  const payloadHash = await hashPayload(payload);
  await upsertRemoteRecord(session, {
    user_id: session.user.id,
    entity_type: local.type,
    entity_id: local.id,
    payload,
    payload_hash: payloadHash,
    client_updated_at: local.updatedAt,
    deleted_at: null,
  });
}

async function tombstoneRemote(session: SupabaseSession, remote: RemoteSyncRecord): Promise<void> {
  if (remote.entity_type === 'attachment' && remote.payload) {
    const storagePath = remote.payload.storagePath;
    if (typeof storagePath === 'string') {
      try {
        await deleteAttachmentObject(session, storagePath);
      } catch (error) {
        // The database tombstone is authoritative; a failed binary cleanup can be retried manually.
        console.warn('A deleted attachment object could not be removed from cloud storage.', error);
      }
    }
  }

  const timestamp = Date.now();
  await upsertRemoteRecord(session, {
    user_id: session.user.id,
    entity_type: remote.entity_type,
    entity_id: remote.entity_id,
    payload: null,
    payload_hash: null,
    client_updated_at: timestamp,
    deleted_at: timestamp,
  });
}

async function applyRemote(session: SupabaseSession, remote: RemoteSyncRecord): Promise<void> {
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
      if (storagePath !== `${session.user.id}/${remote.entity_id}`)
        throw new Error('Cloud attachment is missing its storage path.');
      const data = await downloadAttachment(session, storagePath);
      const { storagePath: _storagePath, ...metadata } = payload;
      void _storagePath;
      const attachment = attachmentRecordSchema.parse({ ...metadata, data });
      if (data.size !== attachment.size)
        throw new Error('Cloud attachment size did not match. Please retry.');
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

async function buildLocalSnapshot(userId: string): Promise<LocalEntity[]> {
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
    const payload = {
      id: attachment.id,
      noteId: attachment.noteId,
      name: attachment.name,
      mimeType: attachment.mimeType,
      size: attachment.size,
      checksum: attachment.checksum,
      createdAt: attachment.createdAt,
      storagePath: `${userId}/${attachment.id}`,
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

function createShadow(local: LocalEntity[], remote: RemoteSyncRecord[]): SyncShadow {
  const localMap = new Map(local.map((item) => [item.key, item]));
  const remoteMap = new Map(remote.map((item) => [recordKey(item), item]));
  const keys = new Set([...localMap.keys(), ...remoteMap.keys()]);
  const shadow: SyncShadow = {};
  for (const key of keys) {
    shadow[key] = {
      localHash: localMap.get(key)?.hash ?? null,
      remoteHash: remoteMap.has(key) ? signatureForRemote(remoteMap.get(key)!) : null,
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

function recordKey(record: Pick<RemoteSyncRecord, 'entity_type' | 'entity_id'>): string {
  return entityKey(record.entity_type, record.entity_id);
}

function entityKey(type: SyncEntityType, id: string): string {
  return `${type}:${id}`;
}

function signatureForRemote(record: RemoteSyncRecord): string {
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
