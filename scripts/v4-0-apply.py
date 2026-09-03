from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def read(path: str) -> str:
    return (ROOT / path).read_text()


def write(path: str, content: str) -> None:
    target = ROOT / path
    target.parent.mkdir(parents=True, exist_ok=True)
    target.write_text(content)


def replace_once(path: str, old: str, new: str) -> None:
    content = read(path)
    count = content.count(old)
    if count != 1:
        raise RuntimeError(f"Expected exactly one match in {path}, found {count}: {old[:80]!r}")
    write(path, content.replace(old, new, 1))


def replace_in_const_block(path: str, const_name: str, old: str, new: str) -> None:
    content = read(path)
    start = content.find(f"  const {const_name}")
    if start < 0:
        raise RuntimeError(f"Could not find {const_name} in {path}")
    end = content.find("\n\n  const ", start + 8)
    if end < 0:
        raise RuntimeError(f"Could not find end of {const_name} in {path}")
    block = content[start:end]
    if old not in block:
        raise RuntimeError(f"Could not find {old!r} inside {const_name}")
    block = block.replace(old, new)
    write(path, content[:start] + block + content[end:])


write(
    "src/features/search/search.worker.ts",
    r'''import { searchDocuments, type SearchDocument } from './searchEngine';
import type { SearchFilters } from './searchTypes';

interface SearchWorkerMatch {
  noteId: string;
  score: number;
}

type SearchWorkerRequest =
  | { type: 'replace-index'; documents: SearchDocument[] }
  | { type: 'upsert-document'; document: SearchDocument }
  | { type: 'remove-document'; noteId: string }
  | { type: 'search'; requestId: number; query: string; filters: SearchFilters };

interface SearchWorkerResponse {
  type: 'search-results';
  requestId: number;
  matches: SearchWorkerMatch[];
}

const documents = new Map<string, SearchDocument>();

self.addEventListener('message', (event: MessageEvent<SearchWorkerRequest>) => {
  const message = event.data;
  if (message.type === 'replace-index') {
    documents.clear();
    for (const document of message.documents) documents.set(document.note.id, document);
    return;
  }
  if (message.type === 'upsert-document') {
    documents.set(message.document.note.id, message.document);
    return;
  }
  if (message.type === 'remove-document') {
    documents.delete(message.noteId);
    return;
  }

  const matches = searchDocuments([...documents.values()], message.query, message.filters).map(
    (result) => ({ noteId: result.document.note.id, score: result.score }),
  );
  const response: SearchWorkerResponse = {
    type: 'search-results',
    requestId: message.requestId,
    matches,
  };
  self.postMessage(response);
});
''',
)

write(
    "src/features/search/searchWorkerClient.ts",
    r'''import { searchDocuments, type SearchDocument } from './searchEngine';
import type { SearchFilters } from './searchTypes';

export interface SearchWorkerMatch {
  noteId: string;
  score: number;
}

interface PendingSearch {
  query: string;
  filters: SearchFilters;
  resolve(matches: SearchWorkerMatch[]): void;
}

interface SearchWorkerResponse {
  type: 'search-results';
  requestId: number;
  matches: SearchWorkerMatch[];
}

export class SearchWorkerClient {
  private worker: Worker | null = null;
  private readonly fallbackDocuments = new Map<string, SearchDocument>();
  private readonly pending = new Map<number, PendingSearch>();
  private requestSequence = 0;

  constructor() {
    if (typeof Worker === 'undefined') return;
    try {
      this.worker = new Worker(new URL('./search.worker.ts', import.meta.url), {
        type: 'module',
        name: 'notes-search',
      });
      this.worker.addEventListener('message', this.handleMessage);
      this.worker.addEventListener('error', this.handleWorkerFailure);
      this.worker.addEventListener('messageerror', this.handleWorkerFailure);
    } catch {
      this.worker = null;
    }
  }

  replaceIndex(documents: SearchDocument[]): void {
    this.fallbackDocuments.clear();
    for (const document of documents) this.fallbackDocuments.set(document.note.id, document);
    this.worker?.postMessage({ type: 'replace-index', documents });
  }

  upsertDocument(document: SearchDocument): void {
    this.fallbackDocuments.set(document.note.id, document);
    this.worker?.postMessage({ type: 'upsert-document', document });
  }

  removeDocument(noteId: string): void {
    this.fallbackDocuments.delete(noteId);
    this.worker?.postMessage({ type: 'remove-document', noteId });
  }

  search(query: string, filters: SearchFilters): Promise<SearchWorkerMatch[]> {
    const worker = this.worker;
    if (!worker) return Promise.resolve(this.searchFallback(query, filters));

    const requestId = ++this.requestSequence;
    return new Promise((resolve) => {
      this.pending.set(requestId, { query, filters, resolve });
      worker.postMessage({ type: 'search', requestId, query, filters });
    });
  }

  dispose(): void {
    const worker = this.worker;
    this.worker = null;
    if (worker) {
      worker.removeEventListener('message', this.handleMessage);
      worker.removeEventListener('error', this.handleWorkerFailure);
      worker.removeEventListener('messageerror', this.handleWorkerFailure);
      worker.terminate();
    }
    this.resolvePendingWithFallback();
  }

  private readonly handleMessage = (event: MessageEvent<SearchWorkerResponse>) => {
    const message = event.data;
    if (message?.type !== 'search-results') return;
    const pending = this.pending.get(message.requestId);
    if (!pending) return;
    this.pending.delete(message.requestId);
    pending.resolve(message.matches);
  };

  private readonly handleWorkerFailure = () => {
    const worker = this.worker;
    this.worker = null;
    worker?.terminate();
    this.resolvePendingWithFallback();
  };

  private resolvePendingWithFallback(): void {
    for (const pending of this.pending.values()) {
      pending.resolve(this.searchFallback(pending.query, pending.filters));
    }
    this.pending.clear();
  }

  private searchFallback(query: string, filters: SearchFilters): SearchWorkerMatch[] {
    return searchDocuments([...this.fallbackDocuments.values()], query, filters).map((result) => ({
      noteId: result.document.note.id,
      score: result.score,
    }));
  }
}
''',
)

