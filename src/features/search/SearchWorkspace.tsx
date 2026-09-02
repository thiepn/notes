import { Suspense, lazy, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { LayoutGrid, Rows3, SearchX, X } from 'lucide-react';

import { IconButton } from '../../components/ui/IconButton';
import {
  AttachmentsRepository,
  ChecklistsRepository,
  LabelsRepository,
  NotesRepository,
  notesDatabase,
  type ChecklistItemRecord,
  type LabelRecord,
  type NoteColor,
  type NoteRecord,
} from '../../db';
import { LifecycleToast, type LifecycleToastState } from '../notes/LifecycleToast';
import { MasonryGrid } from '../notes/MasonryGrid';
import { type NoteCardActions, type NoteCollectionMode } from '../notes/NoteCard';
import { readNotesViewMode, writeNotesViewMode, type NotesViewMode } from '../notes/viewMode';
import { richTextToPlainText } from '../richText/richText';
import {
  parseSearchQuery,
  primarySearchMatchField,
  searchDocuments,
  type SearchDocument,
} from './searchEngine';
import { SearchFiltersPanel } from './SearchFiltersPanel';
import { SearchRepository } from './searchRepository';
import { DEFAULT_SEARCH_FILTERS, type SearchFilters } from './searchTypes';

const searchRepository = new SearchRepository(notesDatabase);
const notesRepository = new NotesRepository(notesDatabase);
const labelsRepository = new LabelsRepository(notesDatabase);
const checklistsRepository = new ChecklistsRepository(notesDatabase);
const attachmentsRepository = new AttachmentsRepository(notesDatabase);
const ChecklistEditorDialog = lazy(() =>
  import('../notes/ChecklistEditorDialog').then((module) => ({
    default: module.ChecklistEditorDialog,
  })),
);
const NoteEditorDialog = lazy(() =>
  import('../notes/NoteEditorDialog').then((module) => ({ default: module.NoteEditorDialog })),
);

interface SearchWorkspaceProps {
  query: string;
  filters: SearchFilters;
  filtersOpen: boolean;
  labels: LabelRecord[];
  onFiltersChange(filters: SearchFilters): void;
  onCloseFilters(): void;
  onClearSearch(): void;
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
  onCloseFilters,
  onClearSearch,
}: SearchWorkspaceProps) {
  const [documents, setDocuments] = useState<SearchDocument[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [viewMode, setViewMode] = useState<NotesViewMode>(() => readNotesViewMode());
  const [editing, setEditing] = useState<EditingState | null>(null);
  const [toast, setToast] = useState<LifecycleToastState | null>(null);
  const [attachmentRefreshByNote, setAttachmentRefreshByNote] = useState<Record<string, number>>(
    {},
  );
  const searchOriginNoteIdRef = useRef<string | null>(null);

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
    const handleReminderChanged = () => {
      void reloadIndex().catch(() => showToast('Search index could not be refreshed.'));
    };
    window.addEventListener('notes-reminders-changed', handleReminderChanged);
    return () => window.removeEventListener('notes-reminders-changed', handleReminderChanged);
  }, [reloadIndex, showToast]);

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
  const activeFilterChips = useMemo(
    () => buildActiveFilterChips(filters, labels),
    [filters, labels],
  );
  const searchContextByNote = useMemo<Record<string, string>>(() => {
    const contexts: Record<string, string> = {};
    for (const result of results) {
      const context = buildSearchContext(result.document, query);
      if (context) contexts[result.document.note.id] = context;
    }
    return contexts;
  }, [query, results]);

  const handleViewMode = useCallback((nextMode: NotesViewMode) => {
    setViewMode(nextMode);
    writeNotesViewMode(nextMode);
  }, []);

  const handleAttachmentsChanged = useCallback((noteId: string) => {
    setAttachmentRefreshByNote((current) => ({
      ...current,
      [noteId]: (current[noteId] ?? 0) + 1,
    }));
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
        if (!document) return;
        searchOriginNoteIdRef.current = note.id;
        setEditing({ note: document.note, items: document.checklistItems });
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

  const closeEditing = useCallback(() => {
    setEditing(null);
    window.requestAnimationFrame(() => {
      if (document.querySelector('[role="dialog"]')) return;
      const noteId = searchOriginNoteIdRef.current;
      const card = noteId
        ? document.querySelector<HTMLElement>(`[data-note-id="${noteId}"]`)
        : null;
      const target = card?.querySelector<HTMLButtonElement>('.note-card-open');
      if (target) {
        target.focus();
        return;
      }
      document.querySelector<HTMLInputElement>('input[aria-label="Search notes"]')?.focus();
    });
  }, []);

  const handleUndo = useCallback(() => {
    const undo = toast?.undo;
    if (!undo) return;
    setToast(null);
    void undo().catch(() => showToast('Undo could not be completed.'));
  }, [showToast, toast]);

  return (
    <>
      {filtersOpen ? (
        <>
          <button
            className="search-filters-backdrop"
            type="button"
            aria-label="Close search filters"
            onClick={onCloseFilters}
          />
          <SearchFiltersPanel
            filters={filters}
            labels={labels}
            onChange={onFiltersChange}
            onClose={onCloseFilters}
          />
        </>
      ) : null}

      <div className="search-results-toolbar">
        <div className="search-results-summary" role="status" aria-live="polite">
          <strong>{loaded ? results.length : '…'}</strong>{' '}
          <span>{results.length === 1 ? 'result' : 'results'}</span>
          {query.trim() ? <span className="search-results-for"> for “{query.trim()}”</span> : null}
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

      {activeFilterChips.length > 0 ? (
        <div className="search-active-filters" aria-label="Active search filters">
          {activeFilterChips.map((chip) => (
            <button
              className="search-filter-chip"
              type="button"
              aria-label={`Remove filter ${chip.label}`}
              key={chip.key}
              onClick={() => onFiltersChange(chip.nextFilters)}
            >
              <span>{chip.label}</span>
              <X aria-hidden="true" />
            </button>
          ))}
          <button
            className="search-clear-active-filters"
            type="button"
            onClick={() => onFiltersChange({ ...DEFAULT_SEARCH_FILTERS })}
          >
            Clear filters
          </button>
        </div>
      ) : null}

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
          <div className="search-empty-actions">
            <button className="search-empty-reset" type="button" onClick={onClearSearch}>
              Reset search
            </button>
          </div>
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
          attachmentRefreshByNote={attachmentRefreshByNote}
          searchContextByNote={searchContextByNote}
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
          attachmentRefreshByNote={attachmentRefreshByNote}
          searchContextByNote={searchContextByNote}
        />
      ) : null}

      {editing ? (
        <Suspense
          fallback={
            <span className="deferred-note-surface" role="status">
              Opening note…
            </span>
          }
        >
          {editing.note.type === 'checklist' ? (
            <ChecklistEditorDialog
              key={editing.note.id}
              note={editing.note}
              items={editing.items}
              repository={checklistsRepository}
              attachmentsRepository={attachmentsRepository}
              attachmentRefreshKey={attachmentRefreshByNote[editing.note.id] ?? 0}
              onSaved={handleChecklistSaved}
              onAttachmentsChanged={handleAttachmentsChanged}
              onConverted={(note) => {
                setEditing({ note, items: [] });
                void reloadIndex();
              }}
              onClose={closeEditing}
            />
          ) : (
            <NoteEditorDialog
              key={editing.note.id}
              note={editing.note}
              repository={notesRepository}
              attachmentsRepository={attachmentsRepository}
              attachmentRefreshKey={attachmentRefreshByNote[editing.note.id] ?? 0}
              onSaved={handleSaved}
              onAttachmentsChanged={handleAttachmentsChanged}
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
              onClose={closeEditing}
            />
          )}
        </Suspense>
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
  attachmentRefreshByNote,
  searchContextByNote,
}: {
  title: string | null;
  documents: SearchDocument[];
  mode: NoteCollectionMode;
  viewMode: NotesViewMode;
  labels: LabelRecord[];
  actions: NoteCardActions;
  attachmentRefreshByNote: Record<string, number>;
  searchContextByNote: Record<string, string>;
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
        attachmentRefreshByNote={attachmentRefreshByNote}
        searchContextByNote={searchContextByNote}
      />
    </section>
  );
}

interface ActiveFilterChip {
  key: string;
  label: string;
  nextFilters: SearchFilters;
}

function buildActiveFilterChips(filters: SearchFilters, labels: LabelRecord[]): ActiveFilterChip[] {
  const chips: ActiveFilterChip[] = [];
  if (filters.type !== 'any') {
    chips.push({
      key: 'type',
      label: `Type: ${filters.type === 'text' ? 'Text' : 'Checklist'}`,
      nextFilters: { ...filters, type: 'any' },
    });
  }
  if (filters.status !== 'any') {
    chips.push({
      key: 'status',
      label: `Status: ${capitalize(filters.status)}`,
      nextFilters: { ...filters, status: 'any' },
    });
  }
  for (const color of filters.colors) {
    chips.push({
      key: `color:${color}`,
      label: `Color: ${capitalize(color)}`,
      nextFilters: { ...filters, colors: filters.colors.filter((item) => item !== color) },
    });
  }
  for (const labelId of filters.labelIds) {
    const name = labels.find((label) => label.id === labelId)?.name ?? 'Unknown';
    chips.push({
      key: `label:${labelId}`,
      label: `Label: ${name}`,
      nextFilters: { ...filters, labelIds: filters.labelIds.filter((id) => id !== labelId) },
    });
  }
  if (filters.after) {
    chips.push({
      key: 'after',
      label: `After: ${filters.after}`,
      nextFilters: { ...filters, after: '' },
    });
  }
  if (filters.before) {
    chips.push({
      key: 'before',
      label: `Before: ${filters.before}`,
      nextFilters: { ...filters, before: '' },
    });
  }
  return chips;
}

function buildSearchContext(document: SearchDocument, query: string): string | null {
  const field = primarySearchMatchField(document, query);
  if (!field) return null;

  if (field === 'title') return formatSearchContext('Title', document.note.title);
  if (field === 'label') return formatSearchContext('Label', document.labelNames.join(' · '));
  if (field === 'attachment') {
    return formatSearchContext('Attachment', document.attachmentNames.join(' · '));
  }
  if (field === 'ocr') return formatSearchContext('OCR', document.ocrText);
  if (field === 'checklist') {
    return formatSearchContext(
      'Checklist',
      document.checklistItems
        .map((item) => item.text)
        .filter(Boolean)
        .join(' · '),
    );
  }
  const body =
    document.note.type === 'text'
      ? richTextToPlainText(document.note.content)
      : document.note.content;
  return formatSearchContext('Text', body);
}

function formatSearchContext(label: string, value: string): string | null {
  const compact = value.replace(/\s+/gu, ' ').trim();
  if (!compact) return null;
  const maximum = 150;
  const excerpt =
    compact.length > maximum ? `${compact.slice(0, maximum - 1).trimEnd()}…` : compact;
  return `${label} · ${excerpt}`;
}

function capitalize(value: string): string {
  return value ? `${value[0]?.toLocaleUpperCase() ?? ''}${value.slice(1)}` : value;
}
