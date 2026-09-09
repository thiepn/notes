from pathlib import Path


def replace(path: str, old: str, new: str, expected: int = 1) -> None:
    file = Path(path)
    text = file.read_text()
    count = text.count(old)
    if count != expected:
        raise RuntimeError(f'{path}: expected {expected} occurrence(s), found {count}: {old[:100]!r}')
    file.write_text(text.replace(old, new, expected))


def append_once(path: str, marker: str, addition: str) -> None:
    file = Path(path)
    text = file.read_text()
    if marker in text:
        return
    file.write_text(text.rstrip() + '\n\n' + addition.strip() + '\n')


# App shell: one organization collection contract, label-context capture, and stale-label cleanup.
replace(
    'src/app/AppShell.tsx',
    "import { subscribeAppEvent } from './events';",
    "import { dispatchAppEvent, subscribeAppEvent } from './events';",
)
replace(
    'src/app/AppShell.tsx',
    """import {
  EMPTY_NAVIGATION_STATS,
  loadNavigationStats,
  type NavigationStats,
} from '../features/organization/navigationStats';
""",
    """import {
  EMPTY_NAVIGATION_STATS,
  loadNavigationStats,
  type NavigationStats,
} from '../features/organization/navigationStats';
import {
  organizationCollectionLabelId,
  organizationCollectionMode,
  resolveOrganizationCollection,
} from '../features/organization/collectionModel';
""",
)
replace(
    'src/app/AppShell.tsx',
    """import {
  DEFAULT_SEARCH_FILTERS,
  hasSearchFilters,
  type SearchFilters,
} from '../features/search/searchTypes';
""",
    """import {
  pruneRecentSearchLabels,
  pruneSearchFiltersToLabels,
  SearchHistoryRepository,
} from '../features/search/searchHistory';
import {
  DEFAULT_SEARCH_FILTERS,
  hasSearchFilters,
  type SearchFilters,
} from '../features/search/searchTypes';
""",
)
replace(
    'src/app/AppShell.tsx',
    """const labelsRepository = new LabelsRepository(notesDatabase);
""",
    """const labelsRepository = new LabelsRepository(notesDatabase);
const searchHistoryRepository = new SearchHistoryRepository(notesDatabase);
""",
)
replace(
    'src/app/AppShell.tsx',
    """  const refreshLabels = useCallback(async () => {
    setLabels(await labelsRepository.list());
  }, []);
""",
    """  const refreshLabels = useCallback(async () => {
    const storedLabels = await labelsRepository.list();
    const validLabelIds = new Set(storedLabels.map((label) => label.id));
    setLabels(storedLabels);
    setActiveLabelId((current) => {
      if (!current || validLabelIds.has(current)) return current;
      persistActiveLabelId(null);
      return null;
    });
    setSearchFilters((current) => pruneSearchFiltersToLabels(current, validLabelIds));

    try {
      await searchHistoryRepository.pruneMissingLabels(validLabelIds);
      pruneRecentSearchLabels(validLabelIds);
      dispatchAppEvent('searchHistoryChanged');
    } catch {
      // Invalid saved-search label references are recoverable convenience state.
    }
  }, []);
""",
)
replace(
    'src/app/AppShell.tsx',
    """  useEffect(() => {
    let cancelled = false;

    void labelsRepository.list().then((storedLabels) => {
      if (cancelled) return;
      setLabels(storedLabels);
      setActiveLabelId((current) => {
        if (!current || storedLabels.some((label) => label.id === current)) return current;
        persistActiveLabelId(null);
        return null;
      });
    });

    return () => {
      cancelled = true;
    };
  }, []);
""",
    """  useEffect(() => {
    void refreshLabels().catch(() => undefined);
  }, [refreshLabels]);
""",
)
replace(
    'src/app/AppShell.tsx',
    """  const handleDeleteLabel = async (labelId: string) => {
    await labelsRepository.delete(labelId);
    setSearchFilters((current) => ({
      ...current,
      labelIds: current.labelIds.filter((id) => id !== labelId),
    }));
    if (activeLabelId === labelId) {
      setActiveLabelId(null);
      setActiveSection('notes');
      persistActiveLabelId(null);
      persistActiveSection('notes');
    }
    await Promise.all([refreshLabels(), refreshNavigationStats()]);
  };
""",
    """  const handleDeleteLabel = async (labelId: string) => {
    await labelsRepository.delete(labelId);
    if (activeLabelId === labelId) {
      setActiveLabelId(null);
      setActiveSection('notes');
      persistActiveLabelId(null);
      persistActiveSection('notes');
    }
    await Promise.all([refreshLabels(), refreshNavigationStats()]);
  };
""",
)
replace(
    'src/app/AppShell.tsx',
    """  const prepareNotesCapture = useCallback(
    (kind: 'text' | 'checklist') => {
      clearSearch();
      setCommandPaletteOpen(false);
      setActiveSection('notes');
      setActiveLabelId(null);
      persistActiveSection('notes');
      persistActiveLabelId(null);
      setMobileSidebarOpen(false);
      setTabletSidebarExpanded(false);
      captureRequestIdRef.current += 1;
      setCaptureRequest({ id: captureRequestIdRef.current, kind });
    },
    [clearSearch],
  );
""",
    """  const prepareNotesCapture = useCallback(
    (kind: 'text' | 'checklist') => {
      const captureLabelId =
        !searchActive && activeSection === 'notes' && activeLabelId ? activeLabelId : null;
      clearSearch();
      setCommandPaletteOpen(false);
      setActiveSection('notes');
      setActiveLabelId(captureLabelId);
      persistActiveSection('notes');
      persistActiveLabelId(captureLabelId);
      setMobileSidebarOpen(false);
      setTabletSidebarExpanded(false);
      captureRequestIdRef.current += 1;
      setCaptureRequest({ id: captureRequestIdRef.current, kind });
    },
    [activeLabelId, activeSection, clearSearch, searchActive],
  );
""",
)
replace(
    'src/app/AppShell.tsx',
    """  const activeLabel = activeLabelId
    ? (labels.find((label) => label.id === activeLabelId) ?? null)
    : null;
  const normalSection = activeLabel
""",
    """  const activeLabel = activeLabelId
    ? (labels.find((label) => label.id === activeLabelId) ?? null)
    : null;
  const organizationCollection = resolveOrganizationCollection(
    activeSection,
    activeLabel?.id ?? null,
  );
  const organizationMode = organizationCollection
    ? organizationCollectionMode(organizationCollection)
    : 'notes';
  const organizationLabelId = organizationCollection
    ? organizationCollectionLabelId(organizationCollection)
    : null;
  const normalSection = activeLabel
""",
)
replace(
    'src/app/AppShell.tsx',
    """  const lifecycleSection =
    activeLabel !== null ||
    activeSection === 'notes' ||
    activeSection === 'archive' ||
    activeSection === 'trash';
""",
    """  const lifecycleSection = organizationCollection !== null;
""",
)
replace(
    'src/app/AppShell.tsx',
    """                  onCloseFilters={() => setSearchFiltersOpen(false)}
                  onClearSearch={clearSearch}
                />
""",
    """                  onCloseFilters={() => setSearchFiltersOpen(false)}
                  onClearSearch={clearSearch}
                  onCollectionChanged={handleCollectionChanged}
                />
""",
)
replace(
    'src/app/AppShell.tsx',
    """                  mode={activeLabel ? 'notes' : activeSection}
                  labels={labels}
                  filterLabelId={activeLabel?.id ?? null}
""",
    """                  mode={organizationMode}
                  labels={labels}
                  filterLabelId={organizationLabelId}
""",
)
replace(
    'src/app/AppShell.tsx',
    """          <LabelManagerDialog
            labels={labels}
            onClose={() => setLabelManagerOpen(false)}
""",
    """          <LabelManagerDialog
            labels={labels}
            counts={navigationStats.labels}
            onClose={() => setLabelManagerOpen(false)}
""",
)

