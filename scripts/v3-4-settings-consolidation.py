from pathlib import Path


def replace_exact(path: str, old: str, new: str, expected: int = 1) -> None:
    file = Path(path)
    text = file.read_text()
    count = text.count(old)
    if count != expected:
        raise SystemExit(f"Expected {expected} matches in {path}, found {count}: {old[:120]!r}")
    file.write_text(text.replace(old, new))


settings_dir = Path('src/features/settings')
settings_dir.mkdir(parents=True, exist_ok=True)
settings_dir.joinpath('SettingsDialog.tsx').write_text(r'''import { useEffect, useRef, useState } from 'react';
import {
  BellRing,
  DatabaseBackup,
  EyeOff,
  LockKeyhole,
  Palette,
  Search,
  Settings2,
  ShieldCheck,
  Trash2,
  X,
} from 'lucide-react';

import { usePrivacy } from '../privacy/PrivacyContext';
import { ReminderNotificationSettings } from '../reminders/ReminderNotificationSettings';
import { clearRecentSearches, readRecentSearches } from '../search/searchHistory';
import { useTheme } from '../../theme/ThemeContext';
import type { ThemePreference } from '../../theme/theme';

export type SettingsSection = 'appearance' | 'privacy' | 'notifications' | 'search' | 'advanced';

interface SettingsDialogProps {
  initialSection?: SettingsSection;
  onClose(): void;
  onOpenBackup(): void;
  onOpenPrivacyLock(): void;
}

const SECTIONS: Array<{
  id: SettingsSection;
  label: string;
  description: string;
  icon: typeof Palette;
}> = [
  { id: 'appearance', label: 'Appearance', description: 'Theme and visual behavior', icon: Palette },
  { id: 'privacy', label: 'Privacy', description: 'Screen privacy and device lock', icon: ShieldCheck },
  { id: 'notifications', label: 'Notifications', description: 'Local reminder alerts', icon: BellRing },
  { id: 'search', label: 'Search & history', description: 'Disposable search traces', icon: Search },
  { id: 'advanced', label: 'Data & advanced', description: 'Backup, restore, and import', icon: DatabaseBackup },
];

const THEME_OPTIONS: Array<{ value: ThemePreference; label: string; detail: string }> = [
  { value: 'system', label: 'System', detail: 'Follow your operating-system appearance.' },
  { value: 'light', label: 'Light', detail: 'Always use the light interface.' },
  { value: 'dark', label: 'Dark', detail: 'Always use the dark interface.' },
];

export function SettingsDialog({
  initialSection = 'appearance',
  onClose,
  onOpenBackup,
  onOpenPrivacyLock,
}: SettingsDialogProps) {
  const [section, setSection] = useState<SettingsSection>(initialSection);
  const [recentSearchCount, setRecentSearchCount] = useState(() => readRecentSearches().length);
  const closeRef = useRef<HTMLButtonElement>(null);
  const { preference, setPreference } = useTheme();
  const {
    hidePreviews,
    privateNotifications,
    autoLockMinutes,
    lockEnabled,
    setPreferences,
    lock,
  } = usePrivacy();

  useEffect(() => {
    closeRef.current?.focus();
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      event.preventDefault();
      onClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  const activeSection = SECTIONS.find((item) => item.id === section) ?? SECTIONS[0];

  return (
    <div className="settings-dialog-layer" role="presentation" onPointerDown={onClose}>
      <section
        className="settings-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="settings-dialog-title"
        onPointerDown={(event) => event.stopPropagation()}
      >
        <header className="settings-dialog-header">
          <div>
            <span className="settings-dialog-icon" aria-hidden="true">
              <Settings2 />
            </span>
            <div>
              <p>Notes preferences</p>
              <h2 id="settings-dialog-title">Settings</h2>
            </div>
          </div>
          <button ref={closeRef} type="button" aria-label="Close settings" onClick={onClose}>
            <X />
          </button>
        </header>

        <div className="settings-dialog-layout">
          <nav className="settings-navigation" aria-label="Settings sections">
            {SECTIONS.map(({ id, label, description, icon: Icon }) => (
              <button
                key={id}
                className="settings-nav-item"
                type="button"
                data-active={section === id}
                aria-current={section === id ? 'page' : undefined}
                onClick={() => setSection(id)}
              >
                <Icon aria-hidden="true" />
                <span>
                  <strong>{label}</strong>
                  <small>{description}</small>
                </span>
              </button>
            ))}
          </nav>

          <div className="settings-content" data-section={section}>
            <div className="settings-section-heading">
              <h3>{activeSection.label}</h3>
              <p>{activeSection.description}</p>
            </div>

            {section === 'appearance' ? (
              <section className="settings-group" aria-label="Appearance preference">
                <div className="settings-group-copy">
                  <strong>Interface appearance</strong>
                  <span>Choose directly instead of cycling through themes from the header.</span>
                </div>
                <div className="settings-choice-list" role="radiogroup" aria-label="Appearance">
                  {THEME_OPTIONS.map((option) => (
                    <label key={option.value} data-selected={preference === option.value}>
                      <input
                        type="radio"
                        name="notes-appearance"
                        value={option.value}
                        checked={preference === option.value}
                        onChange={() => setPreference(option.value)}
                      />
                      <span>
                        <strong>{option.label}</strong>
                        <small>{option.detail}</small>
                      </span>
                    </label>
                  ))}
                </div>
              </section>
            ) : null}

            {section === 'privacy' ? (
              <>
                <section className="settings-group" aria-label="On-screen privacy">
                  <div className="settings-group-copy">
                    <strong>On-screen privacy</strong>
                    <span>Reduce casual exposure without changing your local data model.</span>
                  </div>
                  <label className="settings-switch-row">
                    <span className="settings-row-icon" aria-hidden="true">
                      <EyeOff />
                    </span>
                    <span>
                      <strong>Hide note previews</strong>
                      <small>Mask titles, content, labels, reminders, and attachment previews on cards.</small>
                    </span>
                    <input
                      type="checkbox"
                      checked={hidePreviews}
                      onChange={(event) => setPreferences({ hidePreviews: event.target.checked })}
                    />
                  </label>
                  <label className="settings-switch-row">
                    <span className="settings-row-icon" aria-hidden="true">
                      <BellRing />
                    </span>
                    <span>
                      <strong>Private reminder notifications</strong>
                      <small>Use generic notification text instead of note details.</small>
                    </span>
                    <input
                      type="checkbox"
                      checked={privateNotifications}
                      onChange={(event) =>
                        setPreferences({ privateNotifications: event.target.checked })
                      }
                    />
                  </label>
                </section>

                <section className="settings-group" aria-label="Privacy lock">
                  <div className="settings-setting-row settings-lock-row">
                    <span className="settings-row-icon" aria-hidden="true">
                      <LockKeyhole />
                    </span>
                    <span>
                      <strong>Privacy lock</strong>
                      <small>
                        {lockEnabled
                          ? 'Enabled on this browser profile.'
                          : 'Optional passcode gate for this browser profile.'}
                      </small>
                    </span>
                    <button type="button" onClick={onOpenPrivacyLock}>
                      {lockEnabled ? 'Manage passcode' : 'Set up privacy lock'}
                    </button>
                  </div>

                  <label className="settings-select-row">
                    <span>
                      <strong>Auto-lock after Notes is hidden</strong>
                      <small>Applies only when the privacy lock is enabled.</small>
                    </span>
                    <select
                      disabled={!lockEnabled}
                      value={autoLockMinutes === null ? 'never' : String(autoLockMinutes)}
                      onChange={(event) =>
                        setPreferences({
                          autoLockMinutes:
                            event.target.value === 'never' ? null : Number(event.target.value),
                        })
                      }
                    >
                      <option value="0">Immediately</option>
                      <option value="1">1 minute</option>
                      <option value="5">5 minutes</option>
                      <option value="15">15 minutes</option>
                      <option value="30">30 minutes</option>
                      <option value="never">Never</option>
                    </select>
                  </label>

                  {lockEnabled ? (
                    <button
                      className="settings-secondary-action"
                      type="button"
                      onClick={() => {
                        onClose();
                        lock();
                      }}
                    >
                      <LockKeyhole aria-hidden="true" /> Lock now
                    </button>
                  ) : null}
                </section>
              </>
            ) : null}

            {section === 'notifications' ? (
              <section className="settings-group" aria-label="Reminder notifications">
                <div className="settings-group-copy">
                  <strong>Reminder notifications</strong>
                  <span>
                    Browser permission is optional. Reminders themselves remain local and usable
                    without it.
                  </span>
                </div>
                <ReminderNotificationSettings />
              </section>
            ) : null}

            {section === 'search' ? (
              <section className="settings-group" aria-label="Search history settings">
                <div className="settings-setting-row">
                  <span className="settings-row-icon" aria-hidden="true">
                    <Search />
                  </span>
                  <span>
                    <strong>Recent searches</strong>
                    <small>
                      {recentSearchCount === 0
                        ? 'No disposable recent searches are stored on this device.'
                        : `${recentSearchCount} recent ${recentSearchCount === 1 ? 'search is' : 'searches are'} stored on this device.`}
                    </small>
                  </span>
                  <button
                    type="button"
                    disabled={recentSearchCount === 0}
                    onClick={() => {
                      clearRecentSearches();
                      setRecentSearchCount(0);
                    }}
                  >
                    <Trash2 aria-hidden="true" /> Clear recent
                  </button>
                </div>
                <p className="settings-note">
                  Saved searches are intentional library settings and remain available from the
                  search box. Clearing recent history does not remove them.
                </p>
              </section>
            ) : null}

            {section === 'advanced' ? (
              <>
                <section className="settings-group" aria-label="Backup and import">
                  <div className="settings-setting-row">
                    <span className="settings-row-icon" aria-hidden="true">
                      <DatabaseBackup />
                    </span>
                    <span>
                      <strong>Backup, restore & import</strong>
                      <small>
                        Export the complete local library, restore a backup, or import Google Keep
                        Takeout archives.
                      </small>
                    </span>
                    <button type="button" onClick={onOpenBackup}>
                      Open backup & import
                    </button>
                  </div>
                </section>
                <section className="settings-group settings-boundary" aria-label="Advanced feature boundary">
                  <strong>Contextual tools stay contextual</strong>
                  <p>
                    Drawing, voice, OCR, attachments, history, connections, and note conversion stay
                    inside each note’s Add/More menus. They are capabilities, not global preferences,
                    so they do not clutter Settings.
                  </p>
                </section>
              </>
            ) : null}
          </div>
        </div>
      </section>
    </div>
  );
}
''')

