from pathlib import Path


def replace(path: str, old: str, new: str, expected: int = 1) -> None:
    file = Path(path)
    text = file.read_text()
    count = text.count(old)
    if count != expected:
        raise RuntimeError(f'{path}: expected {expected}, found {count}: {old[:80]!r}')
    file.write_text(text.replace(old, new, expected))


def append_once(path: str, marker: str, addition: str) -> None:
    file = Path(path)
    text = file.read_text()
    if marker in text:
        return
    file.write_text(text.rstrip() + '\n\n' + addition.strip() + '\n')


# Label manager: usage counts and filtering for larger catalogs.
replace(
    'src/features/notes/LabelManagerDialog.tsx',
    "import { Check, Pencil, Plus, Trash2, X } from 'lucide-react';\n",
    "import { Check, Pencil, Plus, Search, Trash2, X } from 'lucide-react';\n",
)

replace(
    'src/features/notes/LabelManagerDialog.tsx',
    '''interface LabelManagerDialogProps {
  labels: LabelRecord[];
  onClose(): void;
''',
    '''interface LabelManagerDialogProps {
  labels: LabelRecord[];
  counts: Record<string, number>;
  onClose(): void;
''',
)

replace(
    'src/features/notes/LabelManagerDialog.tsx',
    '''export function LabelManagerDialog({
  labels,
  onClose,
''',
    '''export function LabelManagerDialog({
  labels,
  counts,
  onClose,
''',
)

replace(
    'src/features/notes/LabelManagerDialog.tsx',
    '''  const [newLabelName, setNewLabelName] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
''',
    '''  const [newLabelName, setNewLabelName] = useState('');
  const [labelQuery, setLabelQuery] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
''',
)

replace(
    'src/features/notes/LabelManagerDialog.tsx',
    '''  const dialogRef = useRef<HTMLDivElement>(null);
  const newLabelRef = useRef<HTMLInputElement>(null);

  useDialogFocusTrap(dialogRef, { onEscape: onClose, initialFocusRef: newLabelRef });
''',
    '''  const dialogRef = useRef<HTMLDivElement>(null);
  const newLabelRef = useRef<HTMLInputElement>(null);
  const showLabelSearch = labels.length >= 6;
  const normalizedLabelQuery = showLabelSearch ? labelQuery.trim().toLocaleLowerCase() : '';
  const visibleLabels = normalizedLabelQuery
    ? labels.filter((label) => label.name.toLocaleLowerCase().includes(normalizedLabelQuery))
    : labels;

  useDialogFocusTrap(dialogRef, { onEscape: onClose, initialFocusRef: newLabelRef });
''',
)

replace(
    'src/features/notes/LabelManagerDialog.tsx',
    '''        {errorMessage ? (
          <p className="label-manager-error" role="alert">
            {errorMessage}
          </p>
        ) : null}

        <div className="label-manager-list">
''',
    '''        {errorMessage ? (
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
''',
)

replace(
    'src/features/notes/LabelManagerDialog.tsx',
    '            labels.map((label) => {\n',
    '            visibleLabels.map((label) => {\n',
)

replace(
    'src/features/notes/LabelManagerDialog.tsx',
    '''                      <span className="label-manager-name">{label.name}</span>
                      <div className="label-manager-actions">
''',
    '''                      <span className="label-manager-name">{label.name}</span>
                      <span className="label-manager-meta">
                        {counts[label.id] ?? 0} {(counts[label.id] ?? 0) === 1 ? 'note' : 'notes'}
                      </span>
                      <div className="label-manager-actions">
''',
)

# Permanent deletion dialog distinguishes whole-Trash destructive action from selection deletion.
replace(
    'src/features/notes/ConfirmDeleteDialog.tsx',
    '''interface ConfirmDeleteDialogProps {
  title?: string;
  count?: number;
  onCancel(): void;
''',
    '''interface ConfirmDeleteDialogProps {
  title?: string;
  count?: number;
  context?: 'selection' | 'trash';
  onCancel(): void;
''',
)

replace(
    'src/features/notes/ConfirmDeleteDialog.tsx',
    '''export function ConfirmDeleteDialog({
  title = '',
  count,
  onCancel,
''',
    '''export function ConfirmDeleteDialog({
  title = '',
  count,
  context = 'selection',
  onCancel,
''',
)

replace(
    'src/features/notes/ConfirmDeleteDialog.tsx',
    '''  const isBulk = count !== undefined && count > 1;
  const description = isBulk
    ? `${count} selected notes will be permanently deleted.`
    : title
      ? `“${title}” will be permanently deleted.`
      : 'This note will be permanently deleted.';
''',
    '''  const emptyingTrash = context === 'trash' && count !== undefined;
  const isBulk = count !== undefined && count > 1;
  const description = emptyingTrash
    ? `${count} ${count === 1 ? 'note' : 'notes'} in Trash will be permanently deleted.`
    : isBulk
      ? `${count} selected notes will be permanently deleted.`
      : title
        ? `“${title}” will be permanently deleted.`
        : 'This note will be permanently deleted.';
''',
)

