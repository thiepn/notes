import { PGlite } from '@electric-sql/pglite';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import {
  createNotesHubHandler,
  notesHubQuery,
  type NotesHubAuthorization,
  type NotesHubDependencies,
  type NotesHubRequest,
} from './notesProjection';

const A = '11111111-1111-4111-8111-111111111111';
const B = '22222222-2222-4222-8222-222222222222';
const NOW = Date.parse('2026-10-03T12:00:00.000Z');
const id = (n: number) => `33333333-3333-4333-8333-${n.toString(16).padStart(12, '0')}`;
const auth = (patch: Partial<NotesHubAuthorization> = {}): NotesHubAuthorization => ({
  accountId: A,
  consumer: 'thiepn-hub',
  audience: 'notes-hub',
  permissions: ['notes.hub.summary.read', 'notes.hub.continue.read', 'notes.hub.search.read'],
  grantRevision: 'grant-1',
  expiresAt: NOW + 600000,
  accountState: 'active',
  notesSyncAccess: true,
  ...patch,
});
const input = (patch: Partial<NotesHubRequest> = {}): NotesHubRequest => ({
  providerId: 'notes',
  operation: 'summary',
  requestId: 'request-1',
  context: {
    scope: 'account',
    accountId: A,
    workspaceId: null,
    grantRevision: 'grant-1',
    translationId: null,
  },
  ...patch,
});
const http = (body: unknown = input(), headers: Record<string, string> = {}) =>
  new Request('https://owner.example.test/hub/notes/v1', {
    method: 'POST',
    headers: {
      authorization: 'Bearer fictional-scoped-token',
      'content-type': 'application/json',
      ...headers,
    },
    body: JSON.stringify(body),
  });
const row = (patch: Record<string, unknown> = {}) => ({
  user_id: A,
  entity_type: 'note',
  entity_id: id(1),
  deleted_at: null,
  note_id: id(1),
  note_type: 'text',
  title: 'Only a title',
  note_updated_at: String(NOW - 1000),
  archived_at: null,
  trashed_at: null,
  synced_at: new Date(NOW - 500).toISOString(),
  ...patch,
});
const stub = (patch: Partial<NotesHubDependencies> = {}) => ({
  authorize: vi.fn(async () => auth()),
  query: vi.fn(async () => [row()]),
  now: () => NOW,
  ...patch,
});