Path('src/styles/settings.css').write_text(r'''.settings-dialog-layer {
  position: fixed;
  z-index: calc(var(--z-modal) + 20);
  inset: 0;
  display: grid;
  place-items: center;
  padding: var(--space-5);
  background: rgb(15 18 24 / 42%);
  backdrop-filter: blur(5px);
}

.settings-dialog {
  display: grid;
  width: min(900px, calc(100vw - 32px));
  height: min(680px, calc(100dvh - 48px));
  grid-template-rows: auto minmax(0, 1fr);
  overflow: hidden;
  border: 1px solid var(--border-strong);
  border-radius: 24px;
  background: var(--surface);
  box-shadow: 0 24px 80px rgb(15 18 24 / 28%);
  color: var(--text);
}

.settings-dialog-header {
  display: flex;
  min-height: 76px;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-4);
  padding: var(--space-4) var(--space-5);
  border-bottom: 1px solid var(--border);
}

.settings-dialog-header > div {
  display: flex;
  align-items: center;
  gap: var(--space-3);
}

.settings-dialog-header p,
.settings-dialog-header h2 {
  margin: 0;
}

.settings-dialog-header p {
  margin-bottom: 2px;
  color: var(--text-subtle);
  font-size: var(--text-xs);
  font-weight: 700;
  letter-spacing: 0.04em;
  text-transform: uppercase;
}

.settings-dialog-header h2 {
  font-size: 1.25rem;
}

.settings-dialog-icon,
.settings-row-icon {
  display: grid;
  flex: 0 0 auto;
  place-items: center;
  border-radius: var(--radius-md);
  background: var(--surface-subtle);
  color: var(--text-muted);
}

.settings-dialog-icon {
  width: 40px;
  height: 40px;
}

.settings-dialog-icon svg,
.settings-row-icon svg {
  width: 19px;
  height: 19px;
}

.settings-dialog-header > button {
  display: grid;
  width: 40px;
  height: 40px;
  place-items: center;
  padding: 0;
  border: 0;
  border-radius: var(--radius-pill);
  background: transparent;
  color: var(--text-muted);
  cursor: pointer;
}

.settings-dialog-header > button:hover,
.settings-dialog-header > button:focus-visible {
  background: var(--surface-hover);
  color: var(--text);
  outline: 0;
}

.settings-dialog-layout {
  display: grid;
  min-height: 0;
  grid-template-columns: 230px minmax(0, 1fr);
}

.settings-navigation {
  display: grid;
  align-content: start;
  gap: 4px;
  padding: var(--space-4);
  overflow: auto;
  border-right: 1px solid var(--border);
  background: color-mix(in srgb, var(--surface-subtle) 72%, var(--surface));
}

.settings-nav-item {
  display: grid;
  grid-template-columns: 28px minmax(0, 1fr);
  align-items: center;
  gap: 9px;
  width: 100%;
  min-height: 54px;
  padding: 8px 10px;
  border: 0;
  border-radius: var(--radius-md);
  background: transparent;
  color: var(--text-muted);
  cursor: pointer;
  text-align: left;
}

.settings-nav-item > svg {
  width: 18px;
  height: 18px;
}

.settings-nav-item > span {
  display: grid;
  min-width: 0;
  gap: 2px;
}

.settings-nav-item strong {
  color: inherit;
  font-size: var(--text-sm);
}

.settings-nav-item small {
  overflow: hidden;
  color: var(--text-subtle);
  font-size: 0.72rem;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.settings-nav-item:hover,
.settings-nav-item:focus-visible,
.settings-nav-item[data-active='true'] {
  background: var(--surface-hover);
  color: var(--text);
  outline: 0;
}

.settings-nav-item[data-active='true'] {
  box-shadow: inset 3px 0 0 var(--accent-strong);
}

.settings-content {
  min-width: 0;
  padding: var(--space-5);
  overflow: auto;
  overscroll-behavior: contain;
}

.settings-section-heading {
  margin-bottom: var(--space-5);
}

.settings-section-heading h3,
.settings-section-heading p {
  margin: 0;
}

.settings-section-heading h3 {
  margin-bottom: 4px;
  font-size: 1.15rem;
}

.settings-section-heading p {
  color: var(--text-muted);
  font-size: var(--text-sm);
}

.settings-group {
  display: grid;
  gap: var(--space-3);
  padding: var(--space-4);
  border: 1px solid var(--border);
  border-radius: var(--radius-lg);
  background: var(--surface);
}

.settings-group + .settings-group {
  margin-top: var(--space-4);
}

.settings-group-copy {
  display: grid;
  gap: 3px;
}

.settings-group-copy strong,
.settings-setting-row strong,
.settings-switch-row strong,
.settings-select-row strong {
  font-size: var(--text-sm);
}

.settings-group-copy span,
.settings-setting-row small,
.settings-switch-row small,
.settings-select-row small,
.settings-note,
.settings-boundary p {
  color: var(--text-muted);
  font-size: var(--text-xs);
  line-height: 1.55;
}

.settings-choice-list {
  display: grid;
  gap: 8px;
}

.settings-choice-list label {
  display: grid;
  grid-template-columns: auto minmax(0, 1fr);
  align-items: center;
  gap: 10px;
  min-height: 56px;
  padding: 9px 12px;
  border: 1px solid var(--border);
  border-radius: var(--radius-md);
  background: var(--surface-subtle);
  cursor: pointer;
}

.settings-choice-list label[data-selected='true'] {
  border-color: var(--accent-strong);
  background: color-mix(in srgb, var(--accent-soft) 55%, var(--surface));
}

.settings-choice-list input {
  accent-color: var(--accent-strong);
}

.settings-choice-list label > span {
  display: grid;
  gap: 2px;
}

.settings-choice-list small {
  color: var(--text-muted);
  font-size: var(--text-xs);
}

.settings-switch-row,
.settings-setting-row,
.settings-select-row {
  display: grid;
  align-items: center;
  gap: var(--space-3);
  min-height: 64px;
  padding: 8px 0;
}

.settings-switch-row,
.settings-setting-row {
  grid-template-columns: 38px minmax(0, 1fr) auto;
}

.settings-select-row {
  grid-template-columns: minmax(0, 1fr) minmax(150px, auto);
}

.settings-switch-row + .settings-switch-row,
.settings-setting-row + .settings-setting-row,
.settings-select-row + .settings-select-row,
.settings-setting-row + .settings-select-row {
  border-top: 1px solid var(--border);
}

.settings-row-icon {
  width: 36px;
  height: 36px;
}

.settings-switch-row > span:nth-child(2),
.settings-setting-row > span:nth-child(2),
.settings-select-row > span:first-child {
  display: grid;
  min-width: 0;
  gap: 3px;
}

.settings-switch-row input[type='checkbox'] {
  width: 20px;
  height: 20px;
  accent-color: var(--accent-strong);
}

.settings-setting-row button,
.settings-secondary-action {
  display: inline-flex;
  min-height: 38px;
  align-items: center;
  justify-content: center;
  gap: 7px;
  padding: 0 12px;
  border: 1px solid var(--border-strong);
  border-radius: var(--radius-md);
  background: var(--surface-subtle);
  color: var(--text);
  cursor: pointer;
  font: inherit;
  font-size: var(--text-xs);
  font-weight: 700;
}

.settings-setting-row button:hover,
.settings-setting-row button:focus-visible,
.settings-secondary-action:hover,
.settings-secondary-action:focus-visible {
  background: var(--surface-hover);
  outline: 0;
}

.settings-setting-row button:disabled {
  cursor: default;
  opacity: 0.5;
}

.settings-setting-row button svg,
.settings-secondary-action svg {
  width: 15px;
  height: 15px;
}

.settings-select-row select {
  min-height: 38px;
  padding: 0 34px 0 10px;
  border: 1px solid var(--border);
  border-radius: var(--radius-md);
  background: var(--surface-subtle);
  color: var(--text);
  font: inherit;
  font-size: var(--text-sm);
}

.settings-secondary-action {
  width: fit-content;
}

.settings-note,
.settings-boundary p {
  margin: 0;
}

.settings-boundary {
  background: var(--surface-subtle);
}

.settings-boundary strong {
  font-size: var(--text-sm);
}

.deferred-settings-loading {
  display: grid;
  min-height: 100px;
  place-items: center;
  color: var(--text-muted);
  font-size: var(--text-sm);
}

.privacy-dialog[data-lock-only='true'] .privacy-boundary,
.privacy-dialog[data-lock-only='true'] .privacy-setting-group[aria-labelledby='privacy-visibility-heading'],
.privacy-dialog[data-lock-only='true'] .privacy-setting-group[aria-labelledby='privacy-traces-heading'] {
  display: none;
}

@media (max-width: 700px) {
  .settings-dialog-layer {
    padding: 0;
  }

  .settings-dialog {
    width: 100%;
    height: 100dvh;
    border: 0;
    border-radius: 0;
  }

  .settings-dialog-header {
    min-height: 68px;
    padding: calc(var(--space-3) + env(safe-area-inset-top)) var(--space-4) var(--space-3);
  }

  .settings-dialog-layout {
    grid-template-columns: 1fr;
    grid-template-rows: auto minmax(0, 1fr);
  }

  .settings-navigation {
    display: flex;
    gap: 4px;
    padding: 8px var(--space-3);
    overflow-x: auto;
    border-right: 0;
    border-bottom: 1px solid var(--border);
    scrollbar-width: none;
  }

  .settings-navigation::-webkit-scrollbar {
    display: none;
  }

  .settings-nav-item {
    display: inline-flex;
    width: auto;
    min-width: max-content;
    min-height: 44px;
    padding: 8px 11px;
  }

  .settings-nav-item > span {
    display: block;
  }

  .settings-nav-item small {
    display: none;
  }

  .settings-nav-item[data-active='true'] {
    box-shadow: inset 0 -3px 0 var(--accent-strong);
  }

  .settings-content {
    padding: var(--space-4) var(--space-3) calc(var(--space-8) + env(safe-area-inset-bottom));
  }

  .settings-switch-row,
  .settings-setting-row {
    grid-template-columns: 36px minmax(0, 1fr) auto;
  }

  .settings-setting-row button {
    grid-column: 2 / -1;
    justify-self: start;
  }

  .settings-select-row {
    grid-template-columns: 1fr;
  }

  .settings-select-row select {
    width: 100%;
  }
}
''')

