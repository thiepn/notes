import { strFromU8, unzip, type Unzipped } from 'fflate';
import { z } from 'zod';

import { normalizeLabelName, type NoteColor, type NoteType } from '../../db';

export const KEEP_IMPORT_LEDGER_PREFIX = 'google-keep-import:v1:';
export const MAX_KEEP_ARCHIVE_BYTES = 512 * 1024 * 1024;
const MAX_KEEP_ENTRY_BYTES = 100 * 1024 * 1024;
const MAX_KEEP_EXPANDED_BYTES = 768 * 1024 * 1024;
const MAX_IMPORT_WARNINGS = 50;

const timestampUsecSchema = z
  .union([z.number().int().nonnegative(), z.string().regex(/^\d+$/u)])
  .optional();
const keepLabelSchema = z.object({ name: z.string() }).passthrough();
const keepAttachmentSchema = z
  .object({
    filePath: z.string().min(1),
    mimetype: z.string().optional(),
    mimeType: z.string().optional(),
  })
  .passthrough();
const keepListItemSchema = z
  .object({
    text: z.string(),
    isChecked: z.boolean().optional(),
    checked: z.boolean().optional(),
    childItems: z.array(z.unknown()).optional(),
    childListItems: z.array(z.unknown()).optional(),
  })
  .passthrough();
const keepNoteSchema = z
  .object({
    id: z.union([z.string(), z.number()]).optional(),
    noteId: z.union([z.string(), z.number()]).optional(),
    title: z.string().optional().default(''),
    textContent: z.string().optional(),
    textContentHtml: z.string().optional(),
    listContent: z.array(z.unknown()).optional(),
    color: z.string().optional().default('DEFAULT'),
    isTrashed: z.boolean().optional().default(false),
    isPinned: z.boolean().optional().default(false),
    isArchived: z.boolean().optional().default(false),
    userEditedTimestampUsec: timestampUsecSchema,
    createdTimestampUsec: timestampUsecSchema,
    labels: z.array(keepLabelSchema).optional().default([]),
    attachments: z.array(keepAttachmentSchema).optional().default([]),
    annotations: z.array(z.unknown()).optional(),
    collaborators: z.array(z.unknown()).optional(),
  })
  .passthrough();

interface KeepListItem {
  text: string;
  checked: boolean;
  parentIndex: number | null;
}

export interface PreparedKeepAttachment {
  name: string;
  mimeType: string;
  size: number;
  checksum: string;
  data: Blob;
  createdAt: number;
}

export interface PreparedKeepNote {
  sourceKey: string;
  sourcePath: string;
  type: NoteType;
  title: string;
  content: string;
  color: NoteColor;
  createdAt: number;
  updatedAt: number;
  pinned: boolean;
  archived: boolean;
  trashed: boolean;
  labels: string[];
  items: KeepListItem[];
  attachments: PreparedKeepAttachment[];
}

export interface KeepImportWarning {
  source: string;
  message: string;
}

export interface KeepImportStats {
  archives: number;
  jsonFiles: number;
  importableNotes: number;
  alreadyImportedNotes: number;
  skippedNotes: number;
  textNotes: number;
  checklistNotes: number;
  labels: number;
  attachments: number;
  missingAttachments: number;
  warningCount: number;
}

export interface PreparedKeepImport {
  archiveNames: string[];
  notes: PreparedKeepNote[];
  warnings: KeepImportWarning[];
  stats: KeepImportStats;
}

interface ArchiveEntry {
  archiveIndex: number;
  path: string;
  bytes: Uint8Array;
}

interface WarningCollector {
  warnings: KeepImportWarning[];
  count: number;
  push(source: string, message: string): void;
}

