import { subscribeAppEvent } from '../../app/events';
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
  EyeOff,
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
import { usePrivacy } from '../privacy/PrivacyContext';
import { formatReminderShort, isReminderOverdue } from '../reminders/reminderTime';
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
  searchContext?: string | undefined;
  selection?: NoteCardSelection | undefined;
}

type OrganizationPanel = 'color' | 'labels' | 'more' | null;

type MenuFocusTarget = 'first' | 'last';

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
  searchContext,
  selection,
}: NoteCardProps) {
  const { hidePreviews } = usePrivacy();
  const cardRef = useRef<HTMLElement>(null);
  const openButtonRef = useRef<HTMLButtonElement>(null);
  const colorTriggerRef = useRef<HTMLButtonElement>(null);
  const moreTriggerRef = useRef<HTMLButtonElement>(null);
  const moreMenuRef = useRef<HTMLDivElement>(null);
  const panelReturnFocusRef = useRef<HTMLElement | null>(null);
  const menuFocusTargetRef = useRef<MenuFocusTarget>('first');
  const longPressTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const longPressTriggeredRef = useRef(false);
  const [openPanel, setOpenPanel] = useState<OrganizationPanel>(null);
  const [loadedReminder, setLoadedReminder] = useState<ReminderRecord | null>(reminder ?? null);
  const effectiveReminder = reminder === undefined ? loadedReminder : reminder;
  const label = hidePreviews ? 'Hidden note' : noteLabel(note, checklistItems);
  const canOpen = mode !== 'trash';
  const selectedLabels = labels.filter((item) => selectedLabelIds.includes(item.id));
  const selectionActive = selection?.active ?? false;
  const selectionSelected = selection?.selected ?? false;
  const visiblePanel = selectionActive ? null : openPanel;
  const colorPanelId = `note-color-panel-${note.id}`;
  const labelsPanelId = `note-labels-panel-${note.id}`;
  const moreMenuId = `note-more-menu-${note.id}`;

  useEffect(() => {
    if (reminder !== undefined) return;
    let cancelled = false;
    const load = () => {
      void remindersRepository.getForNote(note.id).then((stored) => {
        if (!cancelled) setLoadedReminder(stored ?? null);
      });
    };
    const handleChanged = () => load();
    const unsubscribeReminderChanged = subscribeAppEvent('remindersChanged', handleChanged);
    load();
    return () => {
      cancelled = true;
      unsubscribeReminderChanged();
    };
  }, [note.id, reminder]);

  useEffect(() => {
    if (!visiblePanel) return;

    const focusFrame = window.requestAnimationFrame(() => {
      if (visiblePanel === 'more') {
        const items = menuItems(moreMenuRef.current);
        const target = menuFocusTargetRef.current === 'last' ? items.at(-1) : items[0];
        target?.focus({ preventScroll: true });
        return;
      }

      const panelId = visiblePanel === 'color' ? colorPanelId : labelsPanelId;
      const panel = document.getElementById(panelId);
      if (!(panel instanceof HTMLElement)) return;
      const target = firstPopoverControl(panel) ?? panel;
      target.focus({ preventScroll: true });
    });

    const handlePointerDown = (event: PointerEvent) => {
      const target = event.target;
      if (!(target instanceof Node)) return;
      if (cardRef.current?.contains(target)) return;
      setOpenPanel(null);
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        event.stopPropagation();
        const returnTarget = panelReturnFocusRef.current;
        setOpenPanel(null);
        window.requestAnimationFrame(() => {
          if (returnTarget?.isConnected) returnTarget.focus({ preventScroll: true });
          else openButtonRef.current?.focus({ preventScroll: true });
        });
        return;
      }

      if (visiblePanel !== 'more') return;
      const menu = moreMenuRef.current;
      if (!menu || !menu.contains(document.activeElement)) return;
      const items = menuItems(menu);
      if (items.length === 0) return;
      const currentIndex = items.findIndex((item) => item === document.activeElement);
      let nextIndex: number | null = null;
      if (event.key === 'ArrowDown') {
        nextIndex = currentIndex < 0 ? 0 : (currentIndex + 1) % items.length;
      } else if (event.key === 'ArrowUp') {
        nextIndex = currentIndex <= 0 ? items.length - 1 : currentIndex - 1;
      } else if (event.key === 'Home') {
        nextIndex = 0;
      } else if (event.key === 'End') {
        nextIndex = items.length - 1;
      }
      if (nextIndex === null) return;
      event.preventDefault();
      items[nextIndex]?.focus({ preventScroll: true });
    };

    document.addEventListener('pointerdown', handlePointerDown, true);
    window.addEventListener('keydown', handleKeyDown, true);
    return () => {
      window.cancelAnimationFrame(focusFrame);
      document.removeEventListener('pointerdown', handlePointerDown, true);
      window.removeEventListener('keydown', handleKeyDown, true);
    };
  }, [colorPanelId, labelsPanelId, visiblePanel]);

  useEffect(
    () => () => {
      if (longPressTimerRef.current !== null) clearTimeout(longPressTimerRef.current);
    },
    [],
  );

  const pressOriginRef = useRef<{ x: number; y: number } | null>(null);
  const handlePointerMove = (event: ReactPointerEvent<HTMLElement>) => {
    const origin = pressOriginRef.current;
    if (origin && Math.hypot(event.clientX - origin.x, event.clientY - origin.y) > 12)
      clearLongPress();
  };

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
    pressOriginRef.current = { x: event.clientX, y: event.clientY };
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

  const openOrganizationPanel = (
    panel: Exclude<OrganizationPanel, null>,
    returnFocus: HTMLElement | null,
    menuFocusTarget: MenuFocusTarget = 'first',
  ) => {
    panelReturnFocusRef.current = returnFocus;
    menuFocusTargetRef.current = menuFocusTarget;
    setOpenPanel(panel);
  };

  const closeAndRun = (action: () => void) => {
    const returnTarget = panelReturnFocusRef.current;
    setOpenPanel(null);
    action();
    window.requestAnimationFrame(() => {
      if (returnTarget?.isConnected) returnTarget.focus({ preventScroll: true });
    });
  };

  const closeColorAndApply = (color: NoteColor) => {
    const returnTarget = panelReturnFocusRef.current;
    setOpenPanel(null);
    actions.setColor(note, color);
    window.requestAnimationFrame(() => {
      if (returnTarget?.isConnected) returnTarget.focus({ preventScroll: true });
    });
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
      data-panel-open={visiblePanel !== null}
      data-has-reminder={effectiveReminder !== null}
      data-preview-hidden={hidePreviews}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
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

      {!selectionActive && mode !== 'trash' ? (
        <>
          <button
            hidden
            type="button"
            aria-label={`Change labels: ${label}`}
            onClick={() => openOrganizationPanel('labels', openButtonRef.current)}
          />
          <button
            hidden
            type="button"
            aria-label={`Move note to trash: ${label}`}
            onClick={() => actions.trash(note)}
          />
        </>
      ) : null}

      {canOpen ? (
        <button
          ref={openButtonRef}
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
            hidePreview={hidePreviews}
            searchContext={searchContext}
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
            hidePreview={hidePreviews}
            searchContext={searchContext}
          />
        </div>
      )}

      {!hidePreviews && !selectionActive ? (
        <time
          className="note-card-date"
          dateTime={new Date(note.updatedAt).toISOString()}
          title={`Last edited ${new Date(note.updatedAt).toLocaleString()}`}
        >
          {new Date(note.updatedAt).toLocaleDateString(undefined, {
            day: 'numeric',
            month: 'short',
          })}
        </time>
      ) : null}

      {!selectionActive && mode === 'notes' ? (
        <div className="note-card-pin-action note-card-direct-secondary">
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
            <div className="note-card-action-slot note-card-direct-secondary">
              <IconButton
                ref={colorTriggerRef}
                className="note-card-action"
                label={`Change color: ${label}`}
                aria-expanded={visiblePanel === 'color'}
                aria-haspopup="dialog"
                aria-controls={colorPanelId}
                onClick={() => {
                  if (visiblePanel === 'color') setOpenPanel(null);
                  else openOrganizationPanel('color', colorTriggerRef.current);
                }}
              >
                <Palette />
              </IconButton>
            </div>
          ) : null}

          {mode === 'notes' ? (
            <IconButton
              className="note-card-action note-card-direct-secondary"
              label={`Archive note: ${label}`}
              onClick={() => actions.archive(note)}
            >
              <Archive />
            </IconButton>
          ) : null}
          {mode === 'archive' ? (
            <IconButton
              className="note-card-action note-card-direct-secondary"
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
                ref={moreTriggerRef}
                className="note-card-action"
                label={`More actions: ${label}`}
                aria-expanded={visiblePanel === 'more'}
                aria-haspopup="menu"
                aria-controls={moreMenuId}
                onClick={() => {
                  if (visiblePanel === 'more') setOpenPanel(null);
                  else openOrganizationPanel('more', moreTriggerRef.current, 'first');
                }}
                onKeyDown={(event) => {
                  if (event.key === 'ArrowDown') {
                    event.preventDefault();
                    openOrganizationPanel('more', moreTriggerRef.current, 'first');
                  } else if (event.key === 'ArrowUp') {
                    event.preventDefault();
                    openOrganizationPanel('more', moreTriggerRef.current, 'last');
                  }
                }}
              >
                <MoreHorizontal />
              </IconButton>
              {visiblePanel === 'more' ? (
                <div
                  ref={moreMenuRef}
                  className="note-card-more-menu"
                  id={moreMenuId}
                  role="menu"
                  aria-label={`Actions for ${label}`}
                >
                  {mode === 'notes' ? (
                    <button
                      type="button"
                      role="menuitem"
                      onClick={() => closeAndRun(() => actions.togglePin(note))}
                    >
                      {note.pinnedAt !== null ? (
                        <PinOff aria-hidden="true" />
                      ) : (
                        <Pin aria-hidden="true" />
                      )}
                      {note.pinnedAt !== null ? 'Unpin' : 'Pin'}
                    </button>
                  ) : null}
                  <button
                    type="button"
                    role="menuitem"
                    onClick={() => openOrganizationPanel('color', moreTriggerRef.current)}
                  >
                    <Palette aria-hidden="true" /> Color
                  </button>
                  <button
                    type="button"
                    role="menuitem"
                    onClick={() => openOrganizationPanel('labels', moreTriggerRef.current)}
                  >
                    <Tag aria-hidden="true" /> Labels
                  </button>
                  {mode === 'notes' ? (
                    <button
                      type="button"
                      role="menuitem"
                      onClick={() => closeAndRun(() => actions.archive(note))}
                    >
                      <Archive aria-hidden="true" /> Archive
                    </button>
                  ) : null}
                  {mode === 'archive' ? (
                    <button
                      type="button"
                      role="menuitem"
                      onClick={() => closeAndRun(() => actions.unarchive(note))}
                    >
                      <RotateCcw aria-hidden="true" /> Move to Notes
                    </button>
                  ) : null}
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
              {visiblePanel === 'color' ? (
                <NoteColorPicker
                  id={colorPanelId}
                  noteLabel={label}
                  value={note.color}
                  onChange={closeColorAndApply}
                />
              ) : null}
              {visiblePanel === 'labels' ? (
                <NoteLabelPicker
                  id={labelsPanelId}
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
  hidePreview,
  searchContext,
}: {
  note: NoteRecord;
  mode: NoteCardMode;
  reminder: ReminderRecord | null;
  labels: LabelRecord[];
  checklistItems: ChecklistItemRecord[];
  attachmentRefreshKey: number;
  hidePreview: boolean;
  searchContext?: string | undefined;
}) {
  if (hidePreview) {
    return (
      <span className="note-card-private-placeholder" aria-label="Note preview hidden">
        <EyeOff aria-hidden="true" />
        <span>Preview hidden</span>
      </span>
    );
  }

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
      {searchContext ? (
        <span className="note-card-search-context" aria-label={`Search match: ${searchContext}`}>
          {searchContext}
        </span>
      ) : null}
      {reminder && (reminder.status === 'active' || mode === 'reminders') ? (
        <span
          className="note-card-reminder"
          data-status={reminder.status}
          data-overdue={reminder.status === 'active' && isReminderOverdue(reminder.dueAt)}
        >
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

function menuItems(menu: HTMLElement | null): HTMLButtonElement[] {
  if (!menu) return [];
  return Array.from(menu.querySelectorAll<HTMLButtonElement>('[role="menuitem"]')).filter(
    (item) => !item.disabled && item.getClientRects().length > 0,
  );
}

function firstPopoverControl(panel: HTMLElement): HTMLElement | null {
  return panel.querySelector<HTMLElement>(
    'input:not([disabled]), button:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
  );
}
