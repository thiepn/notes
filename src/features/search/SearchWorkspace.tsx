import { useCallback, useEffect, useMemo, useState } from 'react';
import { LayoutGrid, Rows3, SearchX } from 'lucide-react';

import { IconButton } from '../../components/ui/IconButton';
import {
  ChecklistsRepository,
  LabelsRepository,
  NotesRepository,
  notesDatabase,
  type ChecklistItemRecord,
  type LabelRecord,
  type NoteColor,
  type NoteRecord,
} from '../../db';
import { ChecklistEditorDialog } from '../notes/ChecklistEditorDialog';
import { LifecycleToast, type LifecycleToastState } from '../notes/LifecycleToast';
import { MasonryGrid } from '../notes/MasonryGrid';
import { type NoteCardActions, type NoteCollectionMode } from '../notes/NoteCard';
import { NoteEditorDialog } from '../notes/NoteEditorDialog';
import { readNotesViewMode, writeNotesViewMode, type NotesViewMode } from '../notes/viewMode';
import { parseSearchQuery, searchDocuments, type SearchDocument } from './searchEngine';
import { SearchFiltersPanel } from './SearchFiltersPanel';
import { SearchRepository } from './searchRepository';
import type { SearchFilters } from './searchTypes';

const searchRepository = new SearchRepository(notesDatabase);
const notesRepository = new NotesRepository(notesDatabase);
const labelsRepository = new LabelsRepository(notesDatabase);
const checklistsRepository = new ChecklistsRepository(notesDatabase);

interface SearchWorkspaceProps {
  query: string;
  filters: SearchFilters;
  filtersOpen: boolean;
  labels: LabelRecord[];
  onFiltersChange(filters: SearchFilters): void;
}

interface EditingState {
  note: NoteRecord;
  items: ChecklistItemRecord[];
}

