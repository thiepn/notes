// Notes consumer adapter for the certified THIEPN Account platform.
// Source contract: thiepn/thiepn.github.io@124221f39a932d50f9a86ad5c3da2d8fd1fe50af
// Account SDK 1.2.0 / Platform 1.0.0.

export const THIEPN_ACCOUNT_SDK_VERSION = '1.2.0';
export const THIEPN_ACCOUNT_PLATFORM_VERSION = '1.0.0';
export const THIEPN_ACCOUNT_SDK_SOURCE_SHA = '124221f39a932d50f9a86ad5c3da2d8fd1fe50af';
export const NOTES_PLATFORM_APP_ID = 'notes';
export const THIEPN_ACCOUNT_SESSION_KEY = 'sb-hycegznamzjhwinegaai-auth-token';

const SUPABASE_URL = 'https://hycegznamzjhwinegaai.supabase.co';
const SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_1rZzRPzfLMaAH5pIgCwIjA_19UPMIsR';

export interface AccountPlatformUser {
  id: string;
  email?: string;
  new_email?: string;
  factors?: Array<{
    id: string;
    factor_type?: string;
    status?: string;
  }>;
}

export interface AccountPlatformSession {
  access_token: string;
  refresh_token: string;
  expires_at: number;
  token_type: string;
  user: AccountPlatformUser;
}

export interface AccountHandoffState {
  signedIn: boolean;
  requiresAdditionalVerification: boolean;
  assuranceLevel: 'aal1' | 'aal2';
}

export class AccountPlatformRequestError extends Error {
  constructor(
    message: string,
    public readonly status: number,
  ) {
    super(message);
    this.name = 'AccountPlatformRequestError';
  }
}

interface AuthPayload {
  access_token?: string;
  refresh_token?: string;
  expires_at?: number;
  expires_in?: number;
  token_type?: string;
  user?: AccountPlatformUser;
  error?: string;
  error_description?: string;
  message?: string;
  msg?: string;
}

interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

let activityMarkedForUserId: string | null = null;

function browserStorage(): StorageLike | null {
  if (typeof window === 'undefined') return null;
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

export function parseAccountPlatformSession(raw: string | null): AccountPlatformSession | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as Partial<AccountPlatformSession>;
    if (
      typeof parsed.access_token !== 'string' ||
      typeof parsed.refresh_token !== 'string' ||
      typeof parsed.expires_at !== 'number' ||
      !Number.isFinite(parsed.expires_at) ||
      !parsed.user ||
      typeof parsed.user.id !== 'string'
    ) {
      return null;
    }
    return {
      access_token: parsed.access_token,
      refresh_token: parsed.refresh_token,
      expires_at: parsed.expires_at,
      token_type: typeof parsed.token_type === 'string' ? parsed.token_type : 'bearer',
      user: parsed.user,
    };
  } catch {
    return null;
  }
}

export function readAccountPlatformSession(
  legacyKey: string,
  storage: StorageLike | null = browserStorage(),
): AccountPlatformSession | null {
  if (!storage) return null;
  try {
    const shared = parseAccountPlatformSession(storage.getItem(THIEPN_ACCOUNT_SESSION_KEY));
    if (shared) return shared;
    const legacy = parseAccountPlatformSession(storage.getItem(legacyKey));
    if (!legacy) return null;
    storage.setItem(THIEPN_ACCOUNT_SESSION_KEY, JSON.stringify(legacy));
    storage.removeItem(legacyKey);
    return legacy;
  } catch {
    return null;
  }
}

export function storeAccountPlatformSession(
  session: AccountPlatformSession | null,
  legacyKey: string,
  storage: StorageLike | null = browserStorage(),
): void {
  if (!storage) return;
  try {
    if (session) storage.setItem(THIEPN_ACCOUNT_SESSION_KEY, JSON.stringify(session));
    else storage.removeItem(THIEPN_ACCOUNT_SESSION_KEY);
    storage.removeItem(legacyKey);
    if (!session) activityMarkedForUserId = null;
  } catch {
    // A live in-memory Notes session can still work if browser storage is unavailable.
  }
}

export async function signInAccountWithPassword(
  email: string,
  password: string,
): Promise<AccountPlatformSession> {
  const payload = await authRequest('/auth/v1/token?grant_type=password', {
    method: 'POST',
    body: JSON.stringify({ email, password }),
  });
  return normalizeSession(payload);
}

export async function refreshAccountPlatformSession(
  session: AccountPlatformSession,
): Promise<AccountPlatformSession> {
  const payload = await authRequest('/auth/v1/token?grant_type=refresh_token', {
    method: 'POST',
    body: JSON.stringify({ refresh_token: session.refresh_token }),
  });
  return normalizeSession(payload, session.user);
}

