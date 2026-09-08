import {
  deleteAttachmentObject,
  listRemoteRecords,
  type SupabaseSession,
  type SupabaseUser,
} from './supabaseApi';

const SUPABASE_URL = 'https://hycegznamzjhwinegaai.supabase.co';
const SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_1rZzRPzfLMaAH5pIgCwIjA_19UPMIsR';
const ATTACHMENT_BUCKET = 'notes-attachments';
const NOTES_REDIRECT_URL = 'https://thiepn.dev/notes/';

export interface AuthCallbackResult {
  type: string | null;
  session: SupabaseSession | null;
  error: string | null;
}

export interface AuthSessionInfo {
  id: string;
  created_at: string | null;
  updated_at: string | null;
  refreshed_at: string | null;
  not_after: string | null;
  user_agent: string | null;
  is_current: boolean;
}

export type DeleteAccountReason =
  | 'shared_identity'
  | 'not_authenticated'
  | 'notes_access_required'
  | 'unknown';

export interface DeleteAccountResult {
  deleted: boolean;
  reason: DeleteAccountReason | null;
}

export async function consumeAuthCallback(): Promise<AuthCallbackResult | null> {
  if (typeof window === 'undefined' || window.location.hash.length <= 1) return null;

  const params = new URLSearchParams(window.location.hash.slice(1));
  const error = params.get('error_description') ?? params.get('error');
  const callbackType = params.get('type');
  const accessToken = params.get('access_token');
  const refreshToken = params.get('refresh_token');

  if (!error && (!accessToken || !refreshToken)) return null;

  clearAuthCallbackUrl();
  if (error) return { type: callbackType, session: null, error };

  const user = await fetchCurrentUser(accessToken!);
  const expiresIn = Number(params.get('expires_in') ?? '3600');
  const expiresAtParam = Number(params.get('expires_at') ?? '0');
  const expiresAt =
    Number.isFinite(expiresAtParam) && expiresAtParam > 0
      ? expiresAtParam
      : Math.floor(Date.now() / 1000) + Math.max(60, Number.isFinite(expiresIn) ? expiresIn : 3600);

  return {
    type: callbackType,
    error: null,
    session: {
      access_token: accessToken!,
      refresh_token: refreshToken!,
      expires_at: expiresAt,
      token_type: params.get('token_type') ?? 'bearer',
      user,
    },
  };
}

export async function requestPasswordReset(email: string): Promise<void> {
  const redirectTo = authRedirect('recovery');
  await authRequest(`/auth/v1/recover?redirect_to=${encodeURIComponent(redirectTo)}`, {
    method: 'POST',
    body: JSON.stringify({ email: email.trim() }),
  });
}

export async function resendSignupConfirmation(email: string): Promise<void> {
  const redirectTo = authRedirect('confirm');
  await authRequest(`/auth/v1/resend?redirect_to=${encodeURIComponent(redirectTo)}`, {
    method: 'POST',
    body: JSON.stringify({ type: 'signup', email: email.trim() }),
  });
}

export async function updateAccountEmail(
  session: SupabaseSession,
  email: string,
): Promise<SupabaseUser> {
  const redirectTo = authRedirect('email-change');
  return updateUser(session, { email: email.trim() }, redirectTo);
}

export async function resendEmailChangeConfirmation(
  session: SupabaseSession,
  email: string,
): Promise<void> {
  await ensureAuthenticated(session);
  const redirectTo = authRedirect('email-change');
  await authRequest(`/auth/v1/resend?redirect_to=${encodeURIComponent(redirectTo)}`, {
    method: 'POST',
    body: JSON.stringify({ type: 'email_change', email: email.trim() }),
  });
}

export async function requestReauthentication(session: SupabaseSession): Promise<void> {
  await authenticatedRequest('/auth/v1/reauthenticate', session.access_token, { method: 'GET' });
}

export async function updateAccountPassword(
  session: SupabaseSession,
  password: string,
  options: { currentPassword?: string; nonce?: string } = {},
): Promise<SupabaseUser> {
  const body: Record<string, string> = { password };
  if (options.currentPassword) body.current_password = options.currentPassword;
  if (options.nonce) body.nonce = options.nonce;
  return updateUser(session, body);
}

export async function listAuthSessions(session: SupabaseSession): Promise<AuthSessionInfo[]> {
  const response = await authenticatedRequest(
    '/rest/v1/rpc/list_notes_auth_sessions',
    session.access_token,
    { method: 'POST', body: '{}' },
  );
  return (await response.json()) as AuthSessionInfo[];
}

export async function signOutScoped(
  session: SupabaseSession,
  scope: 'local' | 'others' | 'global',
): Promise<void> {
  await authenticatedRequest(`/auth/v1/logout?scope=${scope}`, session.access_token, {
    method: 'POST',
  });
}

export async function deleteNotesCloudData(session: SupabaseSession): Promise<void> {
  await deleteAllAttachmentObjects(session);
  const response = await authenticatedRequest(
    '/rest/v1/rpc/disable_notes_sync_access',
    session.access_token,
    { method: 'POST', body: '{}' },
  );
  const disabled = Boolean((await response.json()) as boolean);
  if (!disabled) throw new Error('The Notes workspace could not be disabled.');
}

