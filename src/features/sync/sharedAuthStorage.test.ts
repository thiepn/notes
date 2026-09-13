import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  RETIRED_NOTES_SESSION_STORAGE_KEY,
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

  it('ignores and deletes the retired Notes-specific session', () => {
    const storage = memoryStorage({
      [RETIRED_NOTES_SESSION_STORAGE_KEY]: JSON.stringify(session),
    });
    vi.stubGlobal('window', { localStorage: storage });

    expect(readStoredSession()).toBeNull();
    expect(storage.getItem(SESSION_STORAGE_KEY)).toBeNull();
    expect(storage.getItem(RETIRED_NOTES_SESSION_STORAGE_KEY)).toBeNull();
  });

  it('keeps the shared THIEPN Account session while deleting retired auth state', () => {
    const shared = { ...session, user: { id: 'shared-owner' } };
    const storage = memoryStorage({
      [SESSION_STORAGE_KEY]: JSON.stringify(shared),
      [RETIRED_NOTES_SESSION_STORAGE_KEY]: JSON.stringify(session),
    });
    vi.stubGlobal('window', { localStorage: storage });

    expect(readStoredSession()).toEqual(shared);
    expect(storage.getItem(RETIRED_NOTES_SESSION_STORAGE_KEY)).toBeNull();
  });

  it('writes and removes only the shared session while cleaning the retired key', () => {
    const storage = memoryStorage({
      [RETIRED_NOTES_SESSION_STORAGE_KEY]: JSON.stringify(session),
    });
    vi.stubGlobal('window', { localStorage: storage });

    storeSession(session);
    expect(JSON.parse(storage.getItem(SESSION_STORAGE_KEY)!)).toEqual(session);
    expect(storage.getItem(RETIRED_NOTES_SESSION_STORAGE_KEY)).toBeNull();

    storeSession(null);
    expect(storage.getItem(SESSION_STORAGE_KEY)).toBeNull();
  });
});
