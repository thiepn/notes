import {
  useId,
  useRef,
  useState,
  type ChangeEvent as ReactChangeEvent,
  type ClipboardEvent as ReactClipboardEvent,
  type KeyboardEvent as ReactKeyboardEvent,
  type RefObject,
  type SyntheticEvent as ReactSyntheticEvent,
} from 'react';
import {
  Bold,
  BookOpen,
  Code2,
  Eye,
  Heading2,
  Italic,
  Link2,
  List,
  ListOrdered,
  Pencil,
  Quote,
  Redo2,
  Strikethrough,
  Type,
  Undo2,
} from 'lucide-react';

import {
  applySlashCommand,
  continueRichTextBlock,
  findSlashCommand,
  linkSelectionWithPastedUrl,
  type RichTextSlashCommand,
} from './editorEditing';
import { applyRichTextCommand, type RichTextCommand, type RichTextEditResult } from './richText';
import { RichTextContent, type WikiLinkRenderResolution } from './RichTextContent';

interface RichTextEditorProps {
  value: string;
  onChange(value: string): void;
  textareaRef?: RefObject<HTMLTextAreaElement | null>;
  className: string;
  ariaLabel: string;
  placeholder: string;
  rows?: number;
  autoFocus?: boolean;
  resolveWikiLink?: (title: string) => WikiLinkRenderResolution;
  onWikiLinkOpen?: (noteId: string) => void;
}

interface EditorHistoryEntry {
  value: string;
  selectionStart: number;
  selectionEnd: number;
}

interface EditorHistory {
  entries: EditorHistoryEntry[];
  index: number;
  lastKind: 'typing' | 'edit' | null;
  lastAt: number;
}

interface SlashCommandOption {
  command: RichTextSlashCommand;
  label: string;
  description: string;
  keywords: string[];
  icon: typeof Bold;
}

const MAX_HISTORY_ENTRIES = 100;
const TYPING_GROUP_MS = 650;

const COMMANDS: Array<{
  command: RichTextCommand;
  label: string;
  shortcut?: string;
  icon: typeof Bold;
}> = [
  { command: 'bold', label: 'Bold', shortcut: 'Ctrl+B', icon: Bold },
  { command: 'italic', label: 'Italic', shortcut: 'Ctrl+I', icon: Italic },
  { command: 'strike', label: 'Strikethrough', shortcut: 'Ctrl+Shift+X', icon: Strikethrough },
  { command: 'code', label: 'Inline code', icon: Code2 },
  { command: 'codeBlock', label: 'Code block', icon: Code2 },
  { command: 'link', label: 'Link', shortcut: 'Ctrl+K', icon: Link2 },
  { command: 'wikiLink', label: 'Wiki link', icon: BookOpen },
  { command: 'heading', label: 'Heading', icon: Heading2 },
  { command: 'bulletList', label: 'Bulleted list', shortcut: 'Ctrl+Shift+8', icon: List },
  { command: 'orderedList', label: 'Numbered list', shortcut: 'Ctrl+Shift+7', icon: ListOrdered },
  { command: 'quote', label: 'Quote', icon: Quote },
];

