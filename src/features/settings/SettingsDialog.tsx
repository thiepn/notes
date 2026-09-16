import { useEffect, useRef, useState, type KeyboardEvent } from 'react';
import {
  BellRing,
  Cloud,
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

import { useDialogFocusTrap } from '../../components/ui/useDialogFocusTrap';
import { usePrivacy } from '../privacy/PrivacyContext';
import { ReminderNotificationSettings } from '../reminders/ReminderNotificationSettings';
import { clearRecentSearches, readRecentSearches } from '../search/searchHistory';
import { StorageHealthSettings } from '../storage/StorageHealthSettings';
import { SyncSettings } from '../sync/SyncSettings';
import { useTheme } from '../../theme/ThemeContext';
import type { ThemePreference } from '../../theme/theme';

export type SettingsSection =
  'appearance' | 'sync' | 'privacy' | 'notifications' | 'search' | 'advanced';
export type SettingsInitialFocus = 'close' | 'privacy-lock';

interface SettingsDialogProps {
  initialSection?: SettingsSection;
  initialFocus?: SettingsInitialFocus;
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
  {
    id: 'appearance',
    label: 'Appearance',
    description: 'Theme and visual behavior',
    icon: Palette,
  },
  {
    id: 'sync',
    label: 'Account & sync',
    description: 'Cross-device cloud sync',
    icon: Cloud,
  },
  {
    id: 'privacy',
    label: 'Privacy',
    description: 'Screen privacy and device lock',
    icon: ShieldCheck,
  },
  {
    id: 'notifications',
    label: 'Notifications',
    description: 'Local reminder alerts',
    icon: BellRing,
  },
  {
    id: 'search',
    label: 'Search & history',
    description: 'Disposable search traces',
    icon: Search,
  },
  {
    id: 'advanced',
    label: 'Data & advanced',
    description: 'Backup, restore, and import',
    icon: DatabaseBackup,
  },
];

const THEME_OPTIONS: Array<{ value: ThemePreference; label: string; detail: string }> = [
  { value: 'system', label: 'System', detail: 'Follow your operating-system appearance.' },
  { value: 'light', label: 'Light', detail: 'Always use the light interface.' },
  { value: 'dark', label: 'Dark', detail: 'Always use the dark interface.' },
];

export function SettingsDialog({
  initialSection = 'appearance',
  initialFocus,
  onClose,
  onOpenBackup,
  onOpenPrivacyLock,
}: SettingsDialogProps) {
  const [section, setSection] = useState<SettingsSection>(initialSection);
  const [recentSearchCount, setRecentSearchCount] = useState(() => readRecentSearches().length);
  const [recentSearchFeedback, setRecentSearchFeedback] = useState<string | null>(null);
  const dialogRef = useRef<HTMLElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const privacyLockRef = useRef<HTMLButtonElement>(null);
  const recentSearchFeedbackRef = useRef<HTMLParagraphElement>(null);
  const sectionButtonRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const { preference, setPreference } = useTheme();
  const { hidePreviews, privateNotifications, autoLockMinutes, lockEnabled, setPreferences, lock } =
    usePrivacy();
  const resolvedInitialFocus =
    initialFocus ?? (initialSection === 'privacy' ? 'privacy-lock' : 'close');

  useDialogFocusTrap(dialogRef, {
    onEscape: onClose,
    initialFocusRef: resolvedInitialFocus === 'privacy-lock' ? privacyLockRef : closeRef,
  });

  const activeSection = SECTIONS.find((item) => item.id === section) ?? SECTIONS[0]!;
  const activeSectionIndex = SECTIONS.findIndex((item) => item.id === section);

  useEffect(() => {
    const activeButton = sectionButtonRefs.current[activeSectionIndex];
    if (!activeButton) return;
    const frame = window.requestAnimationFrame(() => {
      activeButton.scrollIntoView({ block: 'nearest', inline: 'nearest' });
    });
    return () => window.cancelAnimationFrame(frame);
  }, [activeSectionIndex]);

  const activateSectionAt = (index: number, focus = false) => {
    const normalizedIndex = (index + SECTIONS.length) % SECTIONS.length;
    const next = SECTIONS[normalizedIndex];
    if (!next) return;
    setSection(next.id);
    setRecentSearchFeedback(null);
    if (focus) sectionButtonRefs.current[normalizedIndex]?.focus({ preventScroll: true });
  };

  const handleSectionKeyDown = (event: KeyboardEvent<HTMLButtonElement>, index: number) => {
    let nextIndex: number | null = null;
    if (event.key === 'ArrowDown' || event.key === 'ArrowRight') nextIndex = index + 1;
    if (event.key === 'ArrowUp' || event.key === 'ArrowLeft') nextIndex = index - 1;
    if (event.key === 'Home') nextIndex = 0;
    if (event.key === 'End') nextIndex = SECTIONS.length - 1;
    if (nextIndex === null) return;
    event.preventDefault();
    activateSectionAt(nextIndex, true);
  };

  const clearRecentHistory = () => {
    clearRecentSearches();
    setRecentSearchCount(0);
    setRecentSearchFeedback('Recent search history cleared. Saved searches were kept.');
    window.requestAnimationFrame(() =>
      recentSearchFeedbackRef.current?.focus({ preventScroll: true }),
    );
  };

  const openBackupWorkspace = () => {
    onOpenBackup();
    window.requestAnimationFrame(() =>
      document.getElementById('main-content')?.focus({ preventScroll: true }),
    );
  };

  return (
    <div className="settings-dialog-layer" role="presentation" onPointerDown={onClose}>
      <section
        ref={dialogRef}
        tabIndex={-1}
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
            {SECTIONS.map(({ id, label, description, icon: Icon }, index) => (
              <button
                ref={(node) => {
                  sectionButtonRefs.current[index] = node;
                }}
                key={id}
                className="settings-nav-item"
                type="button"
                data-active={section === id}
                aria-current={section === id ? 'page' : undefined}
                aria-controls={`settings-section-${id}`}
                onClick={() => activateSectionAt(index)}
                onKeyDown={(event) => handleSectionKeyDown(event, index)}
              >
                <Icon aria-hidden="true" />
                <span>
                  <strong>{label}</strong>
                  <small>{description}</small>
                </span>
              </button>
            ))}
          </nav>

          <div
            className="settings-content"
            data-section={section}
            id={`settings-section-${section}`}
            role="region"
            aria-labelledby={`settings-section-heading-${section}`}
          >
            <div className="settings-section-heading">
              <h3 id={`settings-section-heading-${section}`}>{activeSection.label}</h3>
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

            {section === 'sync' ? <SyncSettings /> : null}

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
                      <small>
                        Mask titles, content, labels, reminders, and attachment previews on cards.
                      </small>
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
                    <button ref={privacyLockRef} type="button" onClick={onOpenPrivacyLock}>
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
                    onClick={clearRecentHistory}
                  >
                    <Trash2 aria-hidden="true" /> Clear recent
                  </button>
                </div>
                <p className="settings-note">
                  Saved searches are intentional library settings and remain available from the
                  search box. Clearing recent history does not remove them.
                </p>
                {recentSearchFeedback ? (
                  <p
                    ref={recentSearchFeedbackRef}
                    className="settings-action-status"
                    role="status"
                    tabIndex={-1}
                  >
                    {recentSearchFeedback}
                  </p>
                ) : null}
              </section>
            ) : null}

            {section === 'advanced' ? (
              <>
                <StorageHealthSettings />
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
                    <button type="button" onClick={openBackupWorkspace}>
                      Open backup & import
                    </button>
                  </div>
                </section>
                <section
                  className="settings-group settings-boundary"
                  aria-label="Advanced feature boundary"
                >
                  <strong>Contextual tools stay contextual</strong>
                  <p>
                    Drawing, voice, OCR, attachments, history, connections, and note conversion stay
                    inside each note’s Add/More menus. They are capabilities, not global
                    preferences, so they do not clutter Settings.
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
