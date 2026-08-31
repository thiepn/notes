import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
} from 'react';
import { ArrowDown, ArrowLeft, ArrowRight, ArrowUp, GripVertical, Trash2 } from 'lucide-react';

import { IconButton } from '../../components/ui/IconButton';
import type { ChecklistDraftItem } from '../../db';
import {
  checklistDepth,
  clearCompletedChecklistItems,
  indentChecklistItem,
  insertChecklistItemAfter,
  moveChecklistItem,
  outdentChecklistItem,
  removeChecklistItem,
  reorderChecklistBefore,
  toggleChecklistItem,
} from './checklistModel';

interface ChecklistEditorFieldsProps {
  title: string;
  items: ChecklistDraftItem[];
  hideCompleted: boolean;
  moveCompletedDown: boolean;
  autoFocusFirst?: boolean;
  onTitleChange(title: string): void;
  onItemsChange(items: ChecklistDraftItem[]): void;
  onHideCompletedChange(hidden: boolean): void;
  onMoveCompletedDownChange(enabled: boolean): void;
}

export function ChecklistEditorFields({
  title,
  items,
  hideCompleted,
  moveCompletedDown,
  autoFocusFirst = false,
  onTitleChange,
  onItemsChange,
  onHideCompletedChange,
  onMoveCompletedDownChange,
}: ChecklistEditorFieldsProps) {
  const [focusItemId, setFocusItemId] = useState<string | null>(null);
  const inputRefs = useRef(new Map<string, HTMLInputElement>());
  const dragItemIdRef = useRef<string | null>(null);
  const completedCount = useMemo(() => items.filter((item) => item.checked).length, [items]);
  const visibleItems = hideCompleted ? items.filter((item) => !item.checked) : items;

  useEffect(() => {
    if (!focusItemId) return;
    const input = inputRefs.current.get(focusItemId);
    if (!input) return;
    input.focus();
    setFocusItemId(null);
  }, [focusItemId, items]);

  const updateText = (itemId: string, text: string) => {
    onItemsChange(items.map((item) => (item.id === itemId ? { ...item, text } : item)));
  };

  const handleItemKeyDown = (
    event: ReactKeyboardEvent<HTMLInputElement>,
    item: ChecklistDraftItem,
  ) => {
    if (event.key === 'Enter' && !(event.metaKey || event.ctrlKey)) {
      event.preventDefault();
      const inserted = insertChecklistItemAfter(items, item.id);
      if (!inserted.insertedId) return;
      onItemsChange(inserted.items);
      setFocusItemId(inserted.insertedId);
      return;
    }

    if (event.key === 'Backspace' && item.text.length === 0) {
      const removed = removeChecklistItem(items, item.id);
      if (removed.items === items) return;
      event.preventDefault();
      onItemsChange(removed.items);
      setFocusItemId(removed.focusId);
      return;
    }

    if (event.key === 'Tab') {
      event.preventDefault();
      const next = event.shiftKey
        ? outdentChecklistItem(items, item.id)
        : indentChecklistItem(items, item.id);
      onItemsChange(next);
    }
  };

  const handleDelete = (itemId: string) => {
    const removed = removeChecklistItem(items, itemId);
    if (removed.items === items) return;
    onItemsChange(removed.items);
    setFocusItemId(removed.focusId);
  };

  return (
    <div className="checklist-fields">
      <input
        className="checklist-title"
        type="text"
        value={title}
        aria-label="Checklist title"
        placeholder="Title"
        maxLength={500}
        autoComplete="off"
        onChange={(event) => onTitleChange(event.target.value)}
      />

      <div className="checklist-items" role="list" aria-label="Checklist items">
        {visibleItems.map((item, visibleIndex) => {
          const absoluteIndex = items.findIndex((candidate) => candidate.id === item.id);
          const depth = checklistDepth(item);
          return (
            <div
              className="checklist-row"
              data-depth={depth}
              data-checked={item.checked}
              role="listitem"
              key={item.id}
              onDragOver={(event) => event.preventDefault()}
              onDrop={(event) => {
                event.preventDefault();
                const sourceId = dragItemIdRef.current;
                dragItemIdRef.current = null;
                if (!sourceId) return;
                onItemsChange(reorderChecklistBefore(items, sourceId, item.id));
              }}
            >
              <button
                className="checklist-drag-handle"
                type="button"
                draggable
                aria-label={`Drag item ${visibleIndex + 1}`}
                onDragStart={(event) => {
                  dragItemIdRef.current = item.id;
                  event.dataTransfer.effectAllowed = 'move';
                  event.dataTransfer.setData('text/plain', item.id);
                }}
                onDragEnd={() => {
                  dragItemIdRef.current = null;
                }}
              >
                <GripVertical aria-hidden="true" />
              </button>

              <input
                className="checklist-checkbox"
                type="checkbox"
                checked={item.checked}
                aria-label={`Mark item ${visibleIndex + 1} ${item.checked ? 'incomplete' : 'complete'}`}
                onChange={(event) =>
                  onItemsChange(
                    toggleChecklistItem(items, item.id, event.target.checked, moveCompletedDown),
                  )
                }
              />

              <input
                ref={(element) => {
                  if (element) inputRefs.current.set(item.id, element);
                  else inputRefs.current.delete(item.id);
                }}
                className="checklist-item-input"
                type="text"
                value={item.text}
                aria-label={`Checklist item ${visibleIndex + 1}`}
                placeholder="List item"
                autoFocus={autoFocusFirst && absoluteIndex === 0}
                onChange={(event) => updateText(item.id, event.target.value)}
                onKeyDown={(event) => handleItemKeyDown(event, item)}
              />

              <div className="checklist-row-actions">
                {depth === 0 ? (
                  <IconButton
                    className="checklist-row-action"
                    label={`Indent item ${visibleIndex + 1}`}
                    disabled={absoluteIndex <= 0}
                    onClick={() => onItemsChange(indentChecklistItem(items, item.id))}
                  >
                    <ArrowRight />
                  </IconButton>
                ) : (
                  <IconButton
                    className="checklist-row-action"
                    label={`Outdent item ${visibleIndex + 1}`}
                    onClick={() => onItemsChange(outdentChecklistItem(items, item.id))}
                  >
                    <ArrowLeft />
                  </IconButton>
                )}
                <IconButton
                  className="checklist-row-action"
                  label={`Move item ${visibleIndex + 1} up`}
                  onClick={() => onItemsChange(moveChecklistItem(items, item.id, -1))}
                >
                  <ArrowUp />
                </IconButton>
                <IconButton
                  className="checklist-row-action"
                  label={`Move item ${visibleIndex + 1} down`}
                  onClick={() => onItemsChange(moveChecklistItem(items, item.id, 1))}
                >
                  <ArrowDown />
                </IconButton>
                <IconButton
                  className="checklist-row-action checklist-row-delete"
                  label={`Delete item ${visibleIndex + 1}`}
                  disabled={items.length <= 1}
                  onClick={() => handleDelete(item.id)}
                >
                  <Trash2 />
                </IconButton>
              </div>
            </div>
          );
        })}
      </div>

      <div className="checklist-options">
        <label className="checklist-option-toggle">
          <input
            type="checkbox"
            checked={moveCompletedDown}
            onChange={(event) => onMoveCompletedDownChange(event.target.checked)}
          />
          <span>Move checked items down</span>
        </label>

        {completedCount > 0 ? (
          <div className="checklist-completed-actions">
            <button
              type="button"
              onClick={() => onHideCompletedChange(!hideCompleted)}
              aria-pressed={hideCompleted}
            >
              {hideCompleted
                ? `Show completed (${completedCount})`
                : `Hide completed (${completedCount})`}
            </button>
            <button
              type="button"
              onClick={() => onItemsChange(clearCompletedChecklistItems(items))}
            >
              Clear completed
            </button>
          </div>
        ) : null}
      </div>
    </div>
  );
}
