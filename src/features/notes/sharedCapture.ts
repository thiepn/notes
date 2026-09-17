import {
  MAX_ATTACHMENTS_PER_NOTE,
  MAX_NATIVE_AUDIO_BYTES,
  MAX_TOTAL_ATTACHMENT_BYTES_PER_NOTE,
  attachmentRecordSchema,
  isPreviewableImageMimeType,
  isVoiceAudioMimeType,
  noteRecordSchema,
  prepareImageAttachment,
  settingRecordSchema,
  type AttachmentRecord,
  type NoteRecord,
  type PreparedImageAttachment,
} from '../../db';
import type { NotesDatabase } from '../../db/database';
import { linkTitleFromUrl } from './captureEverywhere';

export const RICH_SHARE_CACHE = 'notes-share-target-v2';
export const LEGACY_SHARE_CACHE = 'notes-share-target-v1';
export const SHARE_CAPTURE_LEDGER_PREFIX = 'internal.share-capture.v1:';
export const MAX_SHARED_FILES = 20;
export const MAX_SHARED_STAGED_BYTES = 100 * 1024 * 1024;
export const MAX_SHARED_GENERIC_FILE_BYTES = 50 * 1024 * 1024;
export const MAX_SHARE_STAGE_AGE_MS = 24 * 60 * 60 * 1000;

const MAX_SHARE_TITLE = 500;
const MAX_SHARE_CONTENT = 1_000_000;
const MAX_SHARE_URL = 16_384;
const SHARE_PAYLOAD_PREFIX = '/notes/share-payload/';
const SHARE_STAGE_VERSION_HEADER = 'X-Notes-Share-Stage-Version';
const SHARE_STAGED_AT_HEADER = 'X-Notes-Share-Staged-At';
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;

const GENERIC_SHARED_MIME_TYPES = new Set([
  'application/json',
  'application/msword',
  'application/pdf',
  'application/vnd.ms-excel',
  'application/vnd.ms-powerpoint',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'text/csv',
  'text/markdown',
  'text/plain',
]);

const MIME_BY_EXTENSION: Record<string, string> = {
  aac: 'audio/aac',
  csv: 'text/csv',
  doc: 'application/msword',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  gif: 'image/gif',
  jpeg: 'image/jpeg',
  jpg: 'image/jpeg',
  json: 'application/json',
  m4a: 'audio/x-m4a',
  md: 'text/markdown',
  mp3: 'audio/mpeg',
  mp4: 'audio/mp4',
  oga: 'audio/ogg',
  ogg: 'audio/ogg',
  pdf: 'application/pdf',
  png: 'image/png',
  ppt: 'application/vnd.ms-powerpoint',
  pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  txt: 'text/plain',
  wav: 'audio/wav',
  webm: 'audio/webm',
  webp: 'image/webp',
  xls: 'application/vnd.ms-excel',
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
};

export interface PreparedSharedAttachment {
  name: string;
  mimeType: string;
  size: number;
  checksum: string;
  data: Blob;
}

export interface PreparedSharedCapture {
  title: string;
  content: string;
  attachments: PreparedSharedAttachment[];
}

export interface SharedCaptureCommitResult {
  consumed: true;
  note: NoteRecord | null;
  reused: boolean;
}

export interface StagedSharePayload {
  title: string;
  text: string;
  url: string;
  files: File[];
  cacheName: typeof RICH_SHARE_CACHE | typeof LEGACY_SHARE_CACHE;
  payloadUrl: string;
}

interface SharedCaptureRepositoryOptions {
  clock?: () => number;
  idFactory?: () => string;
}

interface ShareLedgerValue {
  noteId: string;
  capturedAt: number;
}

export class SharedCaptureValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SharedCaptureValidationError';
  }
}

export class SharedCaptureRepository {
  private readonly clock: () => number;
  private readonly idFactory: () => string;

  constructor(
    private readonly database: NotesDatabase,
    options: SharedCaptureRepositoryOptions = {},
  ) {
    this.clock = options.clock ?? Date.now;
    this.idFactory = options.idFactory ?? (() => crypto.randomUUID());
  }

  async lookup(shareKey: string): Promise<SharedCaptureCommitResult | null> {
    const ledger = await this.database.settings.get(shareLedgerKey(shareKey));
    if (!ledger) return null;
    const parsed = parseLedger(ledger.value);
    const note = await this.database.notes.get(parsed.noteId);
    return {
      consumed: true,
      note: note ? noteRecordSchema.parse(note) : null,
      reused: true,
    };
  }

