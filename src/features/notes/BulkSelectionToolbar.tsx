import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Archive,
  Check,
  CheckCheck,
  Palette,
  Pin,
  PinOff,
  RotateCcw,
  Tag,
  Trash2,
  X,
} from 'lucide-react';

import { IconButton } from '../../components/ui/IconButton';
import { NOTE_COLORS, type LabelRecord, type NoteColor, type NoteRecord } from '../../db';
import type { NoteCollectionMode } from './NoteCard';

interface BulkSelectionToolbarProps {
  mode: NoteCollectionMode;
  selectedNotes: NoteRecord[];
  visibleCount: number;
  labels: LabelRecord[];
  labelIdsByNote: Record<string, string[]>;
  onClear(): void;
  onSelectAll(): void;
  onSetPinned(pinned: boolean): void;
  onArchive(): void;
  onUnarchive(): void;
  onTrash(): void;
  onRestore(): void;
  onDeletePermanently(): void;
  onSetColor(color: NoteColor): void;
  onSetLabelMembership(labelId: string, assigned: boolean): void;
}

type BulkPanel = 'color' | 'labels' | null;

export function BulkSelectionToolbar({
  mode,
  selectedNotes,
  visibleCount,
  labels,
  labelIdsByNote,
  onClear,
  onSelectAll,
  onSetPinned,
  onArchive,
  onUnarchive,
  onTrash,
  onRestore,
  onDeletePermanently,
  onSetColor,
  onSetLabelMembership,
}: BulkSelectionToolbarProps) {
  const toolbarRef = useRef<HTMLDivElement>(null);
  const [openPanel, setOpenPanel] = useState<BulkPanel>(null);
  const selectedCount = selectedNotes.length;
  const allPinned = selectedCount > 0 && selectedNotes.every((note) => note.pinnedAt !== null);

  const labelCounts = useMemo(() => {
    const counts = new Map<string, number>();
    for (const note of selectedNotes) {
      for (const labelId of labelIdsByNote[note.id] ?? []) {
        counts.set(labelId, (counts.get(labelId) ?? 0) + 1);
      }
    }
    return counts;
  }, [labelIdsByNote, selectedNotes]);

  useEffect(() => {
    if (!openPanel) return;

    const handlePointerDown = (event: PointerEvent) => {
      const target = event.target;
      if (!(target instanceof Node)) return;
      if (toolbarRef.current?.contains(target)) return;
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
    <div
      ref={toolbarRef}
      className="bulk-selection-toolbar"
      role="toolbar"
      aria-label="Selected notes actions"
      data-mode={mode}
    >
      <div className="bulk-selection-summary">
        <IconButton className="bulk-selection-icon" label="Exit selection" onClick={onClear}>
          <X />
        </IconButton>
        <strong>{selectedCount} selected</strong>
        {selectedCount < visibleCount ? (
          <button className="bulk-selection-text-action" type="button" onClick={onSelectAll}>
            Select all {visibleCount}
          </button>
        ) : null}
      </div>

      <div className="bulk-selection-actions">
        {mode === 'notes' ? (
          <IconButton
            className="bulk-selection-icon"
            label={allPinned ? 'Unpin selected notes' : 'Pin selected notes'}
            onClick={() => onSetPinned(!allPinned)}
          >
            {allPinned ? <PinOff /> : <Pin />}
          </IconButton>
        ) : null}

        {mode !== 'trash' ? (
          <>
            <div className="bulk-selection-action-slot">
              <IconButton
                className="bulk-selection-icon"
                label="Change color for selected notes"
                aria-expanded={openPanel === 'color'}
                onClick={() => setOpenPanel((current) => (current === 'color' ? null : 'color'))}
              >
                <Palette />
              </IconButton>
              {openPanel === 'color' ? (
                <BulkColorPanel
                  onChange={(color) => {
                    setOpenPanel(null);
                    onSetColor(color);
                  }}
                />
              ) : null}
            </div>

            <div className="bulk-selection-action-slot">
              <IconButton
                className="bulk-selection-icon"
                label="Change labels for selected notes"
                aria-expanded={openPanel === 'labels'}
                onClick={() => setOpenPanel((current) => (current === 'labels' ? null : 'labels'))}
              >
                <Tag />
              </IconButton>
              {openPanel === 'labels' ? (
                <BulkLabelPanel
                  labels={labels}
                  selectedCount={selectedCount}
                  labelCounts={labelCounts}
                  onChange={onSetLabelMembership}
                />
              ) : null}
            </div>
          </>
        ) : null}

        {mode === 'notes' ? (
          <IconButton
            className="bulk-selection-icon"
            label="Archive selected notes"
            onClick={onArchive}
          >
            <Archive />
          </IconButton>
        ) : null}

        {mode === 'archive' ? (
          <IconButton
            className="bulk-selection-icon"
            label="Move selected notes to Notes"
            onClick={onUnarchive}
          >
            <RotateCcw />
          </IconButton>
        ) : null}

        {mode !== 'trash' ? (
          <IconButton
            className="bulk-selection-icon"
            label="Move selected notes to trash"
            onClick={onTrash}
          >
            <Trash2 />
          </IconButton>
        ) : null}

        {mode === 'trash' ? (
          <>
            <IconButton
              className="bulk-selection-icon"
              label="Restore selected notes"
              onClick={onRestore}
            >
              <RotateCcw />
            </IconButton>
            <IconButton
              className="bulk-selection-icon bulk-selection-danger"
              label="Delete selected notes permanently"
              onClick={onDeletePermanently}
            >
              <Trash2 />
            </IconButton>
          </>
        ) : null}
      </div>
    </div>
  );
}

function BulkColorPanel({ onChange }: { onChange(color: NoteColor): void }) {
  return (
    <div
      className="bulk-selection-popover bulk-color-panel"
      role="dialog"
      aria-label="Bulk note color"
    >
      <span className="note-organization-title">Color</span>
      <div className="bulk-color-grid">
        {NOTE_COLORS.map((color) => (
          <button
            key={color}
            type="button"
            className="note-color-swatch"
            data-color={color}
            aria-label={`Set ${displayColor(color)} color on selected notes`}
            onClick={() => onChange(color)}
          />
        ))}
      </div>
    </div>
  );
}

function BulkLabelPanel({
  labels,
  selectedCount,
  labelCounts,
  onChange,
}: {
  labels: LabelRecord[];
  selectedCount: number;
  labelCounts: Map<string, number>;
  onChange(labelId: string, assigned: boolean): void;
}) {
  return (
    <div
      className="bulk-selection-popover bulk-label-panel"
      role="dialog"
      aria-label="Bulk note labels"
    >
      <span className="note-organization-title">Labels</span>
      {labels.length === 0 ? (
        <p className="note-organization-empty">Create a label from the sidebar first.</p>
      ) : (
        <div className="bulk-label-list">
          {labels.map((label) => {
            const count = labelCounts.get(label.id) ?? 0;
            const all = selectedCount > 0 && count === selectedCount;
            const mixed = count > 0 && !all;
            return (
              <button
                className="bulk-label-option"
                key={label.id}
                type="button"
                data-state={all ? 'all' : mixed ? 'mixed' : 'none'}
                aria-pressed={all}
                aria-label={`${all ? 'Remove' : 'Add'} label ${label.name} ${all ? 'from' : 'to'} selected notes`}
                onClick={() => onChange(label.id, !all)}
              >
                <span className="bulk-label-check" aria-hidden="true">
                  {all ? <Check /> : mixed ? <CheckCheck /> : null}
                </span>
                <span>{label.name}</span>
                {mixed ? <span className="bulk-label-mixed">Some</span> : null}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

function displayColor(color: NoteColor): string {
  return color.charAt(0).toUpperCase() + color.slice(1);
}
