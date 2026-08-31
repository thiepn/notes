import {
  Archive,
  Bell,
  DatabaseBackup,
  Lightbulb,
  Pencil,
  ShieldCheck,
  Tag,
  Trash2,
} from 'lucide-react';

import type { LabelRecord } from '../db';

export type AppSection = 'notes' | 'reminders' | 'archive' | 'trash' | 'backup';

interface AppSidebarProps {
  activeSection: AppSection;
  activeLabelId: string | null;
  labels: LabelRecord[];
  compact: boolean;
  mobileOpen: boolean;
  mobile: boolean;
  onNavigate: (section: AppSection) => void;
  onLabelNavigate: (labelId: string) => void;
  onManageLabels: () => void;
}

const NAVIGATION = [
  { id: 'notes', label: 'Notes', icon: Lightbulb },
  { id: 'reminders', label: 'Reminders', icon: Bell },
  { id: 'archive', label: 'Archive', icon: Archive },
  { id: 'trash', label: 'Trash', icon: Trash2 },
  { id: 'backup', label: 'Backup', icon: DatabaseBackup },
] satisfies Array<{ id: AppSection; label: string; icon: typeof Lightbulb }>;

export function AppSidebar({
  activeSection,
  activeLabelId,
  labels,
  compact,
  mobileOpen,
  mobile,
  onNavigate,
  onLabelNavigate,
  onManageLabels,
}: AppSidebarProps) {
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
        {NAVIGATION.slice(0, 2).map(({ id, label, icon: Icon }) => {
          const active = activeSection === id && (id !== 'notes' || activeLabelId === null);
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

          {labels.length > 0 ? (
            <div className="sidebar-label-list">
              {labels.map((label) => {
                const active = activeLabelId === label.id;
                return (
                  <button
                    className="nav-item sidebar-label-item"
                    type="button"
                    data-active={active}
                    aria-current={active ? 'page' : undefined}
                    onClick={() => onLabelNavigate(label.id)}
                    key={label.id}
                  >
                    <Tag aria-hidden="true" />
                    <span className="nav-label">{label.name}</span>
                  </button>
                );
              })}
            </div>
          ) : (
            <button className="sidebar-empty-labels" type="button" onClick={onManageLabels}>
              No labels yet
            </button>
          )}
        </div>

        {NAVIGATION.slice(2).map(({ id, label, icon: Icon }) => {
          const active = activeSection === id && activeLabelId === null;
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
            </button>
          );
        })}
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