  async commit(
    shareKey: string,
    capture: PreparedSharedCapture,
  ): Promise<SharedCaptureCommitResult> {
    assertShareKey(shareKey);
    validatePreparedCapture(capture);

    return this.database.transaction(
      'rw',
      this.database.notes,
      this.database.attachments,
      this.database.settings,
      async () => {
        const ledgerKey = shareLedgerKey(shareKey);
        const existingLedger = await this.database.settings.get(ledgerKey);
        if (existingLedger) {
          const parsed = parseLedger(existingLedger.value);
          const existingNote = await this.database.notes.get(parsed.noteId);
          return {
            consumed: true,
            note: existingNote ? noteRecordSchema.parse(existingNote) : null,
            reused: true,
          };
        }

        const timestamp = this.readClock();
        const noteId = this.idFactory();
        const existingNotes = await this.database.notes.toArray();
        const position =
          existingNotes.reduce((highest, note) => Math.max(highest, note.position), -1) + 1;
        const note = noteRecordSchema.parse({
          id: noteId,
          type: 'text',
          title: capture.title,
          content: capture.content,
          color: 'default',
          createdAt: timestamp,
          updatedAt: timestamp,
          pinnedAt: null,
          archivedAt: null,
          trashedAt: null,
          position,
          revision: 1,
        });
        const attachments = capture.attachments.map((attachment) =>
          attachmentRecordSchema.parse({
            id: this.idFactory(),
            noteId,
            name: attachment.name,
            mimeType: attachment.mimeType,
            size: attachment.size,
            checksum: attachment.checksum,
            data: attachment.data,
            createdAt: timestamp,
          }),
        );
        const ledger = settingRecordSchema.parse({
          key: ledgerKey,
          value: JSON.stringify({ noteId, capturedAt: timestamp } satisfies ShareLedgerValue),
          updatedAt: timestamp,
        });

        await this.database.notes.add(note);
        if (attachments.length > 0) await this.database.attachments.bulkAdd(attachments);
        await this.database.settings.add(ledger);

        return { consumed: true, note, reused: false };
      },
    );
  }

  private readClock(): number {
    const timestamp = this.clock();
    if (!Number.isSafeInteger(timestamp) || timestamp < 0) {
      throw new RangeError('The shared-capture clock must return a non-negative safe integer.');
    }
    return timestamp;
  }
}

export async function readStagedShare(shareKey: string): Promise<StagedSharePayload | null> {
  assertShareKey(shareKey);
  if (!('caches' in window)) return null;
  const payloadUrl = new URL(sharePayloadPath(shareKey), window.location.origin).toString();

  const richCache = await window.caches.open(RICH_SHARE_CACHE);
  const richResponse = await richCache.match(payloadUrl);
  if (richResponse) {
    const stagedAt = Number(richResponse.headers.get(SHARE_STAGED_AT_HEADER));
    if (
      Number.isFinite(stagedAt) &&
      stagedAt > 0 &&
      Date.now() - stagedAt > MAX_SHARE_STAGE_AGE_MS
    ) {
      await richCache.delete(payloadUrl);
      return null;
    }
    if (richResponse.headers.get(SHARE_STAGE_VERSION_HEADER) !== '2') {
      await richCache.delete(payloadUrl);
      return null;
    }
    try {
      const form = await richResponse.formData();
      return {
        title: formString(form, 'title'),
        text: formString(form, 'text'),
        url: formString(form, 'url'),
        files: form
          .getAll('files')
          .filter((value): value is File => typeof File !== 'undefined' && value instanceof File),
        cacheName: RICH_SHARE_CACHE,
        payloadUrl,
      };
    } catch {
      await richCache.delete(payloadUrl);
      return null;
    }
  }

  const legacyCache = await window.caches.open(LEGACY_SHARE_CACHE);
  const legacyResponse = await legacyCache.match(payloadUrl);
  if (!legacyResponse) return null;
  try {
    const payload = (await legacyResponse.json()) as Record<string, unknown>;
    return {
      title: typeof payload.title === 'string' ? payload.title : '',
      text: typeof payload.text === 'string' ? payload.text : '',
      url: typeof payload.url === 'string' ? payload.url : '',
      files: [],
      cacheName: LEGACY_SHARE_CACHE,
      payloadUrl,
    };
  } catch {
    await legacyCache.delete(payloadUrl);
    return null;
  }
}

