import { useCallback, useEffect, useRef, useState } from 'react';

import type { NoteRecord, NotesRepository } from '../../db';
import {
  clearCaptureJournal,
  isMeaningfulDraft,
  readCaptureJournal,
  writeCaptureJournal,
  type CaptureDraft,
  type CaptureJournal,
} from './captureJournal';

const AUTOSAVE_DELAY_MS = 180;
const EMPTY_DRAFT: CaptureDraft = { title: '', content: '' };

type CaptureStatus = 'idle' | 'saving' | 'error';

interface UseTextNoteCaptureOptions {
  repository: NotesRepository;
  onSaved(note: NoteRecord): void;
  onRemoved(noteId: string): void;
}

export function useTextNoteCapture({
  repository,
  onSaved,
  onRemoved,
}: UseTextNoteCaptureOptions) {
  const initialJournalRef = useRef<CaptureJournal | null | undefined>(undefined);
  if (initialJournalRef.current === undefined) {
    initialJournalRef.current = readCaptureJournal();
  }

  const initialJournal = initialJournalRef.current;
  const initialDraft: CaptureDraft = initialJournal
    ? { title: initialJournal.title, content: initialJournal.content }
    : EMPTY_DRAFT;

  const [draft, setDraft] = useState<CaptureDraft>(initialDraft);
  const [expanded, setExpanded] = useState(
    Boolean(initialJournal && isMeaningfulDraft(initialJournal)),
  );
  const [activeNoteId, setActiveNoteId] = useState<string | null>(
    initialJournal?.noteId ?? null,
  );
  const [status, setStatus] = useState<CaptureStatus>('idle');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const pendingDraftRef = useRef<CaptureDraft>(initialDraft);
  const noteRef = useRef<NoteRecord | null>(null);
  const noteIdRef = useRef<string | null>(initialJournal?.noteId ?? null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const saveChainRef = useRef<Promise<void>>(Promise.resolve());
  const mountedRef = useRef(false);

  const clearTimer = useCallback(() => {
    if (timerRef.current !== null) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  const persistLatest = useCallback((): Promise<NoteRecord | null> => {
    const task = saveChainRef.current.then(async () => {
      const snapshot = { ...pendingDraftRef.current };
      if (!isMeaningfulDraft(snapshot)) return null;

      if (mountedRef.current) {
        setStatus('saving');
        setErrorMessage(null);
      }

      let note = noteRef.current;
      const journalNoteId = noteIdRef.current;
      if (!note && journalNoteId) {
        note = (await repository.get(journalNoteId)) ?? null;
      }

      if (!note) {
        note = await repository.create({
          type: 'text',
          title: snapshot.title,
          content: snapshot.content,
        });
      } else if (note.title !== snapshot.title || note.content !== snapshot.content) {
        note = await repository.update(
          note.id,
          { title: snapshot.title, content: snapshot.content },
          note.revision,
        );
      }

      noteRef.current = note;
      noteIdRef.current = note.id;
      onSaved(note);

      if (mountedRef.current) {
        setActiveNoteId(note.id);
        setStatus('idle');
      }

      const pending = pendingDraftRef.current;
      if (pending.title === snapshot.title && pending.content === snapshot.content) {
        clearCaptureJournal();
      } else {
        writeCaptureJournal({
          noteId: note.id,
          title: pending.title,
          content: pending.content,
        });
      }

      return note;
    });

    const guardedTask = task.catch((error: unknown) => {
      const pending = pendingDraftRef.current;
      writeCaptureJournal({
        noteId: noteIdRef.current,
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
    (nextDraft: CaptureDraft) => {
      writeCaptureJournal({
        noteId: noteIdRef.current,
        title: nextDraft.title,
        content: nextDraft.content,
      });

      clearTimer();
      if (!isMeaningfulDraft(nextDraft)) return;

      timerRef.current = setTimeout(() => {
        timerRef.current = null;
        void persistLatest();
      }, AUTOSAVE_DELAY_MS);
    },
    [clearTimer, persistLatest],
  );

  const updateDraft = useCallback(
    (patch: Partial<CaptureDraft>) => {
      const nextDraft = { ...pendingDraftRef.current, ...patch };
      pendingDraftRef.current = nextDraft;
      setDraft(nextDraft);
      setErrorMessage(null);
      if (status === 'error') setStatus('idle');
      scheduleSave(nextDraft);
    },
    [scheduleSave, status],
  );

  const resetCapture = useCallback(() => {
    clearTimer();
    pendingDraftRef.current = EMPTY_DRAFT;
    noteRef.current = null;
    noteIdRef.current = null;
    clearCaptureJournal();
    setDraft(EMPTY_DRAFT);
    setActiveNoteId(null);
    setStatus('idle');
    setErrorMessage(null);
    setExpanded(false);
  }, [clearTimer]);

  const finishCapture = useCallback(async (): Promise<boolean> => {
    clearTimer();
    const pending = pendingDraftRef.current;

    if (!isMeaningfulDraft(pending)) {
      const noteId = noteIdRef.current;
      if (noteId) {
        try {
          await repository.deletePermanently(noteId);
          onRemoved(noteId);
        } catch (error) {
          if (mountedRef.current) {
            setStatus('error');
            setErrorMessage(toErrorMessage(error));
          }
          return false;
        }
      }

      resetCapture();
      return true;
    }

    try {
      await persistLatest();
      resetCapture();
      return true;
    } catch {
      return false;
    }
  }, [clearTimer, onRemoved, persistLatest, repository, resetCapture]);

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
    const journal = initialJournalRef.current;
    if (!journal) return;

    if (!isMeaningfulDraft(journal)) {
      const journalNoteId = journal.noteId;
      if (journalNoteId) {
        void repository
          .deletePermanently(journalNoteId)
          .then(() => onRemoved(journalNoteId))
          .finally(() => clearCaptureJournal());
      } else {
        clearCaptureJournal();
      }
      return;
    }

    void persistLatest();
  }, [onRemoved, persistLatest, repository]);

  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.visibilityState !== 'hidden') return;
      if (!isMeaningfulDraft(pendingDraftRef.current)) return;

      clearTimer();
      void persistLatest();
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => document.removeEventListener('visibilitychange', handleVisibilityChange);
  }, [clearTimer, persistLatest]);

  return {
    activeNoteId,
    draft,
    errorMessage,
    expanded,
    status,
    openCapture: () => setExpanded(true),
    setTitle: (title: string) => updateDraft({ title }),
    setContent: (content: string) => updateDraft({ content }),
    finishCapture,
    retrySave,
  };
}

function toErrorMessage(error: unknown): string {
  if (error instanceof Error && error.message.trim()) return error.message;
  return 'This note could not be saved. Your draft is still stored locally for recovery.';
}