# AppHeader: replace scattered global controls with one Settings entry.
replace_exact(
    'src/components/AppHeader.tsx',
    "  LockKeyhole,\n  Menu,\n  Monitor,\n  Moon,\n  MoreHorizontal,\n  Search,\n  ShieldCheck,\n  SlidersHorizontal,\n  StickyNote,\n  Sun,\n  X,\n",
    "  LockKeyhole,\n  Menu,\n  MoreHorizontal,\n  Search,\n  Settings2,\n  SlidersHorizontal,\n  StickyNote,\n  X,\n",
)
replace_exact('src/components/AppHeader.tsx', "import { PrivacySettingsDialog } from '../features/privacy/PrivacySettingsDialog';\n", '')
replace_exact(
    'src/components/AppHeader.tsx',
    "import { useTheme } from '../theme/ThemeContext';\nimport { nextThemePreference, type ThemePreference } from '../theme/theme';\n",
    '',
)
replace_exact(
    'src/components/AppHeader.tsx',
    "const THEME_LABELS: Record<ThemePreference, string> = {\n  system: 'System',\n  light: 'Light',\n  dark: 'Dark',\n};\n",
    '',
)
replace_exact(
    'src/components/AppHeader.tsx',
    "  onCommandPalette(): void;\n",
    "  onCommandPalette(): void;\n  onSettings(): void;\n",
)
replace_exact(
    'src/components/AppHeader.tsx',
    "  onCommandPalette,\n",
    "  onCommandPalette,\n  onSettings,\n",
)
replace_exact('src/components/AppHeader.tsx', "  const { preference, cyclePreference } = useTheme();\n", '')
replace_exact('src/components/AppHeader.tsx', "  const [privacyOpen, setPrivacyOpen] = useState(false);\n", '')
replace_exact(
    'src/components/AppHeader.tsx',
    "  const nextPreference = nextThemePreference(preference);\n  const ThemeIcon = preference === 'system' ? Monitor : preference === 'light' ? Sun : Moon;\n",
    '',
)
replace_exact('src/components/AppHeader.tsx', "  return (\n    <>\n      <header className=\"app-header\">", "  return (\n    <header className=\"app-header\">")
appearance_privacy = r'''              <button
                type="button"
                role="menuitem"
                onClick={() => {
                  cyclePreference();
                  setMoreOpen(false);
                }}
              >
                <ThemeIcon aria-hidden="true" />
                <span>{THEME_LABELS[preference]} appearance</span>
                <small>Next: {THEME_LABELS[nextPreference]}</small>
              </button>
              <button
                type="button"
                role="menuitem"
                onClick={() => {
                  setMoreOpen(false);
                  setPrivacyOpen(true);
                }}
              >
                <ShieldCheck aria-hidden="true" />
                <span>Privacy settings</span>
              </button>
'''
settings_button = r'''              <button
                type="button"
                role="menuitem"
                onClick={() => {
                  setMoreOpen(false);
                  onSettings();
                }}
              >
                <Settings2 aria-hidden="true" />
                <span>Settings</span>
              </button>
'''
replace_exact('src/components/AppHeader.tsx', appearance_privacy, settings_button)
replace_exact(
    'src/components/AppHeader.tsx',
    "      </header>\n\n      {privacyOpen ? <PrivacySettingsDialog onClose={() => setPrivacyOpen(false)} /> : null}\n    </>\n  );",
    "    </header>\n  );",
)

