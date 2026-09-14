import {
  useEffect,
  useRef,
  useState,
  type FormEvent,
  type PointerEvent as ReactPointerEvent,
} from 'react';
import { Check, Pencil, Plus, Search, Trash2, X } from 'lucide-react';

import { IconButton } from '../../components/ui/IconButton';
import { useDialogFocusTrap } from '../../components/ui/useDialogFocusTrap';
import { notesDatabase, type LabelRecord } from '../../db';

interface LabelManagerDialogProps {
  labels: LabelRecord[];
  counts: Record<string, number>;
  onClose(): void;
  onCreate(name: string): Promise<void>;
  onRename(labelId: string, name: string): Promise<void>;
  onDelete(labelId: string): Promise<void>;
}

type LabelSort = 'name' | 'usage';
type LabelAction = 'rename' | 'delete';

export function LabelManagerDialog({
  labels,
  counts,
  onClose,
  onCreate,
  onRename,
  onDelete,
}: LabelManagerDialogProps) {
  const [newLabelName, setNewLabelName] = useState('');
  const [labelQuery, setLabelQuery] = useState('');
  const [labelSort, setLabelSort] = useState<LabelSort>('name');
  const [unusedOnly, setUnusedOnly] = useState(false);
  const [usageCounts, setUsageCounts] = useState<Record<string, number>>(counts);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState('');
  const [deleteCandidateId, setDeleteCandidateId] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const dialogRef = useRef<HTMLDivElement>(null);
  const newLabelRef = useRef<HTMLInputElement>(null);
  const renameTriggerRefs = useRef(new Map<string, HTMLButtonElement>());
  const deleteTriggerRefs = useRef(new Map<string, HTMLButtonElement>());
  const deleteCancelRefs = useRef(new Map<string, HTMLButtonElement>());
  const showLabelSearch = labels.length >= 6;
  const normalizedLabelQuery = showLabelSearch ? labelQuery.trim().toLocaleLowerCase() : '';
  const unusedCount = labels.filter((label) => (usageCounts[label.id] ?? 0) === 0).length;
  const visibleLabels = labels
    .filter((label) =>
      normalizedLabelQuery ? label.name.toLocaleLowerCase().includes(normalizedLabelQuery) : true,
    )
    .filter((label) => (unusedOnly ? (usageCounts[label.id] ?? 0) === 0 : true))
    .sort((a, b) => {
      if (labelSort === 'usage') {
        const countDifference = (usageCounts[b.id] ?? 0) - (usageCounts[a.id] ?? 0);
        if (countDifference !== 0) return countDifference;
      }
      return a.name.localeCompare(b.name, undefined, { sensitivity: 'base' });
    });

  const restoreActionFocus = (action: LabelAction, labelId: string) => {
    afterUiUpdate(() => {
      const target =
        action === 'rename'
          ? renameTriggerRefs.current.get(labelId)
          : deleteTriggerRefs.current.get(labelId);
      target?.focus({ preventScroll: true });
    });
  };

  const cancelRename = (labelId: string) => {
    setEditingId(null);
    setEditingName('');
    restoreActionFocus('rename', labelId);
  };

  const cancelDelete = (labelId: string) => {
    setDeleteCandidateId(null);
    restoreActionFocus('delete', labelId);
  };

  const handleDialogEscape = () => {
    if (busy) return;
    if (editingId) {
      cancelRename(editingId);
      return;
    }
    if (deleteCandidateId) {
      cancelDelete(deleteCandidateId);
      return;
    }
    onClose();
  };

  useDialogFocusTrap(dialogRef, { onEscape: handleDialogEscape, initialFocusRef: newLabelRef });

  useEffect(() => {
    let cancelled = false;
    void notesDatabase.noteLabels.toArray().then((links) => {
      if (cancelled) return;
      const next: Record<string, number> = {};
      for (const link of links) next[link.labelId] = (next[link.labelId] ?? 0) + 1;
      setUsageCounts(next);
    });
    return () => {
      cancelled = true;
    };
  }, [labels]);

  useEffect(() => {
    if (!deleteCandidateId) return;
    const frame = window.requestAnimationFrame(() => {
      deleteCancelRefs.current.get(deleteCandidateId)?.focus({ preventScroll: true });
    });
    return () => window.cancelAnimationFrame(frame);
  }, [deleteCandidateId]);

  const run = async (operation: () => Promise<void>) => {
    setBusy(true);
    setErrorMessage(null);
    try {
      await operation();
    } catch (error) {
      setErrorMessage(
        error instanceof Error ? error.message : 'The label change could not be saved.',
      );
    } finally {
      setBusy(false);
    }
  };

  const handleLayerPointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (event.target === event.currentTarget) onClose();
  };

  const handleCreate = (event: FormEvent) => {
    event.preventDefault();
    const name = newLabelName;
    void run(async () => {
      await onCreate(name);
      setNewLabelName('');
      afterUiUpdate(() => newLabelRef.current?.focus({ preventScroll: true }));
    });
  };

  const handleRename = (event: FormEvent, labelId: string) => {
    event.preventDefault();
    const name = editingName;
    void run(async () => {
      await onRename(labelId, name);
      setEditingId(null);
      setEditingName('');
      restoreActionFocus('rename', labelId);
    });
  };

  return (
    <div className="label-manager-layer" onPointerDown={handleLayerPointerDown}>
      <div
        ref={dialogRef}
        tabIndex={-1}
        className="label-manager-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="label-manager-title"
        aria-busy={busy}
      >
        <div className="label-manager-heading">
          <div>
            <p className="workspace-kicker">Organization</p>
            <h2 id="label-manager-title">Edit labels</h2>
          </div>
          <IconButton label="Close label manager" onClick={onClose}>
            <X />
          </IconButton>
        </div>

        <form className="label-create-row" onSubmit={handleCreate}>
          <input
            ref={newLabelRef}
            type="text"
            value={newLabelName}
            maxLength={100}
            placeholder="Create new label"
            aria-label="New label name"
            disabled={busy}
            onChange={(event) => setNewLabelName(event.target.value)}
          />
          <IconButton label="Create label" type="submit" disabled={busy || !newLabelName.trim()}>
            <Plus />
          </IconButton>
        </form>

        {errorMessage ? (
          <p className="label-manager-error" role="alert">
            {errorMessage}
          </p>
        ) : null}

        {labels.length > 1 ? (
          <div className="label-manager-controls" aria-label="Label organization controls">
            <label>
              <span>Sort</span>
              <select
                aria-label="Sort labels"
                value={labelSort}
                onChange={(event) => setLabelSort(event.target.value as LabelSort)}
              >
                <option value="name">Name A–Z</option>
                <option value="usage">Most used</option>
              </select>
            </label>
            <button
              type="button"
              className="label-manager-unused-toggle"
              aria-pressed={unusedOnly}
              disabled={unusedCount === 0}
              onClick={() => setUnusedOnly((current) => !current)}
            >
              Unused {unusedCount > 0 ? `(${unusedCount})` : ''}
            </button>
          </div>
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
            <p className="label-manager-empty">
              {unusedOnly ? 'No unused labels match.' : 'No matching labels.'}
            </p>
          ) : null}
          {labels.length === 0 ? (
            <p className="label-manager-empty">No labels yet.</p>
          ) : (
            visibleLabels.map((label) => {
              const editing = editingId === label.id;
              const deleting = deleteCandidateId === label.id;
              const usage = usageCounts[label.id] ?? 0;

              return (
                <div className="label-manager-row" key={label.id}>
                  {editing ? (
                    <form
                      className="label-manager-rename"
                      onSubmit={(event) => handleRename(event, label.id)}
                    >
                      <input
                        type="text"
                        value={editingName}
                        maxLength={100}
                        aria-label={`Rename label ${label.name}`}
                        autoFocus
                        disabled={busy}
                        onChange={(event) => setEditingName(event.target.value)}
                      />
                      <IconButton
                        label={`Save label ${label.name}`}
                        type="submit"
                        disabled={busy || !editingName.trim()}
                      >
                        <Check />
                      </IconButton>
                      <IconButton
                        label={`Cancel renaming ${label.name}`}
                        disabled={busy}
                        onClick={() => cancelRename(label.id)}
                      >
                        <X />
                      </IconButton>
                    </form>
                  ) : deleting ? (
                    <div className="label-delete-confirmation">
                      <span>Delete “{label.name}”?</span>
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => {
                          void run(async () => {
                            await onDelete(label.id);
                            setDeleteCandidateId(null);
                            afterUiUpdate(() =>
                              newLabelRef.current?.focus({ preventScroll: true }),
                            );
                          });
                        }}
                      >
                        Delete
                      </button>
                      <button
                        ref={(element) => {
                          if (element) deleteCancelRefs.current.set(label.id, element);
                          else deleteCancelRefs.current.delete(label.id);
                        }}
                        type="button"
                        disabled={busy}
                        onClick={() => cancelDelete(label.id)}
                      >
                        Cancel
                      </button>
                    </div>
                  ) : (
                    <>
                      <span className="label-manager-name">{label.name}</span>
                      <span className="label-manager-meta">
                        {usage} {usage === 1 ? 'note' : 'notes'}
                      </span>
                      <div className="label-manager-actions">
                        <IconButton
                          ref={(element) => {
                            if (element) renameTriggerRefs.current.set(label.id, element);
                            else renameTriggerRefs.current.delete(label.id);
                          }}
                          label={`Rename label ${label.name}`}
                          disabled={busy}
                          onClick={() => {
                            setEditingId(label.id);
                            setEditingName(label.name);
                            setDeleteCandidateId(null);
                          }}
                        >
                          <Pencil />
                        </IconButton>
                        <IconButton
                          ref={(element) => {
                            if (element) deleteTriggerRefs.current.set(label.id, element);
                            else deleteTriggerRefs.current.delete(label.id);
                          }}
                          label={`Delete label ${label.name}`}
                          disabled={busy}
                          onClick={() => {
                            setDeleteCandidateId(label.id);
                            setEditingId(null);
                            setEditingName('');
                          }}
                        >
                          <Trash2 />
                        </IconButton>
                      </div>
                    </>
                  )}
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
}

function afterUiUpdate(callback: () => void): void {
  window.requestAnimationFrame(() => window.requestAnimationFrame(callback));
}
