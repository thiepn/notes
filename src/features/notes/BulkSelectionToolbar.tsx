import { useLayoutEffect, useMemo, useRef, useState } from 'react';
import {
  Archive,
  Check,
  CheckCheck,
  Download,
  Palette,
  Pin,
  PinOff,
  RotateCcw,
  Search,
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
  onExport(): void;
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
  onExport,
  onArchive,
  onUnarchive,
  onTrash,
  onRestore,
  onDeletePermanently,
  onSetColor,
  onSetLabelMembership,
}: BulkSelectionToolbarProps) {
  const toolbarRef = useRef<HTMLDivElement>(null);
  const colorTriggerRef = useRef<HTMLButtonElement>(null);
  const labelsTriggerRef = useRef<HTMLButtonElement>(null);
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

  useLayoutEffect(() => {
    if (!openPanel) return;

    // Focus the first control as part of the mount commit instead of scheduling a later frame.
    // A delayed focus callback could otherwise steal focus back after a keyboard user had already
    // moved to another control in the popover.
    const panel = toolbarRef.current?.querySelector<HTMLElement>('.bulk-selection-popover');
    const first = panel?.querySelector<HTMLElement>(
      'input:not([disabled]), button:not([disabled]), [tabindex]:not([tabindex="-1"])',
    );
    first?.focus({ preventScroll: true });

    const handlePointerDown = (event: PointerEvent) => {
      const target = event.target;
      if (!(target instanceof Node)) return;
      if (toolbarRef.current?.contains(target)) return;
      setOpenPanel(null);
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      event.preventDefault();
      event.stopPropagation();
      const trigger = openPanel === 'color' ? colorTriggerRef.current : labelsTriggerRef.current;
      setOpenPanel(null);
      window.requestAnimationFrame(() => trigger?.focus({ preventScroll: true }));
    };

    document.addEventListener('pointerdown', handlePointerDown, true);
    window.addEventListener('keydown', handleKeyDown, true);
    return () => {
      document.removeEventListener('pointerdown', handlePointerDown, true);
      window.removeEventListener('keydown', handleKeyDown, true);
    };
  }, [openPanel]);

  const handleColorChange = (color: NoteColor) => {
    const trigger = colorTriggerRef.current;
    setOpenPanel(null);
    onSetColor(color);
    window.requestAnimationFrame(() => {
      if (trigger?.isConnected) trigger.focus({ preventScroll: true });
    });
  };

  return (
    <div
      ref={toolbarRef}
      className="bulk-selection-toolbar"
      role="toolbar"
      aria-label="Selected notes actions"
      data-mode={mode}
    >
      <div className="bulk-selection-summary">
        <span className="sr-only" role="status" aria-live="polite" aria-atomic="true">
          {selectedCount} {selectedCount === 1 ? 'note' : 'notes'} selected
        </span>
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
        <IconButton
          className="bulk-selection-icon"
          label="Export selected notes as Markdown"
          onClick={onExport}
        >
          <Download />
        </IconButton>

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
                ref={colorTriggerRef}
                className="bulk-selection-icon"
                label="Change color for selected notes"
                aria-expanded={openPanel === 'color'}
                aria-haspopup="dialog"
                aria-controls="bulk-color-panel"
                onClick={() => setOpenPanel((current) => (current === 'color' ? null : 'color'))}
              >
                <Palette />
              </IconButton>
              {openPanel === 'color' ? (
                <BulkColorPanel id="bulk-color-panel" onChange={handleColorChange} />
              ) : null}
            </div>

            <div className="bulk-selection-action-slot">
              <IconButton
                ref={labelsTriggerRef}
                className="bulk-selection-icon"
                label="Change labels for selected notes"
                aria-expanded={openPanel === 'labels'}
                aria-haspopup="dialog"
                aria-controls="bulk-label-panel"
                onClick={() => setOpenPanel((current) => (current === 'labels' ? null : 'labels'))}
              >
                <Tag />
              </IconButton>
              {openPanel === 'labels' ? (
                <BulkLabelPanel
                  id="bulk-label-panel"
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

function BulkColorPanel({ id, onChange }: { id: string; onChange(color: NoteColor): void }) {
  return (
    <div
      id={id}
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
  id,
  labels,
  selectedCount,
  labelCounts,
  onChange,
}: {
  id: string;
  labels: LabelRecord[];
  selectedCount: number;
  labelCounts: Map<string, number>;
  onChange(labelId: string, assigned: boolean): void;
}) {
  const [query, setQuery] = useState('');
  const normalizedQuery = query.trim().toLocaleLowerCase();
  const visibleLabels = normalizedQuery
    ? labels.filter((label) => label.name.toLocaleLowerCase().includes(normalizedQuery))
    : labels;

  return (
    <div
      id={id}
      className="bulk-selection-popover bulk-label-panel"
      role="dialog"
      aria-label="Bulk note labels"
    >
      <span className="note-organization-title">Labels</span>
      {labels.length === 0 ? (
        <p className="note-organization-empty">Create a label from the sidebar first.</p>
      ) : (
        <>
          {labels.length >= 6 ? (
            <label className="bulk-label-search">
              <Search aria-hidden="true" />
              <span className="sr-only">Find labels for selected notes</span>
              <input
                type="search"
                aria-label="Find labels for selected notes"
                placeholder="Find labels"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
              />
            </label>
          ) : null}
          {visibleLabels.length > 0 ? (
            <div className="bulk-label-list">
              {visibleLabels.map((label) => {
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
                    <span>{label.name}</span>
                    <span className="bulk-label-state" aria-hidden="true">
                      {all ? <CheckCheck /> : mixed ? <Check /> : null}
                    </span>
                  </button>
                );
              })}
            </div>
          ) : (
            <p className="note-organization-empty">No labels match “{query.trim()}”.</p>
          )}
        </>
      )}
    </div>
  );
}

function displayColor(color: NoteColor): string {
  return color === 'default'
    ? 'Default'
    : color.slice(0, 1).toLocaleUpperCase() + color.slice(1);
}
