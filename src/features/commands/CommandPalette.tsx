import { useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';
import { Command, Search } from 'lucide-react';

import { useDialogFocusTrap } from '../../components/ui/useDialogFocusTrap';

export interface CommandPaletteItem {
  id: string;
  label: string;
  description?: string;
  group: string;
  shortcut?: string;
  keywords?: string[];
  disabled?: boolean;
  run(): void;
}

interface CommandPaletteProps {
  commands: CommandPaletteItem[];
  onClose(): void;
}

export function CommandPalette({ commands, onClose }: CommandPaletteProps) {
  const dialogRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const [query, setQuery] = useState('');
  const [activeIndex, setActiveIndex] = useState(0);

  const filtered = useMemo(() => {
    const terms = normalize(query).split(' ').filter(Boolean);
    if (terms.length === 0) return commands;
    return commands.filter((command) => {
      const haystack = normalize(
        [command.label, command.description ?? '', command.group, ...(command.keywords ?? [])].join(
          ' ',
        ),
      );
      return terms.every((term) => haystack.includes(term));
    });
  }, [commands, query]);

  const enabledIndexes = filtered.flatMap((command, index) => (command.disabled ? [] : [index]));
  const safeActiveIndex =
    enabledIndexes.length === 0
      ? -1
      : enabledIndexes.includes(activeIndex)
        ? activeIndex
        : (enabledIndexes[0] ?? -1);
  const activeOptionId =
    safeActiveIndex >= 0 ? `command-palette-option-${safeActiveIndex}` : undefined;

  useDialogFocusTrap(dialogRef, { initialFocusRef: inputRef, onEscape: onClose });

  const execute = (command: CommandPaletteItem | undefined) => {
    if (!command || command.disabled) return;
    onClose();
    command.run();
  };

  const moveActive = (direction: 'next' | 'previous' | 'first' | 'last') => {
    if (enabledIndexes.length === 0) return;
    if (direction === 'first') {
      setActiveIndex(enabledIndexes[0] ?? 0);
      return;
    }
    if (direction === 'last') {
      setActiveIndex(enabledIndexes.at(-1) ?? 0);
      return;
    }

    const currentPosition = enabledIndexes.indexOf(safeActiveIndex);
    if (direction === 'next') {
      const nextPosition = currentPosition < 0 ? 0 : (currentPosition + 1) % enabledIndexes.length;
      setActiveIndex(enabledIndexes[nextPosition] ?? 0);
      return;
    }

    const previousPosition =
      currentPosition <= 0 ? enabledIndexes.length - 1 : currentPosition - 1;
    setActiveIndex(enabledIndexes[previousPosition] ?? 0);
  };

  const handleLayerPointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (event.target === event.currentTarget) onClose();
  };

  return (
    <div className="command-palette-layer" onPointerDown={handleLayerPointerDown}>
      <div
        ref={dialogRef}
        tabIndex={-1}
        className="command-palette"
        role="dialog"
        aria-modal="true"
        aria-label="Command palette"
        onKeyDown={(event) => {
          if (event.key === 'ArrowDown') {
            event.preventDefault();
            moveActive('next');
            return;
          }
          if (event.key === 'ArrowUp') {
            event.preventDefault();
            moveActive('previous');
            return;
          }
          if (event.key === 'Home') {
            event.preventDefault();
            moveActive('first');
            return;
          }
          if (event.key === 'End') {
            event.preventDefault();
            moveActive('last');
            return;
          }
          if (event.key === 'Enter') {
            event.preventDefault();
            execute(filtered[safeActiveIndex]);
          }
        }}
      >
        <div className="command-palette-search">
          <Search aria-hidden="true" />
          <input
            ref={inputRef}
            type="text"
            role="combobox"
            aria-label="Search commands"
            aria-controls="command-palette-results"
            aria-expanded="true"
            aria-autocomplete="list"
            aria-activedescendant={activeOptionId}
            autoComplete="off"
            placeholder="Type a command…"
            value={query}
            onChange={(event) => {
              setQuery(event.target.value);
              setActiveIndex(0);
            }}
          />
          <kbd>Esc</kbd>
        </div>

        <div
          className="command-palette-results"
          id="command-palette-results"
          role="listbox"
          aria-label="Commands"
        >
          {filtered.length === 0 ? (
            <div className="command-palette-empty" role="status">
              <Command aria-hidden="true" />
              <span>No matching commands</span>
            </div>
          ) : (
            filtered.map((command, index) => {
              const active = index === safeActiveIndex;
              const previousGroup = index > 0 ? filtered[index - 1]?.group : null;
              const showGroup = index === 0 || previousGroup !== command.group;
              return (
                <div className="command-palette-entry" key={command.id}>
                  {showGroup ? <div className="command-palette-group">{command.group}</div> : null}
                  <button
                    id={`command-palette-option-${index}`}
                    className="command-palette-item"
                    type="button"
                    role="option"
                    aria-selected={active}
                    data-active={active}
                    disabled={command.disabled}
                    tabIndex={-1}
                    onMouseEnter={() => {
                      if (!command.disabled) setActiveIndex(index);
                    }}
                    onClick={() => execute(command)}
                  >
                    <span className="command-palette-copy">
                      <strong>{command.label}</strong>
                      {command.description ? <small>{command.description}</small> : null}
                    </span>
                    {command.shortcut ? <kbd>{command.shortcut}</kbd> : null}
                  </button>
                </div>
              );
            })
          )}
        </div>

        <div className="command-palette-footer" aria-hidden="true">
          <span>
            <kbd>↑</kbd>
            <kbd>↓</kbd> Navigate
          </span>
          <span>
            <kbd>Enter</kbd> Run
          </span>
          <span>
            <kbd>Esc</kbd> Close
          </span>
        </div>
      </div>
    </div>
  );
}

function normalize(value: string): string {
  return value.toLocaleLowerCase().trim().replace(/\s+/gu, ' ');
}