export async function deleteNotesAccountIdentity(
  session: SupabaseSession,
): Promise<DeleteAccountResult> {
  const statusResponse = await authenticatedRequest(
    '/rest/v1/rpc/notes_auth_identity_delete_status',
    session.access_token,
    { method: 'POST', body: '{}' },
  );
  const status = String(await statusResponse.json());
  if (status !== 'ready') {
    return {
      deleted: false,
      reason: isDeleteReason(status) ? status : 'unknown',
    };
  }

  await deleteAllAttachmentObjects(session);
  const response = await authenticatedRequest(
    '/rest/v1/rpc/delete_notes_auth_identity',
    session.access_token,
    { method: 'POST', body: '{}' },
  );
  const result = (await response.json()) as { deleted?: boolean; reason?: string | null };
  return {
    deleted: result.deleted === true,
    reason:
      result.deleted === true
        ? null
        : isDeleteReason(result.reason ?? '')
          ? (result.reason as DeleteAccountReason)
          : 'unknown',
  };
}

async function deleteAllAttachmentObjects(session: SupabaseSession): Promise<void> {
  const paths = new Set<string>();
  const records = await listRemoteRecords(session);
  for (const record of records) {
    if (record.entity_type !== 'attachment' || !record.payload) continue;
    const storagePath = record.payload.storagePath;
    if (typeof storagePath === 'string') paths.add(storagePath);
  }

  try {
    for (const path of await listStoragePaths(session)) paths.add(path);
  } catch {
    // Database metadata remains a safe fallback if Storage listing is unavailable.
  }

  for (const path of paths) await deleteAttachmentObject(session, path);
}

async function listStoragePaths(session: SupabaseSession): Promise<string[]> {
  const paths: string[] = [];
  const limit = 100;
  let offset = 0;

  while (true) {
    const response = await authenticatedRequest(
      `/storage/v1/object/list/${ATTACHMENT_BUCKET}`,
      session.access_token,
      {
        method: 'POST',
        body: JSON.stringify({
          prefix: session.user.id,
          limit,
          offset,
          sortBy: { column: 'name', order: 'asc' },
        }),
      },
    );
    const entries = (await response.json()) as Array<{ id?: string | null; name?: string }>;
    for (const entry of entries) {
      if (entry.id && entry.name) paths.push(`${session.user.id}/${entry.name}`);
    }
    if (entries.length < limit) break;
    offset += entries.length;
  }

  return paths;
}

async function updateUser(
  session: SupabaseSession,
  attributes: Record<string, string>,
  redirectTo?: string,
): Promise<SupabaseUser> {
  const path = redirectTo
    ? `/auth/v1/user?redirect_to=${encodeURIComponent(redirectTo)}`
    : '/auth/v1/user';
  const response = await authenticatedRequest(path, session.access_token, {
    method: 'PUT',
    body: JSON.stringify(attributes),
  });
  const payload = (await response.json()) as SupabaseUser | { user?: SupabaseUser };
  const user = 'user' in payload ? payload.user : payload;
  if (!user || typeof user.id !== 'string') throw new Error('Supabase did not return the account.');
  return user;
}

async function fetchCurrentUser(accessToken: string): Promise<SupabaseUser> {
  const response = await authenticatedRequest('/auth/v1/user', accessToken, { method: 'GET' });
  const payload = (await response.json()) as SupabaseUser | { user?: SupabaseUser };
  const user = 'user' in payload ? payload.user : payload;
  if (!user || typeof user.id !== 'string') throw new Error('Supabase did not return the account.');
  return user;
}

async function ensureAuthenticated(session: SupabaseSession): Promise<void> {
  if (!session.access_token || !session.user.id) throw new Error('Sign in again to continue.');
}

async function authRequest(path: string, init: RequestInit): Promise<Response> {
  const response = await fetch(`${SUPABASE_URL}${path}`, {
    ...init,
    headers: {
      apikey: SUPABASE_PUBLISHABLE_KEY,
      'Content-Type': 'application/json',
      ...(init.headers ?? {}),
    },
  });
  if (!response.ok) throw await responseError(response);
  return response;
}

async function authenticatedRequest(
  path: string,
  accessToken: string,
  init: RequestInit = {},
): Promise<Response> {
  const response = await fetch(`${SUPABASE_URL}${path}`, {
    ...init,
    headers: {
      apikey: SUPABASE_PUBLISHABLE_KEY,
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
      ...(init.headers ?? {}),
    },
  });
  if (!response.ok) throw await responseError(response);
  return response;
}

async function responseError(response: Response): Promise<Error> {
  const payload = (await response.json().catch(() => null)) as
    | { message?: string; error?: string; error_description?: string; msg?: string }
    | null;
  return new Error(
    payload?.error_description ??
      payload?.message ??
      payload?.msg ??
      payload?.error ??
      `Supabase request failed (${response.status}).`,
  );
}

function authRedirect(kind: string): string {
  const url = new URL(NOTES_REDIRECT_URL);
  url.searchParams.set('auth', kind);
  return url.toString();
}

function clearAuthCallbackUrl(): void {
  const url = new URL(window.location.href);
  url.hash = '';
  url.searchParams.delete('auth');
  window.history.replaceState({}, document.title, `${url.pathname}${url.search}`);
}

function isDeleteReason(value: string): value is DeleteAccountReason {
  return (
    value === 'shared_identity' ||
    value === 'not_authenticated' ||
    value === 'notes_access_required' ||
    value === 'unknown'
  );
}