export async function prepareGoogleKeepImport(
  files: File[],
  alreadyImportedSourceKeys: Set<string> = new Set(),
): Promise<PreparedKeepImport> {
  if (files.length === 0) throw new Error('Choose at least one Google Takeout ZIP file.');
  const compressedBytes = files.reduce((total, file) => total + file.size, 0);
  if (compressedBytes > MAX_KEEP_ARCHIVE_BYTES) {
    throw new Error('The selected Takeout archives exceed the 512 MB browser import safety limit.');
  }

  const collector = createWarningCollector();
  const allEntries: ArchiveEntry[] = [];
  for (const [archiveIndex, file] of files.entries()) {
    if (!file.name.toLocaleLowerCase().endsWith('.zip')) {
      throw new Error(`“${file.name}” is not a ZIP archive.`);
    }
    const archiveEntries = await unzipArchive(file, archiveIndex, collector);
    allEntries.push(...archiveEntries);
  }

  const jsonEntries = allEntries.filter(
    (entry) => entry.path.toLocaleLowerCase().endsWith('.json') && isLikelyKeepPath(entry.path),
  );
  if (jsonEntries.length === 0) {
    throw new Error('No Google Keep JSON note files were found in the selected archive.');
  }

  const entryIndex = buildEntryIndex(allEntries);
  const notes: PreparedKeepNote[] = [];
  const seenSourceKeys = new Set<string>();
  let alreadyImportedNotes = 0;
  let skippedNotes = 0;
  let missingAttachments = 0;

  for (const entry of jsonEntries) {
    let raw: unknown;
    try {
      raw = JSON.parse(strFromU8(entry.bytes)) as unknown;
    } catch {
      skippedNotes += 1;
      collector.push(entry.path, 'The JSON file is malformed and was skipped.');
      continue;
    }
    if (!looksLikeKeepNote(raw)) continue;

    const parsed = keepNoteSchema.safeParse(raw);
    if (!parsed.success) {
      skippedNotes += 1;
      collector.push(entry.path, 'The note uses an unsupported Google Keep JSON shape.');
      continue;
    }

    try {
      const mapped = await mapKeepNote(parsed.data, raw, entry, entryIndex, collector);
      if (seenSourceKeys.has(mapped.note.sourceKey)) {
        skippedNotes += 1;
        collector.push(entry.path, 'A duplicate source note was found in the selected archives.');
        continue;
      }
      seenSourceKeys.add(mapped.note.sourceKey);
      missingAttachments += mapped.missingAttachments;
      if (alreadyImportedSourceKeys.has(mapped.note.sourceKey)) {
        alreadyImportedNotes += 1;
        continue;
      }
      notes.push(mapped.note);
    } catch (error) {
      skippedNotes += 1;
      collector.push(
        entry.path,
        error instanceof Error ? error.message : 'The note could not be mapped.',
      );
    }
  }

  if (notes.length === 0 && alreadyImportedNotes === 0) {
    throw new Error('No importable Google Keep notes were found.');
  }

  const uniqueLabels = new Set<string>();
  let attachments = 0;
  let textNotes = 0;
  let checklistNotes = 0;
  for (const note of notes) {
    if (note.type === 'text') textNotes += 1;
    else checklistNotes += 1;
    attachments += note.attachments.length;
    for (const label of note.labels) uniqueLabels.add(normalizeLabelName(label));
  }

  return {
    archiveNames: files.map((file) => file.name),
    notes,
    warnings: collector.warnings,
    stats: {
      archives: files.length,
      jsonFiles: jsonEntries.length,
      importableNotes: notes.length,
      alreadyImportedNotes,
      skippedNotes,
      textNotes,
      checklistNotes,
      labels: uniqueLabels.size,
      attachments,
      missingAttachments,
      warningCount: collector.count,
    },
  };
}

async function unzipArchive(
  file: File,
  archiveIndex: number,
  collector: WarningCollector,
): Promise<ArchiveEntry[]> {
  const data = new Uint8Array(await file.arrayBuffer());
  let expandedBytes = 0;
  let expandedLimitExceeded = false;
  const unzipped = await new Promise<Unzipped>((resolve, reject) => {
    unzip(
      data,
      {
        filter(entry) {
          if (entry.name.endsWith('/')) return false;
          if (entry.originalSize > MAX_KEEP_ENTRY_BYTES) {
            collector.push(entry.name, 'An archive entry larger than 100 MB was skipped.');
            return false;
          }
          expandedBytes += entry.originalSize;
          if (expandedBytes > MAX_KEEP_EXPANDED_BYTES) {
            expandedLimitExceeded = true;
            return false;
          }
          return !entry.name.toLocaleLowerCase().endsWith('.html');
        },
      },
      (error, result) => {
        if (error) reject(error);
        else resolve(result);
      },
    );
  });

  if (expandedLimitExceeded) {
    throw new Error(`“${file.name}” expands beyond the 768 MB browser import safety limit.`);
  }

  const entries: ArchiveEntry[] = [];
  for (const [rawPath, bytes] of Object.entries(unzipped)) {
    const path = normalizeArchivePath(rawPath);
    if (!path) {
      collector.push(rawPath, 'An unsafe archive path was ignored.');
      continue;
    }
    entries.push({ archiveIndex, path, bytes });
  }
  return entries;
}