# AppShell owns the single Settings entry point and lazy-loads global settings surfaces.
replace_exact('src/app/AppShell.tsx', "import { useTheme } from '../theme/ThemeContext';\n", '')
replace_exact('src/app/AppShell.tsx', "  const { cyclePreference } = useTheme();\n", '')
replace_exact(
    'src/app/AppShell.tsx',
    "const SearchWorkspace = lazy(() =>\n  import('../features/search/SearchWorkspace').then((module) => ({\n    default: module.SearchWorkspace,\n  })),\n);\n",
    """const SearchWorkspace = lazy(() =>\n  import('../features/search/SearchWorkspace').then((module) => ({\n    default: module.SearchWorkspace,\n  })),\n);\nconst SettingsDialog = lazy(() =>\n  import('../features/settings/SettingsDialog').then((module) => ({\n    default: module.SettingsDialog,\n  })),\n);\nconst PrivacySettingsDialog = lazy(() =>\n  import('../features/privacy/PrivacySettingsDialog').then((module) => ({\n    default: module.PrivacySettingsDialog,\n  })),\n);\n""",
)
replace_exact(
    'src/app/AppShell.tsx',
    "  const [commandPaletteOpen, setCommandPaletteOpen] = useState(false);\n",
    "  const [commandPaletteOpen, setCommandPaletteOpen] = useState(false);\n  const [settingsOpen, setSettingsOpen] = useState(false);\n  const [privacyLockSettingsOpen, setPrivacyLockSettingsOpen] = useState(false);\n",
)
replace_exact(
    'src/app/AppShell.tsx',
    "    {\n      id: 'cycle-appearance',\n      label: 'Cycle appearance',\n      description: 'Switch System, Light, and Dark appearance',\n      group: 'View',\n      keywords: ['theme', 'dark', 'light'],\n      run: cyclePreference,\n    },\n",
    """    {\n      id: 'open-settings',\n      label: 'Open Settings',\n      description: 'Appearance, privacy, notifications, search history, and data tools',\n      group: 'Navigate',\n      keywords: [\n        'settings',\n        'preferences',\n        'theme',\n        'appearance',\n        'privacy',\n        'notifications',\n        'history',\n        'backup',\n      ],\n      run: () => {\n        setCommandPaletteOpen(false);\n        setSettingsOpen(true);\n      },\n    },\n""",
)
replace_exact(
    'src/app/AppShell.tsx',
    "        onCommandPalette={() => setCommandPaletteOpen(true)}\n",
    "        onCommandPalette={() => setCommandPaletteOpen(true)}\n        onSettings={() => setSettingsOpen(true)}\n",
)
replace_exact(
    'src/app/AppShell.tsx',
    "      {labelManagerOpen ? (\n",
    """      {settingsOpen ? (\n        <Suspense fallback={<div className=\"deferred-settings-loading\">Loading settings…</div>}>\n          <SettingsDialog\n            onClose={() => setSettingsOpen(false)}\n            onOpenBackup={() => {\n              setSettingsOpen(false);\n              handleNavigate('backup');\n            }}\n            onOpenPrivacyLock={() => {\n              setSettingsOpen(false);\n              setPrivacyLockSettingsOpen(true);\n            }}\n          />\n        </Suspense>\n      ) : null}\n\n      {privacyLockSettingsOpen ? (\n        <Suspense fallback={null}>\n          <PrivacySettingsDialog\n            lockOnly\n            onClose={() => {\n              setPrivacyLockSettingsOpen(false);\n              setSettingsOpen(true);\n            }}\n          />\n        </Suspense>\n      ) : null}\n\n      {labelManagerOpen ? (\n""",
)