export async function signOutAccountPlatformSession(
  session: AccountPlatformSession,
): Promise<void> {
  await authenticatedRequest('/auth/v1/logout?scope=local', session.access_token, {
    method: 'POST',
  });
}

export async function recordNotesAccountActivity(session: AccountPlatformSession): Promise<void> {
  const userId = session.user.id;
  if (!userId || activityMarkedForUserId === userId) return;
  const query = new URLSearchParams({
    on_conflict: 'user_id,app_slug',
    select: 'app_slug,first_used_at,last_used_at',
  });
  try {
    await authenticatedRequest(`/rest/v1/account_user_apps?${query}`, session.access_token, {
      method: 'POST',
      headers: { Prefer: 'resolution=merge-duplicates,return=minimal' },
      body: JSON.stringify({
        user_id: userId,
        app_slug: NOTES_PLATFORM_APP_ID,
        last_used_at: new Date().toISOString(),
        source: 'app',
      }),
    });
    activityMarkedForUserId = userId;
  } catch (error) {
    // Ecosystem metadata is non-critical and must never block local Notes or cloud sync.
    console.warn('Notes account activity marker failed', error);
  }
}

export function getNotesAccountHandoffState(
  session: AccountPlatformSession | null,
): AccountHandoffState {
  if (!session) {
    return { signedIn: false, requiresAdditionalVerification: false, assuranceLevel: 'aal1' };
  }
  const assuranceLevel = readAssuranceLevel(session.access_token);
  const factors = Array.isArray(session.user.factors) ? session.user.factors : [];
  const hasVerifiedFactor = factors.some((factor) => factor?.status === 'verified');
  return {
    signedIn: true,
    requiresAdditionalVerification: hasVerifiedFactor && assuranceLevel !== 'aal2',
    assuranceLevel,
  };
}

function readAssuranceLevel(token: string): 'aal1' | 'aal2' {
  const parts = token.split('.');
  if (parts.length !== 3 || typeof globalThis.atob !== 'function') return 'aal1';
  try {
    const value = parts[1]!.replace(/-/g, '+').replace(/_/g, '/');
    const decoded = globalThis.atob(value.padEnd(Math.ceil(value.length / 4) * 4, '='));
    const payload = JSON.parse(decoded) as { aal?: string };
    return payload.aal === 'aal2' ? 'aal2' : 'aal1';
  } catch {
    return 'aal1';
  }
}

async function authRequest(path: string, init: RequestInit): Promise<AuthPayload> {
  const response = await fetch(`${SUPABASE_URL}${path}`, {
    ...init,
    signal: init.signal ?? AbortSignal.timeout(30_000),
    headers: {
      apikey: SUPABASE_PUBLISHABLE_KEY,
      'Content-Type': 'application/json',
      ...(init.headers ?? {}),
    },
  });
  const payload = (await response.json().catch(() => ({}))) as AuthPayload;
  if (!response.ok) throw responseError(response.status, payload);
  return payload;
}

async function authenticatedRequest(
  path: string,
  accessToken: string,
  init: RequestInit = {},
): Promise<Response> {
  const response = await fetch(`${SUPABASE_URL}${path}`, {
    ...init,
    signal: init.signal ?? AbortSignal.timeout(30_000),
    headers: {
      apikey: SUPABASE_PUBLISHABLE_KEY,
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
      ...(init.headers ?? {}),
    },
  });
  if (!response.ok) {
    const payload = (await response.json().catch(() => ({}))) as AuthPayload;
    throw responseError(response.status, payload);
  }
  return response;
}

function responseError(status: number, payload: AuthPayload): AccountPlatformRequestError {
  return new AccountPlatformRequestError(
    payload.error_description ??
      payload.message ??
      payload.msg ??
      payload.error ??
      `Supabase request failed (${status}).`,
    status,
  );
}

function normalizeSession(
  payload: AuthPayload,
  fallbackUser?: AccountPlatformUser,
): AccountPlatformSession {
  const user = payload.user ?? fallbackUser;
  if (!payload.access_token || !payload.refresh_token || !user?.id) {
    throw new Error('Supabase did not return an authenticated session.');
  }
  return {
    access_token: payload.access_token,
    refresh_token: payload.refresh_token,
    expires_at:
      payload.expires_at ??
      Math.floor(Date.now() / 1000) + Math.max(60, payload.expires_in ?? 3600),
    token_type: payload.token_type ?? 'bearer',
    user,
  };
}
