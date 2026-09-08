import { useState } from 'react';
import { Cloud, CloudOff, KeyRound, RefreshCw } from 'lucide-react';

import { syncStatusLabel, useSync } from './SyncContext';

export function SyncSettings() {
  const {
    status,
    email,
    accessGranted,
    lastSyncedAt,
    message,
    signIn,
    signUp,
    claimAccess,
    signOut,
    syncNow,
  } = useSync();
  const [formEmail, setFormEmail] = useState('');
  const [password, setPassword] = useState('');
  const [setupCode, setSetupCode] = useState('');
  const [busy, setBusy] = useState(false);

  const signedIn = email !== null;
  const submit = async (mode: 'signin' | 'signup') => {
    setBusy(true);
    try {
      if (mode === 'signin') await signIn(formEmail, password);
      else await signUp(formEmail, password);
      setPassword('');
    } catch {
      // Provider surfaces the actionable error message.
    } finally {
      setBusy(false);
    }
  };

  const submitSetupCode = async () => {
    setBusy(true);
    try {
      const claimed = await claimAccess(setupCode);
      if (claimed) setSetupCode('');
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="settings-group" aria-label="Cloud sync">
      <div className="settings-group-copy">
        <strong>Cross-device sync</strong>
        <span>
          Notes remain available offline in this browser and sync through your private Supabase
          account data when signed in.
        </span>
      </div>

      <div className="settings-setting-row">
        <span className="settings-row-icon" aria-hidden="true">
          {signedIn && accessGranted ? <Cloud /> : <CloudOff />}
        </span>
        <span>
          <strong>{syncStatusLabel(status)}</strong>
          <small>
            {signedIn
              ? `${email}${lastSyncedAt ? ` · Last synced ${new Date(lastSyncedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}` : ''}`
              : 'Sign in with the same account on each device to share one notes library.'}
          </small>
        </span>
        {signedIn && accessGranted ? (
          <button
            type="button"
            disabled={busy || status === 'syncing'}
            onClick={() => void syncNow()}
          >
            <RefreshCw aria-hidden="true" /> Sync now
          </button>
        ) : null}
      </div>

      {message ? <p role="status">{message}</p> : null}

      {signedIn ? (
        <>
          {!accessGranted ? (
            <div className="settings-choice-list">
              <label>
                <span>
                  <strong>One-time setup code</strong>
                  <small>
                    Required only for the first account that claims this private Notes workspace.
                  </small>
                </span>
                <input
                  type="password"
                  autoComplete="off"
                  value={setupCode}
                  onChange={(event) => setSetupCode(event.target.value)}
                />
              </label>
              <button
                className="settings-secondary-action"
                type="button"
                disabled={busy || setupCode.trim().length < 12}
                onClick={() => void submitSetupCode()}
              >
                <KeyRound aria-hidden="true" /> Claim private workspace
              </button>
            </div>
          ) : null}
          <button
            className="settings-secondary-action"
            type="button"
            onClick={() => void signOut()}
          >
            Sign out of cloud sync
          </button>
        </>
      ) : (
        <div className="settings-choice-list">
          <label>
            <span>
              <strong>Email</strong>
              <small>Used only for your Supabase sign-in.</small>
            </span>
            <input
              type="email"
              autoComplete="email"
              value={formEmail}
              onChange={(event) => setFormEmail(event.target.value)}
            />
          </label>
          <label>
            <span>
              <strong>Password</strong>
              <small>Use at least 8 characters.</small>
            </span>
            <input
              type="password"
              autoComplete="current-password"
              minLength={8}
              value={password}
              onChange={(event) => setPassword(event.target.value)}
            />
          </label>
          <div>
            <button
              className="settings-secondary-action"
              type="button"
              disabled={busy || !formEmail.trim() || password.length < 8}
              onClick={() => void submit('signin')}
            >
              Sign in
            </button>{' '}
            <button
              className="settings-secondary-action"
              type="button"
              disabled={busy || !formEmail.trim() || password.length < 8}
              onClick={() => void submit('signup')}
            >
              Create account
            </button>
          </div>
        </div>
      )}

      <p>
        First sync merges this device’s existing local library with the cloud library. Device-only
        settings such as theme, privacy-lock passcode, and search history are not uploaded.
      </p>
    </section>
  );
}
