/** Owner-side component only. No route registration, browser imports or credentials.
 * Authorization and an RLS-preserving SQL connection must be supplied by the
 * trusted runtime; an ordinary Supabase user JWT is not a Hub-purpose grant.
 */
export const NOTES_HUB_CONSUMER = 'thiepn-hub';
export const NOTES_HUB_AUDIENCE = 'notes-hub';
export type NotesHubOperation = 'summary' | 'continue' | 'search';
export type NotesHubContext = {
  scope: 'account';
  accountId: string;
  workspaceId: null;
  grantRevision: string;
  translationId: null;
};
export interface NotesHubRequest {
  providerId: 'notes';
  operation: NotesHubOperation;
  requestId: string;
  context: NotesHubContext;
  query?: string;
}
export interface NotesHubAuthorization {
  accountId: string;
  consumer: string;
  audience: string;
  permissions: readonly string[];
  grantRevision: string;
  expiresAt: number;
  accountState: 'active' | 'restricted' | 'deleted';
  notesSyncAccess: boolean;
}
export interface NotesHubQuery {
  text: string;
  values: readonly (string | number)[];
}
export interface NotesHubDependencies {
  authorize(bearer: string, signal: AbortSignal): Promise<NotesHubAuthorization | null>;
  // The runtime binds the verified subject to the DB session/RLS before execute.
  query(
    plan: NotesHubQuery,
    authorization: NotesHubAuthorization,
    signal: AbortSignal,
  ): Promise<unknown[]>;
  now?: () => number;
}
class ProjectionFailure extends Error {
  status: number;
  constructor(status: number) {
    super('Notes projection unavailable');
    this.status = status;
  }
}
const control = (point: string) => point.charCodeAt(0) <= 31 || point.charCodeAt(0) === 127;
const hasControl = (value: string) => Array.from(value).some(control);
const uuid = (v: unknown): v is string =>
  typeof v === 'string' &&
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v);
const token = (v: unknown): v is string =>
  typeof v === 'string' && /^[a-zA-Z0-9:_-]{1,128}$/.test(v);
const object = (v: unknown): v is Record<string, unknown> =>
  !!v && typeof v === 'object' && !Array.isArray(v);
const exactKeys = (v: Record<string, unknown>, keys: string[]) =>
  Object.keys(v).sort().join(',') === keys.sort().join(',');
const timestamp = (v: unknown): v is string =>
  typeof v === 'string' &&
  /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(v) &&
  Number.isFinite(Date.parse(v)) &&
  new Date(v).toISOString() === v;
