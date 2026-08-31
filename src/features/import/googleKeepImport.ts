import { strFromU8, unzip, type Unzipped } from 'fflate';
import { z } from 'zod';

import { normalizeLabelName, type NoteColor, type NoteType } from '../../db';

export const KEEP_IMPORT_LEDGER_PREFIX = 'google-keep-import:v1:';
export const MAX_KEEP_ARCHIVE_BYTES = 512 * 1024 * 1024;
const MAX_KEEP_ENTRY_BYTES = 100 * 1024 * 1024;
const MAX_KEEP_EXPANDED_BYTES = 768 * 1024 * 1024;
const MAX_IMPORT_WARNINGS = 50;
const DIRECT_FILES_ARCHIVE_INDEX = -1;

const timestampUsecSchema = z.union([z.number(), z.string()]).optional();
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
  sourceAliases: string[];
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
  selectedFiles: number;
  jsonFiles: number;
  htmlFiles: number;
  htmlFallbackNotes: number;
  importableNotes: number;
  alreadyImportedNotes: number;
  skippedNotes: number;
  textNotes: number;
  checklistNotes: number;
  activeNotes: number;
  archivedNotes: number;
  trashedNotes: number;
  pinnedNotes: number;
  labels: number;
  attachments: number;
  attachmentBytes: number;
  missingAttachments: number;
  warningCount: number;
}

export interface PreparedKeepImport {
  archiveNames: string[];
  notes: PreparedKeepNote[];
  warnings: KeepImportWarning[];
  stats: KeepImportStats;
}

export interface KeepImportProgress {
  phase: 'reading' | 'extracting' | 'parsing' | 'ready';
  completed: number;
  total: number;
  message: string;
}

interface ArchiveEntry {
  archiveIndex: number;
  path: string;
  bytes: Uint8Array;
  lastModified: number | null;
}

interface WarningCollector {
  warnings: KeepImportWarning[];
  count: number;
  push(source: string, message: string): void;
}

