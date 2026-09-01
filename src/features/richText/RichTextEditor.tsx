import { useRef, useState, type KeyboardEvent as ReactKeyboardEvent, type RefObject } from 'react';
import {
  Bold,
  Code2,
  Eye,
  Heading2,
  Italic,
  Link2,
  List,
  ListOrdered,
  Pencil,
  Quote,
  Strikethrough,
} from 'lucide-react';

import { applyRichTextCommand, type RichTextCommand } from './richText';
import { RichTextContent } from './RichTextContent';

interface RichTextEditorProps {
  value: string;
  onChange(value: string): void;
  textareaRef?: RefObject<HTMLTextAreaElement | null>;
  className: string;
  ariaLabel: string;
  placeholder: string;
  rows?: number;
  autoFocus?: boolean;
}

const COMMANDS: Array<{
  command: RichTextCommand;
  label: string;
  shortcut?: string;
  icon: typeof Bold;
}> = [
  { command: 'bold', label: 'Bold', shortcut: 'Ctrl+B', icon: Bold },
  { command: 'italic', label: 'Italic', shortcut: 'Ctrl+I', icon: Italic },
  { command: 'strike', label: 'Strikethrough', icon: Strikethrough },
  { command: 'code', label: 'Inline code', icon: Code2 },
  { command: 'link', label: 'Link', shortcut: 'Ctrl+K', icon: Link2 },
  { command: 'heading', label: 'Heading', icon: Heading2 },
  { command: 'bulletList', label: 'Bulleted list', icon: List },
  { command: 'orderedList', label: 'Numbered list', icon: ListOrdered },
  { command: 'quote', label: 'Quote', icon: Quote },
];

export function RichTextEditor({
  value,
  onChange,
  textareaRef,
  className,
  ariaLabel,
  placeholder,
  rows = 1,
  autoFocus = false,
}: RichTextEditorProps) {
  const internalRef = useRef<HTMLTextAreaElement>(null);
  const activeRef = textareaRef ?? internalRef;
  const [preview, setPreview] = useState(false);

  const apply = (command: RichTextCommand) => {
    const textarea = activeRef.current;
    if (!textarea) return;
    const result = applyRichTextCommand(
      value,
      textarea.selectionStart ?? value.length,
      textarea.selectionEnd ?? value.length,
      command,
    );
    onChange(result.value);
    requestAnimationFrame(() => {
      const target = activeRef.current;
      if (!target) return;
      target.focus();
      target.setSelectionRange(result.selectionStart, result.selectionEnd);
    });
  };

  const handleKeyDown = (event: ReactKeyboardEvent<HTMLTextAreaElement>) => {
    if (!(event.metaKey || event.ctrlKey) || event.altKey) return;
    const key = event.key.toLowerCase();
    const command = key === 'b' ? 'bold' : key === 'i' ? 'italic' : key === 'k' ? 'link' : null;
    if (!command) return;
    event.preventDefault();
    apply(command);
  };

  return (
    <div className="rich-text-editor" data-preview={preview}>
      <div className="rich-text-toolbar" role="toolbar" aria-label="Text formatting">
        {COMMANDS.map(({ command, label, shortcut, icon: Icon }) => (
          <button
            className="rich-text-toolbar-button"
            type="button"
            aria-label={shortcut ? `${label} (${shortcut})` : label}
            title={shortcut ? `${label} (${shortcut})` : label}
            disabled={preview}
            key={command}
            onClick={() => apply(command)}
          >
            <Icon aria-hidden="true" />
          </button>
        ))}
        <span className="rich-text-toolbar-spacer" />
        <button
          className="rich-text-toolbar-button rich-text-preview-toggle"
          type="button"
          aria-label={preview ? 'Edit formatted text' : 'Preview formatted text'}
          aria-pressed={preview}
          title={preview ? 'Edit' : 'Preview'}
          onClick={() => setPreview((current) => !current)}
        >
          {preview ? <Pencil aria-hidden="true" /> : <Eye aria-hidden="true" />}
        </button>
      </div>

      {preview ? (
        <div
          className={`${className} rich-text-preview`}
          role="region"
          aria-label="Formatted preview"
        >
          {value ? (
            <RichTextContent value={value} />
          ) : (
            <span className="rich-text-preview-empty">{placeholder}</span>
          )}
        </div>
      ) : (
        <textarea
          ref={activeRef}
          className={className}
          value={value}
          aria-label={ariaLabel}
          placeholder={placeholder}
          rows={rows}
          autoFocus={autoFocus}
          onChange={(event) => onChange(event.target.value)}
          onKeyDown={handleKeyDown}
        />
      )}
    </div>
  );
}
