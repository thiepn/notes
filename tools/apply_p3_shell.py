from pathlib import Path


def replace(path: str, old: str, new: str, expected: int = 1) -> None:
    file = Path(path)
    text = file.read_text()
    count = text.count(old)
    if count != expected:
        raise RuntimeError(f'{path}: expected {expected}, found {count}: {old[:80]!r}')
    file.write_text(text.replace(old, new, expected))


replace('src/app/AppShell.tsx', "import { subscribeAppEvent } from './events';", "import { dispatchAppEvent, subscribeAppEvent } from './events';")

replace(
    'src/app/AppShell.tsx',
    '''import {
  EMPTY_NAVIGATION_STATS,
  loadNavigationStats,
  type NavigationStats,
} from '../features/organization/navigationStats';
''',
    '''import {
  EMPTY_NAVIGATION_STATS,
  loadNavigationStats,
  type NavigationStats,
} from '../features/organization/navigationStats';
import {
  organizationCollectionLabelId,
  organizationCollectionMode,
  resolveOrganizationCollection,
} from '../features/organization/collectionModel';
''',
)

replace(
    'src/app/AppShell.tsx',
    '''import {
  DEFAULT_SEARCH_FILTERS,
  hasSearchFilters,
  type SearchFilters,
} from '../features/search/searchTypes';
''',
    '''import {
  pruneRecentSearchLabels,
  pruneSearchFiltersToLabels,
  SearchHistoryRepository,
} from '../features/search/searchHistory';
import {
  DEFAULT_SEARCH_FILTERS,
  hasSearchFilters,
  type SearchFilters,
} from '../features/search/searchTypes';
''',
)

replace(
    'src/app/AppShell.tsx',
    'const labelsRepository = new LabelsRepository(notesDatabase);\n',
    'const labelsRepository = new LabelsRepository(notesDatabase);\nconst searchHistoryRepository = new SearchHistoryRepository(notesDatabase);\n',
)

replace(
    'src/app/AppShell.tsx',
    '''  const refreshLabels = useCallback(async () => {
    setLabels(await labelsRepository.list());
  }, []);
''',
    '''  const refreshLabels = useCallback(async () => {
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
''',
)

replace(
    'src/app/AppShell.tsx',
    '''  useEffect(() => {
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
''',
    '''  useEffect(() => {
    void refreshLabels().catch(() => undefined);
  }, [refreshLabels]);
''',
)

replace(
    'src/app/AppShell.tsx',
    '''  const handleDeleteLabel = async (labelId: string) => {
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
''',
    '''  const handleDeleteLabel = async (labelId: string) => {
    await labelsRepository.delete(labelId);
    if (activeLabelId === labelId) {
      setActiveLabelId(null);
      setActiveSection('notes');
      persistActiveLabelId(null);
      persistActiveSection('notes');
    }
    await Promise.all([refreshLabels(), refreshNavigationStats()]);
  };
''',
)

replace(
    'src/app/AppShell.tsx',
    '''  const prepareNotesCapture = useCallback(
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
''',
    '''  const prepareNotesCapture = useCallback(
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
''',
)

replace(
    'src/app/AppShell.tsx',
    '''  const activeLabel = activeLabelId
    ? (labels.find((label) => label.id === activeLabelId) ?? null)
    : null;
  const normalSection = activeLabel
''',
    '''  const activeLabel = activeLabelId
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
''',
)

replace(
    'src/app/AppShell.tsx',
    '''  const lifecycleSection =
    activeLabel !== null ||
    activeSection === 'notes' ||
    activeSection === 'archive' ||
    activeSection === 'trash';
''',
    '''  const lifecycleSection = organizationCollection !== null;
''',
)

replace(
    'src/app/AppShell.tsx',
    '''                  onCloseFilters={() => setSearchFiltersOpen(false)}
                  onClearSearch={clearSearch}
                />
''',
    '''                  onCloseFilters={() => setSearchFiltersOpen(false)}
                  onClearSearch={clearSearch}
                  onCollectionChanged={handleCollectionChanged}
                />
''',
)

