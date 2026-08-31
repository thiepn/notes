import { useLayoutEffect, useRef, type ReactNode } from 'react';

import type { ChecklistItemRecord, LabelRecord, NoteRecord } from '../../db';
import {
  NoteCard,
  type NoteCardActions,
  type NoteCollectionMode,
  type NoteSelectionIntent,
} from './NoteCard';
import type { NotesViewMode } from './viewMode';

interface MasonryGridProps {
  notes: NoteRecord[];
  viewMode: NotesViewMode;
  ariaLabel: string;
  mode: NoteCollectionMode;
  actions: NoteCardActions;
  labels: LabelRecord[];
  labelIdsByNote: Record<string, string[]>;
  checklistItemsByNote: Record<string, ChecklistItemRecord[]>;
  attachmentRefreshByNote?: Record<string, number>;
  selectedNoteIds?: Set<string>;
  selectionActive?: boolean;
  onSelectionIntent?: ((note: NoteRecord, intent: NoteSelectionIntent) => void) | undefined;
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
  attachmentRefreshByNote = {},
  selectedNoteIds,
  selectionActive = false,
  onSelectionIntent,
}: MasonryGridProps) {
  return (
    <div className="note-grid" data-view={viewMode} role="list" aria-label={ariaLabel}>
      {notes.map((note) => (
        <MasonryItem key={note.id} viewMode={viewMode}>
          <NoteCard
            note={note}
            mode={mode}
            actions={actions}
            labels={labels}
            selectedLabelIds={labelIdsByNote[note.id] ?? []}
            checklistItems={checklistItemsByNote[note.id] ?? []}
            attachmentRefreshKey={attachmentRefreshByNote[note.id] ?? 0}
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
      ))}
    </div>
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
