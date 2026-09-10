import { useEffect, useRef, useState } from 'react';
import {
  Archive,
  Bell,
  Command,
  DatabaseBackup,
  Lightbulb,
  Pencil,
  Plus,
  Search,
  Settings2,
  Tag,
  Trash2,
  X,
} from 'lucide-react';

import { notesDocumentTitle, workspaceAnnouncement } from '../app/documentContext';
import type { LabelRecord } from '../db';
import type { NavigationStats } from '../features/organization/navigationStats';
import { SyncIndicator } from '../features/sync/SyncIndicator';
import { useDialogFocusTrap } from './ui/useDialogFocusTrap';

export type AppSection = 'notes' | 'reminders' | 'archive' | 'trash' | 'backup';

interface AppSidebarProps {
  activeSection: AppSection;
  activeLabelId: string | null;
  searchActive: boolean;
  labels: LabelRecord[];
  counts: NavigationStats;
  compact: boolean;
  mobileOpen: boolean;
  mobile: boolean;
  tablet: boolean;
  onNavigate: (section: AppSection) => void;
  onSearch: () => void;
  onLabelNavigate: (labelId: string) => void;
  onManageLabels: () => void;
  onCreateNote: () => void;
  onCommands: () => void;
  onSettings: () => void;
  onCloseNavigation: () => void;
}

const WORKSPACE_NAVIGATION = [
  { id: 'notes', label: 'Notes', icon: Lightbulb },
  { id: 'search', label: 'Search', icon: Search },
  { id: 'reminders', label: 'Reminders', icon: Bell },
] as const;

const LIBRARY_NAVIGATION = [
  { id: 'archive', label: 'Archive', icon: Archive },
  { id: 'trash', label: 'Trash', icon: Trash2 },
] satisfies Array<{ id: AppSection; label: string; icon: typeof Lightbulb }>;

const SECTION_TITLES: Record<AppSection, string> = {
  notes: 'Notes',
  reminders: 'Reminders',
  archive: 'Archive',
  trash: 'Trash',
  backup: 'Backup',
};

