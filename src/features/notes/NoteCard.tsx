import { useEffect, useRef, useState } from 'react';
import { Archive, Copy, Palette, Pin, PinOff, RotateCcw, Tag, Trash2 } from 'lucide-react';

import { IconButton } from '../../components/ui/IconButton';
import type { ChecklistItemRecord, LabelRecord, NoteColor, NoteRecord } from '../../db';
import { NoteColorPicker } from './NoteColorPicker';
import { NoteLabelPicker } from './NoteLabelPicker';

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
  setColor(note: NoteRecord, color: NoteColor): void;
  setLabels(note: NoteRecord, labelIds: string[]): void;
}

interface NoteCardProps {
  note: NoteRecord;
  mode: NoteCollectionMode;
  actions: NoteCardActions;
  labels: LabelRecord[];
  selectedLabelIds: string[];
  checklistItems: ChecklistItemRecord[];
}

type OrganizationPanel = 'color' | 'labels' | null;

export function NoteCard({
  note,
  mode,
  actions,
  labels,
  selectedLabelIds,
  checklistItems,
}: NoteCardProps) {
  const cardRef = useRef<HTMLElement>(null);
  const [openPanel, setOpenPanel] = useState<OrganizationPanel>(null);
  const label = noteLabel(note, checklistItems);
  const canOpen = mode !== 'trash';
  const selectedLabels = labels.filter((item) => selectedLabelIds.includes(item.id));

  useEffect(() => {
    if (!openPanel) return;
    const handlePointerDown = (event: PointerEvent) => {
      const target = event.target;
      if (!(target instanceof Node)) return;
      if (cardRef.current?.contains(target)) return;
      setOpenPanel(null);
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpenPanel(null);
    };
    document.addEventListener('pointerdown', handlePointerDown, true);
    window.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('pointerdown', handlePointerDown, true);
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [openPanel]);

  return (
    <article
      ref={cardRef}
      className="note-card"
      data-note-card
      data-note-id={note.id}
      data-note-type={note.type}
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
          <NoteCardContent note={note} labels={selectedLabels} checklistItems={checklistItems} />
        </button>
      ) : (
        <div className="note-card-open" data-readonly="true">
          <NoteCardContent note={note} labels={selectedLabels} checklistItems={checklistItems} />
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
        {mode !== 'trash' ? (
          <>
            <div className="note-card-action-slot">
              <IconButton
                className="note-card-action"
                label={`Change color: ${label}`}
                aria-expanded={openPanel === 'color'}
                onClick={() => setOpenPanel((current) => (current === 'color' ? null : 'color'))}
              >
                <Palette />
              </IconButton>
              {openPanel === 'color' ? (
                <NoteColorPicker
                  noteLabel={label}
                  value={note.color}
                  onChange={(color) => {
                    setOpenPanel(null);
                    actions.setColor(note, color);
                  }}
                />
              ) : null}
            </div>
            <div className="note-card-action-slot">
              <IconButton
                className="note-card-action"
                label={`Change labels: ${label}`}
                aria-expanded={openPanel === 'labels'}
                onClick={() => setOpenPanel((current) => (current === 'labels' ? null : 'labels'))}
              >
                <Tag />
              </IconButton>
              {openPanel === 'labels' ? (
                <NoteLabelPicker
                  labels={labels}
                  noteLabel={label}
                  selectedLabelIds={selectedLabelIds}
                  onChange={(labelIds) => actions.setLabels(note, labelIds)}
                />
              ) : null}
            </div>
          </>
        ) : null}

        {mode === 'notes' ? (
          <IconButton className="note-card-action" label={`Archive note: ${label}`} onClick={() => actions.archive(note)}>
            <Archive />
          </IconButton>
        ) : null}
        {mode === 'archive' ? (
          <IconButton className="note-card-action" label={`Unarchive note: ${label}`} onClick={() => actions.unarchive(note)}>
            <RotateCcw />
          </IconButton>
        ) : null}
        {mode !== 'trash' ? (
          <IconButton className="note-card-action" label={`Duplicate note: ${label}`} onClick={() => actions.duplicate(note)}>
            <Copy />
          </IconButton>
        ) : null}
        {mode !== 'trash' ? (
          <IconButton className="note-card-action" label={`Move note to trash: ${label}`} onClick={() => actions.trash(note)}>
            <Trash2 />
          </IconButton>
        ) : null}
        {mode === 'trash' ? (
          <>
            <IconButton className="note-card-action" label={`Restore note: ${label}`} onClick={() => actions.restore(note)}>
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

function NoteCardContent({
  note,
  labels,
  checklistItems,
}: {
  note: NoteRecord;
  labels: LabelRecord[];
  checklistItems: ChecklistItemRecord[];
}) {
  return (
    <>
      {note.title ? <span className="note-card-title">{note.title}</span> : null}
      {note.type === 'checklist' ? (
        <ChecklistPreview items={checklistItems} />
      ) : note.content ? (
        <span className="note-card-body">{note.content}</span>
      ) : null}
      {note.type === 'text' && !note.title && !note.content ? (
        <span className="note-card-empty">Empty note</span>
      ) : null}
      {labels.length > 0 ? (
        <span className="note-card-labels" aria-label="Labels">
          {labels.map((label) => (
            <span className="note-label-chip" key={label.id}>
              {label.name}
            </span>
          ))}
        </span>
      ) : null}
    </>
  );
}

function ChecklistPreview({ items }: { items: ChecklistItemRecord[] }) {
  const preview = items.slice(0, 7);
  if (preview.length === 0) return <span className="note-card-empty">Empty checklist</span>;
  return (
    <span className="note-card-checklist-preview" aria-label="Checklist preview">
      {preview.map((item) => (
        <span
          className="note-card-checklist-row"
          data-checked={item.checked}
          data-depth={item.parentId === null ? 0 : 1}
          key={item.id}
        >
          <span className="note-card-checklist-box" aria-hidden="true">
            {item.checked ? '✓' : ''}
          </span>
          <span className="note-card-checklist-text">{item.text || 'Empty item'}</span>
        </span>
      ))}
      {items.length > preview.length ? (
        <span className="note-card-checklist-more">+{items.length - preview.length} more</span>
      ) : null}
    </span>
  );
}

function noteLabel(note: NoteRecord, checklistItems: ChecklistItemRecord[]): string {
  return (
    note.title.trim() ||
    firstMeaningfulLine(note.content) ||
    checklistItems.find((item) => item.text.trim())?.text.slice(0, 80) ||
    'Untitled note'
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
