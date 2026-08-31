import { useRef, useState } from 'react';

import type { LabelRecord } from '../../db';

interface NoteLabelPickerProps {
  labels: LabelRecord[];
  noteLabel: string;
  selectedLabelIds: string[];
  onChange(labelIds: string[]): void;
}

export function NoteLabelPicker({
  labels,
  noteLabel,
  selectedLabelIds,
  onChange,
}: NoteLabelPickerProps) {
  const [localSelectedLabelIds, setLocalSelectedLabelIds] = useState(selectedLabelIds);
  const selectionRef = useRef(selectedLabelIds);
  const selected = new Set(localSelectedLabelIds);

  const handleToggle = (labelId: string) => {
    const current = selectionRef.current;
    const checked = current.includes(labelId);
    const next = checked ? current.filter((id) => id !== labelId) : [...current, labelId];

    selectionRef.current = next;
    setLocalSelectedLabelIds(next);
    onChange(next);
  };

  return (
    <div
      className="note-organization-popover note-label-picker"
      role="dialog"
      aria-label="Note labels"
    >
      <span className="note-organization-title">Labels</span>
      {labels.length > 0 ? (
        <div className="note-label-picker-list">
          {labels.map((label) => {
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
        <p className="note-organization-empty">Create a label from the sidebar first.</p>
      )}
    </div>
  );
}
