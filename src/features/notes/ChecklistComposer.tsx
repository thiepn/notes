import { useCallback, useEffect, useRef, useState, type KeyboardEvent as ReactKeyboardEvent } from 'react';

import type {
  ChecklistDraftItem,
  ChecklistItemRecord,
  ChecklistsRepository,
  NoteRecord,
  NotesRepository,
} from '../../db';
import {
  clearChecklistCaptureJournal,
  readChecklistCaptureJournal,
  writeChecklistCaptureJournal,
} from './checklistJournal';
import { createChecklistDraftItem, isMeaningfulChecklist } from './checklistModel';
import { ChecklistEditorFields } from './ChecklistEditorFields';

const AUTOSAVE_DELAY_MS = 180;
const MOVE_COMPLETED_KEY = 'notes.checklist.move-completed';

type ChecklistStatus = 'idle' | 'saving' | 'error';

interface ChecklistComposerProps {
  repository: ChecklistsRepository;
  notesRepository: NotesRepository;
  beforeSaved?: ((note: NoteRecord) => Promise<void>) | undefined;
  onSaved(note: NoteRecord, items: ChecklistItemRecord[]): void;
  onRemoved(noteId: string): void;
  onActiveNoteChange(noteId: string | null): void;
  onFinished(): void;
}

interface ChecklistDraft {
  title: string;
  items: ChecklistDraftItem[];
}

