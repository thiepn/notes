import { useState } from 'react';
import {
  Archive,
  Bell,
  DatabaseBackup,
  Lightbulb,
  Pencil,
  Search,
  ShieldCheck,
  Tag,
  Trash2,
} from 'lucide-react';

import type { LabelRecord } from '../db';
import type { NavigationStats } from '../features/organization/navigationStats';

export type AppSection = 'notes' | 'reminders' | 'archive' | 'trash' | 'backup';

interface AppSidebarProps {
  activeSection: AppSection;
  activeLabelId: string | null;
  labels: LabelRecord[];
  counts: NavigationStats;
  compact: boolean;
  mobileOpen: boolean;
  mobile: boolean;
  onNavigate: (section: AppSection) => void;
  onLabelNavigate: (labelId: string) => void;
  onManageLabels: () => void;
}

const PRIMARY_NAVIGATION = [
  { id: 'notes', label: 'Notes', icon: Lightbulb },
  { id: 'reminders', label: 'Reminders', icon: Bell },
] satisfies Array<{ id: AppSection; label: string; icon: typeof Lightbulb }>;

const LIBRARY_NAVIGATION = [
  { id: 'archive', label: 'Archive', icon: Archive },
  { id: 'trash', label: 'Trash', icon: Trash2 },
] satisfies Array<{ id: AppSection; label: string; icon: typeof Lightbulb }>;

export function AppSidebar({
  activeSection,
  activeLabelId,
  labels,
  counts,
  compact,
  mobileOpen,
  mobile,
  onNavigate,
  onLabelNavigate,
  onManageLabels,
}: AppSidebarProps) {
  const [labelQuery, setLabelQuery] = useState('');
  const showLabelSearch = labels.length >= 6 && !compact;
  const normalizedLabelQuery = showLabelSearch ? labelQuery.trim().toLocaleLowerCase() : '';
  const visibleLabels = normalizedLabelQuery
    ? labels.filter((label) => label.name.toLocaleLowerCase().includes(normalizedLabelQuery))
    : labels;

  const navigateLabel = (labelId: string) => {
    setLabelQuery('');
    onLabelNavigate(labelId);
  };

  return (
    <aside
      className="app-sidebar"
      id="app-navigation"
      aria-label="Primary navigation"
      aria-hidden={mobile && !mobileOpen}
      data-compact={compact}
      data-open={mobileOpen}
      data-testid="app-sidebar"
      inert={mobile && !mobileOpen}
    >
      <nav className="sidebar-nav">
        {PRIMARY_NAVIGATION.map(({ id, label, icon: Icon }) => {
          const active = activeSection === id && (id !== 'notes' || activeLabelId === null);
          const count = id === 'notes' ? counts.notes : counts.reminders;
          return (
            <button
              className="nav-item"
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
                  const active = activeLabelId === label.id;
                  return (
                    <button
                      className="nav-item sidebar-label-item"
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
            const active = activeSection === id && activeLabelId === null;
            const count = id === 'archive' ? counts.archive : counts.trash;
            return (
              <button
                className="nav-item"
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

        <div className="sidebar-section sidebar-tools-section">
          <div className="sidebar-section-heading sidebar-section-heading-static">
            <DatabaseBackup aria-hidden="true" />
            <span>Tools</span>
          </div>
          <button
            className="nav-item"
            type="button"
            data-active={activeSection === 'backup' && activeLabelId === null}
            aria-current={activeSection === 'backup' && activeLabelId === null ? 'page' : undefined}
            onClick={() => onNavigate('backup')}
          >
            <DatabaseBackup aria-hidden="true" />
            <span className="nav-label">Backup & import</span>
          </button>
        </div>
      </nav>

      <div className="sidebar-footer">
        <ShieldCheck aria-hidden="true" />
        <div>
          <strong>Local-first</strong>
          <span>Stored on this device</span>
        </div>
      </div>
    </aside>
  );
}