write(
    "src/features/search/searchRepository.ts",
    r'''import Dexie from 'dexie';

import {
  checklistItemRecordSchema,
  labelRecordSchema,
  noteLabelRecordSchema,
  noteRecordSchema,
  reminderRecordSchema,
  type ChecklistItemRecord,
  type NoteRecord,
  type NotesDatabase,
} from '../../db';
import { parseWikiLinks } from '../links/linkIntelligence';
import { richTextToPlainText } from '../richText/richText';
import {
  extractIndexedOcrText,
  normalizeSearchText,
  tokenizeNormalizedSearchText,
  type SearchDocument,
} from './searchEngine';

const LINK_PATTERN = /(?:https?:\/\/|www\.)\S+/iu;

export class SearchRepository {
  constructor(private readonly database: NotesDatabase) {}

  async loadIndex(): Promise<SearchDocument[]> {
    const [
      rawNotes,
      rawItems,
      rawLabels,
      rawLinks,
      attachmentNameKeys,
      attachmentMimeKeys,
      rawReminders,
    ] = await Promise.all([
      this.database.notes.toArray(),
      this.database.checklistItems.toArray(),
      this.database.labels.toArray(),
      this.database.noteLabels.toArray(),
      this.database.attachments.orderBy('[noteId+name]').keys(),
      this.database.attachments.orderBy('[noteId+mimeType]').keys(),
      this.database.reminders.toArray(),
    ]);

    const notes = rawNotes
      .map((note) => noteRecordSchema.parse(note))
      .filter((note) => note.trashedAt === null);
    const noteIds = new Set(notes.map((note) => note.id));
    const itemsByNote = new Map<string, ChecklistItemRecord[]>();
    for (const rawItem of rawItems) {
      const item = checklistItemRecordSchema.parse(rawItem);
      if (!noteIds.has(item.noteId)) continue;
      const items = itemsByNote.get(item.noteId) ?? [];
      items.push(item);
      itemsByNote.set(item.noteId, items);
    }
    for (const items of itemsByNote.values()) {
      items.sort((a, b) => a.position - b.position || a.createdAt - b.createdAt);
    }

    const labelsById = new Map(
      rawLabels.map((rawLabel) => {
        const label = labelRecordSchema.parse(rawLabel);
        return [label.id, label] as const;
      }),
    );
    const labelIdsByNote = new Map<string, string[]>();
    for (const rawLink of rawLinks) {
      const link = noteLabelRecordSchema.parse(rawLink);
      if (!noteIds.has(link.noteId)) continue;
      const labelIds = labelIdsByNote.get(link.noteId) ?? [];
      labelIds.push(link.labelId);
      labelIdsByNote.set(link.noteId, labelIds);
    }

    const imageNoteIds = new Set<string>();
    const attachmentNamesByNote = new Map<string, string[]>();
    for (const rawKey of attachmentNameKeys) {
      const key = compoundStringKey(rawKey);
      if (!key) continue;
      const [noteId, rawName] = key;
      if (!noteIds.has(noteId)) continue;
      const name = rawName.trim();
      if (!name) continue;
      const names = attachmentNamesByNote.get(noteId) ?? [];
      names.push(name);
      attachmentNamesByNote.set(noteId, names);
    }
    for (const rawKey of attachmentMimeKeys) {
      const key = compoundStringKey(rawKey);
      if (!key) continue;
      const [noteId, mimeType] = key;
      if (noteIds.has(noteId) && mimeType.startsWith('image/')) imageNoteIds.add(noteId);
    }

    const reminderNoteIds = new Set<string>();
    for (const rawReminder of rawReminders) {
      const reminder = reminderRecordSchema.parse(rawReminder);
      if (noteIds.has(reminder.noteId) && reminder.status === 'active') {
        reminderNoteIds.add(reminder.noteId);
      }
    }

    return notes.map((note) => {
      const checklistItems = itemsByNote.get(note.id) ?? [];
      const labelIds = labelIdsByNote.get(note.id) ?? [];
      const labelNames = labelIds
        .map((labelId) => labelsById.get(labelId)?.name)
        .filter((name): name is string => Boolean(name));
      return buildSearchDocument(
        note,
        checklistItems,
        labelIds,
        labelNames,
        attachmentNamesByNote.get(note.id) ?? [],
        imageNoteIds.has(note.id),
        reminderNoteIds.has(note.id),
      );
    });
  }

  async loadDocument(noteId: string): Promise<SearchDocument | null> {
    const [rawNote, rawItems, rawLinks, attachmentNameKeys, attachmentMimeKeys, rawReminder] =
      await Promise.all([
        this.database.notes.get(noteId),
        this.database.checklistItems.where('noteId').equals(noteId).toArray(),
        this.database.noteLabels.where('noteId').equals(noteId).toArray(),
        this.database.attachments
          .where('[noteId+name]')
          .between([noteId, Dexie.minKey], [noteId, Dexie.maxKey], true, true)
          .keys(),
        this.database.attachments
          .where('[noteId+mimeType]')
          .between([noteId, Dexie.minKey], [noteId, Dexie.maxKey], true, true)
          .keys(),
        this.database.reminders.where('noteId').equals(noteId).first(),
      ]);

    if (!rawNote) return null;
    const note = noteRecordSchema.parse(rawNote);
    if (note.trashedAt !== null) return null;

    const checklistItems = rawItems
      .map((item) => checklistItemRecordSchema.parse(item))
      .sort((a, b) => a.position - b.position || a.createdAt - b.createdAt);
    const labelIds = rawLinks.map((link) => noteLabelRecordSchema.parse(link).labelId);
    const rawLabels = await this.database.labels.bulkGet(labelIds);
    const labelNames = rawLabels.flatMap((rawLabel) =>
      rawLabel ? [labelRecordSchema.parse(rawLabel).name] : [],
    );
    const attachmentNames = attachmentNameKeys.flatMap((rawKey) => {
      const key = compoundStringKey(rawKey);
      if (!key || key[0] !== noteId) return [];
      const name = key[1].trim();
      return name ? [name] : [];
    });
    const hasImage = attachmentMimeKeys.some((rawKey) => {
      const key = compoundStringKey(rawKey);
      return Boolean(key && key[0] === noteId && key[1].startsWith('image/'));
    });
    const hasReminder = rawReminder
      ? reminderRecordSchema.parse(rawReminder).status === 'active'
      : false;

    return buildSearchDocument(
      note,
      checklistItems,
      labelIds,
      labelNames,
      attachmentNames,
      hasImage,
      hasReminder,
    );
  }
}

function buildSearchDocument(
  note: NoteRecord,
  checklistItems: ChecklistItemRecord[],
  labelIds: string[],
  labelNames: string[],
  attachmentNames: string[],
  hasImage: boolean,
  hasReminder: boolean,
): SearchDocument {
  const checklistText = checklistItems.map((item) => item.text).join('\n');
  const plainBody = note.type === 'text' ? richTextToPlainText(note.content) : note.content;
  const ocrText = note.type === 'text' ? extractIndexedOcrText(note.content) : '';
  const combinedLinkText = [note.title, plainBody, checklistText].join('\n');
  const normalizedTitle = normalizeSearchText(note.title);
  const normalizedBody = normalizeSearchText(plainBody);
  const normalizedChecklist = normalizeSearchText(checklistText);
  const normalizedLabels = normalizeSearchText(labelNames.join(' '));
  const normalizedAttachments = normalizeSearchText(attachmentNames.join(' '));
  const normalizedOcr = normalizeSearchText(ocrText);
  const hasInternalLink = note.type === 'text' && parseWikiLinks(note.content).length > 0;
  const titleTokens = tokenizeNormalizedSearchText(normalizedTitle);
  const bodyTokens = tokenizeNormalizedSearchText(normalizedBody);
  const checklistTokens = tokenizeNormalizedSearchText(normalizedChecklist);
  const labelTokens = tokenizeNormalizedSearchText(normalizedLabels);
  const attachmentTokens = tokenizeNormalizedSearchText(normalizedAttachments);
  const ocrTokens = tokenizeNormalizedSearchText(normalizedOcr);
  const normalizedAll = [
    normalizedTitle,
    normalizedBody,
    normalizedChecklist,
    normalizedLabels,
    normalizedAttachments,
  ]
    .filter(Boolean)
    .join(' ');

  return {
    note,
    checklistItems,
    labelIds,
    labelNames,
    attachmentNames,
    ocrText,
    hasImage,
    hasLink: hasInternalLink || LINK_PATTERN.test(combinedLinkText),
    hasReminder,
    normalizedTitle,
    normalizedBody,
    normalizedChecklist,
    normalizedLabels,
    normalizedAttachments,
    normalizedOcr,
    normalizedAll,
    titleTokens,
    bodyTokens,
    checklistTokens,
    labelTokens,
    attachmentTokens,
    ocrTokens,
    allTokens: [
      ...new Set([
        ...titleTokens,
        ...bodyTokens,
        ...checklistTokens,
        ...labelTokens,
        ...attachmentTokens,
      ]),
    ],
  };
}

function compoundStringKey(value: unknown): [string, string] | null {
  if (!Array.isArray(value) || value.length != 2) return null;
  const [first, second] = value;
  return typeof first === 'string' && typeof second === 'string' ? [first, second] : null;
}
''',
)

