import { useCallback, useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react';

import type { ChecklistItemRecord, LabelRecord, NoteRecord, ReminderRecord } from '../../db';
import {
  NoteCard,
  type NoteCardActions,
  type NoteCardMode,
  type NoteSelectionIntent,
} from './NoteCard';
import type { NotesViewMode } from './viewMode';

export const INITIAL_MOUNTED_NOTE_COUNT = 96;
export const NOTE_MOUNT_BATCH_SIZE = 96;

interface MasonryGridProps {
  notes: NoteRecord[];
  viewMode: NotesViewMode;
  ariaLabel: string;
  mode: NoteCardMode;
  actions: NoteCardActions;
  labels: LabelRecord[];
  labelIdsByNote: Record<string, string[]>;
  checklistItemsByNote: Record<string, ChecklistItemRecord[]>;
  remindersByNote?: Record<string, ReminderRecord>;
  attachmentRefreshByNote?: Record<string, number>;
  searchContextByNote?: Record<string, string>;
  selectedNoteIds?: Set<string>;
  selectionActive?: boolean;
  onSelectionIntent?: ((note: NoteRecord, intent: NoteSelectionIntent) => void) | undefined;
}

interface MountWindow {
  scope: string;
  limit: number;
}

export function MasonryGrid({
  notes,
  viewMode,
  ariaLabel,
  mode,
  actions,
  labels,
  labelIdsByNote,
  checklistItemsByNote,
  remindersByNote,
  attachmentRefreshByNote = {},
  searchContextByNote = {},
  selectedNoteIds,
  selectionActive = false,
  onSelectionIntent,
}: MasonryGridProps) {
  const [mountWindow, setMountWindow] = useState<MountWindow>({
    scope: ariaLabel,
    limit: INITIAL_MOUNTED_NOTE_COUNT,
  });
  const sentinelRef = useRef<HTMLDivElement>(null);
  const activeLimit =
    mountWindow.scope === ariaLabel ? mountWindow.limit : INITIAL_MOUNTED_NOTE_COUNT;
  const mountedNotes = notes.slice(0, Math.min(notes.length, activeLimit));
  const remaining = Math.max(0, notes.length - mountedNotes.length);

  const mountMore = useCallback(() => {
    setMountWindow((current) => {
      const currentLimit = current.scope === ariaLabel ? current.limit : INITIAL_MOUNTED_NOTE_COUNT;
      return {
        scope: ariaLabel,
        limit: Math.min(notes.length, currentLimit + NOTE_MOUNT_BATCH_SIZE),
      };
    });
  }, [ariaLabel, notes.length]);

  useEffect(() => {
    const sentinel = sentinelRef.current;
    if (!sentinel || remaining === 0 || typeof IntersectionObserver === 'undefined') return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) mountMore();
      },
      { rootMargin: '800px 0px' },
    );
    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [mountMore, remaining]);

  return (
    <>
      <div
        className="note-grid"
        data-view={viewMode}
        data-mounted-count={mountedNotes.length}
        data-total-count={notes.length}
        role="list"
        aria-label={ariaLabel}
      >
        {mountedNotes.map((note) => {
          const reminderProps = remindersByNote
            ? { reminder: remindersByNote[note.id] ?? null }
            : {};
          return (
            <MasonryItem key={note.id} viewMode={viewMode}>
              <NoteCard
                note={note}
                mode={mode}
                actions={actions}
                labels={labels}
                selectedLabelIds={labelIdsByNote[note.id] ?? []}
                checklistItems={checklistItemsByNote[note.id] ?? []}
                {...reminderProps}
                attachmentRefreshKey={attachmentRefreshByNote[note.id] ?? 0}
                searchContext={searchContextByNote[note.id]}
                selection={
                  onSelectionIntent
                    ? {
                        active: selectionActive,
                        selected: selectedNoteIds?.has(note.id) ?? false,
                        onIntent: onSelectionIntent,
                      }
                    : undefined
                }
              />
            </MasonryItem>
          );
        })}
      </div>
      {remaining > 0 ? (
        <div ref={sentinelRef} className="note-grid-progress">
          <button type="button" onClick={mountMore}>
            Show more notes <span>{remaining} remaining</span>
          </button>
        </div>
      ) : null}
    </>
  );
}

function MasonryItem({ children, viewMode }: { children: ReactNode; viewMode: NotesViewMode }) {
  const itemRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    const item = itemRef.current;
    const content = contentRef.current;
    if (!item || !content) return;

    if (viewMode === 'list') {
      item.style.removeProperty('grid-row-end');
      return;
    }

    const grid = item.parentElement;
    if (!grid) return;

    let animationFrame = 0;

    const updateSpan = () => {
      cancelAnimationFrame(animationFrame);
      animationFrame = requestAnimationFrame(() => {
        const styles = window.getComputedStyle(grid);
        const rowHeight = Number.parseFloat(styles.gridAutoRows) || 8;
        const rowGap = Number.parseFloat(styles.rowGap) || 8;
        const height = content.getBoundingClientRect().height;
        const span = Math.max(1, Math.ceil((height + rowGap) / (rowHeight + rowGap)));
        item.style.gridRowEnd = `span ${span}`;
      });
    };

    const observer = new ResizeObserver(updateSpan);
    observer.observe(content);
    updateSpan();

    return () => {
      cancelAnimationFrame(animationFrame);
      observer.disconnect();
    };
  }, [viewMode]);

  return (
    <div ref={itemRef} className="note-masonry-item" role="listitem">
      <div ref={contentRef}>{children}</div>
    </div>
  );
}
