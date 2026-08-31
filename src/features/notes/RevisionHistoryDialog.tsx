import { useEffect, useMemo, useState, type PointerEvent as ReactPointerEvent } from 'react';
import { Clock3, Copy, History, RotateCcw, X } from 'lucide-react';

import { IconButton } from '../../components/ui/IconButton';
import type {
  NoteRecord,
  RevisionCopyResult,
  RevisionEntry,
  RevisionRestoreResult,
  RevisionsRepository,
} from '../../db';

interface RevisionHistoryDialogProps {
  note: NoteRecord;
  repository: RevisionsRepository;
  onClose(): void;
  onRestored(result: RevisionRestoreResult): void;
  onCopied(result: RevisionCopyResult): void;
}

const REASON_LABELS: Record<RevisionEntry['record']['reason'], string> = {
  edit: 'Before editing',
  close: 'Finished edit',
  import: 'Imported',
  restore: 'Before restore',
  conversion: 'Converted',
};

export function RevisionHistoryDialog({
  note,
  repository,
  onClose,
  onRestored,
  onCopied,
}: RevisionHistoryDialogProps) {
  const [entries, setEntries] = useState<RevisionEntry[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void repository
      .list(note.id)
      .then((loaded) => {
        if (cancelled) return;
        setEntries(loaded);
        setSelectedId((current) => current ?? loaded[0]?.record.id ?? null);
      })
      .catch((error: unknown) => {
        if (cancelled) return;
        setErrorMessage(toErrorMessage(error));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [note.id, repository]);

  useEffect(() => {
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape' || busy) return;
      event.preventDefault();
      onClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [busy, onClose]);

  const selected = useMemo(
    () => entries.find((entry) => entry.record.id === selectedId) ?? null,
    [entries, selectedId],
  );

  const handleLayerPointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (event.target === event.currentTarget && !busy) onClose();
  };

  const restore = async () => {
    if (!selected || busy) return;
    setBusy(true);
    setErrorMessage(null);
    try {
      const result = await repository.restore(note.id, selected.record.id, note.revision);
      onRestored(result);
    } catch (error) {
      setErrorMessage(toErrorMessage(error));
      setBusy(false);
    }
  };

  const copy = async () => {
    if (!selected || busy) return;
    setBusy(true);
    setErrorMessage(null);
    try {
      const result = await repository.copyAsNew(selected.record.id);
      onCopied(result);
    } catch (error) {
      setErrorMessage(toErrorMessage(error));
      setBusy(false);
    }
  };

  return (
    <div className="revision-history-layer" onPointerDown={handleLayerPointerDown}>
      <div
        className="revision-history-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="revision-history-title"
      >
        <header className="revision-history-heading">
          <div>
            <p className="workspace-kicker">Recovery</p>
            <h2 id="revision-history-title">Version history</h2>
            <p>{note.title || 'Untitled note'}</p>
          </div>
          <IconButton label="Close version history" disabled={busy} onClick={onClose}>
            <X />
          </IconButton>
        </header>

        <div className="revision-history-body">
          <aside className="revision-history-list" aria-label="Saved versions">
            {loading ? <p className="revision-history-empty">Loading history…</p> : null}
            {!loading && entries.length === 0 ? (
              <p className="revision-history-empty">No saved versions yet.</p>
            ) : null}
            {entries.map((entry) => {
              const active = entry.record.id === selectedId;
              return (
                <button
                  key={entry.record.id}
                  className="revision-history-item"
                  type="button"
                  data-active={active}
                  aria-pressed={active}
                  onClick={() => setSelectedId(entry.record.id)}
                >
                  <span className="revision-history-item-icon" aria-hidden="true">
                    <History />
                  </span>
                  <span className="revision-history-item-copy">
                    <strong>Revision {entry.record.noteRevision}</strong>
                    <span>{REASON_LABELS[entry.record.reason]}</span>
                    <time dateTime={new Date(entry.record.createdAt).toISOString()}>
                      {formatTimestamp(entry.record.createdAt)}
                    </time>
                  </span>
                </button>
              );
            })}
          </aside>

          <section className="revision-preview" aria-label="Revision preview">
            {selected ? (
              <>
                <div className="revision-preview-meta">
                  <span>
                    <Clock3 aria-hidden="true" /> {formatTimestamp(selected.record.createdAt)}
                  </span>
                  <span>{selected.snapshot.type === 'checklist' ? 'Checklist' : 'Text note'}</span>
                </div>
                <div className="revision-preview-card" data-color={selected.snapshot.color}>
                  {selected.snapshot.title ? <h3>{selected.snapshot.title}</h3> : null}
                  {selected.snapshot.type === 'checklist' ? (
                    <ul className="revision-preview-checklist">
                      {selected.snapshot.items.map((item) => (
                        <li key={item.id} data-child={item.parentId !== null}>
                          <span aria-hidden="true">{item.checked ? '☑' : '☐'}</span>
                          <span className={item.checked ? 'revision-preview-checked' : undefined}>
                            {item.text || 'Empty item'}
                          </span>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="revision-preview-text">
                      {selected.snapshot.content || 'This version has no body text.'}
                    </p>
                  )}
                </div>
              </>
            ) : (
              <p className="revision-history-empty">Select a version to preview it.</p>
            )}
          </section>
        </div>

        {errorMessage ? (
          <p className="revision-history-error" role="alert">
            {errorMessage}
          </p>
        ) : null}

        <footer className="revision-history-footer">
          <p>Restoring changes content and color only. Labels and lifecycle state stay current.</p>
          <div className="revision-history-actions">
            <button
              className="note-editor-secondary"
              type="button"
              disabled={!selected || busy}
              onClick={() => void copy()}
            >
              <Copy aria-hidden="true" /> Copy as new note
            </button>
            <button
              className="revision-history-restore"
              type="button"
              disabled={!selected || busy}
              onClick={() => void restore()}
            >
              <RotateCcw aria-hidden="true" /> Restore this version
            </button>
          </div>
        </footer>
      </div>
    </div>
  );
}

function formatTimestamp(timestamp: number): string {
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(timestamp));
}

function toErrorMessage(error: unknown): string {
  if (error instanceof Error && error.message.trim()) return error.message;
  return 'Version history could not complete this action.';
}