async function mapKeepNote(
  note: z.infer<typeof keepNoteSchema>,
  raw: unknown,
  source: ArchiveEntry,
  entryIndex: ReturnType<typeof buildEntryIndex>,
  collector: WarningCollector,
): Promise<{ note: PreparedKeepNote; missingAttachments: number }> {
  const now = Date.now();
  const createdAt =
    usecToMillis(note.createdTimestampUsec) ?? usecToMillis(note.userEditedTimestampUsec) ?? now;
  const updatedAt = Math.max(createdAt, usecToMillis(note.userEditedTimestampUsec) ?? createdAt);
  const sourceKey = await keepSourceKey(note, raw, source.path);
  const title = note.title;
  if (title.length > 500) throw new Error('The title exceeds the Notes 500-character limit.');

  const labels = normalizeLabels(note.labels, source.path, collector);
  const color = mapKeepColor(note.color, source.path, collector);
  const isChecklist = note.listContent !== undefined;
  const items = isChecklist ? flattenKeepList(note.listContent ?? [], source.path, collector) : [];
  const content = isChecklist ? '' : (note.textContent ?? '');
  if (content.length > 1_000_000)
    throw new Error('The note body exceeds the Notes 1,000,000-character limit.');
  if (items.length > 10_000) throw new Error('The checklist exceeds the Notes 10,000-item limit.');
  for (const item of items) {
    if (item.text.length > 100_000)
      throw new Error('A checklist item exceeds the Notes 100,000-character limit.');
  }

  let missingAttachments = 0;
  const attachments: PreparedKeepAttachment[] = [];
  for (const attachment of note.attachments) {
    const resolved = resolveAttachment(source, attachment.filePath, entryIndex);
    if (!resolved) {
      missingAttachments += 1;
      collector.push(
        source.path,
        `Attachment “${attachment.filePath}” was not found in the selected archives.`,
      );
      continue;
    }
    const checksum = await sha256Hex(resolved.bytes);
    const mimeType = normalizeMimeType(
      attachment.mimetype ?? attachment.mimeType,
      attachment.filePath,
    );
    attachments.push({
      name: basename(attachment.filePath),
      mimeType,
      size: resolved.bytes.byteLength,
      checksum,
      data: new Blob([ownedArrayBuffer(resolved.bytes)], { type: mimeType }),
      createdAt,
    });
  }

  if ((note.collaborators?.length ?? 0) > 0) {
    collector.push(source.path, 'Google Keep collaborator metadata is not imported.');
  }
  if ((note.annotations?.length ?? 0) > 0) {
    collector.push(source.path, 'Google Keep annotation metadata is not imported separately.');
  }

  return {
    note: {
      sourceKey,
      sourcePath: source.path,
      type: isChecklist ? 'checklist' : 'text',
      title,
      content,
      color,
      createdAt,
      updatedAt,
      pinned: note.isPinned,
      archived: note.isArchived,
      trashed: note.isTrashed,
      labels,
      items,
      attachments,
    },
    missingAttachments,
  };
}

