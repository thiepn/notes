import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  LEGACY_NOTES_SESSION_STORAGE_KEY,
  SESSION_STORAGE_KEY,
  readStoredSession,
  storeSession,
  type SupabaseSession,
} from './supabaseApi';

const session: SupabaseSession = {
  access_token: 'access-token',
  refresh_token: 'refresh-token',
  expires_at: 2_000_000_000,
  token_type: 'bearer',
  user: { id: 'owner-id', email: 'owner@example.test' },
};

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

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('THIEPN Account shared auth storage', () => {
  it('uses the shared Supabase project storage key', () => {
    expect(SESSION_STORAGE_KEY).toBe('sb-hycegznamzjhwinegaai-auth-token');
  });

  it('promotes a valid legacy Notes session when no shared session exists', () => {
    const storage = memoryStorage({
      [LEGACY_NOTES_SESSION_STORAGE_KEY]: JSON.stringify(session),
    });
    vi.stubGlobal('window', { localStorage: storage });

    expect(readStoredSession()).toEqual(session);
    expect(JSON.parse(storage.getItem(SESSION_STORAGE_KEY)!)).toEqual(session);
    expect(storage.getItem(LEGACY_NOTES_SESSION_STORAGE_KEY)).toBeNull();
  });

  it('prefers an existing shared session over the legacy Notes session', () => {
    const shared = { ...session, user: { id: 'shared-owner' } };
    const storage = memoryStorage({
      [SESSION_STORAGE_KEY]: JSON.stringify(shared),
      [LEGACY_NOTES_SESSION_STORAGE_KEY]: JSON.stringify(session),
    });
    vi.stubGlobal('window', { localStorage: storage });

    expect(readStoredSession()).toEqual(shared);
  });

  it('writes and removes the shared session while cleaning the legacy key', () => {
    const storage = memoryStorage({
      [LEGACY_NOTES_SESSION_STORAGE_KEY]: JSON.stringify(session),
    });
    vi.stubGlobal('window', { localStorage: storage });

    storeSession(session);
    expect(JSON.parse(storage.getItem(SESSION_STORAGE_KEY)!)).toEqual(session);
    expect(storage.getItem(LEGACY_NOTES_SESSION_STORAGE_KEY)).toBeNull();

    storeSession(null);
    expect(storage.getItem(SESSION_STORAGE_KEY)).toBeNull();
  });
});
