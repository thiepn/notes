import {
  useEffect,
  useRef,
  useState,
  type MouseEvent as ReactMouseEvent,
  type PointerEvent as ReactPointerEvent,
} from 'react';
import {
  Archive,
  Bell,
  Check,
  Copy,
  MoreHorizontal,
  Palette,
  Pin,
  PinOff,
  RotateCcw,
  Tag,
  Trash2,
} from 'lucide-react';

import { IconButton } from '../../components/ui/IconButton';
import {
  RemindersRepository,
  notesDatabase,
  type ChecklistItemRecord,
  type LabelRecord,
  type NoteColor,
  type NoteRecord,
  type ReminderRecord,
} from '../../db';
import { formatReminderShort } from '../reminders/reminderTime';
import { RichTextContent } from '../richText/RichTextContent';
import { richTextToPlainText } from '../richText/richText';
import { NoteCardAttachmentPreview } from './NoteCardAttachmentPreview';
import { NoteColorPicker } from './NoteColorPicker';
import { NoteLabelPicker } from './NoteLabelPicker';

const remindersRepository = new RemindersRepository(notesDatabase);

export type NoteCollectionMode = 'notes' | 'archive' | 'trash';
export type NoteCardMode = NoteCollectionMode | 'reminders';
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
  mode: NoteCardMode;
  actions: NoteCardActions;
  labels: LabelRecord[];
  selectedLabelIds: string[];
  checklistItems: ChecklistItemRecord[];
  reminder?: ReminderRecord | null;
  attachmentRefreshKey?: number;
  selection?: NoteCardSelection | undefined;
}

type OrganizationPanel = 'color' | 'labels' | 'more' | null;

const LONG_PRESS_MS = 480;

export function NoteCard({
  note,
  mode,
  actions,
  labels,
  selectedLabelIds,
  checklistItems,
  reminder,
  attachmentRefreshKey = 0,
  selection,
}: NoteCardProps) {
  const cardRef = useRef<HTMLElement>(null);
  const longPressTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const longPressTriggeredRef = useRef(false);
  const [openPanel, setOpenPanel] = useState<OrganizationPanel>(null);
  const [loadedReminder, setLoadedReminder] = useState<ReminderRecord | null>(reminder ?? null);
  const effectiveReminder = reminder === undefined ? loadedReminder : reminder;
  const label = noteLabel(note, checklistItems);
  const canOpen = mode !== 'trash';
  const selectedLabels = labels.filter((item) => selectedLabelIds.includes(item.id));
  const selectionActive = selection?.active ?? false;
  const selectionSelected = selection?.selected ?? false;
  const visiblePanel = selectionActive ? null : openPanel;

  useEffect(() => {
    if (reminder !== undefined) return;
    let cancelled = false;
    const load = () => {
      void remindersRepository.getForNote(note.id).then((stored) => {
        if (!cancelled) setLoadedReminder(stored ?? null);
      });
    };
    const handleChanged = () => load();
    window.addEventListener('notes-reminders-changed', handleChanged);
    load();
    return () => {
      cancelled = true;
      window.removeEventListener('notes-reminders-changed', handleChanged);
    };
  }, [note.id, reminder]);

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

  const closeAndRun = (action: () => void) => {
    setOpenPanel(null);
    action();
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
      data-has-reminder={effectiveReminder !== null}
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
          <NoteCardContent
            note={note}
            mode={mode}
            reminder={effectiveReminder}
            labels={selectedLabels}
            checklistItems={checklistItems}
            attachmentRefreshKey={attachmentRefreshKey}
          />
        </button>
      ) : (
        <div className="note-card-open" data-readonly="true">
          <NoteCardContent
            note={note}
            mode={mode}
            reminder={effectiveReminder}
            labels={selectedLabels}
            checklistItems={checklistItems}
            attachmentRefreshKey={attachmentRefreshKey}
          />
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
          ) : (
            <div className="note-card-action-slot">
              <IconButton
                className="note-card-action"
                label={`More actions: ${label}`}
                aria-expanded={visiblePanel === 'more'}
                onClick={() => setOpenPanel((current) => (current === 'more' ? null : 'more'))}
              >
                <MoreHorizontal />
              </IconButton>
              {visiblePanel === 'more' ? (
                <div className="note-card-more-menu" role="menu">
                  <button type="button" role="menuitem" onClick={() => setOpenPanel('labels')}>
                    <Tag aria-hidden="true" /> Labels
                  </button>
                  <button
                    type="button"
                    role="menuitem"
                    onClick={() => closeAndRun(() => actions.duplicate(note))}
                  >
                    <Copy aria-hidden="true" /> Duplicate
                  </button>
                  <button
                    className="danger"
                    type="button"
                    role="menuitem"
                    onClick={() => closeAndRun(() => actions.trash(note))}
                  >
                    <Trash2 aria-hidden="true" /> Move to trash
                  </button>
                </div>
              ) : null}
              {visiblePanel === 'labels' ? (
                <NoteLabelPicker
                  labels={labels}
                  noteLabel={label}
                  selectedLabelIds={selectedLabelIds}
                  onChange={(labelIds) => actions.setLabels(note, labelIds)}
                />
              ) : null}
            </div>
          )}
        </div>
      ) : null}
    </article>
  );
}

function NoteCardContent({
  note,
  mode,
  reminder,
  labels,
  checklistItems,
  attachmentRefreshKey,
}: {
  note: NoteRecord;
  mode: NoteCardMode;
  reminder: ReminderRecord | null;
  labels: LabelRecord[];
  checklistItems: ChecklistItemRecord[];
  attachmentRefreshKey: number;
}) {
  return (
    <>
      <NoteCardAttachmentPreview noteId={note.id} refreshKey={attachmentRefreshKey} />
      {note.title ? <span className="note-card-title">{note.title}</span> : null}
      {note.type === 'checklist' ? (
        <ChecklistPreview items={checklistItems} />
      ) : note.content ? (
        <span className="note-card-body">
          <RichTextContent value={note.content} compact />
        </span>
      ) : null}
      {note.type === 'text' && !note.title && !note.content ? (
        <span className="note-card-empty">Empty note</span>
      ) : null}
      {reminder && (reminder.status === 'active' || mode === 'reminders') ? (
        <span className="note-card-reminder" data-status={reminder.status}>
          <Bell aria-hidden="true" />
          {reminder.status === 'active'
            ? formatReminderShort(reminder.dueAt)
            : reminder.status === 'completed'
              ? 'Completed'
              : 'Dismissed'}
        </span>
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
    richTextToPlainText(content)
      .split(/\r?\n/u)
      .map((line) => line.trim())
      .find(Boolean)
      ?.slice(0, 80) ?? ''
  );
}