export async function prepareGoogleKeepImport(
  files: File[],
  alreadyImportedSourceKeys: Set<string> = new Set(),
  onProgress?: (progress: KeepImportProgress) => void,
): Promise<PreparedKeepImport> {
  if (files.length === 0) throw new Error('Choose a Google Takeout ZIP or extracted Keep files.');
  const inputBytes = files.reduce((total, file) => total + file.size, 0);
  if (inputBytes > MAX_KEEP_ARCHIVE_BYTES) {
    throw new Error(
      'The selected Google Keep files exceed the 512 MB browser import safety limit.',
    );
  }

  const collector = createWarningCollector();
  const allEntries: ArchiveEntry[] = [];
  let archiveCount = 0;

  onProgress?.({ phase: 'reading', completed: 0, total: files.length, message: 'Reading files…' });
  for (const [fileIndex, file] of files.entries()) {
    const lowerName = file.name.toLocaleLowerCase();
    if (lowerName.endsWith('.zip')) {
      const archiveEntries = await unzipArchive(file, archiveCount, collector);
      allEntries.push(...archiveEntries);
      archiveCount += 1;
    } else {
      if (file.size > MAX_KEEP_ENTRY_BYTES) {
        collector.push(file.name, 'A selected file larger than 100 MB was skipped.');
      } else {
        const rawPath = readSelectedFilePath(file);
        const path = normalizeArchivePath(rawPath);
        if (!path) {
          collector.push(rawPath, 'An unsafe selected file path was ignored.');
        } else {
          allEntries.push({
            archiveIndex: DIRECT_FILES_ARCHIVE_INDEX,
            path,
            bytes: new Uint8Array(await file.arrayBuffer()),
            lastModified: Number.isSafeInteger(file.lastModified) ? file.lastModified : null,
          });
        }
      }
    }
    onProgress?.({
      phase: lowerName.endsWith('.zip') ? 'extracting' : 'reading',
      completed: fileIndex + 1,
      total: files.length,
      message: `Reading ${fileIndex + 1} of ${files.length} selected files…`,
    });
  }

  const jsonEntries = allEntries.filter(
    (entry) => entry.path.toLocaleLowerCase().endsWith('.json') && isLikelyKeepPath(entry.path),
  );
  const htmlEntries = allEntries.filter(
    (entry) => entry.path.toLocaleLowerCase().endsWith('.html') && isLikelyKeepPath(entry.path),
  );
  if (jsonEntries.length === 0 && htmlEntries.length === 0) {
    throw new Error('No Google Keep JSON or HTML note files were found in the selected source.');
  }

  const entryIndex = buildEntryIndex(allEntries);
  const notes: PreparedKeepNote[] = [];
  const seenSourceKeys = new Set<string>();
  let alreadyImportedNotes = 0;
  let skippedNotes = 0;
  let missingAttachments = 0;
  let htmlFallbackNotes = 0;
  const pairedJsonPaths = new Set(
    jsonEntries.map((entry) => withoutExtension(entry.path).toLocaleLowerCase()),
  );
  const parseTotal = jsonEntries.length + htmlEntries.length;
  let parseCompleted = 0;

  for (const entry of jsonEntries) {
    let raw: unknown;
    try {
      raw = JSON.parse(strFromU8(entry.bytes)) as unknown;
    } catch {
      skippedNotes += 1;
      collector.push(entry.path, 'The JSON file is malformed and was skipped.');
      parseCompleted += 1;
      reportParseProgress(onProgress, parseCompleted, parseTotal);
      continue;
    }
    if (!looksLikeKeepNote(raw)) {
      parseCompleted += 1;
      reportParseProgress(onProgress, parseCompleted, parseTotal);
      continue;
    }

    const parsed = keepNoteSchema.safeParse(raw);
    if (!parsed.success) {
      skippedNotes += 1;
      collector.push(entry.path, 'The note uses an unsupported Google Keep JSON shape.');
      parseCompleted += 1;
      reportParseProgress(onProgress, parseCompleted, parseTotal);
      continue;
    }

    try {
      const mapped = await mapKeepNote(parsed.data, entry, entryIndex, collector);
      const duplicate = registerPreparedNote(
        mapped.note,
        notes,
        seenSourceKeys,
        alreadyImportedSourceKeys,
      );
      if (duplicate === 'selected') {
        skippedNotes += 1;
        collector.push(entry.path, 'A duplicate source note was found in the selected files.');
      } else if (duplicate === 'imported') {
        alreadyImportedNotes += 1;
      } else {
        missingAttachments += mapped.missingAttachments;
      }
    } catch (error) {
      skippedNotes += 1;
      collector.push(
        entry.path,
        error instanceof Error ? error.message : 'The note could not be mapped.',
      );
    }
    parseCompleted += 1;
    reportParseProgress(onProgress, parseCompleted, parseTotal);
    await yieldToBrowser();
  }

  for (const entry of htmlEntries) {
    if (pairedJsonPaths.has(withoutExtension(entry.path).toLocaleLowerCase())) {
      parseCompleted += 1;
      reportParseProgress(onProgress, parseCompleted, parseTotal);
      continue;
    }
    try {
      const mapped = await mapKeepHtml(entry, entryIndex, collector);
      const duplicate = registerPreparedNote(
        mapped.note,
        notes,
        seenSourceKeys,
        alreadyImportedSourceKeys,
      );
      if (duplicate === 'selected') {
        skippedNotes += 1;
        collector.push(entry.path, 'A duplicate HTML fallback note was skipped.');
      } else if (duplicate === 'imported') {
        alreadyImportedNotes += 1;
      } else {
        htmlFallbackNotes += 1;
        missingAttachments += mapped.missingAttachments;
      }
    } catch (error) {
      skippedNotes += 1;
      collector.push(
        entry.path,
        error instanceof Error ? error.message : 'The HTML fallback note could not be mapped.',
      );
    }
    parseCompleted += 1;
    reportParseProgress(onProgress, parseCompleted, parseTotal);
    await yieldToBrowser();
  }

  if (notes.length === 0 && alreadyImportedNotes === 0) {
    throw new Error('No importable Google Keep notes were found.');
  }

  const uniqueLabels = new Set<string>();
  let attachments = 0;
  let attachmentBytes = 0;
  let textNotes = 0;
  let checklistNotes = 0;
  let activeNotes = 0;
  let archivedNotes = 0;
  let trashedNotes = 0;
  let pinnedNotes = 0;
  for (const note of notes) {
    if (note.type === 'text') textNotes += 1;
    else checklistNotes += 1;
    if (note.trashed) trashedNotes += 1;
    else if (note.archived) archivedNotes += 1;
    else activeNotes += 1;
    if (note.pinned && !note.archived && !note.trashed) pinnedNotes += 1;
    attachments += note.attachments.length;
    attachmentBytes += note.attachments.reduce((total, attachment) => total + attachment.size, 0);
    for (const label of note.labels) uniqueLabels.add(normalizeLabelName(label));
  }

  onProgress?.({
    phase: 'ready',
    completed: parseTotal,
    total: parseTotal,
    message: 'Preview ready.',
  });
  return {
    archiveNames: files.map((file) => file.name),
    notes,
    warnings: collector.warnings,
    stats: {
      archives: archiveCount,
      selectedFiles: files.length,
      jsonFiles: jsonEntries.length,
      htmlFiles: htmlEntries.length,
      htmlFallbackNotes,
      importableNotes: notes.length,
      alreadyImportedNotes,
      skippedNotes,
      textNotes,
      checklistNotes,
      activeNotes,
      archivedNotes,
      trashedNotes,
      pinnedNotes,
      labels: uniqueLabels.size,
      attachments,
      attachmentBytes,
      missingAttachments,
      warningCount: collector.count,
    },
  };
}

