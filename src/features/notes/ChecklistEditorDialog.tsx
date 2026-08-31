import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
  type PointerEvent as ReactPointerEvent,
} from 'react';
import { History } from 'lucide-react';

import type {
  ChecklistDraftItem,
  ChecklistItemRecord,
  ChecklistsRepository,
  NoteRecord,
} from '../../db';
import {
  clearChecklistEditorJournal,
  readChecklistEditorJournal,
  writeChecklistEditorJournal,
} from './checklistJournal';
import { ChecklistEditorFields } from './ChecklistEditorFields';

const AUTOSAVE_DELAY_MS = 180;
const MOVE_COMPLETED_KEY = 'notes.checklist.move-completed';

type EditorStatus = 'idle' | 'saving' | 'error';

interface ChecklistEditorDialogProps {
  note: NoteRecord;
  items: ChecklistItemRecord[];
  repository: ChecklistsRepository;
  onSaved(note: NoteRecord, items: ChecklistItemRecord[]): void;
  onConverted(note: NoteRecord): void;
  onHistoryRequested(noteId: string): void;
  onClose(): void;
}

interface ChecklistDraft {
  title: string;
  items: ChecklistDraftItem[];
}

export function ChecklistEditorDialog({
  note,
  items,
  repository,
  onSaved,
  onConverted,
  onHistoryRequested,
  onClose,
}: ChecklistEditorDialogProps) {
  const [initial] = useState(() => {
    const journal = readChecklistEditorJournal();
    const recovered = journal?.noteId === note.id ? journal : null;
    return {
      journal: recovered,
      draft: {
        title: recovered?.title ?? note.title,
        items: recovered?.items ?? items.map(toDraftItem),
      } satisfies ChecklistDraft,
    };
  });
  const [draft, setDraft] = useState(initial.draft);
  const [status, setStatus] = useState<EditorStatus>('idle');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [hideCompleted, setHideCompleted] = useState(false);
  const [moveCompletedDown, setMoveCompletedDown] = useState(readMoveCompletedPreference);

  const pendingDraftRef = useRef<ChecklistDraft>(initial.draft);
  const noteRef = useRef(note);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const saveChainRef = useRef<Promise<void>>(Promise.resolve());
  const mountedRef = useRef(false);

  const clearTimer = useCallback(() => {
    if (timerRef.current !== null) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  const persistLatest = useCallback(() => {
    const task = saveChainRef.current.then(async () => {
      const snapshot = {
        title: pendingDraftRef.current.title,
        items: pendingDraftRef.current.items.map((item) => ({ ...item })),
      };
      if (mountedRef.current) {
        setStatus('saving');
        setErrorMessage(null);
      }
      const current = noteRef.current;
      const saved = await repository.save(
        current.id,
        snapshot.title,
        snapshot.items,
        current.revision,
      );
      noteRef.current = saved.note;
      onSaved(saved.note, saved.items);
      if (mountedRef.current) setStatus('idle');

      const pending = pendingDraftRef.current;
      if (sameDraft(pending, snapshot)) clearChecklistEditorJournal();
      else {
        writeChecklistEditorJournal({
          noteId: saved.note.id,
          title: pending.title,
          items: pending.items,
        });
      }
      return saved;
    });

    const guarded = task.catch((error: unknown) => {
      const pending = pendingDraftRef.current;
      writeChecklistEditorJournal({
        noteId: noteRef.current.id,
        title: pending.title,
        items: pending.items,
      });
      if (mountedRef.current) {
        setStatus('error');
        setErrorMessage(toErrorMessage(error));
      }
      throw error;
    });
    saveChainRef.current = guarded.then(
      () => undefined,
      () => undefined,
    );
    return guarded;
  }, [onSaved, repository]);

  const scheduleSave = useCallback(
    (nextDraft: ChecklistDraft) => {
      writeChecklistEditorJournal({
        noteId: noteRef.current.id,
        title: nextDraft.title,
        items: nextDraft.items,
      });
      clearTimer();
      timerRef.current = setTimeout(() => {
        timerRef.current = null;
        void persistLatest();
      }, AUTOSAVE_DELAY_MS);
    },
    [clearTimer, persistLatest],
  );

  const updateDraft = useCallback(
    (nextDraft: ChecklistDraft) => {
      pendingDraftRef.current = nextDraft;
      setDraft(nextDraft);
      setStatus('idle');
      setErrorMessage(null);
      scheduleSave(nextDraft);
    },
    [scheduleSave],
  );

  const finish = useCallback(async () => {
    clearTimer();
    try {
      await persistLatest();
      clearChecklistEditorJournal();
      onClose();
      return true;
    } catch {
      return false;
    }
  }, [clearTimer, onClose, persistLatest]);

  const convertToText = useCallback(async () => {
    clearTimer();
    try {
      const saved = await persistLatest();
      const converted = await repository.convertChecklistToText(saved.note.id, saved.note.revision);
      clearChecklistEditorJournal();
      onConverted(converted);
      onClose();
    } catch (error) {
      if (mountedRef.current) {
        setStatus('error');
        setErrorMessage(toErrorMessage(error));
      }
    }
  }, [clearTimer, onClose, onConverted, persistLatest, repository]);

  const openHistory = useCallback(async () => {
    const saved = await finish();
    if (saved) onHistoryRequested(note.id);
  }, [finish, note.id, onHistoryRequested]);

  useEffect(() => {
    mountedRef.current = true;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      mountedRef.current = false;
      clearTimer();
      document.body.style.overflow = previousOverflow;
    };
  }, [clearTimer]);

  useEffect(() => {
    if (initial.journal) void persistLatest();
  }, [initial.journal, persistLatest]);

  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.visibilityState !== 'hidden') return;
      clearTimer();
      void persistLatest();
    };
    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => document.removeEventListener('visibilitychange', handleVisibilityChange);
  }, [clearTimer, persistLatest]);

  const handleKeyDown = (event: ReactKeyboardEvent<HTMLDivElement>) => {
    if (event.key === 'Escape' || (event.key === 'Enter' && (event.metaKey || event.ctrlKey))) {
      event.preventDefault();
      void finish();
    }
  };

  const handleLayerPointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (event.target === event.currentTarget) void finish();
  };

  return (
    <div className="note-editor-layer" onPointerDown={handleLayerPointerDown}>
      <div
        className="note-editor-dialog checklist-editor-dialog"
        data-color={note.color}
        role="dialog"
        aria-modal="true"
        aria-label="Edit checklist"
        onKeyDown={handleKeyDown}
      >
        <ChecklistEditorFields
          title={draft.title}
          items={draft.items}
          hideCompleted={hideCompleted}
          moveCompletedDown={moveCompletedDown}
          onTitleChange={(title) => updateDraft({ ...pendingDraftRef.current, title })}
          onItemsChange={(nextItems) =>
            updateDraft({ ...pendingDraftRef.current, items: nextItems })
          }
          onHideCompletedChange={setHideCompleted}
          onMoveCompletedDownChange={(enabled) => {
            setMoveCompletedDown(enabled);
            writeMoveCompletedPreference(enabled);
          }}
        />

        <div className="note-editor-footer">
          <div className="note-editor-state" aria-live="polite">
            {status === 'saving' ? <span>Saving…</span> : null}
            {errorMessage ? (
              <span className="note-editor-error" role="alert">
                {errorMessage}
                <button type="button" onClick={() => void persistLatest()}>
                  Retry
                </button>
              </span>
            ) : null}
          </div>
          <div className="note-editor-footer-actions">
            <button
              className="note-editor-secondary"
              type="button"
              onClick={() => void openHistory()}
            >
              <History aria-hidden="true" /> History
            </button>
            <button
              className="note-editor-secondary"
              type="button"
              onClick={() => void convertToText()}
            >
              Convert to text
            </button>
            <button className="note-editor-close" type="button" onClick={() => void finish()}>
              Close
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function toDraftItem(item: ChecklistItemRecord): ChecklistDraftItem {
  return { id: item.id, text: item.text, checked: item.checked, parentId: item.parentId };
}

function sameDraft(a: ChecklistDraft, b: ChecklistDraft): boolean {
  return a.title === b.title && JSON.stringify(a.items) === JSON.stringify(b.items);
}

function readMoveCompletedPreference(): boolean {
  try {
    return window.localStorage.getItem(MOVE_COMPLETED_KEY) !== 'false';
  } catch {
    return true;
  }
}

function writeMoveCompletedPreference(enabled: boolean): void {
  try {
    window.localStorage.setItem(MOVE_COMPLETED_KEY, String(enabled));
  } catch {
    // Preference persistence is best effort.
  }
}

function toErrorMessage(error: unknown): string {
  if (error instanceof Error && error.message.trim()) return error.message;
  return 'This checklist could not be saved. Your edit is still stored locally for recovery.';
}