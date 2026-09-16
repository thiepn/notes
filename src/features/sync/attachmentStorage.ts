import {
  classifyOperationalStatus,
  createOperationId,
  logOperationalEvent,
} from './operations';
import {
  downloadAttachment,
  SupabaseRequestError,
  type SupabaseSession,
} from './supabaseApi';

const SUPABASE_URL = 'https://hycegznamzjhwinegaai.supabase.co';
const SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_1rZzRPzfLMaAH5pIgCwIjA_19UPMIsR';
const ATTACHMENT_BUCKET = 'notes-attachments';
const SHA256_HEX = /^[0-9a-f]{64}$/u;

export function immutableAttachmentStoragePath(
  userId: string,
  attachmentId: string,
  checksum: string,
): string {
  assertContentChecksum(checksum);
  return `${userId}/${attachmentId}/${checksum}`;
}

export function isSupportedAttachmentStoragePath(
  userId: string,
  attachmentId: string,
  checksum: string,
  path: string,
): boolean {
  if (!SHA256_HEX.test(checksum)) return false;
  return (
    path === `${userId}/${attachmentId}` ||
    path === immutableAttachmentStoragePath(userId, attachmentId, checksum)
  );
}

export async function uploadImmutableAttachment(
  session: SupabaseSession,
  attachmentId: string,
  checksum: string,
  blob: Blob,
): Promise<string> {
  const path = immutableAttachmentStoragePath(session.user.id, attachmentId, checksum);
  const actualChecksum = await sha256Blob(blob);
  if (actualChecksum !== checksum) {
    throw new Error('Local attachment bytes do not match their stored checksum.');
  }

  const operationId = createOperationId();
  const started = Date.now();
  let response: Response;
  try {
    response = await fetch(
      `${SUPABASE_URL}/storage/v1/object/${ATTACHMENT_BUCKET}/${encodeStoragePath(path)}`,
      {
        method: 'POST',
        signal: AbortSignal.timeout(30_000),
        headers: {
          apikey: SUPABASE_PUBLISHABLE_KEY,
          Authorization: `Bearer ${session.access_token}`,
          'Content-Type': blob.type || 'application/octet-stream',
          'x-upsert': 'false',
        },
        body: blob,
      },
    );
  } catch {
    logOperationalEvent({
      event: 'notes.request.failure',
      operationId,
      category: 'network',
      status: 0,
      durationMs: Date.now() - started,
    });
    throw new SupabaseRequestError(
      'Cloud service could not be reached. Local notes are unchanged.',
      0,
    );
  }

  if (response.ok) {
    if (response.status !== 204) await response.text();
    return path;
  }

  const uploadError = await responseError(response);
  if (response.status === 400 || response.status === 409) {
    try {
      const existing = await downloadAttachment(session, path);
      const existingChecksum = await sha256Blob(existing);
      if (existing.size === blob.size && existingChecksum === checksum) return path;
      throw new Error('Existing cloud attachment bytes do not match their content address.');
    } catch (error) {
      if (!(error instanceof Error) || !error.message.includes('content address')) {
        throw uploadError;
      }
      throw error;
    }
  }

  logOperationalEvent({
    event: 'notes.request.failure',
    operationId,
    category: classifyOperationalStatus(response.status),
    status: response.status,
    durationMs: Date.now() - started,
  });
  throw uploadError;
}

export async function sha256Blob(blob: Blob): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', await blob.arrayBuffer());
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

function assertContentChecksum(checksum: string): void {
  if (!SHA256_HEX.test(checksum)) {
    throw new Error('Attachment checksum is not a SHA-256 content address.');
  }
}

async function responseError(response: Response): Promise<SupabaseRequestError> {
  const payload = (await response.json().catch(() => null)) as {
    message?: string;
    error?: string;
    code?: string;
  } | null;
  return new SupabaseRequestError(
    payload?.message ??
      payload?.error ??
      payload?.code ??
      `Supabase request failed (${response.status}).`,
    response.status,
  );
}

function encodeStoragePath(path: string): string {
  return path
    .split('/')
    .map((part) => encodeURIComponent(part))
    .join('/');
}
