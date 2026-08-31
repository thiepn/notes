import {
  useEffect,
  useLayoutEffect,
  useRef,
  type KeyboardEvent as ReactKeyboardEvent,
} from 'react';
import { ImagePlus, ListChecks } from 'lucide-react';

import type { NoteRecord, NotesRepository } from '../../db';
import { useTextNoteCapture } from './useTextNoteCapture';

interface TextNoteComposerProps {
  repository: NotesRepository;
  beforeSaved?: ((note: NoteRecord) => Promise<void>) | undefined;
  onSaved(note: NoteRecord): void;
  onRemoved(noteId: string): void;
  onActiveNoteChange(noteId: string | null): void;
  onChecklistRequested(): void;
}

export function TextNoteComposer({
  repository,
  beforeSaved,
  onSaved,
  onRemoved,
  onActiveNoteChange,
  onChecklistRequested,
}: TextNoteComposerProps) {
  const composerRef = useRef<HTMLDivElement>(null);
  const bodyRef = useRef<HTMLTextAreaElement>(null);
  const {
    activeNoteId,
    draft,
    errorMessage,
    expanded,
    status,
    openCapture,
    setTitle,
    setContent,
    finishCapture,
    retrySave,
  } = useTextNoteCapture({ repository, beforeSaved, onSaved, onRemoved });

  useEffect(() => {
    onActiveNoteChange(activeNoteId);
  }, [activeNoteId, onActiveNoteChange]);

  useEffect(() => {
    if (!expanded) return;
    const handlePointerDown = (event: PointerEvent) => {
      const target = event.target;
      if (!(target instanceof Node)) return;
      if (composerRef.current?.contains(target)) return;
      void finishCapture();
    };
    document.addEventListener('pointerdown', handlePointerDown, true);
    return () => document.removeEventListener('pointerdown', handlePointerDown, true);
  }, [expanded, finishCapture]);

  useLayoutEffect(() => {
    const textarea = bodyRef.current;
    if (!textarea || !expanded) return;
    textarea.style.height = 'auto';
    textarea.style.height = `${textarea.scrollHeight}px`;
  }, [draft.content, expanded]);

  const handleKeyDown = (event: ReactKeyboardEvent<HTMLDivElement>) => {
    if (event.key === 'Escape') {
      event.preventDefault();
      void finishCapture();
      return;
    }
    if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) {
      event.preventDefault();
      void finishCapture();
    }
  };

  if (!expanded) {
    return (
      <div className="note-composer-collapsed" aria-label="Create a note">
        <button
          className="note-composer-main-action"
          type="button"
          aria-label="Create a text note"
          aria-expanded="false"
          onClick={openCapture}
        >
          Take a note…
        </button>
        <div className="note-composer-hints">
          <button
            className="note-composer-quick-action"
            type="button"
            aria-label="Create a checklist"
            title="New checklist"
            onClick={onChecklistRequested}
          >
            <ListChecks aria-hidden="true" />
          </button>
          <span className="note-composer-future-action" aria-hidden="true">
            <ImagePlus />
          </span>
        </div>
      </div>
    );
  }

  return (
    <div
      ref={composerRef}
      className="note-composer"
      role="form"
      aria-label="New note"
      onKeyDown={handleKeyDown}
    >
      <input
        className="note-composer-title"
        type="text"
        value={draft.title}
        aria-label="Title"
        placeholder="Title"
        autoComplete="off"
        onChange={(event) => setTitle(event.target.value)}
      />
      <textarea
        ref={bodyRef}
        className="note-composer-body"
        value={draft.content}
        aria-label="Note text"
        placeholder="Take a note…"
        rows={1}
        autoFocus
        onChange={(event) => setContent(event.target.value)}
      />
      <div className="note-composer-footer">
        <div className="note-composer-state" aria-live="polite">
          {status === 'saving' ? <span>Saving…</span> : null}
          {errorMessage ? (
            <span className="note-composer-error" role="alert">
              {errorMessage}
              <button type="button" onClick={retrySave}>
                Retry
              </button>
            </span>
          ) : null}
        </div>
        <button className="note-composer-close" type="button" onClick={() => void finishCapture()}>
          Close
        </button>
      </div>
    </div>
  );
}
