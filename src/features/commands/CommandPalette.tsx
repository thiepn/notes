import { useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';
import { Command, Search } from 'lucide-react';

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
  const inputRef = useRef<HTMLInputElement>(null);
  const [query, setQuery] = useState('');
  const [activeIndex, setActiveIndex] = useState(0);

  const filtered = useMemo(() => {
    const terms = normalize(query).split(' ').filter(Boolean);
    if (terms.length === 0) return commands;
    return commands.filter((command) => {
      const haystack = normalize(
        [command.label, command.description ?? '', command.group, ...(command.keywords ?? [])].join(' '),
      );
      return terms.every((term) => haystack.includes(term));
    });
  }, [commands, query]);

  const safeActiveIndex = filtered.length === 0 ? -1 : Math.min(activeIndex, filtered.length - 1);

  useEffect(() => {
    const frame = window.requestAnimationFrame(() => inputRef.current?.focus());
    return () => window.cancelAnimationFrame(frame);
  }, []);

  const execute = (command: CommandPaletteItem | undefined) => {
    if (!command || command.disabled) return;
    onClose();
    command.run();
  };

  const handleLayerPointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (event.target === event.currentTarget) onClose();
  };

  return (
    <div className="command-palette-layer" onPointerDown={handleLayerPointerDown}>
      <div
        className="command-palette"
        role="dialog"
        aria-modal="true"
        aria-label="Command palette"
        onKeyDown={(event) => {
          if (event.key === 'Escape') {
            event.preventDefault();
            onClose();
            return;
          }
          if (event.key === 'ArrowDown') {
            event.preventDefault();
            if (filtered.length > 0) setActiveIndex((index) => (index + 1) % filtered.length);
            return;
          }
          if (event.key === 'ArrowUp') {
            event.preventDefault();
            if (filtered.length > 0) {
              setActiveIndex((index) => (index - 1 + filtered.length) % filtered.length);
            }
            return;
          }
          if (event.key === 'Home') {
            event.preventDefault();
            if (filtered.length > 0) setActiveIndex(0);
            return;
          }
          if (event.key === 'End') {
            event.preventDefault();
            if (filtered.length > 0) setActiveIndex(filtered.length - 1);
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

        <div className="command-palette-results" id="command-palette-results" role="listbox">
          {filtered.length === 0 ? (
            <div className="command-palette-empty">
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
                    className="command-palette-item"
                    type="button"
                    role="option"
                    aria-selected={active}
                    data-active={active}
                    disabled={command.disabled}
                    onMouseEnter={() => setActiveIndex(index)}
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
          <span><kbd>↑</kbd><kbd>↓</kbd> Navigate</span>
          <span><kbd>Enter</kbd> Run</span>
          <span><kbd>Esc</kbd> Close</span>
        </div>
      </div>
    </div>
  );
}

function normalize(value: string): string {
  return value.toLocaleLowerCase().trim().replace(/\s+/gu, ' ');
}