write(
    "src/features/notes/MasonryGrid.tsx",
    r'''import { useCallback, useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react';

import type { ChecklistItemRecord, LabelRecord, NoteRecord, ReminderRecord } from '../../db';
import {
  NoteCard,
  type NoteCardActions,
  type NoteCardMode,
  type NoteSelectionIntent,
} from './NoteCard';
import type { NotesViewMode } from './viewMode';

export const INITIAL_MOUNTED_NOTE_COUNT = 96;
export const NOTE_MOUNT_BATCH_SIZE = 96;

interface MasonryGridProps {
  notes: NoteRecord[];
  viewMode: NotesViewMode;
  ariaLabel: string;
  mode: NoteCardMode;
  actions: NoteCardActions;
  labels: LabelRecord[];
  labelIdsByNote: Record<string, string[]>;
  checklistItemsByNote: Record<string, ChecklistItemRecord[]>;
  remindersByNote?: Record<string, ReminderRecord>;
  attachmentRefreshByNote?: Record<string, number>;
  searchContextByNote?: Record<string, string>;
  selectedNoteIds?: Set<string>;
  selectionActive?: boolean;
  onSelectionIntent?: ((note: NoteRecord, intent: NoteSelectionIntent) => void) | undefined;
}

interface MountWindow {
  scope: string;
  limit: number;
}

export function MasonryGrid({
  notes,
  viewMode,
  ariaLabel,
  mode,
  actions,
  labels,
  labelIdsByNote,
  checklistItemsByNote,
  remindersByNote,
  attachmentRefreshByNote = {},
  searchContextByNote = {},
  selectedNoteIds,
  selectionActive = false,
  onSelectionIntent,
}: MasonryGridProps) {
  const [mountWindow, setMountWindow] = useState<MountWindow>({
    scope: ariaLabel,
    limit: INITIAL_MOUNTED_NOTE_COUNT,
  });
  const sentinelRef = useRef<HTMLDivElement>(null);
  const activeLimit =
    mountWindow.scope === ariaLabel ? mountWindow.limit : INITIAL_MOUNTED_NOTE_COUNT;
  const mountedNotes = notes.slice(0, Math.min(notes.length, activeLimit));
  const remaining = Math.max(0, notes.length - mountedNotes.length);

  const mountMore = useCallback(() => {
    setMountWindow((current) => {
      const currentLimit =
        current.scope === ariaLabel ? current.limit : INITIAL_MOUNTED_NOTE_COUNT;
      return {
        scope: ariaLabel,
        limit: Math.min(notes.length, currentLimit + NOTE_MOUNT_BATCH_SIZE),
      };
    });
  }, [ariaLabel, notes.length]);

  useEffect(() => {
    const sentinel = sentinelRef.current;
    if (!sentinel || remaining === 0 || typeof IntersectionObserver === 'undefined') return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) mountMore();
      },
      { rootMargin: '800px 0px' },
    );
    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [mountMore, remaining]);

  return (
    <>
      <div
        className="note-grid"
        data-view={viewMode}
        data-mounted-count={mountedNotes.length}
        data-total-count={notes.length}
        role="list"
        aria-label={ariaLabel}
      >
        {mountedNotes.map((note) => {
          const reminderProps = remindersByNote ? { reminder: remindersByNote[note.id] ?? null } : {};
          return (
            <MasonryItem key={note.id} viewMode={viewMode}>
              <NoteCard
                note={note}
                mode={mode}
                actions={actions}
                labels={labels}
                selectedLabelIds={labelIdsByNote[note.id] ?? []}
                checklistItems={checklistItemsByNote[note.id] ?? []}
                {...reminderProps}
                attachmentRefreshKey={attachmentRefreshByNote[note.id] ?? 0}
                searchContext={searchContextByNote[note.id]}
                selection={
                  onSelectionIntent
                    ? {
                        active: selectionActive,
                        selected: selectedNoteIds?.has(note.id) ?? false,
                        onIntent: onSelectionIntent,
                      }
                    : undefined
                }
              />
            </MasonryItem>
          );
        })}
      </div>
      {remaining > 0 ? (
        <div ref={sentinelRef} className="note-grid-progress">
          <button type="button" onClick={mountMore}>
            Show more notes <span>{remaining} remaining</span>
          </button>
        </div>
      ) : null}
    </>
  );
}

function MasonryItem({ children, viewMode }: { children: ReactNode; viewMode: NotesViewMode }) {
  const itemRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    const item = itemRef.current;
    const content = contentRef.current;
    if (!item || !content) return;

    if (viewMode === 'list') {
      item.style.removeProperty('grid-row-end');
      return;
    }

    const grid = item.parentElement;
    if (!grid) return;

    let animationFrame = 0;

    const updateSpan = () => {
      cancelAnimationFrame(animationFrame);
      animationFrame = requestAnimationFrame(() => {
        const styles = window.getComputedStyle(grid);
        const rowHeight = Number.parseFloat(styles.gridAutoRows) || 8;
        const rowGap = Number.parseFloat(styles.rowGap) || 8;
        const height = content.getBoundingClientRect().height;
        const span = Math.max(1, Math.ceil((height + rowGap) / (rowHeight + rowGap)));
        item.style.gridRowEnd = `span ${span}`;
      });
    };

    const observer = new ResizeObserver(updateSpan);
    observer.observe(content);
    updateSpan();

    return () => {
      cancelAnimationFrame(animationFrame);
      observer.disconnect();
    };
  }, [viewMode]);

  return (
    <div ref={itemRef} className="note-masonry-item" role="listitem">
      <div ref={contentRef}>{children}</div>
    </div>
  );
}
''',
)

