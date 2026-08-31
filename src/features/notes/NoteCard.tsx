import {
  useEffect,
  useRef,
  useState,
  type MouseEvent as ReactMouseEvent,
  type PointerEvent as ReactPointerEvent,
} from 'react';
import { Archive, Check, Copy, Palette, Pin, PinOff, RotateCcw, Tag, Trash2 } from 'lucide-react';

import { IconButton } from '../../components/ui/IconButton';
import type { ChecklistItemRecord, LabelRecord, NoteColor, NoteRecord } from '../../db';
import { NoteColorPicker } from './NoteColorPicker';
import { NoteLabelPicker } from './NoteLabelPicker';

export type NoteCollectionMode = 'notes' | 'archive' | 'trash';
export type NoteSelectionIntent = 'toggle' | 'range' | 'select';

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

export interface NoteCardSelection {
  active: boolean;
  selected: boolean;
  onIntent(note: NoteRecord, intent: NoteSelectionIntent): void;
}

interface NoteCardProps {
  note: NoteRecord;
  mode: NoteCollectionMode;
  actions: NoteCardActions;
  labels: LabelRecord[];
  selectedLabelIds: string[];
  checklistItems: ChecklistItemRecord[];
  selection?: NoteCardSelection | undefined;
}

type OrganizationPanel = 'color' | 'labels' | null;

const LONG_PRESS_MS = 480;

export function NoteCard({
  note,
  mode,
  actions,
  labels,
  selectedLabelIds,
  checklistItems,
  selection,
}: NoteCardProps) {
  const cardRef = useRef<HTMLElement>(null);
  const longPressTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const longPressTriggeredRef = useRef(false);
  const [openPanel, setOpenPanel] = useState<OrganizationPanel>(null);
  const label = noteLabel(note, checklistItems);
  const canOpen = mode !== 'trash';
  const selectedLabels = labels.filter((item) => selectedLabelIds.includes(item.id));
  const selectionActive = selection?.active ?? false;
  const selectionSelected = selection?.selected ?? false;
  const visiblePanel = selectionActive ? null : openPanel;

  useEffect(() => {
    if (!visiblePanel) return;
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
  }, [visiblePanel]);

  useEffect(
    () => () => {
      if (longPressTimerRef.current !== null) clearTimeout(longPressTimerRef.current);
    },
    [],
  );

  const clearLongPress = () => {
    if (longPressTimerRef.current === null) return;
    clearTimeout(longPressTimerRef.current);
    longPressTimerRef.current = null;
  };

  const handlePointerDown = (event: ReactPointerEvent<HTMLElement>) => {
    if (!selection || event.pointerType === 'mouse' || event.button !== 0) return;
    const target = event.target;
    if (!(target instanceof Element) || !target.closest('.note-card-open')) return;

    longPressTriggeredRef.current = false;
    clearLongPress();
    longPressTimerRef.current = setTimeout(() => {
      longPressTimerRef.current = null;
      longPressTriggeredRef.current = true;
      selection.onIntent(note, 'select');
    }, LONG_PRESS_MS);
  };

  const handleOpenClick = (event: ReactMouseEvent<HTMLButtonElement>) => {
    if (longPressTriggeredRef.current) {
      longPressTriggeredRef.current = false;
      event.preventDefault();
      return;
    }

    if (selection && (selection.active || event.metaKey || event.ctrlKey || event.shiftKey)) {
      event.preventDefault();
      selection.onIntent(note, event.shiftKey ? 'range' : 'toggle');
      return;
    }
    actions.open(note);
  };

  return (
    <article
      ref={cardRef}
      className="note-card"
      data-note-card
      data-note-id={note.id}
      data-note-type={note.type}
      data-color={note.color}
      data-pinned={note.pinnedAt !== null}
      data-selected={selectionSelected}
      data-selection-active={selectionActive}
      onPointerDown={handlePointerDown}
      onPointerUp={clearLongPress}
      onPointerCancel={clearLongPress}
      onPointerLeave={clearLongPress}
    >
      {selection ? (
        <button
          className="note-card-select"
          type="button"
          aria-label={`${selectionSelected ? 'Deselect' : 'Select'} note: ${label}`}
          aria-pressed={selectionSelected}
          onClick={(event) => {
            event.stopPropagation();
            selection.onIntent(note, 'toggle');
          }}
        >
          <span aria-hidden="true">{selectionSelected ? <Check /> : null}</span>
        </button>
      ) : null}

      {canOpen ? (
        <button
          className="note-card-open"
          type="button"
          aria-label={`Open note: ${label}`}
          onClick={handleOpenClick}
        >
          <NoteCardContent note={note} labels={selectedLabels} checklistItems={checklistItems} />
        </button>
      ) : (
        <div className="note-card-open" data-readonly="true">
          <NoteCardContent note={note} labels={selectedLabels} checklistItems={checklistItems} />
        </div>
      )}

      {!selectionActive && mode === 'notes' ? (
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

      {!selectionActive ? (
        <div className="note-card-actions">
          {mode !== 'trash' ? (
            <>
              <div className="note-card-action-slot">
                <IconButton
                  className="note-card-action"
                  label={`Change color: ${label}`}
                  aria-expanded={visiblePanel === 'color'}
                  onClick={() => setOpenPanel((current) => (current === 'color' ? null : 'color'))}
                >
                  <Palette />
                </IconButton>
                {visiblePanel === 'color' ? (
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
                  aria-expanded={visiblePanel === 'labels'}
                  onClick={() =>
                    setOpenPanel((current) => (current === 'labels' ? null : 'labels'))
                  }
                >
                  <Tag />
                </IconButton>
                {visiblePanel === 'labels' ? (
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
      ) : null}
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
