import { useEffect, useState } from 'react';
import { BellOff, EyeOff, LockKeyhole, ShieldCheck, Trash2, X } from 'lucide-react';

import { clearRecentSearches } from '../search/searchHistory';
import { usePrivacy } from './PrivacyContext';
import { supportsPrivacyLock, validatePrivacyPasscode } from './privacy';

export function PrivacySettingsDialog({ onClose }: { onClose(): void }) {
  const {
    hidePreviews,
    privateNotifications,
    autoLockMinutes,
    lockEnabled,
    setPreferences,
    enableLock,
    changePasscode,
    disableLock,
    lock,
  } = usePrivacy();
  const [newPasscode, setNewPasscode] = useState('');
  const [confirmPasscode, setConfirmPasscode] = useState('');
  const [currentPasscode, setCurrentPasscode] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  const resetFeedback = () => {
    setMessage(null);
    setErrorMessage(null);
  };

  const validateNewPasscode = () => {
    const validation = validatePrivacyPasscode(newPasscode);
    if (validation) return validation;
    if (newPasscode !== confirmPasscode) return 'Passcodes do not match.';
    return null;
  };

  const enable = async () => {
    resetFeedback();
    const validation = validateNewPasscode();
    if (validation) {
      setErrorMessage(validation);
      return;
    }
    setBusy(true);
    try {
      await enableLock(newPasscode);
      setNewPasscode('');
      setConfirmPasscode('');
      setMessage('Privacy lock enabled. It will be required after reload and whenever Notes locks.');
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Privacy lock could not be enabled.');
    } finally {
      setBusy(false);
    }
  };

  const change = async () => {
    resetFeedback();
    const validation = validateNewPasscode();
    if (validation) {
      setErrorMessage(validation);
      return;
    }
    if (!currentPasscode) {
      setErrorMessage('Enter the current passcode first.');
      return;
    }
    setBusy(true);
    try {
      if (!(await changePasscode(currentPasscode, newPasscode))) {
        setErrorMessage('Current passcode is incorrect.');
        return;
      }
      setCurrentPasscode('');
      setNewPasscode('');
      setConfirmPasscode('');
      setMessage('Privacy passcode changed.');
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Privacy passcode could not be changed.');
    } finally {
      setBusy(false);
    }
  };

  const disable = async () => {
    resetFeedback();
    if (!currentPasscode) {
      setErrorMessage('Enter the current passcode first.');
      return;
    }
    setBusy(true);
    try {
      if (!(await disableLock(currentPasscode))) {
        setErrorMessage('Current passcode is incorrect.');
        return;
      }
      setCurrentPasscode('');
      setNewPasscode('');
      setConfirmPasscode('');
      setMessage('Privacy lock disabled on this device.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="privacy-dialog-layer" role="presentation" onPointerDown={onClose}>
      <section
        className="privacy-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="privacy-settings-title"
        onPointerDown={(event) => event.stopPropagation()}
      >
        <header className="privacy-dialog-header">
          <div>
            <span className="privacy-dialog-icon" aria-hidden="true">
              <ShieldCheck />
            </span>
            <div>
              <p>Device privacy</p>
              <h2 id="privacy-settings-title">Privacy settings</h2>
            </div>
          </div>
          <button type="button" aria-label="Close privacy settings" onClick={onClose}>
            <X />
          </button>
        </header>

        <div className="privacy-dialog-body">
          <p className="privacy-boundary">
            These controls reduce casual exposure on this device. They do not encrypt browser storage,
            replace operating-system security, or add cloud accounts.
          </p>

          <section className="privacy-setting-group" aria-labelledby="privacy-visibility-heading">
            <h3 id="privacy-visibility-heading">On-screen privacy</h3>
            <label className="privacy-switch-row">
              <span className="privacy-setting-icon" aria-hidden="true">
                <EyeOff />
              </span>
              <span>
                <strong>Hide note previews</strong>
                <small>Replace card titles, content, labels, reminders, and attachment thumbnails with a neutral placeholder.</small>
              </span>
              <input
                type="checkbox"
                checked={hidePreviews}
                onChange={(event) => setPreferences({ hidePreviews: event.target.checked })}
              />
            </label>

            <label className="privacy-switch-row">
              <span className="privacy-setting-icon" aria-hidden="true">
                <BellOff />
              </span>
              <span>
                <strong>Private reminder notifications</strong>
                <small>Show a generic reminder instead of note title or content. Notifications are always redacted while Notes is locked.</small>
              </span>
              <input
                type="checkbox"
                checked={privateNotifications}
                onChange={(event) => setPreferences({ privateNotifications: event.target.checked })}
              />
            </label>
          </section>

          <section className="privacy-setting-group" aria-labelledby="privacy-lock-heading">
            <div className="privacy-setting-heading-row">
              <div>
                <h3 id="privacy-lock-heading">Privacy lock</h3>
                <p>{lockEnabled ? 'Enabled on this browser profile.' : 'Not enabled on this browser profile.'}</p>
              </div>
              {lockEnabled ? (
                <button
                  className="privacy-secondary-button"
                  type="button"
                  onClick={() => {
                    onClose();
                    lock();
                  }}
                >
                  <LockKeyhole aria-hidden="true" /> Lock now
                </button>
              ) : null}
            </div>

            {supportsPrivacyLock() ? (
              <>
                {lockEnabled ? (
                  <label className="privacy-field">
                    <span>Current passcode</span>
                    <input
                      type="password"
                      autoComplete="current-password"
                      value={currentPasscode}
                      onChange={(event) => setCurrentPasscode(event.target.value)}
                    />
                  </label>
                ) : null}

                <div className="privacy-passcode-grid">
                  <label className="privacy-field">
                    <span>{lockEnabled ? 'New passcode' : 'Passcode'}</span>
                    <input
                      type="password"
                      autoComplete="new-password"
                      value={newPasscode}
                      onChange={(event) => setNewPasscode(event.target.value)}
                    />
                  </label>
                  <label className="privacy-field">
                    <span>Confirm passcode</span>
                    <input
                      type="password"
                      autoComplete="new-password"
                      value={confirmPasscode}
                      onChange={(event) => setConfirmPasscode(event.target.value)}
                    />
                  </label>
                </div>

                <div className="privacy-lock-actions">
                  <button
                    type="button"
                    disabled={busy || !newPasscode || !confirmPasscode}
                    onClick={() => void (lockEnabled ? change() : enable())}
                  >
                    <LockKeyhole aria-hidden="true" />
                    {lockEnabled ? 'Change passcode' : 'Enable privacy lock'}
                  </button>
                  {lockEnabled ? (
                    <button
                      className="privacy-danger-button"
                      type="button"
                      disabled={busy || !currentPasscode}
                      onClick={() => void disable()}
                    >
                      Disable lock
                    </button>
                  ) : null}
                </div>
              </>
            ) : (
              <p className="privacy-unavailable">Web Crypto is unavailable, so privacy lock cannot be enabled in this browser.</p>
            )}

            <label className="privacy-field privacy-auto-lock-field">
              <span>Auto-lock after Notes is hidden</span>
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
          </section>

          <section className="privacy-setting-group" aria-labelledby="privacy-traces-heading">
            <h3 id="privacy-traces-heading">Local traces</h3>
            <div className="privacy-cleanup-row">
              <div>
                <strong>Recent searches</strong>
                <small>Saved searches remain in the normal backed-up settings table. Recent searches are disposable device-local history.</small>
              </div>
              <button
                className="privacy-secondary-button"
                type="button"
                onClick={() => {
                  clearRecentSearches();
                  setMessage('Recent search history cleared.');
                  setErrorMessage(null);
                }}
              >
                <Trash2 aria-hidden="true" /> Clear recent searches
              </button>
            </div>
          </section>

          {message ? <p className="privacy-success" role="status">{message}</p> : null}
          {errorMessage ? <p className="privacy-error" role="alert">{errorMessage}</p> : null}
        </div>
      </section>
    </div>
  );
}