replace_once(
    "src/features/search/SearchWorkspace.tsx",
    """import {\n  parseSearchQuery,\n  primarySearchMatchField,\n  searchDocuments,\n  type SearchDocument,\n} from './searchEngine';\n""",
    """import {\n  parseSearchQuery,\n  primarySearchMatchField,\n  type SearchDocument,\n  type SearchResult,\n} from './searchEngine';\n""",
)
replace_once(
    "src/features/search/SearchWorkspace.tsx",
    "import { SearchRepository } from './searchRepository';\n",
    "import { SearchRepository } from './searchRepository';\nimport { SearchWorkerClient } from './searchWorkerClient';\n",
)
replace_once(
    "src/features/search/SearchWorkspace.tsx",
    """  const [documents, setDocuments] = useState<SearchDocument[]>([]);\n  const [loaded, setLoaded] = useState(false);\n""",
    """  const [documents, setDocuments] = useState<SearchDocument[]>([]);\n  const [results, setResults] = useState<SearchResult[]>([]);\n  const [loaded, setLoaded] = useState(false);\n  const [indexRevision, setIndexRevision] = useState(0);\n  const [completedSearchKey, setCompletedSearchKey] = useState('');\n""",
)
replace_once(
    "src/features/search/SearchWorkspace.tsx",
    """  const searchOriginNoteIdRef = useRef<string | null>(null);\n\n  const showToast""",
    """  const searchOriginNoteIdRef = useRef<string | null>(null);\n  const searchClientRef = useRef<SearchWorkerClient | null>(null);\n  const searchRequestIdRef = useRef(0);\n\n  const showToast""",
)
replace_once(
    "src/features/search/SearchWorkspace.tsx",
    """  const reloadIndex = useCallback(async () => {\n    const index = await searchRepository.loadIndex();\n    setDocuments(index);\n    setLoaded(true);\n  }, []);\n\n  useEffect(() => {\n""",
    """  useEffect(() => {\n    const client = new SearchWorkerClient();\n    searchClientRef.current = client;\n    return () => {\n      searchClientRef.current = null;\n      client.dispose();\n    };\n  }, []);\n\n  const replaceIndex = useCallback((index: SearchDocument[]) => {\n    searchClientRef.current?.replaceIndex(index);\n    setDocuments(index);\n    setLoaded(true);\n    setIndexRevision((current) => current + 1);\n  }, []);\n\n  const reloadIndex = useCallback(async () => {\n    replaceIndex(await searchRepository.loadIndex());\n  }, [replaceIndex]);\n\n  const refreshDocument = useCallback(async (noteId: string) => {\n    const document = await searchRepository.loadDocument(noteId);\n    if (document) {\n      searchClientRef.current?.upsertDocument(document);\n      setDocuments((current) => {\n        const existingIndex = current.findIndex((item) => item.note.id === noteId);\n        if (existingIndex < 0) return [...current, document];\n        const next = [...current];\n        next[existingIndex] = document;\n        return next;\n      });\n    } else {\n      searchClientRef.current?.removeDocument(noteId);\n      setDocuments((current) => current.filter((item) => item.note.id !== noteId));\n    }\n    setIndexRevision((current) => current + 1);\n  }, []);\n\n  useEffect(() => {\n""",
)
replace_once(
    "src/features/search/SearchWorkspace.tsx",
    """      .then((index) => {\n        if (cancelled) return;\n        setDocuments(index);\n        setLoaded(true);\n      })\n""",
    """      .then((index) => {\n        if (cancelled) return;\n        replaceIndex(index);\n      })\n""",
)
replace_once(
    "src/features/search/SearchWorkspace.tsx",
    """        setDocuments([]);\n        setLoaded(true);\n        showToast('Search index could not be loaded.');\n""",
    """        searchClientRef.current?.replaceIndex([]);\n        setDocuments([]);\n        setLoaded(true);\n        setIndexRevision((current) => current + 1);\n        showToast('Search index could not be loaded.');\n""",
)
replace_once(
    "src/features/search/SearchWorkspace.tsx",
    "  }, [showToast]);\n\n  useEffect(() => {\n    const handleReminderChanged",
    "  }, [replaceIndex, showToast]);\n\n  useEffect(() => {\n    const handleReminderChanged",
)
replace_once(
    "src/features/search/SearchWorkspace.tsx",
    """  const parsedQuery = useMemo(() => parseSearchQuery(query), [query]);\n  const results = useMemo(\n    () => searchDocuments(documents, query, filters),\n    [documents, filters, query],\n  );\n""",
    """  const parsedQuery = useMemo(() => parseSearchQuery(query), [query]);\n  const searchKey = useMemo(\n    () => `${indexRevision}:${query}:${JSON.stringify(filters)}`,\n    [filters, indexRevision, query],\n  );\n  const searchReady = loaded && completedSearchKey === searchKey;\n\n  useEffect(() => {\n    if (!loaded) return;\n    const client = searchClientRef.current;\n    if (!client) return;\n    let cancelled = false;\n    const requestId = ++searchRequestIdRef.current;\n    void client\n      .search(query, filters)\n      .then((matches) => {\n        if (cancelled || requestId !== searchRequestIdRef.current) return;\n        const byId = new Map(documents.map((document) => [document.note.id, document]));\n        const nextResults = matches.flatMap((match) => {\n          const document = byId.get(match.noteId);\n          return document ? [{ document, score: match.score }] : [];\n        });\n        setResults(nextResults);\n        setCompletedSearchKey(searchKey);\n      })\n      .catch(() => {\n        if (cancelled || requestId !== searchRequestIdRef.current) return;\n        setResults([]);\n        setCompletedSearchKey(searchKey);\n        showToast('Search could not be completed.');\n      });\n    return () => {\n      cancelled = true;\n    };\n  }, [documents, filters, loaded, query, searchKey, showToast]);\n""",
)
replace_once(
    "src/features/search/SearchWorkspace.tsx",
    """  const handleAttachmentsChanged = useCallback((noteId: string) => {\n    setAttachmentRefreshByNote((current) => ({\n      ...current,\n      [noteId]: (current[noteId] ?? 0) + 1,\n    }));\n  }, []);\n""",
    """  const handleAttachmentsChanged = useCallback(\n    (noteId: string) => {\n      setAttachmentRefreshByNote((current) => ({\n        ...current,\n        [noteId]: (current[noteId] ?? 0) + 1,\n      }));\n      void refreshDocument(noteId);\n    },\n    [refreshDocument],\n  );\n""",
)

