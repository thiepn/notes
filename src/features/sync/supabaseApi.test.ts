import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  listRemoteRecords,
  refreshSession,
  SupabaseRequestError,
  type SupabaseSession,
} from './supabaseApi';
const session: SupabaseSession = {
  access_token: 'test-access',
  refresh_token: 'test-refresh',
  expires_at: 0,
  token_type: 'bearer',
  user: { id: 'test-owner' },
};
const row = (n: number) => ({
  user_id: 'test-owner',
  entity_type: 'note',
  entity_id: `note-${String(n).padStart(5, '0')}`,
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});
describe('bounded cloud API requests', () => {
  it('reads beyond the server row cap using an ordered cursor', async () => {
    const pages = [
      Array.from({ length: 500 }, (_, i) => row(i)),
      Array.from({ length: 500 }, (_, i) => row(i + 500)),
      [row(1000)],
      [],
    ];
    const fetchMock = vi.fn(async () => Response.json(pages.shift()));
    vi.stubGlobal('fetch', fetchMock);
    const result = await listRemoteRecords(session);
    expect(result).toHaveLength(1001);
    expect(fetchMock).toHaveBeenCalledTimes(4);
    const calls = fetchMock.mock.calls as unknown as Array<[string, RequestInit]>;
    expect(new URL(calls[0]![0]).searchParams.get('order')).toBe('entity_type.asc,entity_id.asc');
    expect(new URL(calls[1]![0]).searchParams.get('or')).toContain('note-00499');
    expect(calls[0]![1].signal).toBeDefined();
  });
  it('continues when a project has a smaller page cap than requested', async () => {
    const pages = [[row(0)], [row(1)], []];
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => Response.json(pages.shift())),
    );
    expect(await listRemoteRecords(session)).toHaveLength(2);
  });
  it('rejects a repeated cursor instead of looping or returning incomplete data', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => Response.json([row(0)])),
    );
    await expect(listRemoteRecords(session)).rejects.toThrow('did not advance');
  });
  it('rejects records from a different account', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => Response.json([{ ...row(0), user_id: 'someone-else' }])),
    );
    await expect(listRemoteRecords(session)).rejects.toThrow('different account');
  });
  it('coalesces simultaneous refreshes so a token is not consumed twice', async () => {
    const fetchMock = vi.fn(async () =>
      Response.json({
        access_token: 'fresh',
        refresh_token: 'new-refresh',
        expires_in: 3600,
        user: session.user,
      }),
    );
    vi.stubGlobal('fetch', fetchMock);
    const [a, b] = await Promise.all([refreshSession(session), refreshSession(session)]);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(a).toBe(b);
    expect(a.access_token).toBe('fresh');
  });
  it('retains HTTP status and releases failed refreshes for retry', async () => {
    const fetchMock = vi.fn(async () =>
      Response.json({ msg: 'temporarily unavailable' }, { status: 503 }),
    );
    vi.stubGlobal('fetch', fetchMock);
    await expect(refreshSession(session)).rejects.toBeInstanceOf(SupabaseRequestError);
    await expect(refreshSession(session)).rejects.toMatchObject({ status: 503 });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});