# Sidebar: backup/import is now a Settings/command-palette destination, not persistent navigation chrome.
replace_exact('src/components/AppSidebar.tsx', '  DatabaseBackup,\n', '')
tools_block = r'''        <div className="sidebar-section sidebar-tools-section">
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
'''
replace_exact('src/components/AppSidebar.tsx', tools_block, '')

# Reminders no longer own notification permission UI.
replace_exact('src/features/reminders/RemindersWorkspace.tsx', "import { ReminderNotificationSettings } from './ReminderNotificationSettings';\n", '')
replace_exact('src/features/reminders/RemindersWorkspace.tsx', "      <ReminderNotificationSettings />\n\n", '')

# Privacy lock manager can be embedded as the specialized passcode sub-surface.
replace_exact(
    'src/features/privacy/PrivacySettingsDialog.tsx',
    "export function PrivacySettingsDialog({ onClose }: { onClose(): void }) {",
    "export function PrivacySettingsDialog({\n  onClose,\n  lockOnly = false,\n}: {\n  onClose(): void;\n  lockOnly?: boolean;\n}) {",
)
replace_exact(
    'src/features/privacy/PrivacySettingsDialog.tsx',
    '        className="privacy-dialog"\n        role="dialog"',
    '        className="privacy-dialog"\n        data-lock-only={lockOnly}\n        role="dialog"',
)

