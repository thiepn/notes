import { useCallback, useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react';

import { resolveShellViewport, type ShellViewport } from '../../app/shellLayout';
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
export const MOBILE_INITIAL_MOUNTED_NOTE_COUNT = 48;
export const MOBILE_NOTE_MOUNT_BATCH_SIZE = 48;
export const TABLET_INITIAL_MOUNTED_NOTE_COUNT = 72;
export const TABLET_NOTE_MOUNT_BATCH_SIZE = 72;

export interface NoteMountProfile {
  name: ShellViewport;
  initial: number;
  batch: number;
  rootMargin: string;
}

const NOTE_MOUNT_PROFILES: Record<ShellViewport, NoteMountProfile> = {
  mobile: {
    name: 'mobile',
    initial: MOBILE_INITIAL_MOUNTED_NOTE_COUNT,
    batch: MOBILE_NOTE_MOUNT_BATCH_SIZE,
    rootMargin: '480px 0px',
  },
  tablet: {
    name: 'tablet',
    initial: TABLET_INITIAL_MOUNTED_NOTE_COUNT,
    batch: TABLET_NOTE_MOUNT_BATCH_SIZE,
    rootMargin: '640px 0px',
  },
  desktop: {
    name: 'desktop',
    initial: INITIAL_MOUNTED_NOTE_COUNT,
    batch: NOTE_MOUNT_BATCH_SIZE,
    rootMargin: '800px 0px',
  },
};

export function resolveNoteMountProfile(width: number): NoteMountProfile {
  const safeWidth = Number.isFinite(width) && width > 0 ? width : 1101;
  return NOTE_MOUNT_PROFILES[resolveShellViewport(safeWidth)];
}

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
  const mountProfile = resolveNoteMountProfile(
    typeof window === 'undefined' ? 1101 : window.innerWidth,
  );
  const [mountWindow, setMountWindow] = useState<MountWindow>(() => ({
    scope: ariaLabel,
    limit: mountProfile.initial,
  }));
  const sentinelRef = useRef<HTMLDivElement>(null);
  const activeLimit = mountWindow.scope === ariaLabel ? mountWindow.limit : mountProfile.initial;
  const mountedNotes = notes.slice(0, Math.min(notes.length, activeLimit));
  const remaining = Math.max(0, notes.length - mountedNotes.length);

  const mountMore = useCallback(() => {
    setMountWindow((current) => {
      const currentLimit = current.scope === ariaLabel ? current.limit : mountProfile.initial;
      return {
        scope: ariaLabel,
        limit: Math.min(notes.length, currentLimit + mountProfile.batch),
      };
    });
  }, [ariaLabel, mountProfile.batch, mountProfile.initial, notes.length]);

  useEffect(() => {
    const sentinel = sentinelRef.current;
    if (!sentinel || remaining === 0 || typeof IntersectionObserver === 'undefined') return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) mountMore();
      },
      { rootMargin: mountProfile.rootMargin },
    );
    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [mountMore, mountProfile.rootMargin, remaining]);

  return (
    <>
      <div
        className="note-grid"
        data-view={viewMode}
        data-mounted-count={mountedNotes.length}
        data-total-count={notes.length}
        data-mount-profile={mountProfile.name}
        role="list"
        aria-label={ariaLabel}
      >
        {mountedNotes.map((note, index) => {
          const reminderProps = remindersByNote
            ? { reminder: remindersByNote[note.id] ?? null }
            : {};
          return (
            <MasonryItem
              key={note.id}
              viewMode={viewMode}
              position={index + 1}
              setSize={notes.length}
            >
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

function MasonryItem({
  children,
  viewMode,
  position,
  setSize,
}: {
  children: ReactNode;
  viewMode: NotesViewMode;
  position: number;
  setSize: number;
}) {
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

    if (typeof ResizeObserver === 'undefined') {
      updateSpan();
      return () => cancelAnimationFrame(animationFrame);
    }

    const observer = new ResizeObserver(updateSpan);
    observer.observe(content);
    updateSpan();

    return () => {
      cancelAnimationFrame(animationFrame);
      observer.disconnect();
    };
  }, [viewMode]);

  return (
    <div
      ref={itemRef}
      className="note-masonry-item"
      role="listitem"
      aria-posinset={position}
      aria-setsize={setSize}
    >
      <div ref={contentRef}>{children}</div>
    </div>
  );
}
