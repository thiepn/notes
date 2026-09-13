import {
  AccountPlatformRequestError,
  readAccountPlatformSession,
  recordNotesAccountActivity,
  refreshAccountPlatformSession,
  signInAccountWithPassword,
  signOutAccountPlatformSession,
  storeAccountPlatformSession,
  THIEPN_ACCOUNT_SESSION_KEY,
  type AccountPlatformSession,
  type AccountPlatformUser,
} from './thiepnAccountPlatform';

export class SupabaseRequestError extends Error {
  constructor(
    message: string,
    public readonly status: number,
  ) {
    super(message);
    this.name = 'SupabaseRequestError';
  }
}

const SUPABASE_URL = 'https://hycegznamzjhwinegaai.supabase.co';
const SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_1rZzRPzfLMaAH5pIgCwIjA_19UPMIsR';
export const SESSION_STORAGE_KEY = THIEPN_ACCOUNT_SESSION_KEY;
export const LEGACY_NOTES_SESSION_STORAGE_KEY = 'notes.supabase.session.v1';
const ATTACHMENT_BUCKET = 'notes-attachments';

export type SyncEntityType =
  'note' | 'checklist_item' | 'label' | 'note_label' | 'attachment' | 'reminder' | 'revision';

export type SupabaseUser = AccountPlatformUser;
export type SupabaseSession = AccountPlatformSession;

export interface RemoteSyncRecord {
  user_id: string;
  entity_type: SyncEntityType;
  entity_id: string;
  payload: Record<string, unknown> | null;
  payload_hash: string | null;
  client_updated_at: number;
  deleted_at: number | null;
  updated_at?: string;
}

interface AuthResponse {
  access_token?: string;
  refresh_token?: string;
  expires_in?: number;
  expires_at?: number;
  token_type?: string;
  user?: SupabaseUser;
  error?: string;
  error_description?: string;
  msg?: string;
}

export function readStoredSession(): SupabaseSession | null {
  return readAccountPlatformSession(LEGACY_NOTES_SESSION_STORAGE_KEY);
}

export function storeSession(session: SupabaseSession | null): void {
  storeAccountPlatformSession(session, LEGACY_NOTES_SESSION_STORAGE_KEY);
}

export async function signInWithPassword(
  email: string,
  password: string,
): Promise<SupabaseSession> {
  try {
    return await signInAccountWithPassword(email, password);
  } catch (error) {
    throw mapAccountPlatformError(error);
  }
}

export async function signUpWithPassword(
  email: string,
  password: string,
): Promise<{ session: SupabaseSession | null; user: SupabaseUser | null }> {
  const response = await authRequest('/auth/v1/signup', {
    method: 'POST',
    body: JSON.stringify({ email, password }),
  });

  if (!response.access_token || !response.refresh_token || !response.user) {
    return { session: null, user: response.user ?? null };
  }
  return { session: parseSession(response), user: response.user };
}

const refreshRequests = new Map<string, Promise<SupabaseSession>>();

export function refreshSession(session: SupabaseSession): Promise<SupabaseSession> {
  const existing = refreshRequests.get(session.refresh_token);
  if (existing) return existing;
  const operation = refreshAccountPlatformSession(session)
    .catch((error: unknown) => {
      throw mapAccountPlatformError(error);
    })
    .finally(() => refreshRequests.delete(session.refresh_token));
  refreshRequests.set(session.refresh_token, operation);
  return operation;
}

export async function ensureFreshSession(session: SupabaseSession): Promise<SupabaseSession> {
  void recordNotesAccountActivity(session);
  const nowSeconds = Math.floor(Date.now() / 1000);
  if (session.expires_at - nowSeconds > 60) return session;
  return refreshSession(session);
}

export async function signOutSession(session: SupabaseSession): Promise<void> {
  try {
    await signOutAccountPlatformSession(session);
  } catch (error) {
    throw mapAccountPlatformError(error);
  } finally {
    if (readStoredSession()?.access_token === session.access_token) storeSession(null);
  }
}

export async function hasNotesSyncAccess(session: SupabaseSession): Promise<boolean> {
  const response = await request('/rest/v1/rpc/has_notes_sync_access', session.access_token, {
    method: 'POST',
    body: '{}',
  });
  return Boolean((await response.json()) as boolean);
}

export async function claimNotesSyncAccess(
  session: SupabaseSession,
  setupCode: string,
): Promise<boolean> {
  const response = await request('/rest/v1/rpc/claim_notes_sync_access', session.access_token, {
    method: 'POST',
    body: JSON.stringify({ p_code: setupCode }),
  });
  return Boolean((await response.json()) as boolean);
}