for name in [
    "handleTogglePin",
    "handleArchive",
    "handleUnarchive",
    "handleTrash",
    "handleSetColor",
    "handleSetLabels",
]:
    replace_in_const_block("src/features/search/SearchWorkspace.tsx", name, "reloadIndex", "refreshDocument")

replace_in_const_block("src/features/search/SearchWorkspace.tsx", "handleDuplicate", "reloadIndex", "refreshDocument")
content = read("src/features/search/SearchWorkspace.tsx")
start = content.find("  const handleDuplicate")
end = content.find("\n\n  const ", start + 8)
block = content[start:end].replace("refreshDocument(note.id)", "refreshDocument(duplicate.id)")
write("src/features/search/SearchWorkspace.tsx", content[:start] + block + content[end:])

replace_in_const_block("src/features/search/SearchWorkspace.tsx", "handleSaved", "reloadIndex", "refreshDocument")
replace_in_const_block("src/features/search/SearchWorkspace.tsx", "handleChecklistSaved", "reloadIndex", "refreshDocument")
replace_once(
    "src/features/search/SearchWorkspace.tsx",
    """              onConverted={(note) => {\n                setEditing({ note, items: [] });\n                void reloadIndex();\n              }}\n""",
    """              onConverted={(note) => {\n                setEditing({ note, items: [] });\n                void refreshDocument(note.id);\n              }}\n""",
)
replace_once(
    "src/features/search/SearchWorkspace.tsx",
    """                  setEditing({ note: converted.note, items: converted.items });\n                  await reloadIndex();\n""",
    """                  setEditing({ note: converted.note, items: converted.items });\n                  await refreshDocument(converted.note.id);\n""",
)
replace_once(
    "src/features/search/SearchWorkspace.tsx",
    """          <strong>{loaded ? results.length : '…'}</strong>{' '}\n""",
    """          <strong>{searchReady ? results.length : '…'}</strong>{' '}\n""",
)
replace_once(
    "src/features/search/SearchWorkspace.tsx",
    """      {loaded && results.length === 0 ? (\n""",
    """      {searchReady && results.length === 0 ? (\n""",
)