const milliseconds = (v: unknown): number => {
  const n = typeof v === 'string' && /^\d+$/.test(v) ? Number(v) : v;
  if (typeof n !== 'number' || !Number.isSafeInteger(n) || n < 0 || n > 8.64e15)
    throw new ProjectionFailure(503);
  return n;
};
export function parseNotesHubRequest(v: unknown): NotesHubRequest {
  if (!object(v) || !['summary', 'continue', 'search'].includes(String(v.operation)))
    throw new ProjectionFailure(400);
  const searching = v.operation === 'search';
  if (
    !exactKeys(v, [
      'providerId',
      'operation',
      'requestId',
      'context',
      ...(searching ? ['query'] : []),
    ]) ||
    v.providerId !== 'notes' ||
    !token(v.requestId) ||
    !object(v.context) ||
    !exactKeys(v.context, [
      'scope',
      'accountId',
      'workspaceId',
      'grantRevision',
      'translationId',
    ]) ||
    v.context.scope !== 'account' ||
    !uuid(v.context.accountId) ||
    v.context.workspaceId !== null ||
    v.context.translationId !== null ||
    !token(v.context.grantRevision) ||
    (searching &&
      (typeof v.query !== 'string' ||
        !v.query.trim() ||
        v.query.length > 256 ||
        hasControl(v.query)))
  )
    throw new ProjectionFailure(400);
  return structuredClone(v) as unknown as NotesHubRequest;
}
function requireAuthorization(
  auth: NotesHubAuthorization | null,
  request: NotesHubRequest,
  now: number,
): NotesHubAuthorization {
  if (
    !auth ||
    !uuid(auth.accountId) ||
    auth.accountId.toLowerCase() !== request.context.accountId.toLowerCase() ||
    auth.consumer !== NOTES_HUB_CONSUMER ||
    auth.audience !== NOTES_HUB_AUDIENCE ||
    auth.accountState !== 'active' ||
    auth.notesSyncAccess !== true ||
    auth.grantRevision !== request.context.grantRevision ||
    !Number.isSafeInteger(auth.expiresAt) ||
    auth.expiresAt <= now ||
    !Array.isArray(auth.permissions) ||
    !auth.permissions.includes(`notes.hub.${request.operation}.read`)
  )
    throw new ProjectionFailure(403);
  return structuredClone(auth);
}
/** Parameters carry private search text. Never log plans/values or append them to URLs. */
export function notesHubQuery(
  request: NotesHubRequest,
  authorization: NotesHubAuthorization,
): NotesHubQuery {
  const searching = request.operation === 'search';
  const limit = searching ? 20 : 10;
  const pattern = searching ? '%' + request.query!.trim().replace(/[\\%_]/g, '\\$&') + '%' : null;
  const text = String.raw`select user_id::text, entity_type, entity_id, deleted_at,
  payload->>'id' as note_id, payload->>'type' as note_type,
  payload->>'title' as title, payload->>'updatedAt' as note_updated_at,
  payload->>'archivedAt' as archived_at, payload->>'trashedAt' as trashed_at,
  to_char(updated_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') as synced_at
from public.notes_sync_records
where user_id = $1::uuid and entity_type = 'note' and deleted_at is null
  and payload->>'trashedAt' is null
  ${searching ? String.raw`and payload->>'title' ilike $2 escape E'\\'` : "and payload->>'archivedAt' is null"}
order by client_updated_at desc, entity_id asc
limit $${searching ? 3 : 2}`;
  return {
    text,
    values: searching
      ? [authorization.accountId, pattern!, limit]
      : [authorization.accountId, limit],
  };
}
function displayTitle(title: string): string {
  const normalized = Array.from(title.normalize('NFC'), (point) => (control(point) ? ' ' : point))
    .join('')
    .replace(/\s+/gu, ' ')
    .trim();
  let result = '';
  for (const point of normalized) {
    if (result.length + point.length > 160) break;
    result += point;
  }
  return result || 'Untitled note';
}
function projectRows(rows: unknown[], request: NotesHubRequest, now: number) {
  if (!Array.isArray(rows) || rows.length > (request.operation === 'search' ? 20 : 10))
    throw new ProjectionFailure(503);
  const ids = new Set<string>();
  let sourceUpdatedAt: string | null = null;
  const items = rows.map((row) => {
    if (
      !object(row) ||
      !exactKeys(row, [
        'user_id',
        'entity_type',
        'entity_id',
        'deleted_at',
        'note_id',
        'note_type',
        'title',
        'note_updated_at',
        'archived_at',
        'trashed_at',
        'synced_at',
      ]) ||
      !uuid(row.user_id) ||
      row.user_id.toLowerCase() !== request.context.accountId.toLowerCase() ||
      row.entity_type !== 'note' ||
      row.deleted_at !== null ||
      !uuid(row.entity_id) ||
      row.note_id !== row.entity_id ||
      !['text', 'checklist'].includes(String(row.note_type)) ||
      typeof row.title !== 'string' ||
      row.title.length > 500 ||
      row.trashed_at !== null ||
      (request.operation !== 'search' && row.archived_at !== null) ||
      !timestamp(row.synced_at) ||
      Date.parse(row.synced_at) > now + 30000 ||
      ids.has(row.entity_id.toLowerCase())
    )
      throw new ProjectionFailure(503);
    if (row.archived_at !== null) milliseconds(row.archived_at);
    const updatedAt = milliseconds(row.note_updated_at);
    if (updatedAt > now + 30000) throw new ProjectionFailure(503);
    ids.add(row.entity_id.toLowerCase());
    if (sourceUpdatedAt === null || row.synced_at > sourceUpdatedAt)
      sourceUpdatedAt = row.synced_at;
    return {
      resourceId: row.entity_id,
      title: displayTitle(row.title),
      updatedAt: new Date(updatedAt).toISOString(),
    };
  });
  return { items, sourceUpdatedAt };
}
async function requestBody(request: Request, signal: AbortSignal): Promise<unknown> {
  if (
    !/^application\/json(?:;|$)/i.test(request.headers.get('content-type') ?? '') ||
    !request.body
  )
    throw new ProjectionFailure(400);
  const length = request.headers.get('content-length');
  if (length !== null && (!/^\d+$/.test(length) || Number(length) > 4096))
    throw new ProjectionFailure(413);
  const reader = request.body.getReader(),
    parts: Uint8Array[] = [];
  const abort = () => {
    void reader.cancel().catch(() => {});
  };
  signal.addEventListener('abort', abort, { once: true });
  let size = 0;
  try {
    while (true) {
      if (signal.aborted) throw new ProjectionFailure(504);
      const part = await reader.read();
      if (signal.aborted) throw new ProjectionFailure(504);
      if (part.done) break;
      size += part.value.byteLength;
      if (size > 4096) throw new ProjectionFailure(413);
      parts.push(part.value);
    }
    const bytes = new Uint8Array(size);
    let offset = 0;
    for (const part of parts) {
      bytes.set(part, offset);
      offset += part.byteLength;
    }
    try {
      return JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes));
    } catch {
      throw new ProjectionFailure(400);
    }
  } finally {
    signal.removeEventListener('abort', abort);
    await reader.cancel().catch(() => {});
    reader.releaseLock();
  }
}
const response = (value: unknown, status = 200) =>
  new Response(JSON.stringify(value), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store',
      Vary: 'Authorization',
      'X-Content-Type-Options': 'nosniff',
      'Referrer-Policy': 'no-referrer',
    },
  });
