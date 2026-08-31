import type { NotesDatabase } from '../database';
import { InvalidNoteStateError, NoteNotFoundError } from '../errors';
import type { AttachmentRecord } from '../types';
import { attachmentRecordSchema, noteRecordSchema } from '../validation';

export const MAX_NATIVE_IMAGE_BYTES = 25 * 1024 * 1024;
export const MAX_NATIVE_IMAGE_DIMENSION = 4_096;
export const MAX_ATTACHMENTS_PER_NOTE = 50;
export const MAX_TOTAL_ATTACHMENT_BYTES_PER_NOTE = 250 * 1024 * 1024;
export const NATIVE_IMAGE_ACCEPT = 'image/jpeg,image/png,image/gif,image/webp,image/avif';

const PREVIEWABLE_IMAGE_MIME_TYPES = new Set([
  'image/jpeg',
  'image/png',
  'image/gif',
  'image/webp',
  'image/avif',
]);

export interface AddImagesResult {
  attachments: AttachmentRecord[];
  added: number;
  skippedDuplicates: number;
}

interface PreparedImage {
  name: string;
  mimeType: string;
  size: number;
  checksum: string;
  data: Blob;
}

interface SanitizedImage {
  name: string;
  mimeType: string;
  data: Blob;
}

interface AttachmentsRepositoryOptions {
  clock?: () => number;
  idFactory?: () => string;
}

export class AttachmentsRepository {
  private readonly clock: () => number;
  private readonly idFactory: () => string;

  constructor(
    private readonly database: NotesDatabase,
    options: AttachmentsRepositoryOptions = {},
  ) {
    this.clock = options.clock ?? Date.now;
    this.idFactory = options.idFactory ?? (() => crypto.randomUUID());
  }

  async list(noteId: string): Promise<AttachmentRecord[]> {
    const rows = await this.database.attachments.where('noteId').equals(noteId).toArray();
    return rows.map((row) => attachmentRecordSchema.parse(row)).sort(compareAttachments);
  }

  async hasAny(noteId: string): Promise<boolean> {
    return (await this.database.attachments.where('noteId').equals(noteId).count()) > 0;
  }

  async addImages(noteId: string, files: File[]): Promise<AddImagesResult> {
    if (files.length === 0) {
      return { attachments: await this.list(noteId), added: 0, skippedDuplicates: 0 };
    }

    const note = await this.database.notes.get(noteId);
    if (!note) throw new NoteNotFoundError(noteId);
    const parsedNote = noteRecordSchema.parse(note);
    if (parsedNote.trashedAt !== null) {
      throw new InvalidNoteStateError(noteId, 'Images cannot be added to a trashed note.');
    }

    const prepared: PreparedImage[] = [];
    for (const file of files) {
      prepared.push(await prepareImage(file));
      await yieldToBrowser();
    }

    return this.database.transaction(
      'rw',
      this.database.notes,
      this.database.attachments,
      async () => {
        const currentNote = await this.database.notes.get(noteId);
        if (!currentNote) throw new NoteNotFoundError(noteId);
        const currentParsed = noteRecordSchema.parse(currentNote);
        if (currentParsed.trashedAt !== null) {
          throw new InvalidNoteStateError(noteId, 'Images cannot be added to a trashed note.');
        }

        const existing = (await this.database.attachments.where('noteId').equals(noteId).toArray())
          .map((row) => attachmentRecordSchema.parse(row))
          .sort(compareAttachments);
        const checksums = new Set(existing.map((attachment) => attachment.checksum));
        const additions: PreparedImage[] = [];
        let skippedDuplicates = 0;

        for (const image of prepared) {
          if (checksums.has(image.checksum)) {
            skippedDuplicates += 1;
            continue;
          }
          checksums.add(image.checksum);
          additions.push(image);
        }

        if (existing.length + additions.length > MAX_ATTACHMENTS_PER_NOTE) {
          throw new RangeError(
            `A note can contain at most ${MAX_ATTACHMENTS_PER_NOTE} attachments. Remove an attachment before adding more.`,
          );
        }

        const currentBytes = existing.reduce((total, attachment) => total + attachment.size, 0);
        const addedBytes = additions.reduce((total, image) => total + image.size, 0);
        if (currentBytes + addedBytes > MAX_TOTAL_ATTACHMENT_BYTES_PER_NOTE) {
          throw new RangeError('This note would exceed the 250 MB attachment safety limit.');
        }

        if (additions.length === 0) {
          return { attachments: existing, added: 0, skippedDuplicates };
        }

        const createdAt = this.readClock();
        const records = additions.map((image) =>
          attachmentRecordSchema.parse({
            id: this.idFactory(),
            noteId,
            name: image.name,
            mimeType: image.mimeType,
            size: image.size,
            checksum: image.checksum,
            data: image.data,
            createdAt,
          }),
        );
        await this.database.attachments.bulkAdd(records);

        return {
          attachments: [...existing, ...records].sort(compareAttachments),
          added: records.length,
          skippedDuplicates,
        };
      },
    );
  }

