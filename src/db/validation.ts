import { z } from 'zod';

import { NOTE_COLORS, NOTE_TYPES, REVISION_REASONS } from './types';

const uuidSchema = z.string().uuid();
const timestampSchema = z.number().int().nonnegative();
const nullableTimestampSchema = timestampSchema.nullable();
const positionSchema = z.number().int().nonnegative();

export const noteTypeSchema = z.enum(NOTE_TYPES);
export const noteColorSchema = z.enum(NOTE_COLORS);

export const noteRecordSchema = z
  .object({
    id: uuidSchema,
    type: noteTypeSchema,
    title: z.string().max(500),
    content: z.string().max(1_000_000),
    color: noteColorSchema,
    createdAt: timestampSchema,
    updatedAt: timestampSchema,
    pinnedAt: nullableTimestampSchema,
    archivedAt: nullableTimestampSchema,
    trashedAt: nullableTimestampSchema,
    position: positionSchema,
    revision: z.number().int().positive(),
  })
  .strict();

export const createNoteInputSchema = z
  .object({
    type: noteTypeSchema.default('text'),
    title: z.string().max(500).default(''),
    content: z.string().max(1_000_000).default(''),
    color: noteColorSchema.default('default'),
    position: positionSchema.default(0),
  })
  .strict();

export const updateNoteInputSchema = z
  .object({
    type: noteTypeSchema.optional(),
    title: z.string().max(500).optional(),
    content: z.string().max(1_000_000).optional(),
    color: noteColorSchema.optional(),
    position: positionSchema.optional(),
  })
  .strict();

export const checklistItemRecordSchema = z
  .object({
    id: uuidSchema,
    noteId: uuidSchema,
    text: z.string().max(100_000),
    checked: z.boolean(),
    parentId: uuidSchema.nullable(),
    position: positionSchema,
    createdAt: timestampSchema,
    updatedAt: timestampSchema,
  })
  .strict();

export const labelRecordSchema = z
  .object({
    id: uuidSchema,
    name: z.string().trim().min(1).max(100),
    nameNormalized: z.string().min(1).max(100),
    createdAt: timestampSchema,
    updatedAt: timestampSchema,
  })
  .strict();

export const noteLabelRecordSchema = z
  .object({
    noteId: uuidSchema,
    labelId: uuidSchema,
    assignedAt: timestampSchema,
  })
  .strict();

export const attachmentRecordSchema = z
  .object({
    id: uuidSchema,
    noteId: uuidSchema,
    name: z.string().max(1_024).nullable(),
    mimeType: z.string().min(1).max(255),
    size: z.number().int().nonnegative(),
    checksum: z.string().min(1).max(256),
    data: z.instanceof(Blob),
    createdAt: timestampSchema,
  })
  .strict();

export const revisionRecordSchema = z
  .object({
    id: uuidSchema,
    noteId: uuidSchema,
    noteRevision: z.number().int().positive(),
    reason: z.enum(REVISION_REASONS),
    payload: z.string(),
    createdAt: timestampSchema,
  })
  .strict();

export const settingRecordSchema = z
  .object({
    key: z.string().min(1).max(200),
    value: z.string().max(5_000_000),
    updatedAt: timestampSchema,
  })
  .strict();

export type CreateNoteInput = z.input<typeof createNoteInputSchema>;
export type UpdateNoteInput = z.input<typeof updateNoteInputSchema>;
