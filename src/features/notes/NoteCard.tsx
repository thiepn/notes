import { Pin } from 'lucide-react';

import type { NoteRecord } from '../../db';

interface NoteCardProps {
  note: NoteRecord;
  onOpen(noteId: string): void;
}

export function NoteCard({ note, onOpen }: NoteCardProps) {
  const label = note.title.trim() || firstMeaningfulLine(note.content) || 'Untitled note';

  return (
    <button
      className="note-card"
      type="button"
      data-note-card
      data-note-id={note.id}
      data-color={note.color}
      aria-label={`Open note: ${label}`}
      onClick={() => onOpen(note.id)}
    >
      {note.pinnedAt !== null ? (
        <span className="note-card-pin" aria-label="Pinned">
          <Pin aria-hidden="true" />
        </span>
      ) : null}

      {note.title ? <span className="note-card-title">{note.title}</span> : null}
      {note.content ? <span className="note-card-body">{note.content}</span> : null}
      {!note.title && !note.content ? <span className="note-card-empty">Empty note</span> : null}
    </button>
  );
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