export function SearchWorkspace({
  query,
  filters,
  filtersOpen,
  labels,
  onFiltersChange,
}: SearchWorkspaceProps) {
  const [documents, setDocuments] = useState<SearchDocument[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [viewMode, setViewMode] = useState<NotesViewMode>(() => readNotesViewMode());
  const [editing, setEditing] = useState<EditingState | null>(null);
  const [toast, setToast] = useState<LifecycleToastState | null>(null);

  const showToast = useCallback((message: string, undo?: () => Promise<void>) => {
    const id = crypto.randomUUID();
    setToast(undo ? { id, message, undo } : { id, message });
  }, []);

  const reloadIndex = useCallback(async () => {
    const index = await searchRepository.loadIndex();
    setDocuments(index);
    setLoaded(true);
  }, []);

  useEffect(() => {
    let cancelled = false;
    void searchRepository
      .loadIndex()
      .then((index) => {
        if (cancelled) return;
        setDocuments(index);
        setLoaded(true);
      })
      .catch(() => {
        if (cancelled) return;
        setDocuments([]);
        setLoaded(true);
        showToast('Search index could not be loaded.');
      });
    return () => {
      cancelled = true;
    };
  }, [showToast]);

  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => {
      setToast((current) => (current?.id === toast.id ? null : current));
    }, 7000);
    return () => window.clearTimeout(timer);
  }, [toast]);

  const parsedQuery = useMemo(() => parseSearchQuery(query), [query]);
  const results = useMemo(
    () => searchDocuments(documents, query, filters),
    [documents, filters, query],
  );
  const activeDocuments = useMemo(
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
  const documentsById = useMemo(
    () => new Map(documents.map((document) => [document.note.id, document])),
    [documents],
  );

  const handleViewMode = useCallback((nextMode: NotesViewMode) => {
    setViewMode(nextMode);
    writeNotesViewMode(nextMode);
  }, []);

  const handleTogglePin = useCallback(
    async (note: NoteRecord) => {
      const previous = note.pinnedAt !== null;
      try {
        await notesRepository.setPinned(note.id, !previous, note.revision);
        await reloadIndex();
        showToast(previous ? 'Note unpinned.' : 'Note pinned.', async () => {
          await notesRepository.setPinned(note.id, previous);
          await reloadIndex();
        });
      } catch {
        showToast('Pin state could not be changed.');
      }
    },
    [reloadIndex, showToast],
  );

  const handleArchive = useCallback(
    async (note: NoteRecord) => {
      const wasPinned = note.pinnedAt !== null;
      try {
        await notesRepository.archive(note.id, note.revision);
        await reloadIndex();
        showToast('Note archived.', async () => {
          const restored = await notesRepository.unarchive(note.id);
          if (wasPinned) await notesRepository.setPinned(note.id, true, restored.revision);
          await reloadIndex();
        });
      } catch {
        showToast('Note could not be archived.');
      }
    },
    [reloadIndex, showToast],
  );

  const handleUnarchive = useCallback(
    async (note: NoteRecord) => {
      try {
        await notesRepository.unarchive(note.id, note.revision);
        await reloadIndex();
        showToast('Note moved to Notes.', async () => {
          await notesRepository.archive(note.id);
          await reloadIndex();
        });
      } catch {
        showToast('Note could not be unarchived.');
      }
    },
    [reloadIndex, showToast],
  );

  const handleTrash = useCallback(
    async (note: NoteRecord) => {
      const wasArchived = note.archivedAt !== null;
      const wasPinned = note.pinnedAt !== null;
      try {
        await notesRepository.trash(note.id, note.revision);
        await reloadIndex();
        showToast('Note moved to trash.', async () => {
          const restored = await notesRepository.restore(note.id);
          if (wasArchived) await notesRepository.archive(note.id, restored.revision);
          else if (wasPinned) await notesRepository.setPinned(note.id, true, restored.revision);
          await reloadIndex();
        });
      } catch {
        showToast('Note could not be moved to trash.');
      }
    },
    [reloadIndex, showToast],
  );

  const handleDuplicate = useCallback(
    async (note: NoteRecord) => {
      try {
        const duplicate = await notesRepository.duplicate(note.id);
        await reloadIndex();
        showToast('Note duplicated.', async () => {
          await notesRepository.deletePermanently(duplicate.id);
          await reloadIndex();
        });
      } catch {
        showToast('Note could not be duplicated.');
      }
    },
    [reloadIndex, showToast],
  );

  const handleSetColor = useCallback(
    async (note: NoteRecord, color: NoteColor) => {
      if (note.color === color) return;
      const previous = note.color;
      try {
        await notesRepository.update(note.id, { color }, note.revision);
        await reloadIndex();
        showToast('Color changed.', async () => {
          await notesRepository.update(note.id, { color: previous });
          await reloadIndex();
        });
      } catch {
        showToast('Note color could not be changed.');
      }
    },
    [reloadIndex, showToast],
  );

  const handleSetLabels = useCallback(
    async (note: NoteRecord, labelIds: string[]) => {
      const previous = documentsById.get(note.id)?.labelIds ?? [];
      try {
        await labelsRepository.setForNote(note.id, labelIds);
        await reloadIndex();
        showToast('Labels updated.', async () => {
          await labelsRepository.setForNote(note.id, previous);
          await reloadIndex();
        });
      } catch {
        showToast('Note labels could not be changed.');
      }
    },
    [documentsById, reloadIndex, showToast],
  );

  const actions = useMemo<NoteCardActions>(
    () => ({
      open: (note) => {
        const document = documentsById.get(note.id);
        if (document) setEditing({ note: document.note, items: document.checklistItems });
      },
      togglePin: (note) => void handleTogglePin(note),
      archive: (note) => void handleArchive(note),
      unarchive: (note) => void handleUnarchive(note),
      trash: (note) => void handleTrash(note),
      restore: () => undefined,
      duplicate: (note) => void handleDuplicate(note),
      deletePermanently: () => undefined,
      setColor: (note, color) => void handleSetColor(note, color),
      setLabels: (note, labelIds) => void handleSetLabels(note, labelIds),
    }),
    [
      documentsById,
      handleArchive,
      handleDuplicate,
      handleSetColor,
      handleSetLabels,
      handleTogglePin,
      handleTrash,
      handleUnarchive,
    ],
  );

  const handleSaved = useCallback(
    (note: NoteRecord) => {
      setEditing((current) => (current ? { ...current, note } : current));
      void reloadIndex();
    },
    [reloadIndex],
  );

  const handleChecklistSaved = useCallback(
    (note: NoteRecord, items: ChecklistItemRecord[]) => {
      setEditing({ note, items });
      void reloadIndex();
    },
    [reloadIndex],
  );

  const handleUndo = useCallback(() => {
    const undo = toast?.undo;
    if (!undo) return;
    setToast(null);
    void undo().catch(() => showToast('Undo could not be completed.'));
  }, [showToast, toast]);

  return (
    <>
      {filtersOpen ? (
        <SearchFiltersPanel filters={filters} labels={labels} onChange={onFiltersChange} />
      ) : null}

      <div className="search-results-toolbar">
        <div>
          <strong>{loaded ? results.length : '…'}</strong>{' '}
          <span>{results.length === 1 ? 'result' : 'results'}</span>
        </div>
        <div className="notes-view-toggle" role="group" aria-label="Search result view">
          <IconButton
            className="notes-view-button"
            label="Grid view"
            aria-pressed={viewMode === 'grid'}
            data-active={viewMode === 'grid'}
            onClick={() => handleViewMode('grid')}
          >
            <LayoutGrid />
          </IconButton>
          <IconButton
            className="notes-view-button"
            label="List view"
            aria-pressed={viewMode === 'list'}
            data-active={viewMode === 'list'}
            onClick={() => handleViewMode('list')}
          >
            <Rows3 />
          </IconButton>
        </div>
      </div>

      {parsedQuery.errors.length > 0 ? (
        <div className="search-query-errors" role="status">
          {parsedQuery.errors.map((error) => (
            <span key={error}>{error}</span>
          ))}
        </div>
      ) : null}

      {loaded && results.length === 0 ? (
        <section className="empty-state" aria-labelledby="search-empty-title">
          <span className="empty-state-icon" aria-hidden="true">
            <SearchX />
          </span>
          <h2 id="search-empty-title">No matching notes</h2>
          <p>Try fewer words, remove a filter, or use a broader date range.</p>
        </section>
      ) : null}

      {activeDocuments.length > 0 ? (
        <SearchSection
          title={archivedDocuments.length > 0 ? 'Active' : null}
          documents={activeDocuments}
          mode="notes"
          viewMode={viewMode}
          labels={labels}
          actions={actions}
        />
      ) : null}
      {archivedDocuments.length > 0 ? (
        <SearchSection
          title={activeDocuments.length > 0 ? 'Archived' : null}
          documents={archivedDocuments}
          mode="archive"
          viewMode={viewMode}
          labels={labels}
          actions={actions}
        />
      ) : null}

      {editing ? (
        editing.note.type === 'checklist' ? (
          <ChecklistEditorDialog
            key={editing.note.id}
            note={editing.note}
            items={editing.items}
            repository={checklistsRepository}
            onSaved={handleChecklistSaved}
            onConverted={(note) => {
              setEditing({ note, items: [] });
              void reloadIndex();
            }}
            onClose={() => setEditing(null)}
          />
        ) : (
          <NoteEditorDialog
            key={editing.note.id}
            note={editing.note}
            repository={notesRepository}
            onSaved={handleSaved}
            onHistoryChecklistSaved={handleChecklistSaved}
            onConvertToChecklist={async () => {
              try {
                const converted = await checklistsRepository.convertTextToChecklist(
                  editing.note.id,
                );
                setEditing({ note: converted.note, items: converted.items });
                await reloadIndex();
              } catch {
                showToast('Note could not be converted to a checklist.');
              }
            }}
            onClose={() => setEditing(null)}
          />
        )
      ) : null}

      {toast ? <LifecycleToast toast={toast} onUndo={handleUndo} /> : null}
    </>
  );
}

function SearchSection({
  title,
  documents,
  mode,
  viewMode,
  labels,
  actions,
}: {
  title: string | null;
  documents: SearchDocument[];
  mode: NoteCollectionMode;
  viewMode: NotesViewMode;
  labels: LabelRecord[];
  actions: NoteCardActions;
}) {
  const notes = documents.map((document) => document.note);
  const labelIdsByNote = Object.fromEntries(
    documents.map((document) => [document.note.id, document.labelIds]),
  );
  const checklistItemsByNote = Object.fromEntries(
    documents.map((document) => [document.note.id, document.checklistItems]),
  );

  return (
    <section className="note-section search-result-section" aria-label={title ?? 'Search results'}>
      {title ? <h2 className="note-section-title">{title}</h2> : null}
      <MasonryGrid
        notes={notes}
        viewMode={viewMode}
        ariaLabel={title ? `${title} search results` : 'Search results'}
        mode={mode}
        actions={actions}
        labels={labels}
        labelIdsByNote={labelIdsByNote}
        checklistItemsByNote={checklistItemsByNote}
      />
    </section>
  );
}