function flattenKeepList(
  rawItems: unknown[],
  source: string,
  collector: WarningCollector,
): KeepListItem[] {
  const result: KeepListItem[] = [];
  let collapsedNestingWarned = false;

  const visit = (raw: unknown, parentIndex: number | null, depth: number) => {
    const parsed = keepListItemSchema.safeParse(raw);
    if (!parsed.success) {
      collector.push(source, 'An invalid checklist row was skipped.');
      return;
    }
    const currentIndex = result.length;
    const effectiveParent = depth === 0 ? null : parentIndex;
    result.push({
      text: parsed.data.text,
      checked: parsed.data.isChecked ?? parsed.data.checked ?? false,
      parentIndex: effectiveParent,
    });

    const children = parsed.data.childItems ?? parsed.data.childListItems ?? [];
    if (children.length === 0) return;
    const rootParent = depth === 0 ? currentIndex : parentIndex;
    if (depth >= 1 && !collapsedNestingWarned) {
      collapsedNestingWarned = true;
      collector.push(source, 'Checklist nesting deeper than one level was flattened to one level.');
    }
    for (const child of children) visit(child, rootParent, depth + 1);
  };

  for (const raw of rawItems) visit(raw, null, 0);
  return result;
}

function normalizeLabels(
  labels: Array<{ name: string }>,
  source: string,
  collector: WarningCollector,
): string[] {
  const result = new Map<string, string>();
  for (const label of labels) {
    const display = label.name.trim().replace(/\s+/gu, ' ');
    if (!display) continue;
    if (display.length > 100) {
      collector.push(
        source,
        `Label “${display.slice(0, 40)}…” exceeds the 100-character limit and was skipped.`,
      );
      continue;
    }
    try {
      const normalized = normalizeLabelName(display);
      if (!result.has(normalized)) result.set(normalized, display);
    } catch {
      collector.push(source, 'An invalid Google Keep label was skipped.');
    }
  }
  return [...result.values()];
}

const KEEP_COLOR_MAP: Record<string, NoteColor> = {
  DEFAULT: 'default',
  WHITE: 'default',
  CHALK: 'default',
  RED: 'red',
  CORAL: 'red',
  ORANGE: 'orange',
  PEACH: 'orange',
  YELLOW: 'yellow',
  SAND: 'yellow',
  GREEN: 'green',
  MINT: 'green',
  SAGE: 'green',
  TEAL: 'teal',
  BLUE: 'blue',
  CERULEAN: 'blue',
  DARK_BLUE: 'blue',
  DARKBLUE: 'blue',
  FOG: 'blue',
  STORM: 'gray',
  PURPLE: 'purple',
  DUSK: 'purple',
  PINK: 'pink',
  BLOSSOM: 'pink',
  BROWN: 'brown',
  CLAY: 'brown',
  GRAY: 'gray',
  GREY: 'gray',
};

function mapKeepColor(value: string, source: string, collector: WarningCollector): NoteColor {
  const normalized = value
    .trim()
    .replace(/[\s-]+/gu, '_')
    .toLocaleUpperCase();
  const mapped = KEEP_COLOR_MAP[normalized];
  if (mapped) return mapped;
  collector.push(source, `Unknown Google Keep color “${value}” was mapped to the default color.`);
  return 'default';
}

function looksLikeKeepNote(raw: unknown): boolean {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return false;
  const record = raw as Record<string, unknown>;
  const hasContent = 'textContent' in record || 'listContent' in record || 'title' in record;
  const hasKeepMetadata =
    'createdTimestampUsec' in record ||
    'userEditedTimestampUsec' in record ||
    'isPinned' in record ||
    'isArchived' in record ||
    'color' in record;
  return hasContent && hasKeepMetadata;
}

function buildEntryIndex(entries: ArchiveEntry[]) {
  const exact = new Map<string, ArchiveEntry>();
  const basenameByArchive = new Map<string, ArchiveEntry[]>();
  const basenameGlobal = new Map<string, ArchiveEntry[]>();
  for (const entry of entries) {
    exact.set(`${entry.archiveIndex}:${entry.path}`, entry);
    const base = basename(entry.path).toLocaleLowerCase();
    const archiveKey = `${entry.archiveIndex}:${base}`;
    basenameByArchive.set(archiveKey, [...(basenameByArchive.get(archiveKey) ?? []), entry]);
    basenameGlobal.set(base, [...(basenameGlobal.get(base) ?? []), entry]);
  }
  return { exact, basenameByArchive, basenameGlobal };
}