export async function deleteStagedShare(payload: Pick<StagedSharePayload, 'cacheName' | 'payloadUrl'>) {
  if (!('caches' in window)) return;
  const cache = await window.caches.open(payload.cacheName);
  await cache.delete(payload.payloadUrl);
}

export async function deleteStagedShareByKey(shareKey: string): Promise<void> {
  assertShareKey(shareKey);
  if (!('caches' in window)) return;
  const payloadUrl = new URL(sharePayloadPath(shareKey), window.location.origin).toString();
  await Promise.all(
    [RICH_SHARE_CACHE, LEGACY_SHARE_CACHE].map(async (cacheName) => {
      const cache = await window.caches.open(cacheName);
      await cache.delete(payloadUrl);
    }),
  );
}

export async function prepareSharedCapture(
  staged: Pick<StagedSharePayload, 'title' | 'text' | 'url' | 'files'>,
): Promise<PreparedSharedCapture | null> {
  if (staged.files.length > MAX_SHARED_FILES) {
    throw new SharedCaptureValidationError(
      `A shared note can contain at most ${MAX_SHARED_FILES} files at once.`,
    );
  }
  const rawBytes = staged.files.reduce((total, file) => total + file.size, 0);
  if (!Number.isSafeInteger(rawBytes) || rawBytes > MAX_SHARED_STAGED_BYTES) {
    throw new SharedCaptureValidationError('The shared files exceed the 100 MB handoff limit.');
  }

  const explicitTitle = sanitize(staged.title, MAX_SHARE_TITLE);
  const text = sanitize(staged.text, MAX_SHARE_CONTENT);
  const url = sanitize(staged.url, MAX_SHARE_URL);
  const content = composeSharedContent(text, url);
  const prepared: PreparedSharedAttachment[] = [];
  const seenChecksums = new Set<string>();

  for (const file of staged.files) {
    let attachment: PreparedSharedAttachment;
    try {
      attachment = await prepareSharedFile(file);
    } catch (error) {
      throw new SharedCaptureValidationError(toErrorMessage(error));
    }
    if (seenChecksums.has(attachment.checksum)) continue;
    seenChecksums.add(attachment.checksum);
    prepared.push(attachment);
  }

  if (prepared.length > MAX_ATTACHMENTS_PER_NOTE) {
    throw new SharedCaptureValidationError(
      `A note can contain at most ${MAX_ATTACHMENTS_PER_NOTE} attachments.`,
    );
  }
  const totalPreparedBytes = prepared.reduce((total, attachment) => total + attachment.size, 0);
  if (totalPreparedBytes > MAX_TOTAL_ATTACHMENT_BYTES_PER_NOTE) {
    throw new SharedCaptureValidationError('The shared files exceed the note attachment limit.');
  }

  const title =
    explicitTitle ||
    linkTitleFromUrl(url || text) ||
    (prepared.length === 1 ? prepared[0]?.name : prepared.length > 1 ? `${prepared.length} shared files` : '') ||
    '';
  if (!title && !content && prepared.length === 0) return null;
  return { title: title.slice(0, MAX_SHARE_TITLE), content, attachments: prepared };
}

export function sharePayloadPath(shareKey: string): string {
  assertShareKey(shareKey);
  return `${SHARE_PAYLOAD_PREFIX}${shareKey}`;
}

export function shareLedgerKey(shareKey: string): string {
  assertShareKey(shareKey);
  return `${SHARE_CAPTURE_LEDGER_PREFIX}${shareKey}`;
}

export function isSupportedSharedFile(file: Pick<File, 'name' | 'type'>): boolean {
  const mimeType = sharedFileMimeType(file);
  return (
    isPreviewableImageMimeType(mimeType) ||
    isVoiceAudioMimeType(mimeType) ||
    GENERIC_SHARED_MIME_TYPES.has(mimeType)
  );
}

