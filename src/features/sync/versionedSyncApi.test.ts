import { afterEach, describe, expect, it, vi } from 'vitest';

import type { SupabaseSession } from './supabaseApi';
import {
  listVersionedRemoteRecords,
  SyncWriteConflictError,
  writeVersionedRemoteRecord,
} from './versionedSyncApi';

const session: SupabaseSession = {
  access_token: 'test-access',
  refresh_token: 'test-refresh',
  expires_at: 0,
  token_type: 'bearer',
  user: { id: 'test-owner' },
};

const mutation = {
  user_id: 'test-owner',
  entity_type: 'note' as const,
  entity_id: 'note-1',
  payload: { id: 'note-1', title: 'Local' },
  payload_hash: 'hash-local',
  client_updated_at: 10,
  deleted_at: null,
};

function remote(version: number) {
  return {
    ...mutation,
    version,
    updated_at: '2026-09-17T00:00:00Z',
  };
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('versioned sync transport', () => {
  it('reads and validates server-managed versions', async () => {
    const pages = [[remote(4)], []];
    const fetchMock = vi.fn(async () => Response.json(pages.shift()));
    vi.stubGlobal('fetch', fetchMock);

    const rows = await listVersionedRemoteRecords(session);

    expect(rows).toHaveLength(1);
    expect(rows[0]?.version).toBe(4);
    const calls = fetchMock.mock.calls as unknown as Array<[string, RequestInit]>;
    const url = new URL(String(calls[0]?.[0]));
    expect(url.searchParams.get('select')).toContain('version');
  });

  it('rejects invalid remote versions', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => Response.json([{ ...remote(1), version: 0 }])),
    );
    await expect(listVersionedRemoteRecords(session)).rejects.toThrow('invalid record version');
  });

  it('rejects unknown runtime entity types before reconciliation', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        Response.json([
          {
            ...remote(1),
            entity_type: 'unknown_runtime_type',
          },
        ]),
      ),
    );

    await expect(listVersionedRemoteRecords(session)).rejects.toThrow('invalid entity type');
  });

  it('validates every remote identity instead of trusting only the pagination cursor row', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        Response.json([
          { ...remote(1), entity_id: 'bad,identity' },
          { ...remote(2), entity_id: 'valid-last-row' },
        ]),
      ),
    );

    await expect(listVersionedRemoteRecords(session)).rejects.toThrow('invalid record identity');
  });

  it('creates without merge semantics and accepts server version 1', async () => {
    const fetchMock = vi.fn(async () => Response.json([remote(1)], { status: 201 }));
    vi.stubGlobal('fetch', fetchMock);

    const created = await writeVersionedRemoteRecord(session, mutation, null);

    expect(created.version).toBe(1);
    const [rawUrl, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(init.method).toBe('POST');
    expect(String(rawUrl)).not.toContain('on_conflict');
    expect(init.headers).toMatchObject({ Prefer: 'return=representation' });
  });

  it('classifies a duplicate create as a concurrency conflict', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => Response.json({ code: '23505' }, { status: 409 })),
    );

    await expect(writeVersionedRemoteRecord(session, mutation, null)).rejects.toBeInstanceOf(
      SyncWriteConflictError,
    );
  });

  it('updates only the exact observed version and requires one increment', async () => {
    const fetchMock = vi.fn(async () => Response.json([remote(8)]));
    vi.stubGlobal('fetch', fetchMock);

    const updated = await writeVersionedRemoteRecord(session, mutation, 7);

    expect(updated.version).toBe(8);
    const [rawUrl, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    const url = new URL(rawUrl);
    expect(init.method).toBe('PATCH');
    expect(url.searchParams.get('version')).toBe('eq.7');
    expect(url.searchParams.get('user_id')).toBe('eq.test-owner');
    expect(url.searchParams.get('entity_type')).toBe('eq.note');
    expect(url.searchParams.get('entity_id')).toBe('eq.note-1');
    expect(JSON.parse(String(init.body))).not.toHaveProperty('version');
  });

  it('treats a zero-row conditional update as a stale write', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => Response.json([])),
    );

    await expect(writeVersionedRemoteRecord(session, mutation, 3)).rejects.toMatchObject({
      name: 'SyncWriteConflictError',
      expectedVersion: 3,
    });
  });

  it('rejects a server response that skips a version', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => Response.json([remote(9)])),
    );
    await expect(writeVersionedRemoteRecord(session, mutation, 7)).rejects.toThrow(
      'advance the record version exactly once',
    );
  });
});