  async remove(noteId: string, attachmentId: string): Promise<AttachmentRecord[]> {
    return this.database.transaction('rw', this.database.attachments, async () => {
      const rawAttachment = await this.database.attachments.get(attachmentId);
      if (!rawAttachment) {
        const remaining = await this.database.attachments.where('noteId').equals(noteId).toArray();
        return remaining.map((row) => attachmentRecordSchema.parse(row)).sort(compareAttachments);
      }
      const attachment = attachmentRecordSchema.parse(rawAttachment);
      if (attachment.noteId !== noteId) {
        throw new Error('This attachment belongs to a different note.');
      }
      await this.database.attachments.delete(attachmentId);
      const remaining = await this.database.attachments.where('noteId').equals(noteId).toArray();
      return remaining.map((row) => attachmentRecordSchema.parse(row)).sort(compareAttachments);
    });
  }

  private readClock(): number {
    const timestamp = this.clock();
    if (!Number.isSafeInteger(timestamp) || timestamp < 0) {
      throw new RangeError('The attachment clock must return a non-negative safe integer.');
    }
    return timestamp;
  }
}

export function isPreviewableImageMimeType(mimeType: string): boolean {
  return PREVIEWABLE_IMAGE_MIME_TYPES.has(mimeType.trim().toLocaleLowerCase());
}

async function prepareImage(file: File): Promise<PreparedImage> {
  if (!Number.isSafeInteger(file.size) || file.size < 0) {
    throw new RangeError('This image has an invalid file size.');
  }
  if (file.size === 0) throw new Error(`“${displayFileName(file)}” is empty and was not added.`);
  if (file.size > MAX_NATIVE_IMAGE_BYTES) {
    throw new RangeError(`“${displayFileName(file)}” is larger than the 25 MB image limit.`);
  }

  const mimeType = nativeImageMimeType(file);
  if (!mimeType) {
    throw new Error(
      `“${displayFileName(file)}” is not a supported image. Use JPEG, PNG, GIF, WebP, or AVIF.`,
    );
  }

  const sanitized = await sanitizeNativeImage(file, mimeType);
  if (sanitized.data.size > MAX_NATIVE_IMAGE_BYTES) {
    throw new RangeError(`“${displayFileName(file)}” remains larger than 25 MB after processing.`);
  }
  if (sanitized.name.length > 1_024) {
    throw new RangeError('An image filename exceeds the 1,024-character limit.');
  }

  const bytes = new Uint8Array(await sanitized.data.arrayBuffer());
  return {
    name: sanitized.name,
    mimeType: sanitized.mimeType,
    size: sanitized.data.size,
    checksum: await sha256Hex(bytes),
    data: sanitized.data,
  };
}

async function sanitizeNativeImage(file: File, mimeType: string): Promise<SanitizedImage> {
  if (mimeType === 'image/gif') {
    await validateImageDecode(file, displayFileName(file));
    const stripped = stripGifPrivacyMetadata(new Uint8Array(await file.arrayBuffer()));
    return {
      name: normalizedImageName(displayFileName(file), 'image/gif'),
      mimeType: 'image/gif',
      data: new Blob([Uint8Array.from(stripped).buffer], { type: 'image/gif' }),
    };
  }

  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' });
  } catch {
    throw new Error(`“${displayFileName(file)}” could not be decoded as an image.`);
  }

  try {
    if (bitmap.width < 1 || bitmap.height < 1) {
      throw new Error(`“${displayFileName(file)}” has invalid image dimensions.`);
    }
    const { width, height } = scaledDimensions(bitmap.width, bitmap.height);
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext('2d');
    if (!context) throw new Error('This browser cannot process images safely.');
    context.drawImage(bitmap, 0, 0, width, height);

    const outputTypes = mimeType === 'image/avif' ? ['image/avif', 'image/webp'] : [mimeType];
    for (const outputType of outputTypes) {
      const encoded = await canvasToBlob(canvas, outputType, outputQuality(outputType));
      if (encoded && encoded.size > 0 && encoded.type === outputType) {
        return {
          name: normalizedImageName(displayFileName(file), outputType),
          mimeType: outputType,
          data: encoded,
        };
      }
    }

    const fallback = await canvasToBlob(canvas, 'image/png');
    if (!fallback || fallback.size === 0) {
      throw new Error('This browser could not create a privacy-safe image copy.');
    }
    return {
      name: normalizedImageName(displayFileName(file), 'image/png'),
      mimeType: 'image/png',
      data: fallback,
    };
  } finally {
    bitmap.close();
  }
}

async function validateImageDecode(blob: Blob, name: string): Promise<void> {
  try {
    const bitmap = await createImageBitmap(blob);
    if (bitmap.width < 1 || bitmap.height < 1) throw new Error('invalid dimensions');
    bitmap.close();
  } catch {
    throw new Error(`“${name}” could not be decoded as an image.`);
  }
}

function scaledDimensions(width: number, height: number): { width: number; height: number } {
  const longest = Math.max(width, height);
  if (longest <= MAX_NATIVE_IMAGE_DIMENSION) return { width, height };
  const scale = MAX_NATIVE_IMAGE_DIMENSION / longest;
  return {
    width: Math.max(1, Math.round(width * scale)),
    height: Math.max(1, Math.round(height * scale)),
  };
}

