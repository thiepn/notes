import { useRef, useState, type FormEvent, type PointerEvent as ReactPointerEvent } from 'react';
import { Check, Pencil, Plus, Search, Trash2, X } from 'lucide-react';

import { IconButton } from '../../components/ui/IconButton';
import { useDialogFocusTrap } from '../../components/ui/useDialogFocusTrap';
import type { LabelRecord } from '../../db';

interface LabelManagerDialogProps {
  labels: LabelRecord[];
  counts: Record<string, number>;
  onClose(): void;
  onCreate(name: string): Promise<void>;
  onRename(labelId: string, name: string): Promise<void>;
  onDelete(labelId: string): Promise<void>;
}

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
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState('');
  const [deleteCandidateId, setDeleteCandidateId] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const dialogRef = useRef<HTMLDivElement>(null);
  const newLabelRef = useRef<HTMLInputElement>(null);
  const showLabelSearch = labels.length >= 6;
  const normalizedLabelQuery = showLabelSearch ? labelQuery.trim().toLocaleLowerCase() : '';
  const visibleLabels = normalizedLabelQuery
    ? labels.filter((label) => label.name.toLocaleLowerCase().includes(normalizedLabelQuery))
    : labels;

  useDialogFocusTrap(dialogRef, { onEscape: onClose, initialFocusRef: newLabelRef });

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
    });
  };

  const handleRename = (event: FormEvent, labelId: string) => {
    event.preventDefault();
    const name = editingName;
    void run(async () => {
      await onRename(labelId, name);
      setEditingId(null);
      setEditingName('');
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
          {labels.length === 0 ? (
            <p className="label-manager-empty">No labels yet.</p>
          ) : (
            visibleLabels.map((label) => {
              const editing = editingId === label.id;
              const deleting = deleteCandidateId === label.id;

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
                        onClick={() => {
                          setEditingId(null);
                          setEditingName('');
                        }}
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
                          });
                        }}
                      >
                        Delete
                      </button>
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => setDeleteCandidateId(null)}
                      >
                        Cancel
                      </button>
                    </div>
                  ) : (
                    <>
                      <span className="label-manager-name">{label.name}</span>
                      <span className="label-manager-meta">
                        {counts[label.id] ?? 0} {(counts[label.id] ?? 0) === 1 ? 'note' : 'notes'}
                      </span>
                      <div className="label-manager-actions">
                        <IconButton
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
                          label={`Delete label ${label.name}`}
                          disabled={busy}
                          onClick={() => {
                            setDeleteCandidateId(label.id);
                            setEditingId(null);
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