# Styles entry point.
replace_exact('src/styles.css', "@import './styles/privacy.css';\n", "@import './styles/privacy.css';\n@import './styles/settings.css';\n")

# Shell E2E: appearance now lives under Settings.
replace_exact(
    'e2e/shell.spec.ts',
    r'''test('appearance preference persists across reloads', async ({ page }) => {
  await page.goto('./');

  await page.getByTestId('header-more-toggle').click();
  await page.getByRole('menuitem', { name: /System appearance/u }).click();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
  await expect
    .poll(() => page.evaluate(() => window.localStorage.getItem('notes.theme')))
    .toBe('light');

  await page.reload();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');

  await page.getByTestId('header-more-toggle').click();
  await page.getByRole('menuitem', { name: /Light appearance/u }).click();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
});''',
    r'''test('appearance preference persists across reloads', async ({ page }) => {
  await page.goto('./');

  await page.getByTestId('header-more-toggle').click();
  await page.getByRole('menuitem', { name: 'Settings' }).click();
  let settings = page.getByRole('dialog', { name: 'Settings' });
  await settings.getByLabel('Light').check();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
  await expect
    .poll(() => page.evaluate(() => window.localStorage.getItem('notes.theme')))
    .toBe('light');
  await settings.getByRole('button', { name: 'Close settings' }).click();

  await page.reload();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');

  await page.getByTestId('header-more-toggle').click();
  await page.getByRole('menuitem', { name: 'Settings' }).click();
  settings = page.getByRole('dialog', { name: 'Settings' });
  await settings.getByLabel('Dark').check();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
});''',
)

