import type { NotesDatabase } from '../database';
import { InvalidNoteStateError, NoteNotFoundError } from '../errors';
import type { AttachmentRecord } from '../types';
import { attachmentRecordSchema, noteRecordSchema } from '../validation';
import {
  MAX_ATTACHMENTS_PER_NOTE,
  MAX_TOTAL_ATTACHMENT_BYTES_PER_NOTE,
} from './attachmentsRepository';

export const MAX_NATIVE_AUDIO_BYTES = 50 * 1024 * 1024;

const SUPPORTED_AUDIO_MIME_TYPES = new Set([
  'audio/webm',
  'audio/ogg',
  'audio/mp4',
  'audio/mpeg',
  'audio/aac',
  'audio/wav',
  'audio/x-wav',
  'audio/x-m4a',
]);

export interface AddVoiceRecordingResult {
  attachments: AttachmentRecord[];
  attachment: AttachmentRecord | null;
  skippedDuplicate: boolean;
}

interface PreparedAudio {
  name: string;
  mimeType: string;
  size: number;
  checksum: string;
  data: Blob;
}

interface VoiceAttachmentsRepositoryOptions {
  clock?: () => number;
  idFactory?: () => string;
}

export class VoiceAttachmentsRepository {
  private readonly clock: () => number;
  private readonly idFactory: () => string;

  constructor(
    private readonly database: NotesDatabase,
    options: VoiceAttachmentsRepositoryOptions = {},
  ) {
    this.clock = options.clock ?? Date.now;
    this.idFactory = options.idFactory ?? (() => crypto.randomUUID());
  }

  async addRecording(noteId: string, file: File): Promise<AddVoiceRecordingResult> {
    const note = await this.database.notes.get(noteId);
    if (!note) throw new NoteNotFoundError(noteId);
    const parsedNote = noteRecordSchema.parse(note);
    if (parsedNote.trashedAt !== null) {
      throw new InvalidNoteStateError(
        noteId,
        'Voice recordings cannot be added to a trashed note.',
      );
    }

    const prepared = await prepareAudio(file);

    return this.database.transaction(
      'rw',
      this.database.notes,
      this.database.attachments,
      async () => {
        const currentNote = await this.database.notes.get(noteId);
        if (!currentNote) throw new NoteNotFoundError(noteId);
        const currentParsed = noteRecordSchema.parse(currentNote);
        if (currentParsed.trashedAt !== null) {
          throw new InvalidNoteStateError(
            noteId,
            'Voice recordings cannot be added to a trashed note.',
          );
        }

        const existing = (await this.database.attachments.where('noteId').equals(noteId).toArray())
          .map((row) => attachmentRecordSchema.parse(row))
          .sort(compareAttachments);
        const duplicate = existing.find((attachment) => attachment.checksum === prepared.checksum);
        if (duplicate) {
          return { attachments: existing, attachment: duplicate, skippedDuplicate: true };
        }

        if (existing.length + 1 > MAX_ATTACHMENTS_PER_NOTE) {
          throw new RangeError(
            `A note can contain at most ${MAX_ATTACHMENTS_PER_NOTE} attachments. Remove an attachment before adding more.`,
          );
        }

        const currentBytes = existing.reduce((total, attachment) => total + attachment.size, 0);
        if (currentBytes + prepared.size > MAX_TOTAL_ATTACHMENT_BYTES_PER_NOTE) {
          throw new RangeError('This note would exceed the 250 MB attachment safety limit.');
        }

        const record = attachmentRecordSchema.parse({
          id: this.idFactory(),
          noteId,
          name: prepared.name,
          mimeType: prepared.mimeType,
          size: prepared.size,
          checksum: prepared.checksum,
          data: prepared.data,
          createdAt: this.readClock(),
        });
        await this.database.attachments.add(record);

        return {
          attachments: [...existing, record].sort(compareAttachments),
          attachment: record,
          skippedDuplicate: false,
        };
      },
    );
  }

  private readClock(): number {
    const timestamp = this.clock();
    if (!Number.isSafeInteger(timestamp) || timestamp < 0) {
      throw new RangeError('The attachment clock must return a non-negative safe integer.');
    }
    return timestamp;
  }
}

export function isVoiceAudioMimeType(mimeType: string): boolean {
  return SUPPORTED_AUDIO_MIME_TYPES.has(baseMimeType(mimeType));
}

async function prepareAudio(file: File): Promise<PreparedAudio> {
  if (!Number.isSafeInteger(file.size) || file.size < 0) {
    throw new RangeError('This voice recording has an invalid file size.');
  }
  if (file.size === 0) throw new Error('The voice recording is empty and was not added.');
  if (file.size > MAX_NATIVE_AUDIO_BYTES) {
    throw new RangeError('The voice recording is larger than the 50 MB recording limit.');
  }

  const mimeType = normalizeAudioMimeType(file.type);
  if (!isVoiceAudioMimeType(mimeType)) {
    throw new Error('This browser produced an unsupported voice-recording format.');
  }

  const name = normalizedAudioName(file.name, mimeType);
  if (name.length > 1_024) {
    throw new RangeError('A voice-recording filename exceeds the 1,024-character limit.');
  }

  const bytes = new Uint8Array(await file.arrayBuffer());
  return {
    name,
    mimeType,
    size: file.size,
    checksum: await sha256Hex(bytes),
    data: new Blob([bytes], { type: mimeType }),
  };
}

function normalizeAudioMimeType(mimeType: string): string {
  return mimeType.trim().toLocaleLowerCase();
}

function baseMimeType(mimeType: string): string {
  return normalizeAudioMimeType(mimeType).split(';', 1)[0] ?? '';
}

function normalizedAudioName(name: string, mimeType: string): string {
  const extension = extensionForMimeType(mimeType);
  const trimmed = name.trim() || `voice-recording.${extension}`;
  const withoutKnownExtension = trimmed.replace(/\.(webm|ogg|oga|m4a|mp4|mp3|aac|wav)$/iu, '');
  return `${withoutKnownExtension}.${extension}`;
}

function extensionForMimeType(mimeType: string): string {
  const base = baseMimeType(mimeType);
  if (base === 'audio/webm') return 'webm';
  if (base === 'audio/ogg') return 'ogg';
  if (base === 'audio/mpeg') return 'mp3';
  if (base === 'audio/aac') return 'aac';
  if (base === 'audio/wav' || base === 'audio/x-wav') return 'wav';
  return 'm4a';
}

async function sha256Hex(bytes: Uint8Array): Promise<string> {
  const copy = Uint8Array.from(bytes);
  const digest = await crypto.subtle.digest('SHA-256', copy.buffer);
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('');
}

function compareAttachments(a: AttachmentRecord, b: AttachmentRecord): number {
  return a.createdAt - b.createdAt || a.id.localeCompare(b.id);
}
