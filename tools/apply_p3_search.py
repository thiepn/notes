from pathlib import Path


def replace(path: str, old: str, new: str, expected: int = 1) -> None:
    file = Path(path)
    text = file.read_text()
    count = text.count(old)
    if count != expected:
        raise RuntimeError(f'{path}: expected {expected}, found {count}: {old[:80]!r}')
    file.write_text(text.replace(old, new, expected))


replace(
    'src/features/search/SearchWorkspace.tsx',
    "import { LifecycleToast, type LifecycleToastState } from '../notes/LifecycleToast';\n",
    "import { noteLifecycle } from '../organization/collectionModel';\nimport { LifecycleToast, type LifecycleToastState } from '../notes/LifecycleToast';\n",
)

replace(
    'src/features/search/SearchWorkspace.tsx',
    '''  onCloseFilters(): void;
  onClearSearch(): void;
}
''',
    '''  onCloseFilters(): void;
  onClearSearch(): void;
  onCollectionChanged?: () => void;
}
''',
)

replace(
    'src/features/search/SearchWorkspace.tsx',
    '''  onFiltersChange,
  onCloseFilters,
  onClearSearch,
}: SearchWorkspaceProps) {
''',
    '''  onFiltersChange,
  onCloseFilters,
  onClearSearch,
  onCollectionChanged,
}: SearchWorkspaceProps) {
''',
)

replace(
    'src/features/search/SearchWorkspace.tsx',
    '''  const searchOriginNoteIdRef = useRef<string | null>(null);
  const searchClientRef = useRef<SearchWorkerClient | null>(null);
  const searchRequestIdRef = useRef(0);
''',
    '''  const searchOriginNoteIdRef = useRef<string | null>(null);
  const searchClientRef = useRef<SearchWorkerClient | null>(null);
  const searchRequestIdRef = useRef(0);
  const labelCatalogRevision = useMemo(
    () => labels.map((label) => `${label.id}:${label.updatedAt}`).join('|'),
    [labels],
  );
  const indexedLabelCatalogRevisionRef = useRef(labelCatalogRevision);
''',
)

replace(
    'src/features/search/SearchWorkspace.tsx',
    '''  const reloadIndex = useCallback(async () => {
    replaceIndex(await searchRepository.loadIndex());
  }, [replaceIndex]);

  const refreshDocument = useCallback(async (noteId: string) => {
''',
    '''  const reloadIndex = useCallback(async () => {
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
''',
)

replace(
    'src/features/search/SearchWorkspace.tsx',
    '''    setIndexRevision((current) => current + 1);
  }, []);

  useEffect(() => {
''',
    '''    setIndexRevision((current) => current + 1);
  }, []);

  const refreshOrganizationDocument = useCallback(
    async (noteId: string) => {
      await refreshDocument(noteId);
      onCollectionChanged?.();
    },
    [onCollectionChanged, refreshDocument],
  );

  useEffect(() => {
''',
)

replace(
    'src/features/search/SearchWorkspace.tsx',
    '''  const activeDocuments = useMemo(
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
''',
    '''  const activeDocuments = useMemo(
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
''',
)

replace(
    'src/features/search/SearchWorkspace.tsx',
    '''  const handleArchive = useCallback(
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
''',
    '''  const handleArchive = useCallback(
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
''',
)

replace(
    'src/features/search/SearchWorkspace.tsx',
    '''  const handleUnarchive = useCallback(
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
''',
    '''  const handleUnarchive = useCallback(
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
''',
)

replace(
    'src/features/search/SearchWorkspace.tsx',
    '''  const handleTrash = useCallback(
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
''',
    '''  const handleTrash = useCallback(
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
''',
)

replace(
    'src/features/search/SearchWorkspace.tsx',
    '''  const handleDuplicate = useCallback(
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
''',
    '''  const handleDuplicate = useCallback(
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
''',
)

replace(
    'src/features/search/SearchWorkspace.tsx',
    '''  const handleSetLabels = useCallback(
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
''',
    '''  const handleSetLabels = useCallback(
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
''',
)

replace(
    'src/features/search/searchEngine.ts',
    '''import type { ChecklistItemRecord, NoteRecord } from '../../db';
import type { SearchFilters, SearchStatusFilter, SearchTypeFilter } from './searchTypes';
''',
    '''import type { ChecklistItemRecord, NoteRecord } from '../../db';
import {
  isSearchableNote,
  matchesOrganizationSearchStatus,
} from '../organization/collectionModel';
import type { SearchFilters, SearchStatusFilter, SearchTypeFilter } from './searchTypes';
''',
)

replace(
    'src/features/search/searchEngine.ts',
    '''    if (note.trashedAt !== null) continue;
    if (!matchesStatus(note, filters.status)) continue;
    if (!parsed.statuses.every((status) => matchesStatus(note, status))) continue;
''',
    '''    if (!isSearchableNote(note)) continue;
    if (!matchesOrganizationSearchStatus(note, filters.status)) continue;
    if (!parsed.statuses.every((status) => matchesOrganizationSearchStatus(note, status))) continue;
''',
)

replace(
    'src/features/search/searchEngine.ts',
    '''function matchesStatus(note: NoteRecord, status: SearchStatusFilter): boolean {
  if (status === 'any') return note.trashedAt === null;
  if (status === 'active') return note.archivedAt === null && note.trashedAt === null;
  if (status === 'pinned') {
    return note.pinnedAt !== null && note.archivedAt === null && note.trashedAt === null;
  }
  return note.archivedAt !== null && note.trashedAt === null;
}

''',
    '',
)

print('P3 search workspace patch applied.')
