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
  const selected = new Set(selectedLabelIds);

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
                  onChange={() => {
                    const next = checked
                      ? selectedLabelIds.filter((id) => id !== label.id)
                      : [...selectedLabelIds, label.id];
                    onChange(next);
                  }}
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