export function ChecklistComposer({
  repository,
  notesRepository,
  beforeSaved,
  onSaved,
  onRemoved,
  onActiveNoteChange,
  onFinished,
}: ChecklistComposerProps) {
  const [initial] = useState(() => {
    const journal = readChecklistCaptureJournal();
    return {
      journal,
      draft: {
        title: journal?.title ?? '',
        items: journal?.items.length ? journal.items : [createChecklistDraftItem()],
      } satisfies ChecklistDraft,
      noteId: journal?.noteId ?? null,
    };
  });
  const [draft, setDraft] = useState(initial.draft);
  const [status, setStatus] = useState<ChecklistStatus>('idle');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [hideCompleted, setHideCompleted] = useState(false);
  const [moveCompletedDown, setMoveCompletedDown] = useState(readMoveCompletedPreference);

  const composerRef = useRef<HTMLDivElement>(null);
  const pendingDraftRef = useRef<ChecklistDraft>(initial.draft);
  const noteRef = useRef<NoteRecord | null>(null);
  const noteIdRef = useRef<string | null>(initial.noteId);
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
      const snapshot: ChecklistDraft = {
        title: pendingDraftRef.current.title,
        items: pendingDraftRef.current.items.map((item) => ({ ...item })),
      };
      if (!isMeaningfulChecklist(snapshot.title, snapshot.items)) return null;

      if (mountedRef.current) {
        setStatus('saving');
        setErrorMessage(null);
      }

      let current = noteRef.current;
      const journalNoteId = noteIdRef.current;
      if (!current && journalNoteId) {
        current = (await notesRepository.get(journalNoteId)) ?? null;
      }

      const saved = current
        ? await repository.save(current.id, snapshot.title, snapshot.items, current.revision)
        : await repository.create(snapshot.title, snapshot.items);

      if (beforeSaved) await beforeSaved(saved.note);
      noteRef.current = saved.note;
      noteIdRef.current = saved.note.id;
      onSaved(saved.note, saved.items);
      if (mountedRef.current) {
        setStatus('idle');
        onActiveNoteChange(saved.note.id);
      }

      const pending = pendingDraftRef.current;
      if (sameDraft(pending, snapshot)) {
        clearChecklistCaptureJournal();
      } else {
        writeChecklistCaptureJournal({
          noteId: saved.note.id,
          title: pending.title,
          items: pending.items,
        });
      }
      return saved;
    });

    const guarded = task.catch((error: unknown) => {
      const pending = pendingDraftRef.current;
      writeChecklistCaptureJournal({
        noteId: noteIdRef.current,
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
  }, [beforeSaved, notesRepository, onActiveNoteChange, onSaved, repository]);

  const scheduleSave = useCallback(
    (nextDraft: ChecklistDraft) => {
      writeChecklistCaptureJournal({
        noteId: noteIdRef.current,
        title: nextDraft.title,
        items: nextDraft.items,
      });
      clearTimer();
      if (!isMeaningfulChecklist(nextDraft.title, nextDraft.items)) return;
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

  const reset = useCallback(() => {
    clearTimer();
    const empty = { title: '', items: [createChecklistDraftItem()] } satisfies ChecklistDraft;
    pendingDraftRef.current = empty;
    noteRef.current = null;
    noteIdRef.current = null;
    clearChecklistCaptureJournal();
    setDraft(empty);
    setStatus('idle');
    setErrorMessage(null);
    onActiveNoteChange(null);
    onFinished();
  }, [clearTimer, onActiveNoteChange, onFinished]);

  const finish = useCallback(async () => {
    clearTimer();
    const pending = pendingDraftRef.current;
    if (!isMeaningfulChecklist(pending.title, pending.items)) {
      const noteId = noteIdRef.current;
      if (noteId) {
        try {
          await notesRepository.deletePermanently(noteId);
          onRemoved(noteId);
        } catch (error) {
          if (mountedRef.current) {
            setStatus('error');
            setErrorMessage(toErrorMessage(error));
          }
          return false;
        }
      }
      reset();
      return true;
    }

    try {
      await persistLatest();
      reset();
      return true;
    } catch {
      return false;
    }
  }, [clearTimer, notesRepository, onRemoved, persistLatest, reset]);

  useEffect(() => {
    mountedRef.current = true;
    onActiveNoteChange(initial.noteId);
    return () => {
      mountedRef.current = false;
      clearTimer();
    };
  }, [clearTimer, initial.noteId, onActiveNoteChange]);

  useEffect(() => {
    const journal = initial.journal;
    if (!journal) return;
    if (!isMeaningfulChecklist(journal.title, journal.items)) {
      if (journal.noteId) {
        void notesRepository
          .deletePermanently(journal.noteId)
          .then(() => onRemoved(journal.noteId ?? ''))
          .finally(clearChecklistCaptureJournal);
      } else {
        clearChecklistCaptureJournal();
      }
      return;
    }
    void persistLatest();
  }, [initial.journal, notesRepository, onRemoved, persistLatest]);

  useEffect(() => {
    const handlePointerDown = (event: PointerEvent) => {
      const target = event.target;
      if (!(target instanceof Node)) return;
      if (composerRef.current?.contains(target)) return;
      void finish();
    };
    document.addEventListener('pointerdown', handlePointerDown, true);
    return () => document.removeEventListener('pointerdown', handlePointerDown, true);
  }, [finish]);

  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.visibilityState !== 'hidden') return;
      if (!isMeaningfulChecklist(pendingDraftRef.current.title, pendingDraftRef.current.items)) return;
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

  return (
    <div
      ref={composerRef}
      className="note-composer checklist-composer"
      role="form"
      aria-label="New checklist"
      onKeyDown={handleKeyDown}
    >
      <ChecklistEditorFields
        title={draft.title}
        items={draft.items}
        hideCompleted={hideCompleted}
        moveCompletedDown={moveCompletedDown}
        autoFocusFirst
        onTitleChange={(title) => updateDraft({ ...pendingDraftRef.current, title })}
        onItemsChange={(items) => updateDraft({ ...pendingDraftRef.current, items })}
        onHideCompletedChange={setHideCompleted}
        onMoveCompletedDownChange={(enabled) => {
          setMoveCompletedDown(enabled);
          writeMoveCompletedPreference(enabled);
        }}
      />

      <div className="note-composer-footer">
        <div className="note-composer-state" aria-live="polite">
          {status === 'saving' ? <span>Saving…</span> : null}
          {errorMessage ? (
            <span className="note-composer-error" role="alert">
              {errorMessage}
              <button type="button" onClick={() => void persistLatest()}>
                Retry
              </button>
            </span>
          ) : null}
        </div>
        <button className="note-composer-close" type="button" onClick={() => void finish()}>
          Close
        </button>
      </div>
    </div>
  );
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
  return 'This checklist could not be saved. Your draft is still stored locally for recovery.';
}
