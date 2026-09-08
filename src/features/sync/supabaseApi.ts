const SUPABASE_URL = 'https://hycegznamzjhwinegaai.supabase.co';
const SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_1rZzRPzfLMaAH5pIgCwIjA_19UPMIsR';
const SESSION_STORAGE_KEY = 'notes.supabase.session.v1';
const ATTACHMENT_BUCKET = 'notes-attachments';

export type SyncEntityType =
  'note' | 'checklist_item' | 'label' | 'note_label' | 'attachment' | 'reminder' | 'revision';

export interface SupabaseUser {
  id: string;
  email?: string;
}

export interface SupabaseSession {
  access_token: string;
  refresh_token: string;
  expires_at: number;
  token_type: string;
  user: SupabaseUser;
}

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
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.localStorage.getItem(SESSION_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<SupabaseSession>;
    if (
      typeof parsed.access_token !== 'string' ||
      typeof parsed.refresh_token !== 'string' ||
      typeof parsed.expires_at !== 'number' ||
      !parsed.user ||
      typeof parsed.user.id !== 'string'
    ) {
      return null;
    }
    return parsed as SupabaseSession;
  } catch {
    return null;
  }
}

export function storeSession(session: SupabaseSession | null): void {
  if (typeof window === 'undefined') return;
  try {
    if (session) window.localStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(session));
    else window.localStorage.removeItem(SESSION_STORAGE_KEY);
  } catch {
    // A live in-memory session can still work if browser storage is unavailable.
  }
}

export async function signInWithPassword(
  email: string,
  password: string,
): Promise<SupabaseSession> {
  const response = await authRequest('/auth/v1/token?grant_type=password', {
    method: 'POST',
    body: JSON.stringify({ email, password }),
  });
  return parseSession(response);
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

export async function refreshSession(session: SupabaseSession): Promise<SupabaseSession> {
  const response = await authRequest('/auth/v1/token?grant_type=refresh_token', {
    method: 'POST',
    body: JSON.stringify({ refresh_token: session.refresh_token }),
  });
  return parseSession(response);
}

export async function ensureFreshSession(session: SupabaseSession): Promise<SupabaseSession> {
  const nowSeconds = Math.floor(Date.now() / 1000);
  if (session.expires_at - nowSeconds > 60) return session;
  return refreshSession(session);
}

export async function signOutSession(session: SupabaseSession): Promise<void> {
  try {
    await request('/auth/v1/logout?scope=local', session.access_token, { method: 'POST' });
  } finally {
    storeSession(null);
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
  const query = new URLSearchParams({
    select:
      'user_id,entity_type,entity_id,payload,payload_hash,client_updated_at,deleted_at,updated_at',
    user_id: `eq.${session.user.id}`,
  });
  const response = await request(`/rest/v1/notes_sync_records?${query}`, session.access_token);
  return (await response.json()) as RemoteSyncRecord[];
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
    headers: {
      apikey: SUPABASE_PUBLISHABLE_KEY,
      'Content-Type': 'application/json',
      ...(init.headers ?? {}),
    },
  });
  const payload = (await response.json().catch(() => ({}))) as AuthResponse;
  if (!response.ok) {
    throw new Error(
      payload.error_description ??
        payload.msg ??
        payload.error ??
        `Supabase request failed (${response.status}).`,
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
  return new Error(
    payload?.message ??
      payload?.msg ??
      payload?.error ??
      `Supabase request failed (${response.status}).`,
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

function encodeStoragePath(path: string): string {
  return path
    .split('/')
    .map((part) => encodeURIComponent(part))
    .join('/');
}
