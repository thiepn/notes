import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
} from 'react';
import { Command, Search } from 'lucide-react';

import { subscribeAppEvent } from '../../app/events';
import { useDialogFocusTrap } from '../../components/ui/useDialogFocusTrap';
import { NotesRepository, notesDatabase } from '../../db';
import { requestLinkedNoteOpen, requestSavedSearchOpen } from '../links/navigation';
import {
  SearchHistoryRepository,
  summarizeSearch,
  type SavedSearch,
} from '../search/searchHistory';
import { rankCommandCandidates } from './commandRanking';
import { rankQuickOpenNotes, type QuickOpenNote } from './knowledgeCommands';

export interface CommandPaletteItem {
  id: string;
  label: string;
  description?: string;
  group: string;
  shortcut?: string;
  keywords?: string[];
  disabled?: boolean;
  kind?: 'action' | 'note' | 'saved-search' | 'search';
  run(): void;
}

interface CommandPaletteProps {
  commands: CommandPaletteItem[];
  onClose(): void;
  onSearchNotes?(query: string): void;
}

const notesRepository = new NotesRepository(notesDatabase);
const searchHistoryRepository = new SearchHistoryRepository(notesDatabase);

export function CommandPalette({ commands, onClose, onSearchNotes }: CommandPaletteProps) {
  const dialogRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const [query, setQuery] = useState('');
  const [activeIndex, setActiveIndex] = useState(0);
  const [quickOpenNotes, setQuickOpenNotes] = useState<QuickOpenNote[]>([]);
  const [savedSearches, setSavedSearches] = useState<SavedSearch[]>([]);

  useEffect(() => {
    let cancelled = false;

    const loadKnowledgeNavigation = async () => {
      try {
        const [active, archived, saved] = await Promise.all([
          notesRepository.listActive(),
          notesRepository.listArchived(),
          searchHistoryRepository.listSaved(),
        ]);
        if (cancelled) return;
        setQuickOpenNotes([...active, ...archived]);
        setSavedSearches(saved);
      } catch {
        if (cancelled) return;
        setQuickOpenNotes([]);
        setSavedSearches([]);
      }
    };

    void loadKnowledgeNavigation();
    const unsubscribeCloudSync = subscribeAppEvent('cloudSyncApplied', () => {
      void loadKnowledgeNavigation();
    });
    const unsubscribeSearchHistory = subscribeAppEvent('searchHistoryChanged', () => {
      void loadKnowledgeNavigation();
    });

    return () => {
      cancelled = true;
      unsubscribeCloudSync();
      unsubscribeSearchHistory();
    };
  }, []);

  const smartCollectionCommands = useMemo<CommandPaletteItem[]>(
    () =>
      savedSearches.map((search) => {
        const summary = summarizeSearch(search);
        return {
          id: `smart-collection:${search.id}`,
          label: `Smart collection: ${summary.title}`,
          description: summary.detail ?? 'Saved search',
          group: 'Smart collections',
          kind: 'saved-search',
          keywords: [
            'saved search',
            'smart collection',
            search.query,
            summary.title,
            summary.detail ?? '',
          ],
          run: () => {
            void requestSavedSearchOpen(search.id);
          },
        };
      }),
    [savedSearches],
  );

  const quickOpenCommands = useMemo<CommandPaletteItem[]>(
    () =>
      rankQuickOpenNotes(quickOpenNotes, query).map(({ note }) => ({
        id: `quick-open-note:${note.id}`,
        label: `Open note: ${note.title.trim() || 'Untitled note'}`,
        description: `${note.archivedAt === null ? 'Notes' : 'Archive'} · ${note.type === 'checklist' ? 'Checklist' : 'Text note'}`,
        group: 'Notes',
        kind: 'note',
        keywords: ['open note', 'find note', note.title],
        run: () => {
          void requestLinkedNoteOpen(note.id);
        },
      })),
    [quickOpenNotes, query],
  );

  const commandCatalog = useMemo(
    () => [...commands, ...smartCollectionCommands, ...quickOpenCommands],
    [commands, quickOpenCommands, smartCollectionCommands],
  );

  const filtered = useMemo(() => {
    const ranked = rankCommandCandidates(commandCatalog, query, 24).map(({ item }) => item);
    const trimmedQuery = query.trim();
    if (!onSearchNotes || trimmedQuery.length < 2) return ranked;

    const searchCommand: CommandPaletteItem = {
      id: `full-search:${trimmedQuery}`,
      label: `Search notes for “${trimmedQuery}”`,
      description: 'Search titles, text, checklists, labels, attachments, and OCR',
      group: 'Search',
      kind: 'search',
      keywords: [],
      run: () => onSearchNotes(trimmedQuery),
    };

    if (ranked.length === 0) return [searchCommand];
    return [ranked[0]!, searchCommand, ...ranked.slice(1)];
  }, [commandCatalog, onSearchNotes, query]);

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

    const previousPosition = currentPosition <= 0 ? enabledIndexes.length - 1 : currentPosition - 1;
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
            placeholder="Commands, notes, or search anything…"
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
              <span>No matching commands or notes</span>
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
                    data-kind={command.kind ?? 'action'}
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