replace(
    'src/features/notes/ConfirmDeleteDialog.tsx',
    '''        <h2 id="confirm-delete-title">
          {isBulk ? `Delete ${count} notes permanently?` : 'Delete note permanently?'}
        </h2>
''',
    '''        <h2 id="confirm-delete-title">
          {emptyingTrash
            ? 'Empty trash?'
            : isBulk
              ? `Delete ${count} notes permanently?`
              : 'Delete note permanently?'}
        </h2>
''',
)

# Notes workspace: whole-Trash restore/delete while retaining selection behavior.
replace(
    'src/features/notes/NotesWorkspace.tsx',
    '''  const [deleteCandidate, setDeleteCandidate] = useState<NoteRecord | null>(null);
  const [bulkDeleteIds, setBulkDeleteIds] = useState<string[] | null>(null);
''',
    '''  const [deleteCandidate, setDeleteCandidate] = useState<NoteRecord | null>(null);
  const [bulkDeleteIds, setBulkDeleteIds] = useState<string[] | null>(null);
  const [bulkDeleteSource, setBulkDeleteSource] = useState<'selection' | 'trash'>('selection');
''',
)

replace(
    'src/features/notes/NotesWorkspace.tsx',
    '''  const selectedNotes = useMemo(
    () => visibleNotes.filter((note) => selectedNoteIds.has(note.id)),
    [selectedNoteIds, visibleNotes],
  );

  const clearSelection = useCallback(() => {
''',
    '''  const selectedNotes = useMemo(
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
''',
)

replace(
    'src/features/notes/NotesWorkspace.tsx',
    '''  const handleConfirmBulkDelete = useCallback(async () => {
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
''',
    '''  const handleConfirmBulkDelete = useCallback(async () => {
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
      showToast(
        source === 'trash' ? 'Trash could not be emptied.' : 'Selected notes could not be deleted.',
      );
    }
  }, [bulkDeleteIds, bulkDeleteSource, clearSelection, refreshCollection, showToast]);
''',
)

replace(
    'src/features/notes/NotesWorkspace.tsx',
    '''                onDeletePermanently={() => setBulkDeleteIds(selectedNotes.map((note) => note.id))}
''',
    '''                onDeletePermanently={() => {
                  setBulkDeleteSource('selection');
                  setBulkDeleteIds(selectedNotes.map((note) => note.id));
                }}
''',
)

replace(
    'src/features/notes/NotesWorkspace.tsx',
    '''              <div className="notes-toolbar-controls">
                <label className="notes-sort">
''',
    '''              <div className="notes-toolbar-controls">
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
''',
)

replace(
    'src/features/notes/NotesWorkspace.tsx',
    '''          <ConfirmDeleteDialog
            count={bulkDeleteIds.length}
            onCancel={() => setBulkDeleteIds(null)}
            onConfirm={() => void handleConfirmBulkDelete()}
          />
''',
    '''          <ConfirmDeleteDialog
            count={bulkDeleteIds.length}
            context={bulkDeleteSource}
            onCancel={() => {
              setBulkDeleteIds(null);
              setBulkDeleteSource('selection');
            }}
            onConfirm={() => void handleConfirmBulkDelete()}
          />
''',
)

append_once(
    'src/styles/organization.css',
    '.label-manager-search {',
    '''
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
''',
)

append_once(
    'src/styles/notes.css',
    '.notes-collection-actions {',
    '''
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
''',
)

append_once(
    'docs/ARCHITECTURE.md',
    '## P3 organization model',
    '''
## P3 organization model

Search, labels, Archive, and Trash share the lifecycle/collection contract in `src/features/organization/collectionModel.ts`. `AppShell` resolves Notes, a label projection, Archive, or Trash into that contract before rendering the notes workspace; Search reuses the same lifecycle classification and remains a derived Notes + Archive index that excludes Trash.

Label catalog refresh is also a cross-surface reconciliation point: stale label IDs are removed from current, saved, and recent searches, and an open Search workspace rebuilds label metadata after rename/delete. Search lifecycle and label mutations notify the shell's derived navigation counts just like mutations from the normal notes workspace.

P3 introduces no durable table, no database migration, no folder hierarchy, and no secondary search store. Whole-Trash Restore all and Empty trash use the existing bulk repository transactions; permanent deletion remains confirmation-gated.
''',
)

print('P3 organization UI patch applied.')