# Search workspace: reload label metadata and keep shell counts coherent after organization mutations.
replace(
    'src/features/search/SearchWorkspace.tsx',
    """import { LifecycleToast, type LifecycleToastState } from '../notes/LifecycleToast';
""",
    """import { noteLifecycle } from '../organization/collectionModel';
import { LifecycleToast, type LifecycleToastState } from '../notes/LifecycleToast';
""",
)
replace(
    'src/features/search/SearchWorkspace.tsx',
    """  onCloseFilters(): void;
  onClearSearch(): void;
}
""",
    """  onCloseFilters(): void;
  onClearSearch(): void;
  onCollectionChanged?: () => void;
}
""",
)
replace(
    'src/features/search/SearchWorkspace.tsx',
    """  onFiltersChange,
  onCloseFilters,
  onClearSearch,
}: SearchWorkspaceProps) {
""",
    """  onFiltersChange,
  onCloseFilters,
  onClearSearch,
  onCollectionChanged,
}: SearchWorkspaceProps) {
""",
)
replace(
    'src/features/search/SearchWorkspace.tsx',
    """  const searchOriginNoteIdRef = useRef<string | null>(null);
  const searchClientRef = useRef<SearchWorkerClient | null>(null);
  const searchRequestIdRef = useRef(0);
""",
    """  const searchOriginNoteIdRef = useRef<string | null>(null);
  const searchClientRef = useRef<SearchWorkerClient | null>(null);
  const searchRequestIdRef = useRef(0);
  const labelCatalogRevision = useMemo(
    () => labels.map((label) => `${label.id}:${label.updatedAt}`).join('|'),
    [labels],
  );
  const indexedLabelCatalogRevisionRef = useRef(labelCatalogRevision);
""",
)
replace(
    'src/features/search/SearchWorkspace.tsx',
    """  const reloadIndex = useCallback(async () => {
    replaceIndex(await searchRepository.loadIndex());
  }, [replaceIndex]);

  const refreshDocument = useCallback(async (noteId: string) => {
""",
    """  const reloadIndex = useCallback(async () => {
    replaceIndex(await searchRepository.loadIndex());
  }, [replaceIndex]);

  useEffect(() => {
    if (!loaded) {
      indexedLabelCatalogRevisionRef.current = labelCatalogRevision;
      return;
    }
    if (indexedLabelCatalogRevisionRef.current === labelCatalogRevision) return;
    indexedLabelCatalogRevisionRef.current = labelCatalogRevision;
    void reloadIndex().catch(() => showToast('Search labels could not be refreshed.'));
  }, [labelCatalogRevision, loaded, reloadIndex, showToast]);

  const refreshDocument = useCallback(async (noteId: string) => {
""",
)
replace(
    'src/features/search/SearchWorkspace.tsx',
    """    setIndexRevision((current) => current + 1);
  }, []);

  useEffect(() => {
""",
    """    setIndexRevision((current) => current + 1);
  }, []);

  const refreshOrganizationDocument = useCallback(
    async (noteId: string) => {
      await refreshDocument(noteId);
      onCollectionChanged?.();
    },
    [onCollectionChanged, refreshDocument],
  );

  useEffect(() => {
""",
)
replace(
    'src/features/search/SearchWorkspace.tsx',
    """  const activeDocuments = useMemo(
    () =>
      results
        .map((result) => result.document)
        .filter((document) => document.note.archivedAt === null),
    [results],
  );
  const archivedDocuments = useMemo(
    () =>
      results
        .map((result) => result.document)
        .filter((document) => document.note.archivedAt !== null),
    [results],
  );
""",
    """  const activeDocuments = useMemo(
    () =>
      results
        .map((result) => result.document)
        .filter((document) => noteLifecycle(document.note) === 'notes'),
    [results],
  );
  const archivedDocuments = useMemo(
    () =>
      results
        .map((result) => result.document)
        .filter((document) => noteLifecycle(document.note) === 'archive'),
    [results],
  );
""",
)
replace(
    'src/features/search/SearchWorkspace.tsx',
    """  const handleArchive = useCallback(
    async (note: NoteRecord) => {
      const wasPinned = note.pinnedAt !== null;
      try {
        await notesRepository.archive(note.id, note.revision);
        await refreshDocument(note.id);
        showToast('Note archived.', async () => {
          const restored = await notesRepository.unarchive(note.id);
          if (wasPinned) await notesRepository.setPinned(note.id, true, restored.revision);
          await refreshDocument(note.id);
        });
      } catch {
        showToast('Note could not be archived.');
      }
    },
    [refreshDocument, showToast],
  );
""",
    """  const handleArchive = useCallback(
    async (note: NoteRecord) => {
      const wasPinned = note.pinnedAt !== null;
      try {
        await notesRepository.archive(note.id, note.revision);
        await refreshOrganizationDocument(note.id);
        showToast('Note archived.', async () => {
          const restored = await notesRepository.unarchive(note.id);
          if (wasPinned) await notesRepository.setPinned(note.id, true, restored.revision);
          await refreshOrganizationDocument(note.id);
        });
      } catch {
        showToast('Note could not be archived.');
      }
    },
    [refreshOrganizationDocument, showToast],
  );
""",
)
replace(
    'src/features/search/SearchWorkspace.tsx',
    """  const handleUnarchive = useCallback(
    async (note: NoteRecord) => {
      try {
        await notesRepository.unarchive(note.id, note.revision);
        await refreshDocument(note.id);
        showToast('Note moved to Notes.', async () => {
          await notesRepository.archive(note.id);
          await refreshDocument(note.id);
        });
      } catch {
        showToast('Note could not be unarchived.');
      }
    },
    [refreshDocument, showToast],
  );
""",
    """  const handleUnarchive = useCallback(
    async (note: NoteRecord) => {
      try {
        await notesRepository.unarchive(note.id, note.revision);
        await refreshOrganizationDocument(note.id);
        showToast('Note moved to Notes.', async () => {
          await notesRepository.archive(note.id);
          await refreshOrganizationDocument(note.id);
        });
      } catch {
        showToast('Note could not be unarchived.');
      }
    },
    [refreshOrganizationDocument, showToast],
  );
""",
)
replace(
    'src/features/search/SearchWorkspace.tsx',
    """  const handleTrash = useCallback(
    async (note: NoteRecord) => {
      const wasArchived = note.archivedAt !== null;
      const wasPinned = note.pinnedAt !== null;
      try {
        await notesRepository.trash(note.id, note.revision);
        await refreshDocument(note.id);
        showToast('Note moved to trash.', async () => {
          const restored = await notesRepository.restore(note.id);
          if (wasArchived) await notesRepository.archive(note.id, restored.revision);
          else if (wasPinned) await notesRepository.setPinned(note.id, true, restored.revision);
          await refreshDocument(note.id);
        });
      } catch {
        showToast('Note could not be moved to trash.');
      }
    },
    [refreshDocument, showToast],
  );
""",
    """  const handleTrash = useCallback(
    async (note: NoteRecord) => {
      const wasArchived = note.archivedAt !== null;
      const wasPinned = note.pinnedAt !== null;
      try {
        await notesRepository.trash(note.id, note.revision);
        await refreshOrganizationDocument(note.id);
        showToast('Note moved to trash.', async () => {
          const restored = await notesRepository.restore(note.id);
          if (wasArchived) await notesRepository.archive(note.id, restored.revision);
          else if (wasPinned) await notesRepository.setPinned(note.id, true, restored.revision);
          await refreshOrganizationDocument(note.id);
        });
      } catch {
        showToast('Note could not be moved to trash.');
      }
    },
    [refreshOrganizationDocument, showToast],
  );
""",
)
replace(
    'src/features/search/SearchWorkspace.tsx',
    """  const handleDuplicate = useCallback(
    async (note: NoteRecord) => {
      try {
        const duplicate = await notesRepository.duplicate(note.id);
        await refreshDocument(duplicate.id);
        showToast('Note duplicated.', async () => {
          await notesRepository.deletePermanently(duplicate.id);
          await refreshDocument(duplicate.id);
        });
      } catch {
        showToast('Note could not be duplicated.');
      }
    },
    [refreshDocument, showToast],
  );
""",
    """  const handleDuplicate = useCallback(
    async (note: NoteRecord) => {
      try {
        const duplicate = await notesRepository.duplicate(note.id);
        await refreshOrganizationDocument(duplicate.id);
        showToast('Note duplicated.', async () => {
          await notesRepository.deletePermanently(duplicate.id);
          await refreshOrganizationDocument(duplicate.id);
        });
      } catch {
        showToast('Note could not be duplicated.');
      }
    },
    [refreshOrganizationDocument, showToast],
  );
""",
)
replace(
    'src/features/search/SearchWorkspace.tsx',
    """  const handleSetLabels = useCallback(
    async (note: NoteRecord, labelIds: string[]) => {
      const previous = documentsById.get(note.id)?.labelIds ?? [];
      try {
        await labelsRepository.setForNote(note.id, labelIds);
        await refreshDocument(note.id);
        showToast('Labels updated.', async () => {
          await labelsRepository.setForNote(note.id, previous);
          await refreshDocument(note.id);
        });
      } catch {
        showToast('Note labels could not be changed.');
      }
    },
    [documentsById, refreshDocument, showToast],
  );
""",
    """  const handleSetLabels = useCallback(
    async (note: NoteRecord, labelIds: string[]) => {
      const previous = documentsById.get(note.id)?.labelIds ?? [];
      try {
        await labelsRepository.setForNote(note.id, labelIds);
        await refreshOrganizationDocument(note.id);
        showToast('Labels updated.', async () => {
          await labelsRepository.setForNote(note.id, previous);
          await refreshOrganizationDocument(note.id);
        });
      } catch {
        showToast('Note labels could not be changed.');
      }
    },
    [documentsById, refreshOrganizationDocument, showToast],
  );
""",
)