async function prepareSharedFile(file: File): Promise<PreparedSharedAttachment> {
  const mimeType = sharedFileMimeType(file);
  if (!isSupportedSharedFile(file)) {
    throw new Error(`“${displayFileName(file)}” is not a supported shared file.`);
  }
  if (isPreviewableImageMimeType(mimeType)) {
    return imageAsSharedAttachment(await prepareImageAttachment(file));
  }
  if (!Number.isSafeInteger(file.size) || file.size < 0) {
    throw new RangeError(`“${displayFileName(file)}” has an invalid file size.`);
  }
  if (file.size === 0) throw new Error(`“${displayFileName(file)}” is empty and was not added.`);
  const limit = isVoiceAudioMimeType(mimeType)
    ? MAX_NATIVE_AUDIO_BYTES
    : MAX_SHARED_GENERIC_FILE_BYTES;
  if (file.size > limit) {
    throw new RangeError(`“${displayFileName(file)}” is larger than the 50 MB shared-file limit.`);
  }

  const name = normalizedFileName(file.name);
  const bytes = await file.arrayBuffer();
  const data = new Blob([bytes], { type: mimeType });
  return {
    name,
    mimeType,
    size: data.size,
    checksum: await sha256Hex(bytes),
    data,
  };
}

function imageAsSharedAttachment(image: PreparedImageAttachment): PreparedSharedAttachment {
  return image;
}

function sharedFileMimeType(file: Pick<File, 'name' | 'type'>): string {
  const declared = baseMimeType(file.type);
  if (
    declared &&
    (isPreviewableImageMimeType(declared) ||
      isVoiceAudioMimeType(declared) ||
      GENERIC_SHARED_MIME_TYPES.has(declared))
  ) {
    return declared;
  }
  const extension = file.name.split('.').pop()?.trim().toLocaleLowerCase() ?? '';
  return MIME_BY_EXTENSION[extension] ?? declared;
}

function baseMimeType(mimeType: string): string {
  return mimeType.trim().toLocaleLowerCase().split(';', 1)[0] ?? '';
}

function normalizedFileName(name: string): string {
  const normalized = name.replaceAll('\0', '').replaceAll('/', '_').replaceAll('\\', '_').trim();
  const value = normalized || 'shared-file';
  if (value.length > 1_024) {
    throw new RangeError('A shared filename exceeds the 1,024-character limit.');
  }
  return value;
}

function displayFileName(file: Pick<File, 'name'>): string {
  return file.name.replaceAll('\0', '').trim() || 'shared file';
}

function formString(form: FormData, key: string): string {
  const value = form.get(key);
  return typeof value === 'string' ? value : '';
}

function composeSharedContent(text: string, url: string): string {
  const normalizedText = text.trim();
  const normalizedUrl = url.trim();
  if (!normalizedUrl || normalizedText.includes(normalizedUrl)) {
    return normalizedText.slice(0, MAX_SHARE_CONTENT);
  }
  if (!normalizedText) return normalizedUrl.slice(0, MAX_SHARE_CONTENT);
  return `${normalizedText}\n\n${normalizedUrl}`.slice(0, MAX_SHARE_CONTENT);
}

function sanitize(value: string, limit: number): string {
  return value.replaceAll('\0', '').trim().slice(0, limit);
}

function validatePreparedCapture(capture: PreparedSharedCapture): void {
  if (capture.title.length > MAX_SHARE_TITLE || capture.content.length > MAX_SHARE_CONTENT) {
    throw new RangeError('Shared note content exceeds its storage limit.');
  }
  if (capture.attachments.length > MAX_ATTACHMENTS_PER_NOTE) {
    throw new RangeError(`A note can contain at most ${MAX_ATTACHMENTS_PER_NOTE} attachments.`);
  }
  const bytes = capture.attachments.reduce((total, attachment) => total + attachment.size, 0);
  if (bytes > MAX_TOTAL_ATTACHMENT_BYTES_PER_NOTE) {
    throw new RangeError('Shared attachments exceed the note attachment limit.');
  }
}

function assertShareKey(shareKey: string): void {
  if (!UUID_PATTERN.test(shareKey)) throw new Error('Invalid share-capture identifier.');
}

function parseLedger(value: string): ShareLedgerValue {
  try {
    const parsed = JSON.parse(value) as Partial<ShareLedgerValue>;
    if (
      typeof parsed.noteId !== 'string' ||
      !UUID_PATTERN.test(parsed.noteId) ||
      typeof parsed.capturedAt !== 'number' ||
      !Number.isSafeInteger(parsed.capturedAt) ||
      parsed.capturedAt < 0
    ) {
      throw new Error('invalid ledger');
    }
    return { noteId: parsed.noteId, capturedAt: parsed.capturedAt };
  } catch {
    throw new Error('The local share-capture ledger is corrupted.');
  }
}

async function sha256Hex(bytes: ArrayBuffer): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('');
}

function toErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : 'The shared file could not be imported safely.';
}
