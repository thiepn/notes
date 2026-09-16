import { afterEach, describe, expect, it, vi } from 'vitest';

import type { SupabaseSession } from './supabaseApi';
import {
  immutableAttachmentStoragePath,
  isSupportedAttachmentStoragePath,
  sha256Blob,
  uploadImmutableAttachment,
} from './attachmentStorage';

const session: SupabaseSession = {
  access_token: 'attachment-access',
  refresh_token: 'attachment-refresh',
  expires_at: 0,
  token_type: 'bearer',
  user: { id: '11111111-1111-4111-8111-111111111111' },
};
const attachmentId = '22222222-2222-4222-8222-222222222222';

async function fixture(content = 'immutable attachment bytes') {
  const blob = new Blob([content], { type: 'text/plain' });
  return { blob, checksum: await sha256Blob(blob) };
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('immutable attachment storage', () => {
  it('uses a content-addressed path while retaining legacy paths as readable', async () => {
    const { checksum } = await fixture();
    const immutable = immutableAttachmentStoragePath(session.user.id, attachmentId, checksum);

    expect(immutable).toBe(`${session.user.id}/${attachmentId}/${checksum}`);
    expect(
      isSupportedAttachmentStoragePath(session.user.id, attachmentId, checksum, immutable),
    ).toBe(true);
    expect(
      isSupportedAttachmentStoragePath(
        session.user.id,
        attachmentId,
        checksum,
        `${session.user.id}/${attachmentId}`,
      ),
    ).toBe(true);
    expect(
      isSupportedAttachmentStoragePath(
        session.user.id,
        attachmentId,
        checksum,
        `${session.user.id}/different/${checksum}`,
      ),
    ).toBe(false);
  });

  it('uploads without overwrite semantics and returns the immutable path', async () => {
    const { blob, checksum } = await fixture();
    const fetchMock = vi.fn(async () => new Response(null, { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);

    const path = await uploadImmutableAttachment(session, attachmentId, checksum, blob);

    expect(path).toBe(`${session.user.id}/${attachmentId}/${checksum}`);
    const [rawUrl, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(rawUrl).toContain(`/${attachmentId}/${checksum}`);
    expect(init.method).toBe('POST');
    expect(init.headers).toMatchObject({ 'x-upsert': 'false' });
  });

  it('rejects local bytes that do not match the requested content address', async () => {
    const { blob } = await fixture('actual bytes');
    const other = await fixture('different bytes');
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    await expect(
      uploadImmutableAttachment(session, attachmentId, other.checksum, blob),
    ).rejects.toThrow('stored checksum');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('treats an already-existing immutable generation as success only after byte verification', async () => {
    const { blob, checksum } = await fixture();
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        Response.json({ message: 'The resource already exists' }, { status: 400 }),
      )
      .mockResolvedValueOnce(new Response(blob, { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);

    await expect(uploadImmutableAttachment(session, attachmentId, checksum, blob)).resolves.toBe(
      `${session.user.id}/${attachmentId}/${checksum}`,
    );
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('rejects a colliding immutable path whose existing bytes do not match the checksum', async () => {
    const { blob, checksum } = await fixture('expected bytes');
    const wrong = new Blob(['wrong bytes'], { type: 'text/plain' });
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        Response.json({ message: 'The resource already exists' }, { status: 409 }),
      )
      .mockResolvedValueOnce(new Response(wrong, { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);

    await expect(uploadImmutableAttachment(session, attachmentId, checksum, blob)).rejects.toThrow(
      'content address',
    );
  });
});