# Privacy E2E follows the consolidated settings entry point.
replace_exact(
    'e2e/privacy.spec.ts',
    r'''async function openPrivacySettings(page: Page) {
  await page.getByRole('button', { name: 'More options' }).click();
  await page.getByRole('menuitem', { name: 'Privacy settings' }).click();
  const dialog = page.getByRole('dialog', { name: 'Privacy settings' });
  await expect(dialog).toBeVisible();
  return dialog;
}''',
    r'''async function openSettings(page: Page, section: 'Privacy' | 'Search & history') {
  await page.getByRole('button', { name: 'More options' }).click();
  await page.getByRole('menuitem', { name: 'Settings' }).click();
  const dialog = page.getByRole('dialog', { name: 'Settings' });
  await dialog.getByRole('button', { name: section }).click();
  await expect(dialog).toBeVisible();
  return dialog;
}

async function openPrivacyLockSettings(page: Page) {
  const settings = await openSettings(page, 'Privacy');
  await settings.getByRole('button', { name: /privacy lock|passcode/u }).click();
  const dialog = page.getByRole('dialog', { name: 'Privacy settings' });
  await expect(dialog).toBeVisible();
  return dialog;
}''',
)
replace_exact('e2e/privacy.spec.ts', '  const privacy = await openPrivacySettings(page);\n  await privacy.getByLabel(\'Hide note previews\').check();', "  const privacy = await openSettings(page, 'Privacy');\n  await privacy.getByLabel('Hide note previews').check();", expected=1)
replace_exact('e2e/privacy.spec.ts', "  await privacy.getByRole('button', { name: 'Close privacy settings' }).click();", "  await privacy.getByRole('button', { name: 'Close settings' }).click();", expected=1)
replace_exact('e2e/privacy.spec.ts', '  const privacy = await openPrivacySettings(page);\n  await privacy.getByLabel(\'Passcode\', { exact: true }).fill(\'4815\');', "  const privacy = await openPrivacyLockSettings(page);\n  await privacy.getByLabel('Passcode', { exact: true }).fill('4815');", expected=1)
replace_exact('e2e/privacy.spec.ts', '  const privacy = await openPrivacySettings(page);\n  await privacy.getByRole(\'button\', { name: \'Clear recent searches\' }).click();', "  const privacy = await openSettings(page, 'Search & history');\n  await privacy.getByRole('button', { name: 'Clear recent' }).click();", expected=1)
replace_exact('e2e/privacy.spec.ts', "  await expect(privacy.getByText('Recent search history cleared.')).toBeVisible();\n", '', expected=1)

# Existing backup/import E2E helpers now navigate through Settings -> Data & advanced.
def add_backup_helper(path: str) -> None:
    replace_exact(
        path,
        r'''async function waitForNotes(page: Page) {
  await expect(page.getByRole('heading', { name: 'Notes', level: 1 })).toBeVisible();
}
''',
        r'''async function waitForNotes(page: Page) {
  await expect(page.getByRole('heading', { name: 'Notes', level: 1 })).toBeVisible();
}

async function openBackupTools(page: Page) {
  await page.getByRole('button', { name: 'More options' }).click();
  await page.getByRole('menuitem', { name: 'Settings' }).click();
  const settings = page.getByRole('dialog', { name: 'Settings' });
  await settings.getByRole('button', { name: 'Data & advanced' }).click();
  await settings.getByRole('button', { name: 'Open backup & import' }).click();
  await expect(page.getByRole('heading', { name: 'Backup', level: 1 })).toBeVisible();
}
''',
    )
    text = Path(path).read_text()
    text = text.replace("await page.getByRole('button', { name: 'Backup' }).click();", 'await openBackupTools(page);')
    Path(path).write_text(text)

