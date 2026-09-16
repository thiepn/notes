import { useEffect, useRef, useState } from 'react';
import {
  Cloud,
  CloudOff,
  KeyRound,
  LogOut,
  Mail,
  MonitorSmartphone,
  RefreshCw,
  ShieldCheck,
  Trash2,
  UserRound,
} from 'lucide-react';

import { syncStatusLabel, useSync } from './SyncContext';
import { formatSyncActivity, syncAttentionCopy } from './syncPresentation';

type AccountAction =
  | 'signin'
  | 'signup'
  | 'claim'
  | 'sync'
  | 'password-reset'
  | 'resend-verification'
  | 'change-email'
  | 'resend-email-change'
  | 'reauthenticate'
  | 'change-password'
  | 'refresh-sessions'
  | 'signout-others'
  | 'signout-all'
  | 'signout-local'
  | 'delete-cloud'
  | 'delete-account';

export function SyncSettings() {
  const {
    status,
    email,
    pendingEmail,
    accessGranted,
    recoveryMode,
    lastSyncedAt,
    message,
    lastResult,
    sessions,
    signIn,
    signUp,
    claimAccess,
    requestPasswordReset,
    resendVerification,
    changeEmail,
    resendEmailChange,
    requestReauthentication,
    changePassword,
    refreshSessions,
    signOutOtherDevices,
    signOutAllDevices,
    deleteCloudData,
    deleteAccount,
    signOut,
    syncNow,
  } = useSync();
  const [formEmail, setFormEmail] = useState('');
  const [password, setPassword] = useState('');
  const [setupCode, setSetupCode] = useState('');
  const [newEmail, setNewEmail] = useState('');
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [reauthNonce, setReauthNonce] = useState('');
  const [deleteCloudConfirm, setDeleteCloudConfirm] = useState('');
  const [deleteAccountConfirm, setDeleteAccountConfirm] = useState('');
  const [activeAction, setActiveAction] = useState<AccountAction | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const actionErrorRef = useRef<HTMLParagraphElement>(null);

  const signedIn = email !== null;
  const busy = activeAction !== null;
  const attention =
    signedIn &&
    accessGranted &&
    !recoveryMode &&
    (status === 'offline' || status === 'pending' || status === 'error')
      ? syncAttentionCopy(status, lastResult)
      : null;

  useEffect(() => {
    if (busy || !actionError) return;
    const frame = window.requestAnimationFrame(() =>
      actionErrorRef.current?.focus({ preventScroll: true }),
    );
    return () => window.cancelAnimationFrame(frame);
  }, [actionError, busy]);

  const runBusy = async (action: AccountAction, operation: () => Promise<void>) => {
    if (busy) return;
    setActiveAction(action);
    setActionError(null);
    try {
      await operation();
    } catch (error) {
      setActionError(
        error instanceof Error
          ? error.message
          : 'The action could not be completed. Please try again.',
      );
    } finally {
      setActiveAction(null);
    }
  };

  const submit = async (mode: 'signin' | 'signup') => {
    await runBusy(mode, async () => {
      if (mode === 'signin') await signIn(formEmail, password);
      else await signUp(formEmail, password);
      setPassword('');
    });
  };

  const submitSetupCode = async () => {
    await runBusy('claim', async () => {
      const claimed = await claimAccess(setupCode);
      if (claimed) setSetupCode('');
    });
  };

  const submitPassword = async () => {
    if (newPassword !== confirmPassword || newPassword.length < 8) return;
    const options: { currentPassword?: string; nonce?: string } = {};
    if (!recoveryMode && currentPassword) options.currentPassword = currentPassword;
    if (reauthNonce) options.nonce = reauthNonce;
    await runBusy('change-password', async () => {
      await changePassword(newPassword, options);
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
      setReauthNonce('');
    });
  };

  return (
    <>
      {actionError ? (
        <p ref={actionErrorRef} role="alert" tabIndex={-1} className="settings-error">
          {actionError}
        </p>
      ) : null}
      {activeAction ? (
        <p className="settings-note" role="status" aria-live="polite">
          {accountActionLabel(activeAction)}
        </p>
      ) : null}

      <section
        className="settings-group"
        aria-label="Cloud sync"
        aria-busy={busy || status === 'syncing'}
      >
        <div className="settings-group-copy">
          <strong>Cross-device sync</strong>
          <span>
            Notes stay available offline in this browser. Sign-in uses your shared THIEPN Account,
            while the Notes library remains separately authorized and synced through its private
            cloud workspace.
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
                : 'Use the same THIEPN Account on every device to share one Notes library.'}
            </small>
          </span>
          {signedIn && accessGranted && !recoveryMode ? (
            <button
              type="button"
              disabled={busy || status === 'syncing'}
              onClick={() => void runBusy('sync', syncNow)}
            >
              <RefreshCw aria-hidden="true" /> Sync now
            </button>
          ) : null}
        </div>

        {lastResult && signedIn && accessGranted ? (
          <div className="settings-setting-row" data-testid="last-sync-activity">
            <span className="settings-row-icon" aria-hidden="true">
              <RefreshCw />
            </span>
            <span>
              <strong>Last sync activity</strong>
              <small>{formatSyncActivity(lastResult)}</small>
            </span>
          </div>
        ) : null}

        {lastResult?.conflictCopies ? (
          <p className="settings-note">
            {lastResult.conflictCopies}{' '}
            {lastResult.conflictCopies === 1 ? 'safety copy was' : 'safety copies were'} kept in
            Notes so a conflicting version is not silently lost.
          </p>
        ) : null}

        {attention ? (
          <div className="settings-choice-list" data-testid="sync-attention">
            <p className="settings-note">
              <strong>{attention.title}</strong>
              <br />
              {attention.detail}
            </p>
            <button
              className="settings-secondary-action"
              type="button"
              disabled={busy || status === 'syncing'}
              onClick={() => void runBusy('sync', syncNow)}
            >
              <RefreshCw aria-hidden="true" /> {attention.action}
            </button>
          </div>
        ) : null}

        {message && !actionError && !busy ? <p role="status">{message}</p> : null}

        {signedIn && !accessGranted ? (
          <div className="settings-choice-list">
            <label>
              <span>
                <strong>One-time setup code</strong>
                <small>Required only when the private Notes workspace is first claimed.</small>
              </span>
              <input
                type="password"
                autoComplete="off"
                disabled={busy}
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

        <p>
          First sync merges this device’s existing library with the cloud library. Theme,
          privacy-lock passcode, and disposable search history remain device-local.
        </p>
      </section>

      {!signedIn ? (
        <section
          className="settings-group"
          aria-label="Sign in and account recovery"
          aria-busy={busy}
        >
          <div className="settings-group-copy">
            <strong>THIEPN Account</strong>
            <span>Create an account or sign in to enable private cross-device sync.</span>
          </div>
          <div className="settings-choice-list">
            <label>
              <span>
                <strong>Email</strong>
                <small>Used for sign-in, verification, and account recovery.</small>
              </span>
              <input
                type="email"
                autoComplete="email"
                disabled={busy}
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
                disabled={busy}
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
            <div>
              <button
                className="settings-secondary-action"
                type="button"
                disabled={busy || !formEmail.trim()}
                onClick={() =>
                  void runBusy('password-reset', async () => {
                    await requestPasswordReset(formEmail);
                  })
                }
              >
                <KeyRound aria-hidden="true" /> Forgot password
              </button>{' '}
              <button
                className="settings-secondary-action"
                type="button"
                disabled={busy || !formEmail.trim()}
                onClick={() =>
                  void runBusy('resend-verification', async () => {
                    await resendVerification(formEmail);
                  })
                }
              >
                <Mail aria-hidden="true" /> Resend verification
              </button>
            </div>
          </div>
        </section>
      ) : null}

      {signedIn && recoveryMode ? (
        <section className="settings-group" aria-label="Password recovery" aria-busy={busy}>
          <div className="settings-group-copy">
            <strong>Set a new password</strong>
            <span>Your recovery link was verified. Choose the replacement password now.</span>
          </div>
          <PasswordFields
            disabled={busy}
            newPassword={newPassword}
            confirmPassword={confirmPassword}
            onNewPassword={setNewPassword}
            onConfirmPassword={setConfirmPassword}
          />
          <button
            className="settings-secondary-action"
            type="button"
            disabled={busy || newPassword.length < 8 || newPassword !== confirmPassword}
            onClick={() => void submitPassword()}
          >
            <KeyRound aria-hidden="true" /> Save new password
          </button>
        </section>
      ) : null}

      {signedIn && !recoveryMode ? (
        <>
          <section className="settings-group" aria-label="Account identity" aria-busy={busy}>
            <div className="settings-group-copy">
              <strong>Account & credentials</strong>
              <span>
                Manage the shared THIEPN Account email and password used by supported first-party
                apps.
              </span>
            </div>
            <div className="settings-setting-row">
              <span className="settings-row-icon" aria-hidden="true">
                <UserRound />
              </span>
              <span>
                <strong>{email}</strong>
                <small>
                  {pendingEmail ? `Pending email change: ${pendingEmail}` : 'Current sign-in email'}
                </small>
              </span>
            </div>
            <div className="settings-choice-list">
              <label>
                <span>
                  <strong>New email</strong>
                  <small>Supabase may require confirmation from the current and new address.</small>
                </span>
                <input
                  type="email"
                  autoComplete="email"
                  disabled={busy}
                  value={newEmail}
                  onChange={(event) => setNewEmail(event.target.value)}
                />
              </label>
              <div>
                <button
                  className="settings-secondary-action"
                  type="button"
                  disabled={busy || !newEmail.trim() || newEmail.trim() === email}
                  onClick={() =>
                    void runBusy('change-email', async () => {
                      await changeEmail(newEmail);
                      setNewEmail('');
                    })
                  }
                >
                  <Mail aria-hidden="true" /> Change email
                </button>{' '}
                {pendingEmail ? (
                  <button
                    className="settings-secondary-action"
                    type="button"
                    disabled={busy}
                    onClick={() => void runBusy('resend-email-change', resendEmailChange)}
                  >
                    Resend email-change confirmation
                  </button>
                ) : null}
              </div>
            </div>

            <div className="settings-choice-list">
              <label>
                <span>
                  <strong>Current password</strong>
                  <small>
                    Provide it when your project requires current-password verification.
                  </small>
                </span>
                <input
                  type="password"
                  autoComplete="current-password"
                  disabled={busy}
                  value={currentPassword}
                  onChange={(event) => setCurrentPassword(event.target.value)}
                />
              </label>
              <PasswordFields
                disabled={busy}
                newPassword={newPassword}
                confirmPassword={confirmPassword}
                onNewPassword={setNewPassword}
                onConfirmPassword={setConfirmPassword}
              />
              <label>
                <span>
                  <strong>Verification code</strong>
                  <small>
                    Optional. Request one if Supabase requires secure password reauthentication.
                  </small>
                </span>
                <input
                  type="text"
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  disabled={busy}
                  value={reauthNonce}
                  onChange={(event) => setReauthNonce(event.target.value.trim())}
                />
              </label>
              <div>
                <button
                  className="settings-secondary-action"
                  type="button"
                  disabled={busy}
                  onClick={() => void runBusy('reauthenticate', requestReauthentication)}
                >
                  <ShieldCheck aria-hidden="true" /> Send verification code
                </button>{' '}
                <button
                  className="settings-secondary-action"
                  type="button"
                  disabled={busy || newPassword.length < 8 || newPassword !== confirmPassword}
                  onClick={() => void submitPassword()}
                >
                  <KeyRound aria-hidden="true" /> Change password
                </button>
              </div>
            </div>
          </section>

          <section className="settings-group" aria-label="Signed-in sessions" aria-busy={busy}>
            <div className="settings-group-copy">
              <strong>Sessions & devices</strong>
              <span>
                Review active THIEPN Account sessions and revoke access from other devices.
              </span>
            </div>
            {sessions.length > 0 ? (
              <div className="settings-choice-list">
                {sessions.map((authSession) => (
                  <div className="settings-setting-row" key={authSession.id}>
                    <span className="settings-row-icon" aria-hidden="true">
                      <MonitorSmartphone />
                    </span>
                    <span>
                      <strong>
                        {authSession.is_current ? 'This session' : 'Signed-in session'}
                      </strong>
                      <small>
                        {sessionSummary(authSession.user_agent, authSession.updated_at)}
                      </small>
                    </span>
                  </div>
                ))}
              </div>
            ) : (
              <p>No session details are currently available.</p>
            )}
            <p className="settings-note">
              THIEPN apps on this origin share the browser account session. Signing out here may
              also sign you out of other supported THIEPN apps in this browser.
            </p>
            <div>
              <button
                className="settings-secondary-action"
                type="button"
                disabled={busy || !accessGranted}
                onClick={() => void runBusy('refresh-sessions', refreshSessions)}
              >
                <RefreshCw aria-hidden="true" /> Refresh sessions
              </button>{' '}
              <button
                className="settings-secondary-action"
                type="button"
                disabled={busy || !accessGranted}
                onClick={() => void runBusy('signout-others', signOutOtherDevices)}
              >
                <LogOut aria-hidden="true" /> Sign out other devices
              </button>{' '}
              <button
                className="settings-secondary-action"
                type="button"
                disabled={busy}
                onClick={() => void runBusy('signout-all', signOutAllDevices)}
              >
                Sign out everywhere
              </button>
            </div>
            <button
              className="settings-secondary-action"
              type="button"
              disabled={busy}
              onClick={() => void runBusy('signout-local', signOut)}
            >
              Sign out on this device
            </button>
          </section>

          {accessGranted ? (
            <section
              className="settings-group settings-boundary"
              aria-label="Cloud data deletion"
              aria-busy={busy}
            >
              <div className="settings-group-copy">
                <strong>Delete cloud data</strong>
                <span>
                  These actions are destructive. Your local IndexedDB library is kept unless you
                  remove it separately.
                </span>
              </div>
              <label className="settings-select-row">
                <span>
                  <strong>Delete the cloud copy and turn sync off</strong>
                  <small>Type DELETE CLOUD. Attachments and synced records are removed.</small>
                </span>
                <input
                  type="text"
                  autoComplete="off"
                  disabled={busy}
                  value={deleteCloudConfirm}
                  onChange={(event) => setDeleteCloudConfirm(event.target.value)}
                />
              </label>
              <button
                className="settings-secondary-action"
                type="button"
                disabled={busy || deleteCloudConfirm !== 'DELETE CLOUD'}
                onClick={() =>
                  void runBusy('delete-cloud', async () => {
                    await deleteCloudData();
                    setDeleteCloudConfirm('');
                  })
                }
              >
                <Trash2 aria-hidden="true" /> Delete cloud copy
              </button>

              <label className="settings-select-row">
                <span>
                  <strong>Delete the Supabase account identity</strong>
                  <small>
                    Type DELETE ACCOUNT. Deletion is blocked while the same THIEPN Account is still
                    required by another supported first-party app.
                  </small>
                </span>
                <input
                  type="text"
                  autoComplete="off"
                  disabled={busy}
                  value={deleteAccountConfirm}
                  onChange={(event) => setDeleteAccountConfirm(event.target.value)}
                />
              </label>
              <button
                className="settings-secondary-action"
                type="button"
                disabled={busy || deleteAccountConfirm !== 'DELETE ACCOUNT'}
                onClick={() =>
                  void runBusy('delete-account', async () => {
                    const result = await deleteAccount();
                    if (result.deleted) setDeleteAccountConfirm('');
                  })
                }
              >
                <Trash2 aria-hidden="true" /> Delete account identity
              </button>
            </section>
          ) : null}
        </>
      ) : null}
    </>
  );
}

function PasswordFields({
  disabled,
  newPassword,
  confirmPassword,
  onNewPassword,
  onConfirmPassword,
}: {
  disabled: boolean;
  newPassword: string;
  confirmPassword: string;
  onNewPassword(value: string): void;
  onConfirmPassword(value: string): void;
}) {
  return (
    <>
      <label>
        <span>
          <strong>New password</strong>
          <small>Use at least 8 characters.</small>
        </span>
        <input
          type="password"
          autoComplete="new-password"
          minLength={8}
          disabled={disabled}
          value={newPassword}
          onChange={(event) => onNewPassword(event.target.value)}
        />
      </label>
      <label>
        <span>
          <strong>Confirm new password</strong>
          <small>{passwordMatchCopy(newPassword, confirmPassword)}</small>
        </span>
        <input
          type="password"
          autoComplete="new-password"
          minLength={8}
          disabled={disabled}
          value={confirmPassword}
          onChange={(event) => onConfirmPassword(event.target.value)}
        />
      </label>
    </>
  );
}

function accountActionLabel(action: AccountAction): string {
  switch (action) {
    case 'signin':
      return 'Signing in…';
    case 'signup':
      return 'Creating account…';
    case 'claim':
      return 'Claiming private workspace…';
    case 'sync':
      return 'Syncing now…';
    case 'password-reset':
      return 'Sending recovery email…';
    case 'resend-verification':
      return 'Requesting verification email…';
    case 'change-email':
      return 'Requesting email change…';
    case 'resend-email-change':
      return 'Requesting email-change confirmation…';
    case 'reauthenticate':
      return 'Sending verification code…';
    case 'change-password':
      return 'Updating password…';
    case 'refresh-sessions':
      return 'Refreshing sessions…';
    case 'signout-others':
      return 'Signing out other devices…';
    case 'signout-all':
      return 'Signing out everywhere…';
    case 'signout-local':
      return 'Signing out on this device…';
    case 'delete-cloud':
      return 'Deleting cloud Notes data…';
    case 'delete-account':
      return 'Deleting account identity…';
  }
}

function passwordMatchCopy(password: string, confirmation: string): string {
  if (!confirmation) return 'Enter the same password again.';
  return password === confirmation ? 'Passwords match.' : 'Passwords do not match.';
}

function sessionSummary(userAgent: string | null, updatedAt: string | null): string {
  const device = userAgent?.trim() || 'Unknown browser/device';
  if (!updatedAt) return device;
  const date = new Date(updatedAt);
  return Number.isNaN(date.getTime()) ? device : `${device} · Active ${date.toLocaleString()}`;
}