const SLASH_COMMANDS: SlashCommandOption[] = [
  {
    command: 'heading',
    label: 'Heading',
    description: 'Start a section heading',
    keywords: ['heading', 'title', 'h2'],
    icon: Heading2,
  },
  {
    command: 'bulletList',
    label: 'Bulleted list',
    description: 'Create a simple list',
    keywords: ['bullet', 'list', 'unordered'],
    icon: List,
  },
  {
    command: 'orderedList',
    label: 'Numbered list',
    description: 'Create a numbered sequence',
    keywords: ['number', 'ordered', 'list'],
    icon: ListOrdered,
  },
  {
    command: 'quote',
    label: 'Quote',
    description: 'Emphasize quoted text',
    keywords: ['quote', 'blockquote'],
    icon: Quote,
  },
  {
    command: 'codeBlock',
    label: 'Code block',
    description: 'Insert fenced code',
    keywords: ['code', 'block', 'fence'],
    icon: Code2,
  },
  {
    command: 'wikiLink',
    label: 'Wiki link',
    description: 'Link another note by title',
    keywords: ['wiki', 'link', 'note'],
    icon: BookOpen,
  },
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
  resolveWikiLink,
  onWikiLinkOpen,
}: RichTextEditorProps) {
  const internalRef = useRef<HTMLTextAreaElement>(null);
  const activeRef = textareaRef ?? internalRef;
  const slashMenuId = useId();
  const [preview, setPreview] = useState(false);
  const [formattingOpen, setFormattingOpen] = useState(false);
  const [selection, setSelection] = useState({ selectionStart: 0, selectionEnd: 0 });
  const selectionRef = useRef(selection);
  const [slashDismissed, setSlashDismissed] = useState(false);
  const [slashIndex, setSlashIndex] = useState(0);
  const [historyAvailability, setHistoryAvailability] = useState({
    canUndo: false,
    canRedo: false,
  });
  const historyRef = useRef<EditorHistory>({
    entries: [{ value, selectionStart: 0, selectionEnd: 0 }],
    index: 0,
    lastKind: null,
    lastAt: 0,
  });

  const updateSelection = (selectionStart: number, selectionEnd: number) => {
    const next = { selectionStart, selectionEnd };
    selectionRef.current = next;
    setSelection(next);
  };

  const publishHistoryAvailability = (history: EditorHistory) => {
    const next = {
      canUndo: history.index > 0,
      canRedo: history.index < history.entries.length - 1,
    };
    setHistoryAvailability((current) =>
      current.canUndo === next.canUndo && current.canRedo === next.canRedo ? current : next,
    );
  };

  const recordHistory = (entry: EditorHistoryEntry, kind: 'typing' | 'edit') => {
    const history = historyRef.current;
    const current = history.entries[history.index];
    if (
      current?.value === entry.value &&
      current.selectionStart === entry.selectionStart &&
      current.selectionEnd === entry.selectionEnd
    ) {
      return;
    }

    const now = Date.now();
    const canGroupTyping =
      kind === 'typing' &&
      history.lastKind === 'typing' &&
      now - history.lastAt <= TYPING_GROUP_MS &&
      history.index === history.entries.length - 1 &&
      history.index > 0;

    if (canGroupTyping) {
      history.entries[history.index] = entry;
    } else {
      history.entries.splice(history.index + 1);
      history.entries.push(entry);
      history.index = history.entries.length - 1;
    }

    if (history.entries.length > MAX_HISTORY_ENTRIES) {
      const excess = history.entries.length - MAX_HISTORY_ENTRIES;
      history.entries.splice(0, excess);
      history.index = Math.max(0, history.index - excess);
    }

    history.lastKind = kind;
    history.lastAt = now;
    publishHistoryAvailability(history);
  };

  const focusSelection = (selectionStart: number, selectionEnd: number) => {
    updateSelection(selectionStart, selectionEnd);
    requestAnimationFrame(() => {
      const target = activeRef.current;
      if (!target) return;
      target.focus();
      target.setSelectionRange(selectionStart, selectionEnd);
    });
  };

  const commitEdit = (result: RichTextEditResult, kind: 'typing' | 'edit' = 'edit') => {
    recordHistory(
      {
        value: result.value,
        selectionStart: result.selectionStart,
        selectionEnd: result.selectionEnd,
      },
      kind,
    );
    onChange(result.value);
    focusSelection(result.selectionStart, result.selectionEnd);
    setSlashDismissed(false);
    setSlashIndex(0);
  };

  const apply = (command: RichTextCommand) => {
    const textarea = activeRef.current;
    if (!textarea) return;
    commitEdit(
      applyRichTextCommand(
        value,
        textarea.selectionStart ?? value.length,
        textarea.selectionEnd ?? value.length,
        command,
      ),
    );
  };

  const restoreHistory = (direction: 'undo' | 'redo') => {
    const history = historyRef.current;
    const nextIndex = direction === 'undo' ? history.index - 1 : history.index + 1;
    if (nextIndex < 0 || nextIndex >= history.entries.length) return false;
    const entry = history.entries[nextIndex];
    if (!entry) return false;

    history.index = nextIndex;
    history.lastKind = null;
    history.lastAt = 0;
    publishHistoryAvailability(history);
    onChange(entry.value);
    focusSelection(entry.selectionStart, entry.selectionEnd);
    setSlashDismissed(false);
    setSlashIndex(0);
    return true;
  };

  const slashMatch =
    preview || slashDismissed
      ? null
      : findSlashCommand(value, selection.selectionStart, selection.selectionEnd);
  const slashOptions = !slashMatch
    ? []
    : !slashMatch.query
      ? SLASH_COMMANDS
      : SLASH_COMMANDS.filter((option) =>
          [option.label, option.description, ...option.keywords].some((candidate) =>
            candidate.toLocaleLowerCase().includes(slashMatch.query),
          ),
        );
  const activeSlashIndex =
    slashOptions.length === 0 ? 0 : Math.min(slashIndex, slashOptions.length - 1);
  const slashOpen = slashMatch !== null && slashOptions.length > 0;

  const chooseSlashCommand = (option: SlashCommandOption) => {
    if (!slashMatch) return;
    commitEdit(applySlashCommand(value, slashMatch, option.command));
    setFormattingOpen(false);
  };

  const handleKeyDown = (event: ReactKeyboardEvent<HTMLTextAreaElement>) => {
    if (slashOpen && slashMatch) {
      if (event.key === 'ArrowDown') {
        event.preventDefault();
        event.stopPropagation();
        setSlashIndex((index) => (index + 1) % slashOptions.length);
        return;
      }
      if (event.key === 'ArrowUp') {
        event.preventDefault();
        event.stopPropagation();
        setSlashIndex((index) => (index - 1 + slashOptions.length) % slashOptions.length);
        return;
      }
      if (event.key === 'Enter' || event.key === 'Tab') {
        const option = slashOptions[activeSlashIndex];
        if (!option) return;
        event.preventDefault();
        event.stopPropagation();
        chooseSlashCommand(option);
        return;
      }
      if (event.key === 'Escape') {
        event.preventDefault();
        event.stopPropagation();
        setSlashDismissed(true);
        return;
      }
    }

    if (event.key === 'Escape' && formattingOpen) {
      event.preventDefault();
      event.stopPropagation();
      setFormattingOpen(false);
      return;
    }

    if (
      event.key === 'Enter' &&
      !event.shiftKey &&
      !event.metaKey &&
      !event.ctrlKey &&
      !event.altKey
    ) {
      const continuation = continueRichTextBlock(
        value,
        event.currentTarget.selectionStart,
        event.currentTarget.selectionEnd,
      );
      if (continuation) {
        event.preventDefault();
        commitEdit(continuation);
        return;
      }
    }

    const modifier = event.metaKey || event.ctrlKey;
    if (!modifier || event.altKey) return;
    const key = event.key.toLocaleLowerCase();

    if (key === 'z') {
      const handled = restoreHistory(event.shiftKey ? 'redo' : 'undo');
      if (handled) {
        event.preventDefault();
        event.stopPropagation();
      }
      return;
    }
    if (key === 'y' && !event.shiftKey) {
      const handled = restoreHistory('redo');
      if (handled) {
        event.preventDefault();
        event.stopPropagation();
      }
      return;
    }

    const command =
      key === 'b' && !event.shiftKey
        ? 'bold'
        : key === 'i' && !event.shiftKey
          ? 'italic'
          : key === 'k' && !event.shiftKey
            ? 'link'
            : key === 'x' && event.shiftKey
              ? 'strike'
              : key === '7' && event.shiftKey
                ? 'orderedList'
                : key === '8' && event.shiftKey
                  ? 'bulletList'
                  : null;
    if (!command) return;
    event.preventDefault();
    event.stopPropagation();
    apply(command);
  };

  const handleChange = (event: ReactChangeEvent<HTMLTextAreaElement>) => {
    const nextValue = event.currentTarget.value;
    const nextSelectionStart = event.currentTarget.selectionStart;
    const nextSelectionEnd = event.currentTarget.selectionEnd;
    recordHistory(
      {
        value: nextValue,
        selectionStart: nextSelectionStart,
        selectionEnd: nextSelectionEnd,
      },
      'typing',
    );
    updateSelection(nextSelectionStart, nextSelectionEnd);
    setSlashDismissed(false);
    setSlashIndex(0);
    onChange(nextValue);
  };

  const handleSelection = (event: ReactSyntheticEvent<HTMLTextAreaElement>) => {
    const selectionStart = event.currentTarget.selectionStart;
    const selectionEnd = event.currentTarget.selectionEnd;
    updateSelection(selectionStart, selectionEnd);
    if (selectionStart !== selectionEnd) setFormattingOpen(true);
  };

  const handlePaste = (event: ReactClipboardEvent<HTMLTextAreaElement>) => {
    const result = linkSelectionWithPastedUrl(
      value,
      event.currentTarget.selectionStart,
      event.currentTarget.selectionEnd,
      event.clipboardData.getData('text/plain'),
    );
    if (!result) return;
    event.preventDefault();
    commitEdit(result);
  };

  return (
    <div className="rich-text-editor" data-preview={preview} data-formatting-open={formattingOpen}>
      <div className="rich-text-compact-controls">
        {!preview ? (
          <>
            <button
              className="rich-text-compact-button rich-text-history-button"
              type="button"
              aria-label="Undo"
              title="Undo (Ctrl/⌘ Z)"
              disabled={!historyAvailability.canUndo}
              onClick={() => restoreHistory('undo')}
            >
              <Undo2 aria-hidden="true" />
            </button>
            <button
              className="rich-text-compact-button rich-text-history-button"
              type="button"
              aria-label="Redo"
              title="Redo (Ctrl/⌘ Shift+Z)"
              disabled={!historyAvailability.canRedo}
              onClick={() => restoreHistory('redo')}
            >
              <Redo2 aria-hidden="true" />
            </button>
            <button
              className="rich-text-compact-button"
              type="button"
              aria-label={formattingOpen ? 'Hide formatting' : 'Show formatting'}
              aria-expanded={formattingOpen}
              title="Formatting"
              onClick={() => setFormattingOpen((current) => !current)}
            >
              <Type aria-hidden="true" />
              <span>Format</span>
            </button>
            <span className="rich-text-slash-hint" aria-hidden="true">
              / blocks
            </span>
          </>
        ) : null}
        <button
          className="rich-text-compact-button rich-text-preview-toggle"
          type="button"
          aria-label={preview ? 'Edit formatted text' : 'Preview formatted text'}
          aria-pressed={preview}
          title={preview ? 'Edit' : 'Preview'}
          onClick={() => setPreview((current) => !current)}
        >
          {preview ? <Pencil aria-hidden="true" /> : <Eye aria-hidden="true" />}
          <span>{preview ? 'Edit' : 'Preview'}</span>
        </button>
      </div>

      {formattingOpen && !preview ? (
        <div className="rich-text-toolbar" role="toolbar" aria-label="Text formatting">
          {COMMANDS.map(({ command, label, shortcut, icon: Icon }) => (
            <button
              className="rich-text-toolbar-button"
              type="button"
              aria-label={shortcut ? `${label} (${shortcut})` : label}
              title={shortcut ? `${label} (${shortcut})` : label}
              key={command}
              onClick={() => apply(command)}
            >
              <Icon aria-hidden="true" />
            </button>
          ))}
        </div>
      ) : null}

      {preview ? (
        <div
          className={`${className} rich-text-preview`}
          role="region"
          aria-label="Formatted preview"
        >
          {value ? (
            <RichTextContent
              value={value}
              resolveWikiLink={resolveWikiLink}
              onWikiLinkOpen={onWikiLinkOpen}
            />
          ) : (
            <span className="rich-text-preview-empty">{placeholder}</span>
          )}
        </div>
      ) : (
        <div className="rich-text-input-wrap">
          <textarea
            ref={activeRef}
            className={className}
            value={value}
            aria-label={ariaLabel}
            aria-controls={slashOpen ? slashMenuId : undefined}
            aria-haspopup="menu"
            aria-expanded={slashOpen}
            placeholder={placeholder}
            rows={rows}
            autoFocus={autoFocus}
            autoCapitalize="sentences"
            autoCorrect="on"
            spellCheck
            title="Type / at the start of a line for block commands"
            onChange={handleChange}
            onKeyDown={handleKeyDown}
            onSelect={handleSelection}
            onClick={handleSelection}
            onKeyUp={handleSelection}
            onPaste={handlePaste}
          />

          {slashOpen ? (
            <div
              className="rich-text-slash-menu"
              id={slashMenuId}
              role="menu"
              aria-label="Insert block"
            >
              <div className="rich-text-slash-header" aria-hidden="true">
                <span>Insert block</span>
                <span>↑↓ · Enter</span>
              </div>
              {slashOptions.map((option, index) => {
                const Icon = option.icon;
                return (
                  <button
                    className="rich-text-slash-option"
                    data-active={index === activeSlashIndex}
                    type="button"
                    role="menuitem"
                    key={option.command}
                    onMouseDown={(event) => event.preventDefault()}
                    onClick={() => chooseSlashCommand(option)}
                  >
                    <span className="rich-text-slash-icon" aria-hidden="true">
                      <Icon />
                    </span>
                    <span className="rich-text-slash-copy">
                      <strong>{option.label}</strong>
                      <span>{option.description}</span>
                    </span>
                  </button>
                );
              })}
            </div>
          ) : null}
        </div>
      )}
    </div>
  );
}