add_backup_helper('e2e/backup.spec.ts')
add_backup_helper('e2e/google-keep-import.spec.ts')

# google-keep-reminders has no wait helper, add a compact Settings navigator.
replace_exact(
    'e2e/google-keep-reminders.spec.ts',
    "import { expect, test } from '@playwright/test';\n",
    "import { expect, test, type Page } from '@playwright/test';\n",
)
replace_exact(
    'e2e/google-keep-reminders.spec.ts',
    "function takeoutWithReminder(): Buffer {",
    r'''async function openBackupTools(page: Page) {
  await page.getByRole('button', { name: 'More options' }).click();
  await page.getByRole('menuitem', { name: 'Settings' }).click();
  const settings = page.getByRole('dialog', { name: 'Settings' });
  await settings.getByRole('button', { name: 'Data & advanced' }).click();
  await settings.getByRole('button', { name: 'Open backup & import' }).click();
  await expect(page.getByRole('heading', { name: 'Backup', level: 1 })).toBeVisible();
}

function takeoutWithReminder(): Buffer {''',
)
replace_exact('e2e/google-keep-reminders.spec.ts', "  await page.getByRole('button', { name: 'Backup' }).click();\n", "  await openBackupTools(page);\n")

# New V3.4 consolidation regression coverage.
Path('e2e/settings-consolidation.spec.ts').write_text(r'''import { expect, test } from '@playwright/test';

async function openSettings(page: import('@playwright/test').Page) {
  await page.getByRole('button', { name: 'More options' }).click();
  const menu = page.getByRole('menu');
  await expect(menu.getByRole('menuitem', { name: 'Settings' })).toBeVisible();
  await expect(menu.getByRole('menuitem', { name: /appearance/u })).toHaveCount(0);
  await expect(menu.getByRole('menuitem', { name: 'Privacy settings' })).toHaveCount(0);
  await menu.getByRole('menuitem', { name: 'Settings' }).click();
  const settings = page.getByRole('dialog', { name: 'Settings' });
  await expect(settings).toBeVisible();
  return settings;
}

test('global preferences are consolidated under one Settings surface', async ({ page }) => {
  await page.goto('./');
  const settings = await openSettings(page);

  for (const section of [
    'Appearance',
    'Privacy',
    'Notifications',
    'Search & history',
    'Data & advanced',
  ]) {
    await expect(settings.getByRole('button', { name: section })).toBeVisible();
  }

  await settings.getByRole('button', { name: 'Privacy' }).click();
  await expect(settings.getByLabel('Hide note previews')).toBeVisible();
  await expect(settings.getByLabel('Private reminder notifications')).toBeVisible();
  await expect(settings.getByRole('button', { name: 'Set up privacy lock' })).toBeVisible();
});

test('notification permission UI lives in Settings rather than the Reminders workspace', async ({
  page,
}) => {
  await page.goto('./');
  let settings = await openSettings(page);
  await settings.getByRole('button', { name: 'Notifications' }).click();
  await expect(settings.locator('.reminder-notification-banner')).toBeVisible();
  await settings.getByRole('button', { name: 'Close settings' }).click();

  await page.getByRole('button', { name: 'Reminders', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Reminders', level: 1 })).toBeVisible();
  await expect(page.locator('.reminder-notification-banner')).toHaveCount(0);
});

test('advanced data tools leave permanent sidebar chrome and remain reachable from settings and commands', async ({
  page,
}) => {
  await page.goto('./');
  const sidebar = page.getByTestId('app-sidebar');
  await expect(sidebar.getByText('Tools', { exact: true })).toHaveCount(0);
  await expect(sidebar.getByRole('button', { name: /Backup/u })).toHaveCount(0);

  const settings = await openSettings(page);
  await settings.getByRole('button', { name: 'Data & advanced' }).click();
  await settings.getByRole('button', { name: 'Open backup & import' }).click();
  await expect(page.getByRole('heading', { name: 'Backup', level: 1 })).toBeVisible();

  await page.keyboard.press('Control+K');
  const palette = page.getByRole('dialog', { name: 'Command palette' });
  await palette.getByRole('combobox', { name: 'Search commands' }).fill('settings');
  await expect(palette.getByRole('option', { name: /Open Settings/u })).toBeVisible();
});

test('settings becomes a full-height touch-safe surface on mobile', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('./');
  const settings = await openSettings(page);
  const box = await settings.boundingBox();
  expect(box).not.toBeNull();
  expect(box!.width).toBeGreaterThanOrEqual(380);
  expect(box!.height).toBeGreaterThanOrEqual(830);
  await settings.getByRole('button', { name: 'Data & advanced' }).click();
  await expect(settings.getByRole('button', { name: 'Open backup & import' })).toBeVisible();
});
''')
