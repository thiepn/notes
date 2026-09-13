import { Buffer } from 'node:buffer';
import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  AccountPlatformRequestError,
  NOTES_PLATFORM_APP_ID,
  THIEPN_ACCOUNT_PLATFORM_VERSION,
  THIEPN_ACCOUNT_SDK_SOURCE_SHA,
  THIEPN_ACCOUNT_SDK_VERSION,
  THIEPN_ACCOUNT_SESSION_KEY,
  getNotesAccountHandoffState,
  readAccountPlatformSession,
  recordNotesAccountActivity,
  refreshAccountPlatformSession,
  storeAccountPlatformSession,
  type AccountPlatformSession,
} from './thiepnAccountPlatform';

const LEGACY_KEY = 'notes.supabase.session.v1';

function memoryStorage(initial: Record<string, string> = {}) {
  const values = new Map(Object.entries(initial));
  return {
    getItem(key: string) {
      return values.get(key) ?? null;
    },
    setItem(key: string, value: string) {
      values.set(key, String(value));
    },
    removeItem(key: string) {
      values.delete(key);
    },
  };
}

function jwt(payload: Record<string, unknown>): string {
  const encode = (value: unknown) => Buffer.from(JSON.stringify(value)).toString('base64url');
  return `${encode({ alg: 'HS256', typ: 'JWT' })}.${encode(payload)}.signature`;
}

const session: AccountPlatformSession = {
  access_token: jwt({ aal: 'aal1', session_id: 'session-1', exp: 2_000_000_000 }),
  refresh_token: 'refresh-token',
  expires_at: 2_000_000_000,
  token_type: 'bearer',
  user: { id: 'owner-id', email: 'owner@example.test' },
};

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('A5 Notes THIEPN Account platform adapter', () => {
  it('pins the certified A4 contract', () => {
    expect(THIEPN_ACCOUNT_SDK_VERSION).toBe('1.2.0');
    expect(THIEPN_ACCOUNT_PLATFORM_VERSION).toBe('1.0.0');
    expect(THIEPN_ACCOUNT_SDK_SOURCE_SHA).toBe(
      '124221f39a932d50f9a86ad5c3da2d8fd1fe50af',
    );
    expect(THIEPN_ACCOUNT_SESSION_KEY).toBe('sb-hycegznamzjhwinegaai-auth-token');
    expect(NOTES_PLATFORM_APP_ID).toBe('notes');
  });

  it('promotes a valid Notes legacy session without replacing an existing shared session', () => {
    const legacyStorage = memoryStorage({ [LEGACY_KEY]: JSON.stringify(session) });
    expect(readAccountPlatformSession(LEGACY_KEY, legacyStorage)).toEqual(session);
    expect(JSON.parse(legacyStorage.getItem(THIEPN_ACCOUNT_SESSION_KEY)!)).toEqual(session);
    expect(legacyStorage.getItem(LEGACY_KEY)).toBeNull();

    const shared = { ...session, user: { id: 'shared-owner' } };
    const sharedStorage = memoryStorage({
      [THIEPN_ACCOUNT_SESSION_KEY]: JSON.stringify(shared),
      [LEGACY_KEY]: JSON.stringify(session),
    });
    expect(readAccountPlatformSession(LEGACY_KEY, sharedStorage)).toEqual(shared);
  });

  it('stores and clears only the shared account session while retiring the legacy key', () => {
    const storage = memoryStorage({ [LEGACY_KEY]: JSON.stringify(session) });
    storeAccountPlatformSession(session, LEGACY_KEY, storage);
    expect(JSON.parse(storage.getItem(THIEPN_ACCOUNT_SESSION_KEY)!)).toEqual(session);
    expect(storage.getItem(LEGACY_KEY)).toBeNull();

    storeAccountPlatformSession(null, LEGACY_KEY, storage);
    expect(storage.getItem(THIEPN_ACCOUNT_SESSION_KEY)).toBeNull();
  });

  it('reports an MFA handoff requirement only for verified factors on AAL1', () => {
    const mfaSession = {
      ...session,
      user: {
        ...session.user,
        factors: [{ id: 'factor-1', factor_type: 'totp', status: 'verified' }],
      },
    };
    expect(getNotesAccountHandoffState(mfaSession)).toEqual({
      signedIn: true,
      requiresAdditionalVerification: true,
      assuranceLevel: 'aal1',
    });

    expect(
      getNotesAccountHandoffState({
        ...mfaSession,
        access_token: jwt({ aal: 'aal2', session_id: 'session-2', exp: 2_000_000_000 }),
      }),
    ).toEqual({
      signedIn: true,
      requiresAdditionalVerification: false,
      assuranceLevel: 'aal2',
    });
  });

  it('refreshes through the shared account endpoint and preserves HTTP status failures', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        Response.json({
          access_token: 'fresh-access',
          refresh_token: 'fresh-refresh',
          expires_in: 3600,
          user: session.user,
        }),
      )
      .mockResolvedValueOnce(Response.json({ msg: 'unavailable' }, { status: 503 }));
    vi.stubGlobal('fetch', fetchMock);

    const refreshed = await refreshAccountPlatformSession(session);
    expect(refreshed.access_token).toBe('fresh-access');
    expect(fetchMock.mock.calls[0]?.[0]).toContain('/auth/v1/token?grant_type=refresh_token');

    await expect(refreshAccountPlatformSession(session)).rejects.toBeInstanceOf(
      AccountPlatformRequestError,
    );
    await expect(refreshAccountPlatformSession(session)).rejects.toMatchObject({ status: 503 });
  });

  it('records only Notes platform metadata and never app content', async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      expect(String(input)).toContain('/rest/v1/account_user_apps?');
      expect(init?.method).toBe('POST');
      const body = JSON.parse(String(init?.body)) as Record<string, unknown>;
      expect(body).toMatchObject({
        user_id: session.user.id,
        app_slug: 'notes',
        source: 'app',
      });
      expect(body).not.toHaveProperty('note');
      expect(body).not.toHaveProperty('payload');
      return new Response(null, { status: 204 });
    });
    vi.stubGlobal('fetch', fetchMock);

    await recordNotesAccountActivity(session);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