replace_once(
    "src/styles/notes.css",
    """.note-grid[data-view='list'] .note-masonry-item {\n  grid-row-end: auto !important;\n}\n\n.note-card {\n""",
    """.note-grid[data-view='list'] .note-masonry-item {\n  grid-row-end: auto !important;\n}\n\n.note-grid-progress {\n  display: flex;\n  justify-content: center;\n  padding: var(--space-5) 0 var(--space-2);\n}\n\n.note-grid-progress button {\n  min-height: 40px;\n  padding: 0 var(--space-4);\n  border: 1px solid var(--border);\n  border-radius: var(--radius-pill);\n  background: var(--surface);\n  color: var(--text-muted);\n  cursor: pointer;\n  font: inherit;\n  font-size: var(--text-sm);\n  font-weight: 650;\n}\n\n.note-grid-progress button:hover,\n.note-grid-progress button:focus-visible {\n  border-color: var(--border-strong);\n  background: var(--surface-hover);\n  color: var(--text);\n}\n\n.note-grid-progress button span {\n  margin-left: var(--space-2);\n  color: var(--text-subtle);\n  font-size: var(--text-xs);\n  font-weight: 550;\n}\n\n.note-card {\n""",
)

replace_once(
    "scripts/check-performance-budget.mjs",
    """if (\n  !searchRepository.includes(\"orderBy('[noteId+name]').keys()\") ||\n  !searchRepository.includes(\"orderBy('[noteId+mimeType]').keys()\")\n) {\n  throw new Error('Search attachment metadata indexes are missing from the production source.');\n}\n\nconst sw = await readFile(join(distDir, 'sw.js'), 'utf8');\n""",
    """if (\n  !searchRepository.includes(\"orderBy('[noteId+name]').keys()\") ||\n  !searchRepository.includes(\"orderBy('[noteId+mimeType]').keys()\")\n) {\n  throw new Error('Search attachment metadata indexes are missing from the production source.');\n}\nif (!searchRepository.includes('async loadDocument(noteId: string)')) {\n  throw new Error('Incremental single-note search refresh is missing.');\n}\n\nconst searchWorkspace = await readFile(\n  join(cwd(), 'src', 'features', 'search', 'SearchWorkspace.tsx'),\n  'utf8',\n);\nif (searchWorkspace.includes('searchDocuments(')) {\n  throw new Error('Search scoring regressed onto the SearchWorkspace main-thread render path.');\n}\nconst searchWorkerClient = await readFile(\n  join(cwd(), 'src', 'features', 'search', 'searchWorkerClient.ts'),\n  'utf8',\n);\nif (!searchWorkerClient.includes("new Worker(new URL('./search.worker.ts', import.meta.url)")) {\n  throw new Error('The dedicated search worker is missing.');\n}\n\nconst sw = await readFile(join(distDir, 'sw.js'), 'utf8');\n""",
)