/** Not mounted anywhere. The runtime must independently authenticate tokens,
 * resolve live grants/account lifecycle/Notes entitlement, and preserve RLS.
 */
export function createNotesHubHandler(
  dependencies: NotesHubDependencies,
): (request: Request) => Promise<Response> {
  const now = dependencies.now ?? Date.now;
  return async (request) => {
    const controller = new AbortController();
    const signal = AbortSignal.any([request.signal, controller.signal]);
    const timer = setTimeout(() => controller.abort(), 2000);
    let detach = () => {};
    try {
      const aborted = new Promise<never>((_, reject) => {
        const abort = () => reject(new ProjectionFailure(504));
        detach = () => signal.removeEventListener('abort', abort);
        if (signal.aborted) abort();
        else signal.addEventListener('abort', abort, { once: true });
      });
      const work = async () => {
        const url = new URL(request.url);
        if (request.method !== 'POST') throw new ProjectionFailure(405);
        if (url.pathname !== '/hub/notes/v1' || url.search || url.hash)
          throw new ProjectionFailure(400);
        const bearer = /^Bearer ([a-zA-Z0-9._~-]{16,8192})$/.exec(
          request.headers.get('authorization') ?? '',
        )?.[1];
        if (!bearer) throw new ProjectionFailure(401);
        const input = parseNotesHubRequest(await requestBody(request, signal));
        const initial = requireAuthorization(
          await dependencies.authorize(bearer, signal),
          input,
          now(),
        );
        if (signal.aborted) throw new ProjectionFailure(504);
        const rows = await dependencies.query(notesHubQuery(input, initial), initial, signal);
        if (signal.aborted) throw new ProjectionFailure(504);
        // Re-check after the read: a revoked grant/closed account cannot release
        // a result merely because it was permitted when the query started.
        const current = requireAuthorization(
          await dependencies.authorize(bearer, signal),
          input,
          now(),
        );
        if (signal.aborted) throw new ProjectionFailure(504);
        const observed = now(),
          projected = projectRows(rows, input, observed);
        const expires = Math.min(observed + 300000, initial.expiresAt, current.expiresAt);
        if (expires <= observed) throw new ProjectionFailure(403);
        const envelope = {
          schemaVersion: 1,
          providerId: 'notes',
          operation: input.operation,
          requestId: input.requestId,
          context: input.context,
          privacy: 'private',
          coverage: 'cloud-snapshot',
          status: projected.items.length ? 'ready' : 'empty',
          observedAt: new Date(observed).toISOString(),
          expiresAt: new Date(expires).toISOString(),
          sourceUpdatedAt: projected.sourceUpdatedAt,
          data: { items: projected.items },
        };
        const encoded = JSON.stringify(envelope);
        if (
          new TextEncoder().encode(encoded).byteLength >
          (input.operation === 'search' ? 65536 : 32768)
        )
          throw new ProjectionFailure(503);
        return response(envelope);
      };
      return await Promise.race([work(), aborted]);
    } catch (error) {
      // Do not return SQL, queries, tokens, titles, counts or dependency errors.
      return response(
        { status: 'unavailable' },
        error instanceof ProjectionFailure ? error.status : 503,
      );
    } finally {
      clearTimeout(timer);
      detach();
      controller.abort();
    }
  };
}