function resolveAttachment(
  source: ArchiveEntry,
  filePath: string,
  index: ReturnType<typeof buildEntryIndex>,
): ArchiveEntry | null {
  const normalized = normalizeArchivePath(filePath);
  if (!normalized) return null;
  const sourceDirectory = dirname(source.path);
  const relativeCandidate = sourceDirectory ? `${sourceDirectory}/${normalized}` : normalized;
  const exactRelative = index.exact.get(`${source.archiveIndex}:${relativeCandidate}`);
  if (exactRelative) return exactRelative;
  const exact = index.exact.get(`${source.archiveIndex}:${normalized}`);
  if (exact) return exact;

  const base = basename(normalized).toLocaleLowerCase();
  const sameArchive = index.basenameByArchive.get(`${source.archiveIndex}:${base}`) ?? [];
  if (sameArchive.length === 1) return sameArchive[0] ?? null;
  const global = index.basenameGlobal.get(base) ?? [];
  return global.length === 1 ? (global[0] ?? null) : null;
}

async function keepSourceKey(
  note: z.infer<typeof keepNoteSchema>,
  raw: unknown,
  sourcePath: string,
): Promise<string> {
  const stableId = note.id ?? note.noteId;
  if (stableId !== undefined) return sha256Text(`id:${String(stableId)}`);
  const created = timestampIdentity(note.createdTimestampUsec);
  if (created) return sha256Text(`created-usec:${created}`);
  return sha256Text(`fallback:${sourcePath}:${JSON.stringify(raw)}`);
}

function timestampIdentity(value: z.infer<typeof timestampUsecSchema>): string | null {
  if (value === undefined) return null;
  return typeof value === 'number' ? String(value) : value;
}

function usecToMillis(value: z.infer<typeof timestampUsecSchema>): number | null {
  if (value === undefined) return null;
  try {
    const microseconds = BigInt(typeof value === 'number' ? String(value) : value);
    const milliseconds = microseconds / 1000n;
    if (milliseconds < 0n || milliseconds > BigInt(Number.MAX_SAFE_INTEGER)) return null;
    return Number(milliseconds);
  } catch {
    return null;
  }
}

function normalizeArchivePath(value: string): string | null {
  const normalized = value
    .replace(/\\/gu, '/')
    .replace(/^\.\//u, '')
    .replace(/^\/+|\/+$/gu, '');
  if (!normalized) return null;
  const segments = normalized.split('/');
  if (segments.some((segment) => segment === '..' || segment === '')) return null;
  return segments.filter((segment) => segment !== '.').join('/');
}

function isLikelyKeepPath(path: string): boolean {
  const lowerSegments = path.toLocaleLowerCase().split('/');
  return lowerSegments.includes('keep') || lowerSegments.length === 1;
}

function dirname(path: string): string {
  const index = path.lastIndexOf('/');
  return index < 0 ? '' : path.slice(0, index);
}

function basename(path: string): string {
  const normalized = path.replace(/\\/gu, '/');
  return normalized.slice(normalized.lastIndexOf('/') + 1) || 'attachment';
}

function normalizeMimeType(value: string | undefined, filePath: string): string {
  const declared = value?.trim().toLocaleLowerCase();
  if (declared) return declared.slice(0, 255);
  const extension = basename(filePath).split('.').pop()?.toLocaleLowerCase();
  const inferred: Record<string, string> = {
    png: 'image/png',
    jpg: 'image/jpeg',
    jpeg: 'image/jpeg',
    gif: 'image/gif',
    webp: 'image/webp',
    svg: 'image/svg+xml',
    mp3: 'audio/mpeg',
    m4a: 'audio/mp4',
    wav: 'audio/wav',
    ogg: 'audio/ogg',
    pdf: 'application/pdf',
  };
  return (extension && inferred[extension]) || 'application/octet-stream';
}

async function sha256Text(value: string): Promise<string> {
  return sha256Hex(new TextEncoder().encode(value));
}

export async function sha256Hex(bytes: Uint8Array): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', ownedArrayBuffer(bytes));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('');
}

function ownedArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  return Uint8Array.from(bytes).buffer;
}

function createWarningCollector(): WarningCollector {
  return {
    warnings: [],
    count: 0,
    push(source, message) {
      this.count += 1;
      if (this.warnings.length < MAX_IMPORT_WARNINGS) this.warnings.push({ source, message });
    },
  };
}
