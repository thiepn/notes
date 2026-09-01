import { useMemo, useState, type ReactNode } from 'react';
import { AlertTriangle, ArrowUpRight, Link2, Sparkles } from 'lucide-react';

import type { NoteRecord, NotesRepository } from '../../db';
import { analyzeNoteConnections, linkUnlinkedMentions } from './linkIntelligence';

interface ConnectionsPanelProps {
  note: NoteRecord;
  library: NoteRecord[];
  repository: NotesRepository;
  beforeLinking(): Promise<NoteRecord | null>;
  onOpenNote(noteId: string): void;
  onSourceSaved(note: NoteRecord): void;
  onLibraryChanged(): Promise<void>;
}

export function ConnectionsPanel({
  note,
  library,
  repository,
  beforeLinking,
  onOpenNote,
  onSourceSaved,
  onLibraryChanged,
}: ConnectionsPanelProps) {
  const connections = useMemo(() => analyzeNoteConnections(note, library), [library, note]);
  const [linkingNoteId, setLinkingNoteId] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const title = note.title.trim();
  const connectionCount = connections.outgoing.length + connections.backlinks.length;

  const linkMention = async (sourceId: string) => {
    setErrorMessage(null);
    setLinkingNoteId(sourceId);
    try {
      const savedTarget = await beforeLinking();
      if (!savedTarget?.title.trim()) return;
      const source = await repository.require(sourceId);
      if (source.type !== 'text' || source.trashedAt !== null) return;
      const nextContent = linkUnlinkedMentions(source.content, savedTarget.title);
      if (nextContent === source.content) return;
      const savedSource = await repository.update(
        source.id,
        { content: nextContent },
        source.revision,
      );
      onSourceSaved(savedSource);
      await onLibraryChanged();
    } catch {
      setErrorMessage('That mention could not be linked. The source note may have changed.');
    } finally {
      setLinkingNoteId(null);
    }
  };

  return (
    <section className="note-connections" aria-label="Connections">
      <div className="note-connections-heading">
        <div>
          <span className="note-connections-title">
            <Link2 aria-hidden="true" /> Connections
          </span>
          <span className="note-connections-summary">
            {connectionCount} {connectionCount === 1 ? 'linked note' : 'linked notes'} ·{' '}
            {connections.unlinkedMentions.length}{' '}
            {connections.unlinkedMentions.length === 1 ? 'unlinked mention' : 'unlinked mentions'}
          </span>
        </div>
      </div>

      {!title ? (
        <p className="note-connections-empty">
          Add a title to this note to resolve backlinks and discover unlinked mentions.
        </p>
      ) : connections.titleCollisionCount > 1 ? (
        <div className="note-connections-warning" role="status">
          <AlertTriangle aria-hidden="true" />
          <span>
            {connections.titleCollisionCount} notes use the title “{title}”. WikiLinks to this title
            are ambiguous until the titles are unique.
          </span>
        </div>
      ) : null}

      {connections.outgoing.length > 0 ? (
        <ConnectionGroup title="Links from this note">
          {connections.outgoing.map((link) => {
            const resolution = link.resolution;
            const countLabel = link.count > 1 ? ` ×${link.count}` : '';
            if (resolution.status === 'resolved' && resolution.noteId) {
              const resolvedNoteId = resolution.noteId;
              return (
                <button
                  className="note-connection-row"
                  type="button"
                  key={resolution.normalizedTitle}
                  onClick={() => onOpenNote(resolvedNoteId)}
                >
                  <span>{link.title}</span>
                  <span className="note-connection-meta">
                    Linked{countLabel} <ArrowUpRight aria-hidden="true" />
                  </span>
                </button>
              );
            }

            return (
              <div
                className="note-connection-row"
                data-status={resolution.status}
                key={resolution.normalizedTitle || link.title}
              >
                <span>{link.title}</span>
                <span className="note-connection-meta">
                  {resolution.status === 'missing' ? 'Missing target' : 'Ambiguous target'}
                  {countLabel}
                </span>
              </div>
            );
          })}
        </ConnectionGroup>
      ) : null}

      {connections.backlinks.length > 0 ? (
        <ConnectionGroup title="Backlinks">
          {connections.backlinks.map((backlink) => (
            <button
              className="note-connection-row"
              type="button"
              key={backlink.note.id}
              onClick={() => onOpenNote(backlink.note.id)}
            >
              <span>{backlink.note.title || 'Untitled note'}</span>
              <span className="note-connection-meta">
                {backlink.count > 1 ? `${backlink.count} links` : '1 link'}{' '}
                <ArrowUpRight aria-hidden="true" />
              </span>
            </button>
          ))}
        </ConnectionGroup>
      ) : null}

      {connections.unlinkedMentions.length > 0 ? (
        <ConnectionGroup title="Unlinked mentions" icon={<Sparkles aria-hidden="true" />}>
          {connections.unlinkedMentions.map((mention) => (
            <div className="note-unlinked-mention" key={mention.note.id}>
              <button
                className="note-unlinked-source"
                type="button"
                onClick={() => onOpenNote(mention.note.id)}
              >
                <span>{mention.note.title || 'Untitled note'}</span>
                <span>{mention.snippet}</span>
              </button>
              <button
                className="note-unlinked-link"
                type="button"
                disabled={linkingNoteId !== null || connections.titleCollisionCount !== 1}
                onClick={() => void linkMention(mention.note.id)}
              >
                {linkingNoteId === mention.note.id
                  ? 'Linking…'
                  : mention.count > 1
                    ? `Link ${mention.count} mentions`
                    : 'Link mention'}
              </button>
            </div>
          ))}
        </ConnectionGroup>
      ) : null}

      {title && connectionCount === 0 && connections.unlinkedMentions.length === 0 ? (
        <p className="note-connections-empty">
          No links or unlinked mentions found for this note yet.
        </p>
      ) : null}

      {errorMessage ? (
        <p className="note-connections-error" role="alert">
          {errorMessage}
        </p>
      ) : null}
    </section>
  );
}

function ConnectionGroup({
  title,
  icon,
  children,
}: {
  title: string;
  icon?: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className="note-connection-group">
      <h3>
        {icon}
        {title}
      </h3>
      <div className="note-connection-list">{children}</div>
    </div>
  );
}
