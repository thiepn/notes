import { useCallback, useEffect, useRef, useState } from 'react';

import type { NoteRecord, NotesRepository } from '../../db';
import { clearEditorJournal, readEditorJournal, writeEditorJournal } from './editorJournal';

const AUTOSAVE_DELAY_MS = 180;

type EditorStatus = 'idle' | 'saving' | 'error';

interface EditorDraft {
  title: string;
  content: string;
}

interface UseExistingNoteEditorOptions {
  note: NoteRecord;
  repository: NotesRepository;
  onSaved(note: NoteRecord): void;
  beforeClose?: ((note: NoteRecord) => Promise<void>) | undefined;
  onClose(): void;
}

export function useExistingNoteEditor({
  note,
  repository,
  onSaved,
  beforeClose,
  onClose,
}: UseExistingNoteEditorOptions) {
  const [initialEditor] = useState(() => {
    const journal = readEditorJournal();
    const recovered = journal?.noteId === note.id ? journal : null;

    return {
      journal: recovered,
      draft: {
        title: recovered?.title ?? note.title,
        content: recovered?.content ?? note.content,
      } satisfies EditorDraft,
    };
  });

  const [draft, setDraft] = useState<EditorDraft>(initialEditor.draft);
  const [status, setStatus] = useState<EditorStatus>('idle');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const pendingDraftRef = useRef<EditorDraft>(initialEditor.draft);
  const noteRef = useRef<NoteRecord>(note);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const saveChainRef = useRef<Promise<void>>(Promise.resolve());
  const mountedRef = useRef(false);

  const clearTimer = useCallback(() => {
    if (timerRef.current !== null) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  const persistLatest = useCallback((): Promise<NoteRecord> => {
    const task = saveChainRef.current.then(async () => {
      const snapshot = { ...pendingDraftRef.current };
      const current = noteRef.current;

      if (mountedRef.current) {
        setStatus('saving');
        setErrorMessage(null);
      }

      const saved =
        current.title === snapshot.title && current.content === snapshot.content
          ? current
          : await repository.update(
              current.id,
              { title: snapshot.title, content: snapshot.content },
              current.revision,
            );

      noteRef.current = saved;
      onSaved(saved);

      if (mountedRef.current) {
        setStatus('idle');
      }

      const pending = pendingDraftRef.current;
      if (pending.title === snapshot.title && pending.content === snapshot.content) {
        clearEditorJournal();
      } else {
        writeEditorJournal({
          noteId: saved.id,
          title: pending.title,
          content: pending.content,
        });
      }

      return saved;
    });

    const guardedTask = task.catch((error: unknown) => {
      const pending = pendingDraftRef.current;
      writeEditorJournal({
        noteId: noteRef.current.id,
        title: pending.title,
        content: pending.content,
      });

      if (mountedRef.current) {
        setStatus('error');
        setErrorMessage(toErrorMessage(error));
      }

      throw error;
    });

    saveChainRef.current = guardedTask.then(
      () => undefined,
      () => undefined,
    );

    return guardedTask;
  }, [onSaved, repository]);

  const scheduleSave = useCallback(
    (nextDraft: EditorDraft) => {
      writeEditorJournal({
        noteId: noteRef.current.id,
        title: nextDraft.title,
        content: nextDraft.content,
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
    (patch: Partial<EditorDraft>) => {
      const nextDraft = { ...pendingDraftRef.current, ...patch };
      pendingDraftRef.current = nextDraft;
      setDraft(nextDraft);
      setStatus('idle');
      setErrorMessage(null);
      scheduleSave(nextDraft);
    },
    [scheduleSave],
  );

  const saveNow = useCallback(async (): Promise<NoteRecord | null> => {
    clearTimer();
    try {
      return await persistLatest();
    } catch {
      return null;
    }
  }, [clearTimer, persistLatest]);

  const finishEditing = useCallback(async (): Promise<boolean> => {
    const saved = await saveNow();
    if (!saved) return false;

    try {
      if (beforeClose) await beforeClose(saved);
      clearEditorJournal();
      onClose();
      return true;
    } catch (error) {
      if (mountedRef.current) {
        setStatus('error');
        setErrorMessage(toErrorMessage(error));
      }
      return false;
    }
  }, [beforeClose, onClose, saveNow]);

  const retrySave = useCallback(() => {
    clearTimer();
    void persistLatest();
  }, [clearTimer, persistLatest]);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      clearTimer();
    };
  }, [clearTimer]);

  useEffect(() => {
    if (!initialEditor.journal) return;
    void persistLatest();
  }, [initialEditor.journal, persistLatest]);

  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.visibilityState !== 'hidden') return;
      clearTimer();
      void persistLatest();
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => document.removeEventListener('visibilitychange', handleVisibilityChange);
  }, [clearTimer, persistLatest]);

  return {
    draft,
    errorMessage,
    status,
    setTitle: (title: string) => updateDraft({ title }),
    setContent: (content: string) => updateDraft({ content }),
    saveNow,
    finishEditing,
    retrySave,
  };
}

function toErrorMessage(error: unknown): string {
  if (error instanceof Error && error.message.trim()) return error.message;
  return 'This note could not be saved. Your edit is still stored locally for recovery.';
}