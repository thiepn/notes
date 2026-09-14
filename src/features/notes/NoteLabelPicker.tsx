import { useRef, useState } from 'react';
import { Search } from 'lucide-react';

import type { LabelRecord } from '../../db';

interface NoteLabelPickerProps {
  id?: string;
  labels: LabelRecord[];
  noteLabel: string;
  selectedLabelIds: string[];
  onChange(labelIds: string[]): void;
}

export function NoteLabelPicker({
  id,
  labels,
  noteLabel,
  selectedLabelIds,
  onChange,
}: NoteLabelPickerProps) {
  const [query, setQuery] = useState('');
  const [localSelectedLabelIds, setLocalSelectedLabelIds] = useState(selectedLabelIds);
  const selectionRef = useRef(selectedLabelIds);
  const selected = new Set(localSelectedLabelIds);
  const showSearch = labels.length >= 6;
  const normalizedQuery = showSearch ? query.trim().toLocaleLowerCase() : '';
  const visibleLabels = normalizedQuery
    ? labels.filter((label) => label.name.toLocaleLowerCase().includes(normalizedQuery))
    : labels;

  const handleToggle = (labelId: string) => {
    const current = selectionRef.current;
    const checked = current.includes(labelId);
    const next = checked ? current.filter((itemId) => itemId !== labelId) : [...current, labelId];

    selectionRef.current = next;
    setLocalSelectedLabelIds(next);
    onChange(next);
  };

  return (
    <div
      id={id}
      className="note-organization-popover note-label-picker"
      role="dialog"
      aria-label="Note labels"
      tabIndex={-1}
    >
      <span className="note-organization-title">Labels</span>
      {labels.length > 0 ? (
        <>
          {showSearch ? (
            <label className="bulk-label-search">
              <Search aria-hidden="true" />
              <span className="sr-only">Find labels for note</span>
              <input
                type="search"
                aria-label="Find labels for note"
                placeholder="Find labels"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
              />
            </label>
          ) : null}
          {visibleLabels.length > 0 ? (
            <div className="note-label-picker-list">
              {visibleLabels.map((label) => {
                const checked = selected.has(label.id);
                return (
                  <label className="note-label-picker-option" key={label.id}>
                    <input
                      type="checkbox"
                      checked={checked}
                      aria-label={`${checked ? 'Remove' : 'Add'} label ${label.name}: ${noteLabel}`}
                      onChange={() => handleToggle(label.id)}
                    />
                    <span>{label.name}</span>
                  </label>
                );
              })}
            </div>
          ) : (
            <p className="note-organization-empty">No matching labels.</p>
          )}
        </>
      ) : (
        <p className="note-organization-empty">Create a label from the sidebar first.</p>
      )}
    </div>
  );
}