function canvasToBlob(
  canvas: HTMLCanvasElement,
  mimeType: string,
  quality?: number,
): Promise<Blob | null> {
  return new Promise((resolve) => canvas.toBlob(resolve, mimeType, quality));
}

function outputQuality(mimeType: string): number | undefined {
  if (mimeType === 'image/jpeg') return 0.92;
  if (mimeType === 'image/webp') return 0.9;
  if (mimeType === 'image/avif') return 0.88;
  return undefined;
}

function stripGifPrivacyMetadata(bytes: Uint8Array): Uint8Array {
  if (bytes.length < 14) return bytes;
  const signature = new TextDecoder('ascii').decode(bytes.subarray(0, 6));
  if (signature !== 'GIF87a' && signature !== 'GIF89a') return bytes;

  let position = 13;
  const logicalPacked = bytes[10] ?? 0;
  if ((logicalPacked & 0x80) !== 0) {
    position += 3 * 2 ** ((logicalPacked & 0x07) + 1);
  }
  if (position > bytes.length) return bytes;

  const chunks: Uint8Array[] = [bytes.subarray(0, position)];
  while (position < bytes.length) {
    const marker = bytes[position];
    if (marker === 0x3b) {
      chunks.push(bytes.subarray(position, position + 1));
      position += 1;
      break;
    }

    if (marker === 0x21) {
      const end = gifExtensionEnd(bytes, position);
      if (end === null) return bytes;
      const label = bytes[position + 1];
      const xmpApplication = label === 0xff && isGifXmpApplication(bytes, position);
      if (label !== 0xfe && !xmpApplication) chunks.push(bytes.subarray(position, end));
      position = end;
      continue;
    }

    if (marker === 0x2c) {
      const end = gifImageEnd(bytes, position);
      if (end === null) return bytes;
      chunks.push(bytes.subarray(position, end));
      position = end;
      continue;
    }

    return bytes;
  }

  return concatenateBytes(chunks);
}

function gifExtensionEnd(bytes: Uint8Array, start: number): number | null {
  if (start + 3 > bytes.length) return null;
  return gifSubBlocksEnd(bytes, start + 2);
}

function gifImageEnd(bytes: Uint8Array, start: number): number | null {
  if (start + 10 > bytes.length) return null;
  const packed = bytes[start + 9] ?? 0;
  let position = start + 10;
  if ((packed & 0x80) !== 0) position += 3 * 2 ** ((packed & 0x07) + 1);
  if (position >= bytes.length) return null;
  position += 1;
  return gifSubBlocksEnd(bytes, position);
}

function gifSubBlocksEnd(bytes: Uint8Array, start: number): number | null {
  let position = start;
  while (position < bytes.length) {
    const size = bytes[position] ?? 0;
    position += 1;
    if (size === 0) return position;
    position += size;
    if (position > bytes.length) return null;
  }
  return null;
}

function isGifXmpApplication(bytes: Uint8Array, start: number): boolean {
  const blockSize = bytes[start + 2];
  if (blockSize !== 11 || start + 14 > bytes.length) return false;
  const identifier = new TextDecoder('ascii').decode(bytes.subarray(start + 3, start + 14));
  return identifier === 'XMP DataXMP';
}

function concatenateBytes(chunks: Uint8Array[]): Uint8Array {
  const total = chunks.reduce((sum, chunk) => sum + chunk.byteLength, 0);
  const result = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    result.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return result;
}

function nativeImageMimeType(file: File): string | null {
  const declared = file.type.trim().toLocaleLowerCase();
  if (PREVIEWABLE_IMAGE_MIME_TYPES.has(declared)) return declared;

  const extension = file.name.split('.').pop()?.toLocaleLowerCase();
  const inferred: Record<string, string> = {
    jpg: 'image/jpeg',
    jpeg: 'image/jpeg',
    png: 'image/png',
    gif: 'image/gif',
    webp: 'image/webp',
    avif: 'image/avif',
  };
  return extension ? (inferred[extension] ?? null) : null;
}

function normalizedImageName(name: string, mimeType: string): string {
  const extensionByMimeType: Record<string, string> = {
    'image/jpeg': 'jpg',
    'image/png': 'png',
    'image/gif': 'gif',
    'image/webp': 'webp',
    'image/avif': 'avif',
  };
  const extension = extensionByMimeType[mimeType] ?? 'img';
  const trimmed = name.trim() || 'image';
  const base = trimmed.replace(/\.(?:jpe?g|png|gif|webp|avif)$/iu, '') || 'image';
  return `${base}.${extension}`;
}

function displayFileName(file: File): string {
  return file.name.trim() || 'image';
}

async function sha256Hex(bytes: Uint8Array): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', Uint8Array.from(bytes).buffer);
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('');
}

function compareAttachments(a: AttachmentRecord, b: AttachmentRecord): number {
  return a.createdAt - b.createdAt || a.id.localeCompare(b.id);
}

function yieldToBrowser(): Promise<void> {
  return new Promise((resolve) => window.setTimeout(resolve, 0));
}
