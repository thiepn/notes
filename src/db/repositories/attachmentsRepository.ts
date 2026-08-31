import type { NotesDatabase } from '../database';
import { InvalidNoteStateError, NoteNotFoundError } from '../errors';
import type { AttachmentRecord } from '../types';
import { attachmentRecordSchema, noteRecordSchema } from '../validation';

export const MAX_NATIVE_IMAGE_BYTES = 25 * 1024 * 1024;
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
    for (const file of files) prepared.push(await prepareImage(file));

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
      if (!rawAttachment) return this.list(noteId);
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

  const name = displayFileName(file);
  if (name.length > 1_024) throw new RangeError('An image filename exceeds the 1,024-character limit.');
  const bytes = new Uint8Array(await file.arrayBuffer());
  return {
    name,
    mimeType,
    size: file.size,
    checksum: await sha256Hex(bytes),
    data: new Blob([Uint8Array.from(bytes).buffer], { type: mimeType }),
  };
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
