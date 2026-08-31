import { Archive, Copy, Pin, PinOff, RotateCcw, Trash2 } from 'lucide-react';

import { IconButton } from '../../components/ui/IconButton';
import type { NoteRecord } from '../../db';

export type NoteCollectionMode = 'notes' | 'archive' | 'trash';

export interface NoteCardActions {
  open(note: NoteRecord): void;
  togglePin(note: NoteRecord): void;
  archive(note: NoteRecord): void;
  unarchive(note: NoteRecord): void;
  trash(note: NoteRecord): void;
  restore(note: NoteRecord): void;
  duplicate(note: NoteRecord): void;
  deletePermanently(note: NoteRecord): void;
}

interface NoteCardProps {
  note: NoteRecord;
  mode: NoteCollectionMode;
  actions: NoteCardActions;
}

export function NoteCard({ note, mode, actions }: NoteCardProps) {
  const label = noteLabel(note);
  const canOpen = mode !== 'trash';

  return (
    <article
      className="note-card"
      data-note-card
      data-note-id={note.id}
      data-color={note.color}
      data-pinned={note.pinnedAt !== null}
    >
      {canOpen ? (
        <button
          className="note-card-open"
          type="button"
          aria-label={`Open note: ${label}`}
          onClick={() => actions.open(note)}
        >
          <NoteCardContent note={note} />
        </button>
      ) : (
        <div className="note-card-open" data-readonly="true">
          <NoteCardContent note={note} />
        </div>
      )}

      {mode === 'notes' ? (
        <div className="note-card-pin-action">
          <IconButton
            className="note-card-action"
            label={`${note.pinnedAt !== null ? 'Unpin' : 'Pin'} note: ${label}`}
            onClick={() => actions.togglePin(note)}
          >
            {note.pinnedAt !== null ? <PinOff /> : <Pin />}
          </IconButton>
        </div>
      ) : null}

      <div className="note-card-actions">
        {mode === 'notes' ? (
          <IconButton
            className="note-card-action"
            label={`Archive note: ${label}`}
            onClick={() => actions.archive(note)}
          >
            <Archive />
          </IconButton>
        ) : null}

        {mode === 'archive' ? (
          <IconButton
            className="note-card-action"
            label={`Unarchive note: ${label}`}
            onClick={() => actions.unarchive(note)}
          >
            <RotateCcw />
          </IconButton>
        ) : null}

        {mode !== 'trash' ? (
          <IconButton
            className="note-card-action"
            label={`Duplicate note: ${label}`}
            onClick={() => actions.duplicate(note)}
          >
            <Copy />
          </IconButton>
        ) : null}

        {mode !== 'trash' ? (
          <IconButton
            className="note-card-action"
            label={`Move note to trash: ${label}`}
            onClick={() => actions.trash(note)}
          >
            <Trash2 />
          </IconButton>
        ) : null}

        {mode === 'trash' ? (
          <>
            <IconButton
              className="note-card-action"
              label={`Restore note: ${label}`}
              onClick={() => actions.restore(note)}
            >
              <RotateCcw />
            </IconButton>
            <IconButton
              className="note-card-action note-card-action-danger"
              label={`Delete note permanently: ${label}`}
              onClick={() => actions.deletePermanently(note)}
            >
              <Trash2 />
            </IconButton>
          </>
        ) : null}
      </div>
    </article>
  );
}

function NoteCardContent({ note }: { note: NoteRecord }) {
  return (
    <>
      {note.title ? <span className="note-card-title">{note.title}</span> : null}
      {note.content ? <span className="note-card-body">{note.content}</span> : null}
      {!note.title && !note.content ? <span className="note-card-empty">Empty note</span> : null}
    </>
  );
}

function noteLabel(note: NoteRecord): string {
  return note.title.trim() || firstMeaningfulLine(note.content) || 'Untitled note';
}

function firstMeaningfulLine(content: string): string {
  return (
    content
      .split(/\r?\n/u)
      .map((line) => line.trim())
      .find(Boolean)
      ?.slice(0, 80) ?? ''
  );
}