describe('Notes owner projection against actual PostgreSQL semantics', () => {
  let db: PGlite;
  beforeAll(async () => {
    db = new PGlite();
    await db.exec(`
      create table public.notes_sync_records (
        user_id uuid not null, entity_type text not null, entity_id text not null,
        payload jsonb, deleted_at bigint, client_updated_at bigint not null,
        updated_at timestamptz not null, primary key (user_id,entity_type,entity_id)
      );
      create role notes_hub_reader;
      grant usage on schema public to notes_hub_reader;
      grant select on public.notes_sync_records to notes_hub_reader;
      alter table public.notes_sync_records enable row level security;
      create policy fixture_owner on public.notes_sync_records for select to notes_hub_reader
      using (user_id = current_setting('request.jwt.claim.sub',true)::uuid);
    `);
    const insert = async (
      n: number,
      owner: string,
      title: string,
      patch: Record<string, unknown> = {},
      entity = 'note',
      deleted: number | null = null,
    ) => {
      const payload = {
        id: id(n),
        type: 'text',
        title,
        content: 'DO_NOT_EXPORT_BODY',
        updatedAt: NOW - n * 1000,
        archivedAt: null,
        trashedAt: null,
        ...patch,
      };
      await db.query('insert into notes_sync_records values ($1,$2,$3,$4,$5,$6,$7)', [
        owner,
        entity,
        id(n),
        JSON.stringify(payload),
        deleted,
        NOW - n * 1000,
        new Date(NOW - 100).toISOString(),
      ]);
    };
    for (let n = 1; n <= 30; n++) await insert(n, A, `Public-looking private title ${n}`);
    await insert(1, B, 'OTHER_OWNER_SECRET');
    await insert(100, A, 'TOMBSTONE_SECRET', {}, 'note', NOW - 50);
    await insert(101, A, 'TRASH_SECRET', { trashedAt: NOW - 100 });
    await insert(102, A, 'Archived title', { archivedAt: NOW - 100 });
    await insert(103, A, 'LABEL_SECRET', {}, 'label');
    await insert(104, A, "Literal 100%_\\* quoted ' title");
    await insert(105, A, 'Large body match', { content: 'x'.repeat(1_000_000) });
  }, 30000);
  afterAll(async () => {
    await db.close();
  });
  const query: NotesHubDependencies['query'] = async (plan, authorization) =>
    db.transaction(async (tx) => {
      await tx.exec('set local role notes_hub_reader');
      await tx.query("select set_config('request.jwt.claim.sub',$1,true)", [
        authorization.accountId,
      ]);
      return (await tx.query(plan.text, [...plan.values])).rows;
    });
  for (const operation of ['summary', 'continue'] as const)
    it(`returns at most ten active owner notes for ${operation} without bodies or related entities`, async () => {
      const result = await createNotesHubHandler(stub({ query }))(http(input({ operation })));
      expect(result.status).toBe(200);
      const raw = await result.text(),
        envelope = JSON.parse(raw);
      expect(envelope.data.items).toHaveLength(10);
      expect(envelope.data.items.map((item: { resourceId: string }) => item.resourceId)).toEqual(
        Array.from({ length: 10 }, (_, n) => id(n + 1)),
      );
      expect(raw).not.toMatch(
        /DO_NOT_EXPORT_BODY|OTHER_OWNER_SECRET|TOMBSTONE_SECRET|TRASH_SECRET|LABEL_SECRET|Archived title|content|payload|attachment/,
      );
      expect(Object.keys(envelope.data.items[0]).sort()).toEqual([
        'resourceId',
        'title',
        'updatedAt',
      ]);
      expect(envelope.coverage).toBe('cloud-snapshot');
      expect(envelope.expiresAt).toBe(new Date(NOW + 300000).toISOString());
      expect(result.headers.get('cache-control')).toBe('no-store');
      expect(result.headers.get('access-control-allow-origin')).toBeNull();
    });
  it('applies bounded case-insensitive title search at the owner, including Archive and excluding Trash', async () => {
    const handler = createNotesHubHandler(stub({ query }));
    const response = await handler(http(input({ operation: 'search', query: 'PRIVATE TITLE' })));
    const envelope = await response.json();
    expect(envelope.data.items).toHaveLength(20);
    expect(JSON.stringify(envelope)).not.toContain('PRIVATE TITLE');
    const archived = await handler(http(input({ operation: 'search', query: 'Archived title' })));
    expect((await archived.json()).data.items[0].resourceId).toBe(id(102));
    const trashed = await handler(http(input({ operation: 'search', query: 'TRASH_SECRET' })));
    expect((await trashed.json()).status).toBe('empty');
  });
  it.each(['100%_\\*', "quoted ' title", "' OR true --", '*'])(
    'treats wildcards and SQL text as literal title query: %s',
    async (queryText) => {
      const result = await createNotesHubHandler(stub({ query }))(
        http(input({ operation: 'search', query: queryText })),
      );
      expect(result.status).toBe(200);
      const items = (await result.json()).data.items;
      expect(items.map((item: { resourceId: string }) => item.resourceId)).toEqual(
        queryText.includes('OR true') ? [] : [id(104)],
      );
    },
  );
  it('the fixture RLS independently denies other-owner rows even without a user WHERE clause', async () => {
    const rows = await db.transaction(async (tx) => {
      await tx.exec('set local role notes_hub_reader');
      await tx.query("select set_config('request.jwt.claim.sub',$1,true)", [B]);
      return (await tx.query<{ user_id: string }>('select user_id::text from notes_sync_records'))
        .rows;
    });
    expect(rows).toHaveLength(1);
    expect(rows[0]?.user_id).toBe(B);
    const handler = createNotesHubHandler(
      stub({ query, authorize: async () => auth({ accountId: B }) }),
    );
    const result = await handler(http(input({ context: { ...input().context, accountId: B } })));
    expect((await result.json()).data.items[0].title).toBe('OTHER_OWNER_SECRET');
  });
  it('the SQL plan has only metadata columns, a verified owner parameter and no raw query interpolation', () => {
    const request = input({ operation: 'search', query: "' OR true --" });
    const plan = notesHubQuery(request, auth());
    expect(plan.text).not.toContain(request.query);
    expect(plan.text).not.toMatch(/select\s+\*|payload\s*,|content|attachment/i);
    expect(plan.values).toEqual([A, "%' OR true --%", 20]);
  });
  it('keeps a one-megabyte note body inside the owner database', async () => {
    const result = await createNotesHubHandler(stub({ query }))(
      http(input({ operation: 'search', query: 'Large body match' })),
    );
    const raw = await result.text();
    expect(result.status).toBe(200);
    expect(JSON.parse(raw).data.items[0].resourceId).toBe(id(105));
    expect(new TextEncoder().encode(raw).byteLength).toBeLessThan(2048);
    expect(raw).not.toContain('xxxxxxxxxx');
  });
});

