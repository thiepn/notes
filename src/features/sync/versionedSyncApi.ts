import {
  SupabaseRequestError,
  type RemoteSyncRecord,
  type SupabaseSession,
} from './supabaseApi';

const SUPABASE_URL = 'https://hycegznamzjhwinegaai.supabase.co';
const SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_1rZzRPzfLMaAH5pIgCwIjA_19UPMIsR';
const REMOTE_SELECT =
  'user_id,entity_type,entity_id,payload,payload_hash,client_updated_at,deleted_at,updated_at,version';

export interface VersionedRemoteSyncRecord extends RemoteSyncRecord {
  version: number;
}

export type RemoteSyncMutation = Omit<
  VersionedRemoteSyncRecord,
  'updated_at' | 'version'
>;

export class SyncWriteConflictError extends Error {
  constructor(
    public readonly entityType: VersionedRemoteSyncRecord['entity_type'],
    public readonly entityId: string,
    public readonly expectedVersion: number | null,
  ) {
    super(
      expectedVersion === null
        ? `Cloud record ${entityType}:${entityId} was created by another client.`
        : `Cloud record ${entityType}:${entityId} changed after version ${expectedVersion} was observed.`,
    );
    this.name = 'SyncWriteConflictError';
  }
}

export async function listVersionedRemoteRecords(
  session: SupabaseSession,
): Promise<VersionedRemoteSyncRecord[]> {
  const records: VersionedRemoteSyncRecord[] = [];
  let cursor = '';
  const query = new URLSearchParams({
    select: REMOTE_SELECT,
    user_id: `eq.${session.user.id}`,
    order: 'entity_type.asc,entity_id.asc',
    limit: '500',
  });

  for (let page = 0; page < 2000; page += 1) {
    const response = await request(`/rest/v1/notes_sync_records?${query}`, session, {
      method: 'GET',
    });
    const rows = (await response.json()) as VersionedRemoteSyncRecord[];
    if (!Array.isArray(rows)) throw new Error('Cloud sync returned an invalid record list.');
    if (rows.length === 0) return records;
    validateRemoteRows(rows, session.user.id);

    const last = rows.at(-1)!;
    if (!/^[a-z_]+$/u.test(last.entity_type) || !/^[a-zA-Z0-9:-]+$/u.test(last.entity_id)) {
      throw new Error('Cloud sync returned an invalid record cursor.');
    }
    const next = `${last.entity_type}:${last.entity_id}`;
    if (next === cursor) {
      throw new Error('Cloud pagination did not advance. No changes were applied.');
    }
    records.push(...rows);
    cursor = next;
    query.set(
      'or',
      `(entity_type.gt.${last.entity_type},and(entity_type.eq.${last.entity_type},entity_id.gt.${last.entity_id}))`,
    );
  }

  throw new Error('The cloud library exceeded the safe fetch limit. No changes were applied.');
}

export async function writeVersionedRemoteRecord(
  session: SupabaseSession,
  record: RemoteSyncMutation,
  expectedVersion: number | null,
): Promise<VersionedRemoteSyncRecord> {
  if (expectedVersion === null) {
    const response = await request(
      `/rest/v1/notes_sync_records?select=${encodeURIComponent(REMOTE_SELECT)}`,
      session,
      {
        method: 'POST',
        headers: { Prefer: 'return=representation' },
        body: JSON.stringify(record),
      },
      true,
    );
    if (response.status === 409) {
      throw new SyncWriteConflictError(record.entity_type, record.entity_id, null);
    }
    if (!response.ok) throw await responseError(response);
    return readSingleMutationRow(response, session.user.id, record, null);
  }

  if (!Number.isSafeInteger(expectedVersion) || expectedVersion < 1) {
    throw new RangeError('Expected cloud version must be a positive safe integer.');
  }

  const query = new URLSearchParams({
    user_id: `eq.${session.user.id}`,
    entity_type: `eq.${record.entity_type}`,
    entity_id: `eq.${record.entity_id}`,
    version: `eq.${expectedVersion}`,
    select: REMOTE_SELECT,
  });
  const response = await request(`/rest/v1/notes_sync_records?${query}`, session, {
    method: 'PATCH',
    headers: { Prefer: 'return=representation' },
    body: JSON.stringify({
      payload: record.payload,
      payload_hash: record.payload_hash,
      client_updated_at: record.client_updated_at,
      deleted_at: record.deleted_at,
    }),
  });
  if (!response.ok) throw await responseError(response);

  const rows = (await response.json()) as VersionedRemoteSyncRecord[];
  if (!Array.isArray(rows)) throw new Error('Cloud sync returned an invalid mutation result.');
  if (rows.length === 0) {
    throw new SyncWriteConflictError(record.entity_type, record.entity_id, expectedVersion);
  }
  if (rows.length !== 1) throw new Error('Cloud sync updated more than one record identity.');
  const row = rows[0]!;
  validateRemoteRows(rows, session.user.id);
  if (row.entity_type !== record.entity_type || row.entity_id !== record.entity_id) {
    throw new Error('Cloud sync returned a different record after mutation.');
  }
  if (row.version !== expectedVersion + 1) {
    throw new Error('Cloud sync did not advance the record version exactly once.');
  }
  return row;
}

function validateRemoteRows(rows: VersionedRemoteSyncRecord[], expectedUserId: string): void {
  for (const row of rows) {
    if (row.user_id !== expectedUserId) {
      throw new Error('Cloud sync returned a different account’s record.');
    }
    if (!Number.isSafeInteger(row.version) || row.version < 1) {
      throw new Error('Cloud sync returned an invalid record version.');
    }
  }
}

async function readSingleMutationRow(
  response: Response,
  expectedUserId: string,
  record: RemoteSyncMutation,
  expectedVersion: number | null,
): Promise<VersionedRemoteSyncRecord> {
  const rows = (await response.json()) as VersionedRemoteSyncRecord[];
  if (!Array.isArray(rows) || rows.length !== 1) {
    throw new Error('Cloud sync did not return exactly one created record.');
  }
  validateRemoteRows(rows, expectedUserId);
  const row = rows[0]!;
  if (row.entity_type !== record.entity_type || row.entity_id !== record.entity_id) {
    throw new Error('Cloud sync returned a different record after mutation.');
  }
  if (expectedVersion === null && row.version !== 1) {
    throw new Error('A newly created cloud record did not begin at version 1.');
  }
  return row;
}

async function request(
  path: string,
  session: SupabaseSession,
  init: RequestInit,
  allowConflict = false,
): Promise<Response> {
  let response: Response;
  try {
    response = await fetch(`${SUPABASE_URL}${path}`, {
      ...init,
      signal: init.signal ?? AbortSignal.timeout(30_000),
      headers: {
        apikey: SUPABASE_PUBLISHABLE_KEY,
        Authorization: `Bearer ${session.access_token}`,
        'Content-Type': 'application/json',
        ...(init.headers ?? {}),
      },
    });
  } catch {
    throw new SupabaseRequestError(
      'Cloud service could not be reached. Local notes are unchanged.',
      0,
    );
  }
  if (!response.ok && !(allowConflict && response.status === 409)) {
    throw await responseError(response);
  }
  return response;
}

async function responseError(response: Response): Promise<Error> {
  const payload = (await response.json().catch(() => null)) as {
    message?: string;
    error?: string;
    msg?: string;
  } | null;
  return new SupabaseRequestError(
    payload?.message ??
      payload?.msg ??
      payload?.error ??
      `Supabase request failed (${response.status}).`,
    response.status,
  );
}