write(
    "e2e/large-library-engine.spec.ts",
    r'''import { expect, test } from '@playwright/test';

async function seedNotes(page: import('@playwright/test').Page, count: number, needleIndex = -1) {
  await page.evaluate(
    async ({ count: noteCount, needleIndex: targetIndex }) => {
      const db = await import('/notes/src/db/index.ts');
      const now = Date.now();
      await db.notesDatabase.notes.bulkPut(
        Array.from({ length: noteCount }, (_, index) => ({
          id: crypto.randomUUID(),
          type: 'text' as const,
          title: index === targetIndex ? 'Worker needle target' : `Scale note ${index + 1}`,
          content: index === targetIndex ? 'Incremental search target body' : `Body ${index + 1}`,
          color: 'default' as const,
          createdAt: now - index,
          updatedAt: now - index,
          pinnedAt: null,
          archivedAt: null,
          trashedAt: null,
          position: index,
          revision: 1,
        })),
      );
    },
    { count, needleIndex },
  );
}

test('large libraries progressively mount note cards instead of mounting the whole collection', async ({
  page,
}) => {
  await page.goto('./');
  await seedNotes(page, 1000);
  await page.reload();

  const cards = page.locator('[data-note-card]');
  await expect(cards.first()).toBeVisible();
  const initialMounted = await cards.count();
  expect(initialMounted).toBeGreaterThan(0);
  expect(initialMounted).toBeLessThan(300);

  const grid = page.getByRole('list', { name: /notes/i }).first();
  await expect(grid).toHaveAttribute('data-total-count', '1000');
  await expect(grid).not.toHaveAttribute('data-mounted-count', '1000');

  const loadMore = page.getByRole('button', { name: /Show more notes/ }).first();
  if (await loadMore.isVisible()) {
    const before = await cards.count();
    await loadMore.click();
    await expect.poll(() => cards.count()).toBeGreaterThan(before);
  }
});

test('search uses a worker and note edits refresh the index without a full-library reload', async ({
  page,
}) => {
  await page.addInitScript(() => {
    const NativeWorker = window.Worker;
    const workerUrls: string[] = [];
    Object.defineProperty(window, '__notesWorkerUrls', { value: workerUrls, configurable: true });
    Object.defineProperty(window, 'Worker', {
      configurable: true,
      writable: true,
      value: new Proxy(NativeWorker, {
        construct(target, args) {
          workerUrls.push(String(args[0]));
          return Reflect.construct(target, args);
        },
      }),
    });
  });

  await page.goto('./');
  await seedNotes(page, 1200, 777);
  await page.reload();

  const search = page.getByRole('searchbox', { name: 'Search notes' });
  await search.fill('Worker needle target');
  await expect(page.getByRole('button', { name: 'Open note: Worker needle target' })).toBeVisible();

  const workerUrls = await page.evaluate(
    () => (window as Window & { __notesWorkerUrls?: string[] }).__notesWorkerUrls ?? [],
  );
  expect(workerUrls.some((url) => url.includes('search.worker'))).toBe(true);

  await page.evaluate(async () => {
    const searchModule = await import('/notes/src/features/search/searchRepository.ts');
    searchModule.SearchRepository.prototype.loadIndex = async () => {
      throw new Error('Full search-index reload is forbidden after initial load.');
    };
  });

  await page.getByRole('button', { name: 'Open note: Worker needle target' }).click();
  const editor = page.getByRole('dialog', { name: 'Edit note' });
  await editor.getByLabel('Title').fill('Worker renamed target');
  await editor.getByRole('button', { name: 'Close' }).click();

  await search.fill('Worker renamed target');
  await expect(page.getByRole('button', { name: 'Open note: Worker renamed target' })).toBeVisible();
  await expect(page.getByText('Search index could not be refreshed.')).toHaveCount(0);
});
''',
)