export function AppSidebar({
  activeSection,
  activeLabelId,
  searchActive,
  labels,
  counts,
  compact,
  mobileOpen,
  mobile,
  tablet,
  onNavigate,
  onSearch,
  onLabelNavigate,
  onManageLabels,
  onCreateNote,
  onCommands,
  onSettings,
  onCloseNavigation,
}: AppSidebarProps) {
  const sidebarRef = useRef<HTMLElement>(null);
  useDialogFocusTrap(sidebarRef, { enabled: mobile && mobileOpen });
  const [labelQuery, setLabelQuery] = useState('');
  const showLabelSearch = labels.length >= 6 && !compact;
  const normalizedLabelQuery = showLabelSearch ? labelQuery.trim().toLocaleLowerCase() : '';
  const visibleLabels = normalizedLabelQuery
    ? labels.filter((label) => label.name.toLocaleLowerCase().includes(normalizedLabelQuery))
    : labels;
  const activeLabelName = activeLabelId
    ? (labels.find((label) => label.id === activeLabelId)?.name ?? null)
    : null;
  const currentWorkspaceTitle = searchActive
    ? 'Search'
    : (activeLabelName ?? SECTION_TITLES[activeSection]);

  useEffect(() => {
    document.title = notesDocumentTitle(currentWorkspaceTitle);
  }, [currentWorkspaceTitle]);

  const navigateLabel = (labelId: string) => {
    setLabelQuery('');
    onLabelNavigate(labelId);
  };

  return (
    <>
      <p
        className="sr-only"
        role="status"
        aria-live="polite"
        aria-atomic="true"
        data-testid="workspace-announcer"
      >
        {workspaceAnnouncement(currentWorkspaceTitle)}
      </p>
      <aside
        ref={sidebarRef}
        tabIndex={-1}
        className="app-sidebar"
        id="app-navigation"
        role={mobile && mobileOpen ? 'dialog' : undefined}
        aria-modal={mobile && mobileOpen ? true : undefined}
        aria-label="Primary navigation"
        aria-hidden={mobile && !mobileOpen}
        data-compact={compact}
        data-open={mobileOpen}
        data-tablet={tablet}
        data-testid="app-sidebar"
        inert={mobile && !mobileOpen}
      >
        {mobile ? (
          <div className="sidebar-mobile-heading">
            <strong>Navigation</strong>
            <button type="button" aria-label="Hide navigation" onClick={onCloseNavigation}>
              <X aria-hidden="true" />
            </button>
          </div>
        ) : null}

        <nav className="sidebar-nav" aria-label="Notes navigation">
          <button
            type="button"
            className="sidebar-capture"
            onClick={onCreateNote}
            aria-label="Write a new note"
            title={compact ? 'New note' : undefined}
          >
            <Plus aria-hidden="true" />
            <span>New note</span>
            <kbd>C</kbd>
          </button>

          <p className="sidebar-eyebrow">Workspace</p>
          {WORKSPACE_NAVIGATION.map(({ id, label, icon: Icon }) => {
            const active =
              id === 'search'
                ? searchActive
                : !searchActive &&
                  activeSection === id &&
                  (id !== 'notes' || activeLabelId === null);
            const count =
              id === 'notes' ? counts.notes : id === 'reminders' ? counts.reminders : null;
            const activate = () => {
              if (id === 'search') onSearch();
              else onNavigate(id);
            };
            return (
              <button
                className="nav-item"
                aria-label={label}
                title={compact ? label : undefined}
                type="button"
                data-active={active}
                aria-current={active ? 'page' : undefined}
                onClick={activate}
                key={id}
              >
                <Icon aria-hidden="true" />
                <span className="nav-label">{label}</span>
                {count !== null ? (
                  <span className="nav-count" aria-hidden="true">
                    {count}
                  </span>
                ) : null}
              </button>
            );
          })}

          <div className="sidebar-section sidebar-label-section">
            <div className="sidebar-section-heading">
              <Tag aria-hidden="true" />
              <span>Labels</span>
              <button
                className="sidebar-label-manager"
                type="button"
                aria-label="Edit labels"
                title="Edit labels"
                onClick={onManageLabels}
              >
                <Pencil aria-hidden="true" />
              </button>
            </div>

            {showLabelSearch ? (
              <label className="sidebar-label-search">
                <Search aria-hidden="true" />
                <span className="sr-only">Find labels</span>
                <input
                  type="search"
                  aria-label="Find labels"
                  placeholder="Find labels"
                  value={labelQuery}
                  onChange={(event) => setLabelQuery(event.target.value)}
                />
              </label>
            ) : null}

            {labels.length > 0 ? (
              visibleLabels.length > 0 ? (
                <div className="sidebar-label-list">
                  {visibleLabels.map((label) => {
                    const active = !searchActive && activeLabelId === label.id;
                    return (
                      <button
                        className="nav-item sidebar-label-item"
                        aria-label={label.name}
                        type="button"
                        data-active={active}
                        aria-current={active ? 'page' : undefined}
                        onClick={() => navigateLabel(label.id)}
                        key={label.id}
                      >
                        <Tag aria-hidden="true" />
                        <span className="nav-label">{label.name}</span>
                        <span className="nav-count" aria-hidden="true">
                          {counts.labels[label.id] ?? 0}
                        </span>
                      </button>
                    );
                  })}
                </div>
              ) : (
                <p className="sidebar-label-empty">No matching labels</p>
              )
            ) : (
              <button className="sidebar-empty-labels" type="button" onClick={onManageLabels}>
                No labels yet
              </button>
            )}
          </div>

          <div className="sidebar-section sidebar-library-section">
            <div className="sidebar-section-heading sidebar-section-heading-static">
              <Archive aria-hidden="true" />
              <span>Library</span>
            </div>
            {LIBRARY_NAVIGATION.map(({ id, label, icon: Icon }) => {
              const active = !searchActive && activeSection === id && activeLabelId === null;
              const count = id === 'archive' ? counts.archive : counts.trash;
              return (
                <button
                  className="nav-item"
                  aria-label={label}
                  title={compact ? label : undefined}
                  type="button"
                  data-active={active}
                  aria-current={active ? 'page' : undefined}
                  onClick={() => onNavigate(id)}
                  key={id}
                >
                  <Icon aria-hidden="true" />
                  <span className="nav-label">{label}</span>
                  <span className="nav-count" aria-hidden="true">
                    {count}
                  </span>
                </button>
              );
            })}
          </div>

          <div className="sidebar-section sidebar-utilities-section">
            <button
              type="button"
              className="nav-item"
              aria-label="Backup & import"
              title={compact ? 'Backup & import' : undefined}
              data-active={!searchActive && activeSection === 'backup'}
              aria-current={!searchActive && activeSection === 'backup' ? 'page' : undefined}
              onClick={() => onNavigate('backup')}
            >
              <DatabaseBackup aria-hidden="true" />
              <span className="nav-label">Backup & import</span>
            </button>
            <button
              type="button"
              className="nav-item"
              aria-label="Settings"
              title={compact ? 'Settings' : undefined}
              onClick={onSettings}
            >
              <Settings2 aria-hidden="true" />
              <span className="nav-label">Settings</span>
            </button>
            <button
              type="button"
              className="nav-item"
              aria-label="Commands"
              title={compact ? 'Commands' : undefined}
              onClick={onCommands}
            >
              <Command aria-hidden="true" />
              <span className="nav-label">Commands</span>
              <kbd>Ctrl K</kbd>
            </button>
          </div>
        </nav>

        <div className="sidebar-footer">
          <SyncIndicator />
        </div>
      </aside>
    </>
  );
}
