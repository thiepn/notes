import { useDialogFocusTrap } from '../../components/ui/useDialogFocusTrap';
import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
  type PointerEvent as ReactPointerEvent,
} from 'react';
import { Clock3, Copy, History, RotateCcw, Undo2, X } from 'lucide-react';

import { IconButton } from '../../components/ui/IconButton';
import type {
  NoteRecord,
  RevisionCopyResult,
  RevisionEntry,
  RevisionRestoreResult,
  RevisionSnapshot,
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

type HistoryAction = 'restore' | 'undo' | 'copy' | null;
type FocusTarget = 'status' | 'error' | 'undo' | null;

export function RevisionHistoryDialog({
  note,
  repository,
  onClose,
  onRestored,
  onCopied,
}: RevisionHistoryDialogProps) {
  const dialogRef = useRef<HTMLDivElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const statusRef = useRef<HTMLParagraphElement>(null);
  const errorRef = useRef<HTMLParagraphElement>(null);
  const undoRef = useRef<HTMLButtonElement>(null);
  const itemRefs = useRef(new Map<string, HTMLButtonElement>());
  const initialSelectionFocusedRef = useRef(false);
  const [entries, setEntries] = useState<RevisionEntry[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [currentSnapshot, setCurrentSnapshot] = useState<RevisionSnapshot | null>(null);
  const [loading, setLoading] = useState(true);
  const [busyAction, setBusyAction] = useState<HistoryAction>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [lastRestore, setLastRestore] = useState<RevisionRestoreResult | null>(null);
  const [focusTarget, setFocusTarget] = useState<FocusTarget>(null);
  const busy = busyAction !== null;

  useDialogFocusTrap(
    dialogRef,
    busy
      ? { initialFocusRef: closeRef }
      : {
          onEscape: onClose,
          initialFocusRef: closeRef,
        },
  );

  useEffect(() => {
    let cancelled = false;
    initialSelectionFocusedRef.current = false;
    setLoading(true);
    setErrorMessage(null);
    setStatusMessage(null);
    setFocusTarget(null);
    void repository
      .list(note.id)
      .then((loaded) => {
        if (cancelled) return;
        setEntries(loaded);
        setSelectedId((current) => current ?? loaded[0]?.record.id ?? null);
        setCurrentSnapshot(loaded[0]?.snapshot ?? null);
      })
      .catch((error: unknown) => {
        if (cancelled) return;
        setErrorMessage(toErrorMessage(error));
        setFocusTarget('error');
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
    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, []);

  useEffect(() => {
    if (loading || !selectedId || initialSelectionFocusedRef.current || errorMessage) return;
    initialSelectionFocusedRef.current = true;
    const frame = window.requestAnimationFrame(() => {
      itemRefs.current.get(selectedId)?.focus({ preventScroll: true });
    });
    return () => window.cancelAnimationFrame(frame);
  }, [errorMessage, loading, selectedId]);

  useEffect(() => {
    if (busy || !focusTarget) return;
    const target =
      focusTarget === 'undo'
        ? undoRef.current
        : focusTarget === 'error'
          ? errorRef.current
          : statusRef.current;
    const frame = window.requestAnimationFrame(() => {
      target?.focus({ preventScroll: true });
      setFocusTarget((current) => (current === focusTarget ? null : current));
    });
    return () => window.cancelAnimationFrame(frame);
  }, [busy, focusTarget]);

  const selected = useMemo(
    () => entries.find((entry) => entry.record.id === selectedId) ?? null,
    [entries, selectedId],
  );
  const currentEntryId = useMemo(
    () =>
      currentSnapshot
        ? (entries.find((entry) => snapshotsEqual(entry.snapshot, currentSnapshot))?.record.id ?? null)
        : null,
    [currentSnapshot, entries],
  );
  const selectedMatchesCurrent = Boolean(
    selected && currentSnapshot && snapshotsEqual(selected.snapshot, currentSnapshot),
  );
  const currentType = currentSnapshot?.type ?? note.type;
  const selectedChangesType = selected ? selected.snapshot.type !== currentType : false;

  const handleLayerPointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (event.target === event.currentTarget && !busy) onClose();
  };

  const refreshEntries = async () => {
    const loaded = await repository.list(note.id);
    setEntries(loaded);
    setSelectedId((current) =>
      current && loaded.some((entry) => entry.record.id === current)
        ? current
        : (loaded[0]?.record.id ?? null),
    );
  };

  const selectRevision = (revisionId: string) => {
    if (busy) return;
    setSelectedId(revisionId);
    setErrorMessage(null);
    setStatusMessage(null);
  };

  const focusRevisionAt = (index: number) => {
    const entry = entries[index];
    if (!entry) return;
    selectRevision(entry.record.id);
    itemRefs.current.get(entry.record.id)?.focus({ preventScroll: true });
  };

  const handleRevisionKeyDown = (
    event: ReactKeyboardEvent<HTMLButtonElement>,
    index: number,
  ) => {
    if (busy) return;
    let targetIndex: number | null = null;
    if (event.key === 'ArrowDown') targetIndex = Math.min(entries.length - 1, index + 1);
    if (event.key === 'ArrowUp') targetIndex = Math.max(0, index - 1);
    if (event.key === 'Home') targetIndex = 0;
    if (event.key === 'End') targetIndex = entries.length - 1;
    if (targetIndex === null || targetIndex === index) return;
    event.preventDefault();
    focusRevisionAt(targetIndex);
  };

  const restore = async () => {
    if (!selected || selectedMatchesCurrent || busy) return;
    setBusyAction('restore');
    setErrorMessage(null);
    setStatusMessage(null);
    setFocusTarget(null);
    try {
      const result = await repository.restore(note.id, selected.record.id, note.revision);
      onRestored(result);
      setCurrentSnapshot(snapshotFromRestore(result));
      setLastRestore(result);
      setStatusMessage(
        `Revision ${selected.record.noteRevision} restored. Undo restore is available until you close history.`,
      );
      let refreshFailed = false;
      try {
        await refreshEntries();
      } catch (error) {
        refreshFailed = true;
        setErrorMessage(
          `The version was restored, but History could not refresh the saved-version list. ${toErrorMessage(error)}`,
        );
      }
      setFocusTarget(refreshFailed ? 'error' : 'undo');
    } catch (error) {
      setErrorMessage(`Restore failed. ${toErrorMessage(error)}`);
      setFocusTarget('error');
    } finally {
      setBusyAction(null);
    }
  };

  const undoRestore = async () => {
    if (!lastRestore || busy) return;
    setBusyAction('undo');
    setErrorMessage(null);
    setStatusMessage(null);
    setFocusTarget(null);
    try {
      const result = await repository.restore(note.id, lastRestore.undoRevisionId, note.revision);
      onRestored(result);
      setCurrentSnapshot(snapshotFromRestore(result));
      setLastRestore(null);
      setStatusMessage('Restore undone. The note is back to its pre-restore recoverable state.');
      let refreshFailed = false;
      try {
        await refreshEntries();
      } catch (error) {
        refreshFailed = true;
        setErrorMessage(
          `The restore was undone, but History could not refresh the saved-version list. ${toErrorMessage(error)}`,
        );
      }
      setFocusTarget(refreshFailed ? 'error' : 'status');
    } catch (error) {
      setErrorMessage(`Undo restore failed. ${toErrorMessage(error)}`);
      setFocusTarget('error');
    } finally {
      setBusyAction(null);
    }
  };

  const copy = async () => {
    if (!selected || busy) return;
    setBusyAction('copy');
    setErrorMessage(null);
    setStatusMessage(null);
    setFocusTarget(null);
    try {
      const result = await repository.copyAsNew(selected.record.id);
      onCopied(result);
      setStatusMessage(
        `Revision ${selected.record.noteRevision} copied to a new active note. The original note was not changed.`,
      );
      setFocusTarget('status');
    } catch (error) {
      setErrorMessage(`Copy failed. ${toErrorMessage(error)}`);
      setFocusTarget('error');
    } finally {
      setBusyAction(null);
    }
  };

  return (
    <div className="revision-history-layer" onPointerDown={handleLayerPointerDown}>
      <div
        ref={dialogRef}
        tabIndex={-1}
        className="revision-history-dialog"
        role="dialog"
        aria-modal="true"
        aria-busy={busy || undefined}
        aria-labelledby="revision-history-title"
      >
        <header className="revision-history-heading">
          <div>
            <p className="workspace-kicker">Recovery</p>
            <h2 id="revision-history-title">Version history</h2>
            <p>{note.title || 'Untitled note'}</p>
          </div>
          <IconButton ref={closeRef} label="Close version history" disabled={busy} onClick={onClose}>
            <X />
          </IconButton>
        </header>

        <div className="revision-history-body">
          <aside className="revision-history-list" aria-label="Saved versions">
            {loading ? <p className="revision-history-empty">Loading history…</p> : null}
            {!loading && entries.length === 0 ? (
              <p className="revision-history-empty">No saved versions yet.</p>
            ) : null}
            {entries.map((entry, index) => {
              const active = entry.record.id === selectedId;
              const isCurrent = entry.record.id === currentEntryId;
              const label = `Revision ${entry.record.noteRevision}, ${REASON_LABELS[entry.record.reason]}, ${formatTimestamp(entry.record.createdAt)}${isCurrent ? ', current version' : ''}`;
              return (
                <button
                  ref={(node) => {
                    if (node) itemRefs.current.set(entry.record.id, node);
                    else itemRefs.current.delete(entry.record.id);
                  }}
                  key={entry.record.id}
                  className="revision-history-item"
                  type="button"
                  data-active={active}
                  data-current={isCurrent || undefined}
                  aria-label={label}
                  aria-pressed={active}
                  aria-current={isCurrent ? 'true' : undefined}
                  disabled={busy}
                  onClick={() => selectRevision(entry.record.id)}
                  onKeyDown={(event) => handleRevisionKeyDown(event, index)}
                >
                  <span className="revision-history-item-icon" aria-hidden="true">
                    <History />
                  </span>
                  <span className="revision-history-item-copy">
                    <span className="revision-history-item-title">
                      <strong>Revision {entry.record.noteRevision}</strong>
                      {isCurrent ? <span className="revision-history-current">Current</span> : null}
                    </span>
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
                  <span>{typeLabel(selected.snapshot.type)}</span>
                </div>
                <div
                  className="revision-preview-context"
                  data-state={
                    selectedMatchesCurrent ? 'current' : selectedChangesType ? 'type-change' : 'saved'
                  }
                >
                  <strong>
                    {selectedMatchesCurrent
                      ? 'Current recoverable version'
                      : selectedChangesType
                        ? 'This restore changes note type'
                        : 'Historical recoverable version'}
                  </strong>
                  <span>
                    {selectedMatchesCurrent
                      ? 'This snapshot already matches the current recoverable note state.'
                      : selectedChangesType
                        ? `Restoring changes this note from ${typeLabel(currentType).toLowerCase()} to ${typeLabel(selected.snapshot.type).toLowerCase()} and replaces its recoverable content.`
                        : selected.snapshot.type === 'checklist'
                          ? 'Restoring replaces the current title, checklist rows, check states, hierarchy, and color.'
                          : 'Restoring replaces the current title, text, and color.'}
                  </span>
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
          <p ref={errorRef} className="revision-history-error" role="alert" tabIndex={-1}>
            {errorMessage}
          </p>
        ) : null}
        {statusMessage ? (
          <p ref={statusRef} className="revision-history-status" role="status" tabIndex={-1}>
            {statusMessage}
          </p>
        ) : null}

        <footer className="revision-history-footer">
          <p>
            Recovery changes title, note type/content, and color. Labels, attachments, pin/archive/
            trash state, and note position stay current.
          </p>
          <div className="revision-history-actions">
            {lastRestore ? (
              <button
                ref={undoRef}
                className="note-editor-secondary"
                type="button"
                disabled={busy}
                onClick={() => void undoRestore()}
              >
                <Undo2 aria-hidden="true" />
                {busyAction === 'undo' ? 'Undoing…' : 'Undo restore'}
              </button>
            ) : null}
            <button
              className="note-editor-secondary"
              type="button"
              disabled={!selected || busy}
              onClick={() => void copy()}
            >
              <Copy aria-hidden="true" />
              {busyAction === 'copy' ? 'Copying…' : 'Copy as new note'}
            </button>
            <button
              className="revision-history-restore"
              type="button"
              disabled={!selected || selectedMatchesCurrent || busy}
              onClick={() => void restore()}
            >
              <RotateCcw aria-hidden="true" />
              {selectedMatchesCurrent
                ? 'Current version'
                : busyAction === 'restore'
                  ? 'Restoring…'
                  : 'Restore this version'}
            </button>
          </div>
        </footer>
      </div>
    </div>
  );
}

function snapshotFromRestore(result: RevisionRestoreResult): RevisionSnapshot {
  return {
    version: 1,
    type: result.note.type,
    title: result.note.title,
    content: result.note.type === 'text' ? result.note.content : '',
    color: result.note.color,
    items:
      result.note.type === 'checklist'
        ? result.items.map((item) => ({
            id: item.id,
            text: item.text,
            checked: item.checked,
            parentId: item.parentId,
          }))
        : [],
  };
}

function snapshotsEqual(a: RevisionSnapshot, b: RevisionSnapshot): boolean {
  if (a.type !== b.type || a.title !== b.title || a.content !== b.content || a.color !== b.color) {
    return false;
  }
  if (a.items.length !== b.items.length) return false;
  return a.items.every((item, index) => {
    const other = b.items[index];
    return (
      other !== undefined &&
      item.id === other.id &&
      item.text === other.text &&
      item.checked === other.checked &&
      item.parentId === other.parentId
    );
  });
}

function typeLabel(type: NoteRecord['type']): string {
  return type === 'checklist' ? 'Checklist' : 'Text note';
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
