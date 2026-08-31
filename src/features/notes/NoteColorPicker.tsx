import { NOTE_COLORS, type NoteColor } from '../../db';

const COLOR_LABELS: Record<NoteColor, string> = {
  default: 'Default',
  red: 'Red',
  orange: 'Orange',
  yellow: 'Yellow',
  green: 'Green',
  teal: 'Teal',
  blue: 'Blue',
  purple: 'Purple',
  pink: 'Pink',
  brown: 'Brown',
  gray: 'Gray',
};

interface NoteColorPickerProps {
  noteLabel: string;
  value: NoteColor;
  onChange(color: NoteColor): void;
}

export function NoteColorPicker({ noteLabel, value, onChange }: NoteColorPickerProps) {
  return (
    <div className="note-organization-popover note-color-picker" role="dialog" aria-label="Note color">
      <span className="note-organization-title">Color</span>
      <div className="note-color-grid">
        {NOTE_COLORS.map((color) => (
          <button
            className="note-color-swatch"
            type="button"
            data-color={color}
            data-selected={color === value}
            aria-label={`Set ${COLOR_LABELS[color]} color: ${noteLabel}`}
            aria-pressed={color === value}
            title={COLOR_LABELS[color]}
            onClick={() => onChange(color)}
            key={color}
          >
            <span aria-hidden="true" />
          </button>
        ))}
      </div>
    </div>
  );
}