function registerPreparedNote(
  note: PreparedKeepNote,
  notes: PreparedKeepNote[],
  seenSourceKeys: Set<string>,
  alreadyImportedSourceKeys: Set<string>,
): 'added' | 'selected' | 'imported' {
  const identities = [note.sourceKey, ...note.sourceAliases];
  if (identities.some((key) => alreadyImportedSourceKeys.has(key))) return 'imported';
  if (seenSourceKeys.has(note.sourceKey)) return 'selected';
  seenSourceKeys.add(note.sourceKey);
  notes.push(note);
  return 'added';
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
          return true;
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
    entries.push({ archiveIndex, path, bytes, lastModified: null });
  }
  return entries;
}

async function mapKeepNote(
  note: z.infer<typeof keepNoteSchema>,
  source: ArchiveEntry,
  entryIndex: ReturnType<typeof buildEntryIndex>,
  collector: WarningCollector,
): Promise<{ note: PreparedKeepNote; missingAttachments: number }> {
  const now = Date.now();
  const createdCandidate = usecToMillis(note.createdTimestampUsec);
  const updatedCandidate = usecToMillis(note.userEditedTimestampUsec);
  if (note.createdTimestampUsec !== undefined && createdCandidate === null) {
    collector.push(
      source.path,
      'The Google Keep creation timestamp was invalid and a fallback was used.',
    );
  }
  if (note.userEditedTimestampUsec !== undefined && updatedCandidate === null) {
    collector.push(
      source.path,
      'The Google Keep edit timestamp was invalid and a fallback was used.',
    );
  }
  const createdAt = createdCandidate ?? updatedCandidate ?? now;
  let updatedAt = updatedCandidate ?? createdAt;
  if (updatedAt < createdAt) {
    collector.push(
      source.path,
      'The edit timestamp predates creation and was normalized to creation time.',
    );
    updatedAt = createdAt;
  }

  const sourceIdentity = await keepSourceIdentity(note);
  const title = note.title;
  if (title.length > 500) throw new Error('The title exceeds the Notes 500-character limit.');

  const labels = normalizeLabels(note.labels, source.path, collector);
  const color = mapKeepColor(note.color, source.path, collector);
  const isChecklist = note.listContent !== undefined;
  const items = isChecklist ? flattenKeepList(note.listContent ?? [], source.path, collector) : [];
  const fallbackHtmlText = note.textContentHtml ? htmlToPlainText(note.textContentHtml) : '';
  const content = isChecklist ? '' : (note.textContent ?? fallbackHtmlText);
  if (isChecklist && (note.textContent?.trim() || fallbackHtmlText.trim())) {
    collector.push(
      source.path,
      'Both text and checklist content were present; the checklist representation was used.',
    );
  }
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
        `Attachment “${attachment.filePath}” was not found in the selected files.`,
      );
      continue;
    }
    attachments.push(
      await prepareAttachment(
        resolved,
        attachment.filePath,
        attachment.mimetype ?? attachment.mimeType,
        createdAt,
      ),
    );
  }

  if (!title.trim() && !content.trim() && items.length === 0 && attachments.length === 0) {
    throw new Error('The note is empty and was skipped.');
  }
  if ((note.collaborators?.length ?? 0) > 0) {
    collector.push(source.path, 'Google Keep collaborator metadata is not imported.');
  }
  if ((note.annotations?.length ?? 0) > 0) {
    collector.push(source.path, 'Google Keep annotation metadata is not imported separately.');
  }

  return {
    note: {
      sourceKey: sourceIdentity.primary,
      sourceAliases: sourceIdentity.aliases,
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

async function mapKeepHtml(
  source: ArchiveEntry,
  entryIndex: ReturnType<typeof buildEntryIndex>,
  collector: WarningCollector,
): Promise<{ note: PreparedKeepNote; missingAttachments: number }> {
  const html = strFromU8(source.bytes);
  const title = extractFirstHtmlTextByClass(html, 'title') || extractTagText(html, 'title');
  const listFragments = extractHtmlFragmentsByClass(html, 'listitem');
  const liFragments = listFragments.length > 0 ? listFragments : extractTagFragments(html, 'li');
  const items = liFragments.map((fragment) => ({
    text: htmlToPlainText(fragment),
    checked: /(?:\bchecked\b|class\s*=\s*["'][^"']*\bchecked\b)/iu.test(fragment),
    parentIndex: null,
  }));
  const contentFragment = extractFirstHtmlFragmentByClass(html, 'content');
  const content = items.length > 0 ? '' : htmlToPlainText(contentFragment || extractBodyHtml(html));
  const labels = uniqueDisplayStrings(extractHtmlTextsByClass(html, 'label'));
  const createdAt = source.lastModified ?? Date.now();
  const attachmentRefs = extractHtmlAttachmentRefs(html);
  const attachments: PreparedKeepAttachment[] = [];
  let missingAttachments = 0;
  for (const reference of attachmentRefs) {
    const resolved = resolveAttachment(source, reference, entryIndex);
    if (!resolved) {
      missingAttachments += 1;
      collector.push(
        source.path,
        `HTML attachment “${reference}” was not found in the selected files.`,
      );
      continue;
    }
    attachments.push(await prepareAttachment(resolved, reference, undefined, createdAt));
  }

  if (!title.trim() && !content.trim() && items.length === 0 && attachments.length === 0) {
    throw new Error('The HTML fallback note is empty and was skipped.');
  }
  collector.push(
    source.path,
    'Imported from the Google Keep HTML fallback; color, pin/archive/trash state, and some metadata may be unavailable.',
  );
  const sourceKey = await sha256Text(
    `html:${JSON.stringify({ title, content, items: items.map((item) => [item.text, item.checked]), labels })}`,
  );
  return {
    note: {
      sourceKey,
      sourceAliases: [],
      sourcePath: source.path,
      type: items.length > 0 ? 'checklist' : 'text',
      title: title.slice(0, 500),
      content: content.slice(0, 1_000_000),
      color: 'default',
      createdAt,
      updatedAt: createdAt,
      pinned: false,
      archived: false,
      trashed: false,
      labels,
      items: items.slice(0, 10_000),
      attachments,
    },
    missingAttachments,
  };
}

async function prepareAttachment(
  resolved: ArchiveEntry,
  reference: string,
  declaredMimeType: string | undefined,
  createdAt: number,
): Promise<PreparedKeepAttachment> {
  const checksum = await sha256Hex(resolved.bytes);
  const mimeType = normalizeMimeType(declaredMimeType, reference);
  return {
    name: basename(reference),
    mimeType,
    size: resolved.bytes.byteLength,
    checksum,
    data: new Blob([ownedArrayBuffer(resolved.bytes)], { type: mimeType }),
    createdAt,
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
  const normalized = normalizeArchivePath(decodeHtmlEntities(filePath));
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

async function keepSourceIdentity(
  note: z.infer<typeof keepNoteSchema>,
): Promise<{ primary: string; aliases: string[] }> {
  const stableId = note.id ?? note.noteId;
  if (stableId !== undefined) {
    return { primary: await sha256Text(`id:${String(stableId)}`), aliases: [] };
  }

  const canonical = JSON.stringify({
    created: timestampIdentity(note.createdTimestampUsec),
    updated: timestampIdentity(note.userEditedTimestampUsec),
    title: note.title,
    text: note.textContent ?? note.textContentHtml ?? '',
    list: canonicalizeListForIdentity(note.listContent ?? []),
    labels: note.labels.map((label) => label.name.trim().toLocaleLowerCase()).sort(),
    attachments: note.attachments.map((attachment) => attachment.filePath).sort(),
    color: note.color,
    pinned: note.isPinned,
    archived: note.isArchived,
    trashed: note.isTrashed,
  });
  const primary = await sha256Text(`fingerprint:${canonical}`);
  const created = timestampIdentity(note.createdTimestampUsec);
  const aliases = created ? [await sha256Text(`created-usec:${created}`)] : [];
  return { primary, aliases: aliases.filter((alias) => alias !== primary) };
}

function canonicalizeListForIdentity(rawItems: unknown[]): unknown[] {
  return rawItems.map((raw) => {
    const parsed = keepListItemSchema.safeParse(raw);
    if (!parsed.success) return null;
    const children = parsed.data.childItems ?? parsed.data.childListItems ?? [];
    return {
      text: parsed.data.text,
      checked: parsed.data.isChecked ?? parsed.data.checked ?? false,
      children: canonicalizeListForIdentity(children),
    };
  });
}

function timestampIdentity(value: z.infer<typeof timestampUsecSchema>): string | null {
  if (value === undefined) return null;
  if (typeof value === 'number') {
    return Number.isFinite(value) && value >= 0 && Number.isInteger(value) ? String(value) : null;
  }
  return /^\d+$/u.test(value) ? value : null;
}

function usecToMillis(value: z.infer<typeof timestampUsecSchema>): number | null {
  const identity = timestampIdentity(value);
  if (identity === null) return null;
  try {
    const milliseconds = BigInt(identity) / 1000n;
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

function readSelectedFilePath(file: File): string {
  const relative = (file as File & { webkitRelativePath?: string }).webkitRelativePath;
  return relative?.trim() || file.name;
}

function dirname(path: string): string {
  const index = path.lastIndexOf('/');
  return index < 0 ? '' : path.slice(0, index);
}

function basename(path: string): string {
  const normalized = path.replace(/\\/gu, '/');
  return normalized.slice(normalized.lastIndexOf('/') + 1) || 'attachment';
}

function withoutExtension(path: string): string {
  const dot = path.lastIndexOf('.');
  return dot < 0 ? path : path.slice(0, dot);
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

function extractFirstHtmlTextByClass(html: string, className: string): string {
  return htmlToPlainText(extractFirstHtmlFragmentByClass(html, className));
}

function extractHtmlTextsByClass(html: string, className: string): string[] {
  return extractHtmlFragmentsByClass(html, className).map(htmlToPlainText).filter(Boolean);
}

function extractFirstHtmlFragmentByClass(html: string, className: string): string {
  return extractHtmlFragmentsByClass(html, className)[0] ?? '';
}

function extractHtmlFragmentsByClass(html: string, className: string): string[] {
  const safeClass = className.replace(/[^a-z0-9_-]/giu, '');
  if (!safeClass) return [];
  const expression = new RegExp(
    `<([a-z0-9]+)[^>]*class=["'][^"']*\\b${safeClass}\\b[^"']*["'][^>]*>([\\s\\S]*?)<\\/\\1>`,
    'giu',
  );
  return Array.from(html.matchAll(expression), (match) => match[2] ?? '');
}

function extractTagText(html: string, tagName: string): string {
  return htmlToPlainText(extractTagFragments(html, tagName)[0] ?? '');
}

function extractTagFragments(html: string, tagName: string): string[] {
  const safeTag = tagName.replace(/[^a-z0-9]/giu, '');
  if (!safeTag) return [];
  const expression = new RegExp(`<${safeTag}\\b[^>]*>([\\s\\S]*?)<\\/${safeTag}>`, 'giu');
  return Array.from(html.matchAll(expression), (match) => match[1] ?? '');
}

function extractBodyHtml(html: string): string {
  return extractTagFragments(html, 'body')[0] ?? html;
}

function htmlToPlainText(html: string): string {
  return decodeHtmlEntities(
    html
      .replace(/<script\b[\s\S]*?<\/script>/giu, '')
      .replace(/<style\b[\s\S]*?<\/style>/giu, '')
      .replace(/<br\s*\/?>/giu, '\n')
      .replace(/<\/(?:div|p|li|h[1-6])>/giu, '\n')
      .replace(/<[^>]+>/gu, '')
      .replace(/\r\n?/gu, '\n')
      .replace(/[ \t]+\n/gu, '\n')
      .replace(/\n{3,}/gu, '\n\n'),
  ).trim();
}

function decodeHtmlEntities(value: string): string {
  const named: Record<string, string> = {
    amp: '&',
    apos: "'",
    gt: '>',
    lt: '<',
    nbsp: ' ',
    quot: '"',
  };
  return value.replace(/&(#x?[0-9a-f]+|[a-z]+);/giu, (match, entity: string) => {
    if (entity.startsWith('#x') || entity.startsWith('#X')) {
      const code = Number.parseInt(entity.slice(2), 16);
      return Number.isFinite(code) ? String.fromCodePoint(code) : match;
    }
    if (entity.startsWith('#')) {
      const code = Number.parseInt(entity.slice(1), 10);
      return Number.isFinite(code) ? String.fromCodePoint(code) : match;
    }
    return named[entity.toLocaleLowerCase()] ?? match;
  });
}

function extractHtmlAttachmentRefs(html: string): string[] {
  const references = new Set<string>();
  const expression = /<(?:img|audio|source)\b[^>]*\bsrc=["']([^"']+)["']/giu;
  for (const match of html.matchAll(expression)) {
    const reference = match[1]?.trim();
    if (!reference || /^(?:data:|https?:|blob:|javascript:)/iu.test(reference)) continue;
    references.add(reference);
  }
  return [...references];
}

function uniqueDisplayStrings(values: string[]): string[] {
  const result = new Map<string, string>();
  for (const value of values) {
    const display = value.trim().replace(/\s+/gu, ' ');
    if (!display || display.length > 100) continue;
    const normalized = display.normalize('NFKC').toLocaleLowerCase();
    if (!result.has(normalized)) result.set(normalized, display);
  }
  return [...result.values()];
}

function reportParseProgress(
  onProgress: ((progress: KeepImportProgress) => void) | undefined,
  completed: number,
  total: number,
): void {
  onProgress?.({
    phase: 'parsing',
    completed,
    total,
    message: `Scanning Keep notes… ${completed} / ${total}`,
  });
}

async function yieldToBrowser(): Promise<void> {
  await new Promise<void>((resolve) => setTimeout(resolve, 0));
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