describe('Trusted authorization, lifecycle and request boundary', () => {
  const denied: Partial<NotesHubAuthorization>[] = [
    { accountId: B },
    { consumer: 'another-app' },
    { audience: 'other-owner' },
    { permissions: ['app_data.read'] },
    { permissions: ['notes.hub.continue.read'] },
    { grantRevision: 'grant-revoked' },
    { accountState: 'restricted' },
    { accountState: 'deleted' },
    { notesSyncAccess: false },
    { expiresAt: NOW },
    { expiresAt: NaN },
  ];
  it.each(denied)('denies the authorization mismatch before querying: %j', async (patch) => {
    const dependencies = stub({ authorize: vi.fn(async () => auth(patch)) });
    const response = await createNotesHubHandler(dependencies)(http());
    expect(response.status).toBe(403);
    expect(dependencies.query).not.toHaveBeenCalled();
    expect(await response.json()).toEqual({ status: 'unavailable' });
  });
  it('denies revoked grants after a permitted query without releasing titles', async () => {
    let calls = 0;
    const dependencies = stub({ authorize: async () => (++calls === 1 ? auth() : null) });
    const response = await createNotesHubHandler(dependencies)(http());
    expect(dependencies.query).toHaveBeenCalledOnce();
    expect(calls).toBe(2);
    expect(response.status).toBe(403);
    expect(await response.text()).not.toContain('Only a title');
  });
  it('bounds freshness by both authorization checks', async () => {
    let calls = 0;
    const handler = createNotesHubHandler(
      stub({ authorize: async () => auth({ expiresAt: NOW + (++calls === 1 ? 90000 : 30000) }) }),
    );
    expect((await (await handler(http())).json()).expiresAt).toBe(
      new Date(NOW + 30000).toISOString(),
    );
  });
  it.each([
    { ...input(), context: { ...input().context, workspaceId: 'wrong-workspace' } },
    { ...input(), context: { ...input().context, translationId: 'esv' } },
    { ...input(), context: { scope: 'device', deviceId: 'browser', consentRevision: 'consent' } },
    { ...input(), access_token: 'fictional' },
    { ...input(), operation: 'capture' },
    { ...input({ operation: 'search' }), query: '' },
    { ...input({ operation: 'search' }), query: 'x'.repeat(257) },
  ])('rejects unsupported request shapes before authorization', async (request) => {
    const dependencies = stub();
    const response = await createNotesHubHandler(dependencies)(http(request));
    expect(response.status).toBe(400);
    expect(dependencies.authorize).not.toHaveBeenCalled();
  });
  it('rejects missing credentials, query-string transport, methods and oversized bodies', async () => {
    const handler = createNotesHubHandler(stub());
    expect((await handler(http(input(), { authorization: '' }))).status).toBe(401);
    expect(
      (
        await handler(
          new Request('https://owner.example.test/hub/notes/v1?query=private', { method: 'POST' }),
        )
      ).status,
    ).toBe(400);
    expect((await handler(new Request('https://owner.example.test/hub/notes/v1'))).status).toBe(
      405,
    );
    expect((await handler(http({ ...input(), overflow: 'x'.repeat(5000) }))).status).toBe(413);
    expect((await handler(http(input(), { 'content-length': '5000' }))).status).toBe(413);
  });
  it('strips dependency failures from responses', async () => {
    const handler = createNotesHubHandler(
      stub({
        query: async () => {
          throw new Error('secret title / token / SQL / private search');
        },
      }),
    );
    const response = await handler(http());
    expect(response.status).toBe(503);
    expect(await response.text()).toBe('{"status":"unavailable"}');
  });
  it.each([
    row({ user_id: B }),
    row({ note_id: id(2) }),
    row({ trashed_at: '1' }),
    row({ archived_at: '1' }),
    row({ content: 'DO_NOT_EXPORT_BODY' }),
    row({ note_updated_at: String(NOW + 60000) }),
    row({ title: 'x'.repeat(501) }),
  ])('rejects unsafe data-source rows without private output', async (unsafe) => {
    const response = await createNotesHubHandler(stub({ query: async () => [unsafe] }))(http());
    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({ status: 'unavailable' });
  });
  it('rejects overflow and duplicate identities instead of silently accepting a wide read', async () => {
    for (const rows of [
      Array.from({ length: 11 }, (_, n) => row({ entity_id: id(n), note_id: id(n) })),
      [row(), row()],
    ]) {
      const response = await createNotesHubHandler(stub({ query: async () => rows }))(http());
      expect(response.status).toBe(503);
    }
  });
  it('uses a bounded title with no body-derived fallback or split surrogate', async () => {
    const response = await createNotesHubHandler(
      stub({
        query: async () => [
          row({ title: '😀'.repeat(200) }),
          row({ entity_id: id(2), note_id: id(2), title: '\n\t' }),
        ],
      }),
    )(http());
    const items = (await response.json()).data.items;
    expect(items[0].title).toBe('😀'.repeat(80));
    expect(items[1].title).toBe('Untitled note');
  });
  it('stops on request abort and refuses a late read', async () => {
    const controller = new AbortController();
    let release!: (rows: unknown[]) => void, started!: () => void;
    const began = new Promise<void>((resolve) => {
      started = resolve;
    });
    const dependencies = stub({
      query: async () => {
        started();
        return new Promise((resolve) => {
          release = resolve;
        });
      },
    });
    const pending = createNotesHubHandler(dependencies)(
      new Request(http(), { signal: controller.signal }),
    );
    await began;
    controller.abort();
    const result = await pending;
    release([row()]);
    expect(result.status).toBe(504);
    expect(await result.json()).toEqual({ status: 'unavailable' });
  });
  it('enforces a two-second deadline even when the trusted dependency ignores cancellation', async () => {
    vi.useFakeTimers();
    try {
      let started!: () => void;
      const began = new Promise<void>((resolve) => {
        started = resolve;
      });
      const handler = createNotesHubHandler(
        stub({
          authorize: async () => {
            started();
            return new Promise(() => {});
          },
        }),
      );
      const pending = handler(http());
      await began;
      await vi.advanceTimersByTimeAsync(2001);
      expect((await pending).status).toBe(504);
    } finally {
      vi.useRealTimers();
    }
  });
});