export async function listRemoteRecords(session: SupabaseSession): Promise<RemoteSyncRecord[]> {
  const records: RemoteSyncRecord[] = [];
  let cursor = '';
  const query = new URLSearchParams({
    select:
      'user_id,entity_type,entity_id,payload,payload_hash,client_updated_at,deleted_at,updated_at',
    user_id: `eq.${session.user.id}`,
    order: 'entity_type.asc,entity_id.asc',
    limit: '500',
  });
  for (let page = 0; page < 2000; page += 1) {
    const response = await request(`/rest/v1/notes_sync_records?${query}`, session.access_token);
    const rows = (await response.json()) as RemoteSyncRecord[];
    if (!Array.isArray(rows)) throw new Error('Cloud sync returned an invalid record list.');
    if (rows.length === 0) return records;
    const last = rows.at(-1)!;
    if (rows.some((row) => row.user_id !== session.user.id))
      throw new Error('Cloud sync returned a different account’s record.');
    if (!/^[a-z_]+$/.test(last.entity_type) || !/^[a-zA-Z0-9:-]+$/.test(last.entity_id))
      throw new Error('Cloud sync returned an invalid record cursor.');
    const next = `${last.entity_type}:${last.entity_id}`;
    if (next === cursor)
      throw new Error('Cloud pagination did not advance. No changes were applied.');
    records.push(...rows);
    cursor = next;
    query.set(
      'or',
      `(entity_type.gt.${last.entity_type},and(entity_type.eq.${last.entity_type},entity_id.gt.${last.entity_id}))`,
    );
  }
  throw new Error('The cloud library exceeded the safe fetch limit. No changes were applied.');
}

export async function upsertRemoteRecord(
  session: SupabaseSession,
  record: Omit<RemoteSyncRecord, 'updated_at'>,
): Promise<void> {
  const response = await request(
    '/rest/v1/notes_sync_records?on_conflict=user_id,entity_type,entity_id',
    session.access_token,
    {
      method: 'POST',
      headers: { Prefer: 'resolution=merge-duplicates,return=minimal' },
      body: JSON.stringify(record),
    },
  );
  await consumeEmptyResponse(response);
}

export async function uploadAttachment(
  session: SupabaseSession,
  attachmentId: string,
  blob: Blob,
): Promise<string> {
  const path = `${session.user.id}/${attachmentId}`;
  const response = await request(
    `/storage/v1/object/${ATTACHMENT_BUCKET}/${encodeStoragePath(path)}`,
    session.access_token,
    {
      method: 'POST',
      headers: {
        'Content-Type': blob.type || 'application/octet-stream',
        'x-upsert': 'true',
      },
      body: blob,
    },
    false,
  );
  await consumeEmptyResponse(response);
  return path;
}

export async function downloadAttachment(session: SupabaseSession, path: string): Promise<Blob> {
  const response = await request(
    `/storage/v1/object/authenticated/${ATTACHMENT_BUCKET}/${encodeStoragePath(path)}`,
    session.access_token,
    undefined,
    false,
  );
  return response.blob();
}

export async function deleteAttachmentObject(
  session: SupabaseSession,
  path: string,
): Promise<void> {
  const response = await request(
    `/storage/v1/object/${ATTACHMENT_BUCKET}/${encodeStoragePath(path)}`,
    session.access_token,
    { method: 'DELETE' },
    false,
  );
  if (!response.ok && response.status !== 404) {
    throw await responseError(response);
  }
}

async function authRequest(path: string, init: RequestInit): Promise<AuthResponse> {
  const response = await fetch(`${SUPABASE_URL}${path}`, {
    ...init,
    signal: init.signal ?? AbortSignal.timeout(30_000),
    headers: {
      apikey: SUPABASE_PUBLISHABLE_KEY,
      'Content-Type': 'application/json',
      ...(init.headers ?? {}),
    },
  });
  const payload = (await response.json().catch(() => ({}))) as AuthResponse;
  if (!response.ok) {
    throw new SupabaseRequestError(
      payload.error_description ??
        payload.msg ??
        payload.error ??
        `Supabase request failed (${response.status}).`,
      response.status,
    );
  }
  return payload;
}

async function request(
  path: string,
  accessToken: string,
  init: RequestInit = {},
  jsonContentType = true,
): Promise<Response> {
  const response = await fetch(`${SUPABASE_URL}${path}`, {
    ...init,
    signal: init.signal ?? AbortSignal.timeout(30_000),
    headers: {
      apikey: SUPABASE_PUBLISHABLE_KEY,
      Authorization: `Bearer ${accessToken}`,
      ...(jsonContentType ? { 'Content-Type': 'application/json' } : {}),
      ...(init.headers ?? {}),
    },
  });
  if (!response.ok) throw await responseError(response);
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

async function consumeEmptyResponse(response: Response): Promise<void> {
  if (response.status !== 204) await response.text();
}

function parseSession(response: AuthResponse): SupabaseSession {
  if (!response.access_token || !response.refresh_token || !response.user) {
    throw new Error('Supabase did not return an authenticated session.');
  }
  const expiresAt =
    response.expires_at ??
    Math.floor(Date.now() / 1000) + Math.max(60, response.expires_in ?? 3600);
  return {
    access_token: response.access_token,
    refresh_token: response.refresh_token,
    expires_at: expiresAt,
    token_type: response.token_type ?? 'bearer',
    user: response.user,
  };
}

function mapAccountPlatformError(error: unknown): Error {
  if (error instanceof AccountPlatformRequestError) {
    return new SupabaseRequestError(error.message, error.status);
  }
  return error instanceof Error ? error : new Error('THIEPN Account request failed.');
}

function encodeStoragePath(path: string): string {
  return path
    .split('/')
    .map((part) => encodeURIComponent(part))
    .join('/');
}