write(
    "docs/LARGE_LIBRARY_ENGINE.md",
    r'''# V4.0 — Large-Library Engine & Responsiveness

## Release objective

V4.0 is the first major post-hardening release. It changes how Notes spends browser resources at library scale without changing the local-first product contract or adding cloud/account complexity.

## Off-main-thread search scoring

Search document scoring and fuzzy matching run in a dedicated module Worker. SearchWorkspace sends the normalized index to the worker once, then submits query/filter requests and receives only ordered note IDs plus scores.

If Worker construction is unavailable, the client retains a compatibility fallback using the same deterministic search engine. The production performance gate prevents SearchWorkspace from directly calling the synchronous scorer again.

## Incremental search refresh

SearchRepository now supports `loadDocument(noteId)`. Note edits, checklist changes, color/label changes, archive/pin/trash changes, duplicate operations, and attachment changes refresh only the affected search document instead of rescanning every note and relationship table.

The single-note path reads attachment metadata through the database-v3 compound metadata indexes, so it does not materialize attachment Blob payloads.

A full index rebuild remains available for initial search startup and global reminder-change reconciliation.

## Progressive note mounting

MasonryGrid no longer mounts an arbitrarily large collection in one React render. It starts with a bounded card window and expands in fixed batches near the scroll boundary. A keyboard-accessible **Show more notes** control remains available when automatic intersection loading is unavailable or when users reach it directly.

The total collection remains unchanged in memory and all bulk/data operations still operate on the full loaded collection. The optimization only bounds rendered cards, ResizeObservers, attachment preview observers, and initial DOM work.

## Release gates

V4.0 adds permanent browser coverage that verifies:

- a 1,000-note library does not mount all cards initially;
- the grid still knows the complete collection size;
- search instantiates the dedicated worker;
- an edited search result is reindexed without calling the full-library `loadIndex()` path.

Existing 10,000-note search-engine, bundle-size, Blob-scan, PWA, offline, data-integrity, and full browser regression gates remain mandatory.
''',
)

arch = read("docs/ARCHITECTURE.md")
if "## V4.0 large-library execution model" not in arch:
    arch += r'''

## V4.0 large-library execution model

Search scoring is isolated in a dedicated module Worker. The UI owns display/edit state while the worker owns a clone of the normalized searchable documents and returns only note IDs plus scores. SearchRepository supports single-note reconstruction so normal search-result mutations do not rebuild the whole database-derived index.

Card rendering is progressively mounted in bounded batches. This keeps initial DOM nodes and per-card ResizeObservers proportional to the visible working set rather than the total library size while preserving the complete in-memory collection for sorting, selection, and data operations.
'''
    write("docs/ARCHITECTURE.md", arch)

product = read("docs/PRODUCT.md")
if "11. Large libraries must not force all note cards" not in product:
    product = product.replace(
        "10. Scale regressions in search, rendering, attachments, or backups must be treated as reliability defects.\n",
        "10. Scale regressions in search, rendering, attachments, or backups must be treated as reliability defects.\n11. Large libraries must not force all note cards or fuzzy-search scoring onto the main interaction path at once.\n",
    )
    write("docs/PRODUCT.md", product)