# Search engine: lifecycle semantics come from the organization model.
replace(
    'src/features/search/searchEngine.ts',
    """import type { ChecklistItemRecord, NoteRecord } from '../../db';
import type { SearchFilters, SearchStatusFilter, SearchTypeFilter } from './searchTypes';
""",
    """import type { ChecklistItemRecord, NoteRecord } from '../../db';
import {
  isSearchableNote,
  matchesOrganizationSearchStatus,
} from '../organization/collectionModel';
import type { SearchFilters, SearchStatusFilter, SearchTypeFilter } from './searchTypes';
""",
)
replace(
    'src/features/search/searchEngine.ts',
    """    if (note.trashedAt !== null) continue;
    if (!matchesStatus(note, filters.status)) continue;
    if (!parsed.statuses.every((status) => matchesStatus(note, status))) continue;
""",
    """    if (!isSearchableNote(note)) continue;
    if (!matchesOrganizationSearchStatus(note, filters.status)) continue;
    if (!parsed.statuses.every((status) => matchesOrganizationSearchStatus(note, status))) continue;
""",
)
replace(
    'src/features/search/searchEngine.ts',
    """function matchesStatus(note: NoteRecord, status: SearchStatusFilter): boolean {
  if (status === 'any') return note.trashedAt === null;
  if (status === 'active') return note.archivedAt === null && note.trashedAt === null;
  if (status === 'pinned') {
    return note.pinnedAt !== null && note.archivedAt === null && note.trashedAt === null;
  }
  return note.archivedAt !== null && note.trashedAt === null;
}

""",
    """,
)

# Search history: prune references to deleted labels across current/saved/recent state.
replace(
    'src/features/search/searchHistory.ts',
    """  async remove(id: string): Promise<SavedSearch[]> {
    const existing = await this.listSaved();
    return this.writeSaved(existing.filter((item) => item.id !== id));
  }

  private async writeSaved(searches: SavedSearch[]): Promise<SavedSearch[]> {
""",
    """  async remove(id: string): Promise<SavedSearch[]> {
    const existing = await this.listSaved();
    return this.writeSaved(existing.filter((item) => item.id !== id));
  }

  async pruneMissingLabels(validLabelIds: Iterable<string>): Promise<SavedSearch[]> {
    const existing = await this.listSaved();
    const next = pruneSearchEntries(existing, new Set(validLabelIds));
    if (JSON.stringify(next) === JSON.stringify(existing)) return existing;
    return this.writeSaved(next);
  }

  private async writeSaved(searches: SavedSearch[]): Promise<SavedSearch[]> {
""",
)
replace(
    'src/features/search/searchHistory.ts',
    """export function clearRecentSearches(): RecentSearch[] {
  try {
    window.localStorage.removeItem(RECENT_SEARCHES_KEY);
  } catch {
    // Clearing device-local history is best effort.
  }
  return [];
}

export function searchSignature(snapshot: SearchSnapshot): string {
""",
    """export function clearRecentSearches(): RecentSearch[] {
  try {
    window.localStorage.removeItem(RECENT_SEARCHES_KEY);
  } catch {
    // Clearing device-local history is best effort.
  }
  return [];
}

export function pruneRecentSearchLabels(validLabelIds: Iterable<string>): RecentSearch[] {
  const existing = readRecentSearches();
  const next = pruneSearchEntries(existing, new Set(validLabelIds));
  if (JSON.stringify(next) === JSON.stringify(existing)) return existing;

  try {
    if (next.length === 0) window.localStorage.removeItem(RECENT_SEARCHES_KEY);
    else {
      window.localStorage.setItem(
        RECENT_SEARCHES_KEY,
        JSON.stringify({ version: 1, searches: next }),
      );
    }
  } catch {
    // Recent searches are best-effort device-local history.
  }
  return next;
}

export function searchSignature(snapshot: SearchSnapshot): string {
""",
)
replace(
    'src/features/search/searchHistory.ts',
    """export function hasSearchSnapshot(snapshot: SearchSnapshot): boolean {
  return Boolean(snapshot.query.trim()) || hasSearchFilters(snapshot.filters);
}

export function summarizeSearch(snapshot: SearchSnapshot): {
""",
    """export function hasSearchSnapshot(snapshot: SearchSnapshot): boolean {
  return Boolean(snapshot.query.trim()) || hasSearchFilters(snapshot.filters);
}

export function pruneSearchFiltersToLabels(
  filters: SearchFilters,
  validLabelIds: Iterable<string>,
): SearchFilters {
  const valid = new Set(validLabelIds);
  const labelIds = filters.labelIds.filter((id) => valid.has(id));
  if (labelIds.length === filters.labelIds.length) return filters;
  return { ...filters, labelIds };
}

export function summarizeSearch(snapshot: SearchSnapshot): {
""",
)
replace(
    'src/features/search/searchHistory.ts',
    """function normalizeSnapshot(snapshot: SearchSnapshot): SearchSnapshot {
""",
    """function pruneSearchEntries<T extends SearchSnapshot & { id: string }>(
  searches: T[],
  validLabelIds: Set<string>,
): T[] {
  const seen = new Set<string>();
  const next: T[] = [];

  for (const search of searches) {
    const candidate = {
      ...search,
      filters: pruneSearchFiltersToLabels(search.filters, validLabelIds),
    } as T;
    if (!hasSearchSnapshot(candidate)) continue;
    const signature = searchSignature(candidate);
    if (seen.has(signature)) continue;
    seen.add(signature);
    next.push(candidate);
  }

  return next;
}

function normalizeSnapshot(snapshot: SearchSnapshot): SearchSnapshot {
""",
)
replace(
    'src/features/search/searchHistory.test.ts',
    """import { searchSignature, summarizeSearch } from './searchHistory';
""",
    """import {
  pruneSearchFiltersToLabels,
  searchSignature,
  summarizeSearch,
} from './searchHistory';
""",
)
replace(
    'src/features/search/searchHistory.test.ts',
    """  it('summarizes filter-only saved searches without inventing label names', () => {
""",
    """  it('removes deleted label references without changing other filters', () => {
    const filters = {
      ...DEFAULT_SEARCH_FILTERS,
      type: 'checklist' as const,
      labelIds: ['keep', 'delete', 'keep-two'],
    };
    expect(pruneSearchFiltersToLabels(filters, new Set(['keep', 'keep-two']))).toEqual({
      ...filters,
      labelIds: ['keep', 'keep-two'],
    });
    expect(pruneSearchFiltersToLabels(filters, new Set(filters.labelIds))).toBe(filters);
  });

  it('summarizes filter-only saved searches without inventing label names', () => {
""",
)

# App header: external search-history reconciliation refreshes both saved and recent lists.
replace(
    'src/components/AppHeader.tsx',
    """    const reloadSaved = () => {
      void searchHistoryRepository.listSaved().then((searches) => {
        if (!cancelled) setSavedSearches(searches);
      });
    };
    reloadSaved();
    const unsubscribeSearchHistory = subscribeAppEvent('searchHistoryChanged', reloadSaved);
""",
    """    const reloadHistory = () => {
      void searchHistoryRepository.listSaved().then((searches) => {
        if (!cancelled) {
          setSavedSearches(searches);
          setRecentSearches(readRecentSearches());
        }
      });
    };
    reloadHistory();
    const unsubscribeSearchHistory = subscribeAppEvent('searchHistoryChanged', reloadHistory);
""",
)

# Label manager: usage counts and filtering for larger catalogs.
replace(
    'src/features/notes/LabelManagerDialog.tsx',
    """import { Check, Pencil, Plus, Trash2, X } from 'lucide-react';
""",
    """import { Check, Pencil, Plus, Search, Trash2, X } from 'lucide-react';
""",
)
replace(
    'src/features/notes/LabelManagerDialog.tsx',
    """interface LabelManagerDialogProps {
  labels: LabelRecord[];
  onClose(): void;
""",
    """interface LabelManagerDialogProps {
  labels: LabelRecord[];
  counts: Record<string, number>;
  onClose(): void;
""",
)
replace(
    'src/features/notes/LabelManagerDialog.tsx',
    """export function LabelManagerDialog({
  labels,
  onClose,
""",
    """export function LabelManagerDialog({
  labels,
  counts,
  onClose,
""",
)
replace(
    'src/features/notes/LabelManagerDialog.tsx',
    """  const [newLabelName, setNewLabelName] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
""",
    """  const [newLabelName, setNewLabelName] = useState('');
  const [labelQuery, setLabelQuery] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
""",
)
replace(
    'src/features/notes/LabelManagerDialog.tsx',
    """  const dialogRef = useRef<HTMLDivElement>(null);
  const newLabelRef = useRef<HTMLInputElement>(null);

  useDialogFocusTrap(dialogRef, { onEscape: onClose, initialFocusRef: newLabelRef });
""",
    """  const dialogRef = useRef<HTMLDivElement>(null);
  const newLabelRef = useRef<HTMLInputElement>(null);
  const showLabelSearch = labels.length >= 6;
  const normalizedLabelQuery = showLabelSearch ? labelQuery.trim().toLocaleLowerCase() : '';
  const visibleLabels = normalizedLabelQuery
    ? labels.filter((label) => label.name.toLocaleLowerCase().includes(normalizedLabelQuery))
    : labels;

  useDialogFocusTrap(dialogRef, { onEscape: onClose, initialFocusRef: newLabelRef });
""",
)
replace(
    'src/features/notes/LabelManagerDialog.tsx',
    """        {errorMessage ? (
          <p className="label-manager-error" role="alert">
            {errorMessage}
          </p>
        ) : null}

        <div className="label-manager-list">
""",
    """        {errorMessage ? (
          <p className="label-manager-error" role="alert">
            {errorMessage}
          </p>
        ) : null}

        {showLabelSearch ? (
          <label className="label-manager-search">
            <Search aria-hidden="true" />
            <span className="sr-only">Find labels</span>
            <input
              type="search"
              aria-label="Find labels"
              placeholder="Find labels"
              value={labelQuery}
              onChange={(event) => setLabelQuery(event.target.value)}
            />
          </label>
        ) : null}

        <div className="label-manager-list">
          {labels.length > 0 && visibleLabels.length === 0 ? (
            <p className="label-manager-empty">No matching labels.</p>
          ) : null}
""",
)
replace(
    'src/features/notes/LabelManagerDialog.tsx',
    """            labels.map((label) => {
""",
    """            visibleLabels.map((label) => {
""",
)
replace(
    'src/features/notes/LabelManagerDialog.tsx',
    """                      <span className="label-manager-name">{label.name}</span>
                      <div className="label-manager-actions">
""",
    """                      <span className="label-manager-name">{label.name}</span>
                      <span className="label-manager-meta">
                        {counts[label.id] ?? 0} {(counts[label.id] ?? 0) === 1 ? 'note' : 'notes'}
                      </span>
                      <div className="label-manager-actions">
""",
)

# Permanent deletion dialog distinguishes whole-Trash destructive action from selection deletion.
replace(
    'src/features/notes/ConfirmDeleteDialog.tsx',
    """interface ConfirmDeleteDialogProps {
  title?: string;
  count?: number;
  onCancel(): void;
""",
    """interface ConfirmDeleteDialogProps {
  title?: string;
  count?: number;
  context?: 'selection' | 'trash';
  onCancel(): void;
""",
)
replace(
    'src/features/notes/ConfirmDeleteDialog.tsx',
    """export function ConfirmDeleteDialog({
  title = '',
  count,
  onCancel,
""",
    """export function ConfirmDeleteDialog({
  title = '',
  count,
  context = 'selection',
  onCancel,
""",
)
replace(
    'src/features/notes/ConfirmDeleteDialog.tsx',
    """  const isBulk = count !== undefined && count > 1;
  const description = isBulk
    ? `${count} selected notes will be permanently deleted.`
    : title
      ? `“${title}” will be permanently deleted.`
      : 'This note will be permanently deleted.';
""",
    """  const emptyingTrash = context === 'trash' && count !== undefined;
  const isBulk = count !== undefined && count > 1;
  const description = emptyingTrash
    ? `${count} ${count === 1 ? 'note' : 'notes'} in Trash will be permanently deleted.`
    : isBulk
      ? `${count} selected notes will be permanently deleted.`
      : title
        ? `“${title}” will be permanently deleted.`
        : 'This note will be permanently deleted.';
""",
)
replace(
    'src/features/notes/ConfirmDeleteDialog.tsx',
    """        <h2 id="confirm-delete-title">
          {isBulk ? `Delete ${count} notes permanently?` : 'Delete note permanently?'}
        </h2>
""",
    """        <h2 id="confirm-delete-title">
          {emptyingTrash
            ? 'Empty trash?'
            : isBulk
              ? `Delete ${count} notes permanently?`
              : 'Delete note permanently?'}
        </h2>
""",
)

# Notes workspace: first-class whole-Trash restore/delete while retaining existing selection behavior.
replace(
    'src/features/notes/NotesWorkspace.tsx',
    """  const [deleteCandidate, setDeleteCandidate] = useState<NoteRecord | null>(null);
  const [bulkDeleteIds, setBulkDeleteIds] = useState<string[] | null>(null);
""",
    """  const [deleteCandidate, setDeleteCandidate] = useState<NoteRecord | null>(null);
  const [bulkDeleteIds, setBulkDeleteIds] = useState<string[] | null>(null);
  const [bulkDeleteSource, setBulkDeleteSource] = useState<'selection' | 'trash'>('selection');
""",
)
replace(
    'src/features/notes/NotesWorkspace.tsx',
    """  const handleConfirmBulkDelete = useCallback(async () => {
    const noteIds = bulkDeleteIds;
    if (!noteIds || noteIds.length === 0) return;
    setBulkDeleteIds(null);
    try {
      const deleted = await bulkActionsRepository.deletePermanently(noteIds);
      clearSelection();
      await refreshCollection();
      showToast(`${deleted} ${deleted === 1 ? 'note' : 'notes'} deleted permanently.`);
    } catch {
      showToast('Selected notes could not be deleted.');
    }
  }, [bulkDeleteIds, clearSelection, refreshCollection, showToast]);
""",
    """  const handleConfirmBulkDelete = useCallback(async () => {
    const noteIds = bulkDeleteIds;
    const source = bulkDeleteSource;
    if (!noteIds || noteIds.length === 0) return;
    setBulkDeleteIds(null);
    setBulkDeleteSource('selection');
    try {
      const deleted = await bulkActionsRepository.deletePermanently(noteIds);
      clearSelection();
      await refreshCollection();
      showToast(
        source === 'trash'
          ? 'Trash emptied.'
          : `${deleted} ${deleted === 1 ? 'note' : 'notes'} deleted permanently.`,
      );
    } catch {
      showToast(source === 'trash' ? 'Trash could not be emptied.' : 'Selected notes could not be deleted.');
    }
  }, [bulkDeleteIds, bulkDeleteSource, clearSelection, refreshCollection, showToast]);
""",
)
replace(
    'src/features/notes/NotesWorkspace.tsx',
    """  const selectedNotes = useMemo(
    () => visibleNotes.filter((note) => selectedNoteIds.has(note.id)),
    [selectedNoteIds, visibleNotes],
  );

  const clearSelection = useCallback(() => {
""",
    """  const selectedNotes = useMemo(
    () => visibleNotes.filter((note) => selectedNoteIds.has(note.id)),
    [selectedNoteIds, visibleNotes],
  );

  const handleRestoreAll = useCallback(async () => {
    if (mode !== 'trash' || visibleNotes.length === 0) return;
    const targets = toBulkTargets(visibleNotes);
    const previous = toLifecycleStates(visibleNotes);
    const count = visibleNotes.length;
    try {
      await bulkActionsRepository.restore(targets);
      await refreshCollection();
      showToast(`Restored ${count} ${count === 1 ? 'note' : 'notes'} to Notes.`, async () => {
        await bulkActionsRepository.restoreLifecycle(previous);
        await refreshCollection();
      });
    } catch {
      showToast('Trash notes could not be restored.');
    }
  }, [mode, refreshCollection, showToast, visibleNotes]);

  const clearSelection = useCallback(() => {
""",
)
replace(
    'src/features/notes/NotesWorkspace.tsx',
    """                onDeletePermanently={() => setBulkDeleteIds(selectedNotes.map((note) => note.id))}
""",
    """                onDeletePermanently={() => {
                  setBulkDeleteSource('selection');
                  setBulkDeleteIds(selectedNotes.map((note) => note.id));
                }}
""",
)
replace(
    'src/features/notes/NotesWorkspace.tsx',
    """              <div className="notes-toolbar-controls">
                <label className="notes-sort">
""",
    """              <div className="notes-toolbar-controls">
                {mode === 'trash' ? (
                  <div className="notes-collection-actions" aria-label="Trash actions">
                    <button type="button" onClick={() => void handleRestoreAll()}>
                      Restore all
                    </button>
                    <button
                      className="notes-collection-action-danger"
                      type="button"
                      onClick={() => {
                        setBulkDeleteSource('trash');
                        setBulkDeleteIds(visibleNotes.map((note) => note.id));
                      }}
                    >
                      Empty trash
                    </button>
                  </div>
                ) : null}
                <label className="notes-sort">
""",
)
replace(
    'src/features/notes/NotesWorkspace.tsx',
    """          <ConfirmDeleteDialog
            count={bulkDeleteIds.length}
            onCancel={() => setBulkDeleteIds(null)}
            onConfirm={() => void handleConfirmBulkDelete()}
          />
""",
    """          <ConfirmDeleteDialog
            count={bulkDeleteIds.length}
            context={bulkDeleteSource}
            onCancel={() => {
              setBulkDeleteIds(null);
              setBulkDeleteSource('selection');
            }}
            onConfirm={() => void handleConfirmBulkDelete()}
          />
""",
)

# P3 visual additions stay in the existing feature-owned stylesheets.
append_once(
    'src/styles/organization.css',
    '.label-manager-search {',
    """
.label-manager-search {
  display: flex;
  min-height: 40px;
  align-items: center;
  gap: var(--space-2);
  padding: 0 12px;
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  background: var(--surface-subtle);
  color: var(--text-muted);
}

.label-manager-search svg {
  width: 16px;
  height: 16px;
  flex: 0 0 auto;
}

.label-manager-search input {
  min-width: 0;
  width: 100%;
  border: 0;
  outline: 0;
  background: transparent;
  color: var(--text);
  font: inherit;
}

.label-manager-search:focus-within {
  border-color: var(--focus);
  outline: 2px solid color-mix(in srgb, var(--focus) 20%, transparent);
}

.label-manager-meta {
  flex: 0 0 auto;
  color: var(--text-subtle);
  font: 11px var(--font-mono);
  white-space: nowrap;
}
""",
)
append_once(
    'src/styles/notes.css',
    '.notes-collection-actions {',
    """
.notes-collection-actions {
  display: inline-flex;
  align-items: center;
  gap: 6px;
}

.notes-collection-actions button {
  min-height: 40px;
  padding: 0 12px;
  border: 1px solid var(--border);
  border-radius: 3px;
  background: var(--surface);
  color: var(--text-muted);
  font: inherit;
  font-size: 12px;
  cursor: pointer;
}

.notes-collection-actions button:hover,
.notes-collection-actions button:focus-visible {
  border-color: var(--border-strong);
  background: var(--surface-hover);
  color: var(--text);
}

.notes-collection-actions .notes-collection-action-danger {
  color: var(--danger-strong);
}

@media (max-width: 767px) {
  .notes-toolbar-controls {
    width: 100%;
    flex-wrap: wrap;
  }

  .notes-collection-actions {
    order: 3;
    width: 100%;
  }

  .notes-collection-actions button {
    min-height: 44px;
    flex: 1;
  }
}
""",
)
append_once(
    'docs/ARCHITECTURE.md',
    '## P3 organization model',
    """
## P3 organization model

Search, labels, Archive, and Trash share the lifecycle/collection contract in `src/features/organization/collectionModel.ts`. `AppShell` resolves Notes, a label projection, Archive, or Trash into that contract before rendering the notes workspace; Search reuses the same lifecycle classification and remains a derived Notes + Archive index that excludes Trash.

Label catalog refresh is also a cross-surface reconciliation point: stale label IDs are removed from current, saved, and recent searches, and an open Search workspace rebuilds label metadata after rename/delete. Search lifecycle and label mutations notify the shell's derived navigation counts just like mutations from the normal notes workspace.

P3 introduces no durable table, no database migration, no folder hierarchy, and no secondary search store. Whole-Trash Restore all and Empty trash use the existing bulk repository transactions; permanent deletion remains confirmation-gated.
""",
)

print('P3 patch applied successfully.')