replace(
    'src/app/AppShell.tsx',
    '''                  mode={activeLabel ? 'notes' : activeSection}
                  labels={labels}
                  filterLabelId={activeLabel?.id ?? null}
''',
    '''                  mode={organizationMode}
                  labels={labels}
                  filterLabelId={organizationLabelId}
''',
)

replace(
    'src/app/AppShell.tsx',
    '''          <LabelManagerDialog
            labels={labels}
            onClose={() => setLabelManagerOpen(false)}
''',
    '''          <LabelManagerDialog
            labels={labels}
            counts={navigationStats.labels}
            onClose={() => setLabelManagerOpen(false)}
''',
)

# Search history label-reference repair.
replace(
    'src/features/search/searchHistory.ts',
    '''  async remove(id: string): Promise<SavedSearch[]> {
    const existing = await this.listSaved();
    return this.writeSaved(existing.filter((item) => item.id !== id));
  }

  private async writeSaved(searches: SavedSearch[]): Promise<SavedSearch[]> {
''',
    '''  async remove(id: string): Promise<SavedSearch[]> {
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
''',
)

replace(
    'src/features/search/searchHistory.ts',
    '''export function clearRecentSearches(): RecentSearch[] {
  try {
    window.localStorage.removeItem(RECENT_SEARCHES_KEY);
  } catch {
    // Clearing device-local history is best effort.
  }
  return [];
}

export function searchSignature(snapshot: SearchSnapshot): string {
''',
    '''export function clearRecentSearches(): RecentSearch[] {
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
    else window.localStorage.setItem(RECENT_SEARCHES_KEY, JSON.stringify({ version: 1, searches: next }));
  } catch {
    // Recent searches are best-effort device-local history.
  }
  return next;
}

export function searchSignature(snapshot: SearchSnapshot): string {
''',
)

replace(
    'src/features/search/searchHistory.ts',
    '''export function hasSearchSnapshot(snapshot: SearchSnapshot): boolean {
  return Boolean(snapshot.query.trim()) || hasSearchFilters(snapshot.filters);
}

export function summarizeSearch(snapshot: SearchSnapshot): {
''',
    '''export function hasSearchSnapshot(snapshot: SearchSnapshot): boolean {
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
''',
)

replace(
    'src/features/search/searchHistory.ts',
    '''function normalizeSnapshot(snapshot: SearchSnapshot): SearchSnapshot {
''',
    '''function pruneSearchEntries<T extends SearchSnapshot & { id: string }>(
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
''',
)

replace(
    'src/features/search/searchHistory.test.ts',
    "import { searchSignature, summarizeSearch } from './searchHistory';\n",
    '''import {
  pruneSearchFiltersToLabels,
  searchSignature,
  summarizeSearch,
} from './searchHistory';
''',
)

replace(
    'src/features/search/searchHistory.test.ts',
    '''  it('summarizes filter-only saved searches without inventing label names', () => {
''',
    '''  it('removes deleted label references without changing other filters', () => {
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
''',
)

replace(
    'src/components/AppHeader.tsx',
    '''    const reloadSaved = () => {
      void searchHistoryRepository.listSaved().then((searches) => {
        if (!cancelled) setSavedSearches(searches);
      });
    };
    reloadSaved();
    const unsubscribeSearchHistory = subscribeAppEvent('searchHistoryChanged', reloadSaved);
''',
    '''    const reloadHistory = () => {
      void searchHistoryRepository.listSaved().then((searches) => {
        if (!cancelled) {
          setSavedSearches(searches);
          setRecentSearches(readRecentSearches());
        }
      });
    };
    reloadHistory();
    const unsubscribeSearchHistory = subscribeAppEvent('searchHistoryChanged', reloadHistory);
''',
)

print('P3 shell/search-history patch applied.')
