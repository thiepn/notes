import { useState } from 'react';
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

export function SyncSettings() {
  const {
    status,
    email,
    pendingEmail,
    accessGranted,
    recoveryMode,
    lastSyncedAt,
    message,
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
  const [busy, setBusy] = useState(false);

  const signedIn = email !== null;

  const runBusy = async (operation: () => Promise<void>) => {
    setBusy(true);
    try {
      await operation();
    } catch {
      // Provider surfaces the actionable error message.
    } finally {
      setBusy(false);
    }
  };

  const submit = async (mode: 'signin' | 'signup') => {
    await runBusy(async () => {
      if (mode === 'signin') await signIn(formEmail, password);
      else await signUp(formEmail, password);
      setPassword('');
    });
  };

  const submitSetupCode = async () => {
    await runBusy(async () => {
      const claimed = await claimAccess(setupCode);
      if (claimed) setSetupCode('');
    });
  };

  const submitPassword = async () => {
    if (newPassword !== confirmPassword || newPassword.length < 8) return;
    const options: { currentPassword?: string; nonce?: string } = {};
    if (!recoveryMode && currentPassword) options.currentPassword = currentPassword;
    if (reauthNonce) options.nonce = reauthNonce;
    await runBusy(async () => {
      await changePassword(newPassword, options);
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
      setReauthNonce('');
    });
  };

  return (
    <>
      <section className="settings-group" aria-label="Cloud sync">
        <div className="settings-group-copy">
          <strong>Cross-device sync</strong>
          <span>
            Notes remain available offline in this browser and sync through your private Supabase
            workspace when signed in.
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
                : 'Use the same account on every device to share one Notes library.'}
            </small>
          </span>
          {signedIn && accessGranted && !recoveryMode ? (
            <button
              type="button"
              disabled={busy || status === 'syncing'}
              onClick={() => void runBusy(syncNow)}
            >
              <RefreshCw aria-hidden="true" /> Sync now
            </button>
          ) : null}
        </div>

        {message ? <p role="status">{message}</p> : null}

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
        <section className="settings-group" aria-label="Sign in and account recovery">
          <div className="settings-group-copy">
            <strong>Email account</strong>
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
            <div>
              <button
                className="settings-secondary-action"
                type="button"
                disabled={busy || !formEmail.trim()}
                onClick={() =>
                  void runBusy(async () => {
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
                  void runBusy(async () => {
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
        <section className="settings-group" aria-label="Password recovery">
          <div className="settings-group-copy">
            <strong>Set a new password</strong>
            <span>Your recovery link was verified. Choose the replacement password now.</span>
          </div>
          <PasswordFields
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
          <section className="settings-group" aria-label="Account identity">
            <div className="settings-group-copy">
              <strong>Account & credentials</strong>
              <span>Manage the email address and password used for Notes sync.</span>
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
                    void runBusy(async () => {
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
                    onClick={() => void runBusy(resendEmailChange)}
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
                  <small>Provide it when your project requires current-password verification.</small>
                </span>
                <input
                  type="password"
                  autoComplete="current-password"
                  value={currentPassword}
                  onChange={(event) => setCurrentPassword(event.target.value)}
                />
              </label>
              <PasswordFields
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
                  value={reauthNonce}
                  onChange={(event) => setReauthNonce(event.target.value.trim())}
                />
              </label>
              <div>
                <button
                  className="settings-secondary-action"
                  type="button"
                  disabled={busy}
                  onClick={() => void runBusy(requestReauthentication)}
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

          <section className="settings-group" aria-label="Signed-in sessions">
            <div className="settings-group-copy">
              <strong>Sessions & devices</strong>
              <span>Review active Supabase sessions and revoke access from other devices.</span>
            </div>
            {sessions.length > 0 ? (
              <div className="settings-choice-list">
                {sessions.map((authSession) => (
                  <div className="settings-setting-row" key={authSession.id}>
                    <span className="settings-row-icon" aria-hidden="true">
                      <MonitorSmartphone />
                    </span>
                    <span>
                      <strong>{authSession.is_current ? 'This session' : 'Signed-in session'}</strong>
                      <small>{sessionSummary(authSession.user_agent, authSession.updated_at)}</small>
                    </span>
                  </div>
                ))}
              </div>
            ) : (
              <p>No session details are currently available.</p>
            )}
            <div>
              <button
                className="settings-secondary-action"
                type="button"
                disabled={busy || !accessGranted}
                onClick={() => void runBusy(refreshSessions)}
              >
                <RefreshCw aria-hidden="true" /> Refresh sessions
              </button>{' '}
              <button
                className="settings-secondary-action"
                type="button"
                disabled={busy || !accessGranted}
                onClick={() => void runBusy(signOutOtherDevices)}
              >
                <LogOut aria-hidden="true" /> Sign out other devices
              </button>{' '}
              <button
                className="settings-secondary-action"
                type="button"
                disabled={busy}
                onClick={() => void runBusy(signOutAllDevices)}
              >
                Sign out everywhere
              </button>
            </div>
            <button
              className="settings-secondary-action"
              type="button"
              disabled={busy}
              onClick={() => void runBusy(signOut)}
            >
              Sign out on this device
            </button>
          </section>

          {accessGranted ? (
            <section className="settings-group settings-boundary" aria-label="Cloud data deletion">
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
                  value={deleteCloudConfirm}
                  onChange={(event) => setDeleteCloudConfirm(event.target.value)}
                />
              </label>
              <button
                className="settings-secondary-action"
                type="button"
                disabled={busy || deleteCloudConfirm !== 'DELETE CLOUD'}
                onClick={() =>
                  void runBusy(async () => {
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
                    Type DELETE ACCOUNT. This is blocked automatically if the identity is also used
                    by WORDSTRIKE.
                  </small>
                </span>
                <input
                  type="text"
                  autoComplete="off"
                  value={deleteAccountConfirm}
                  onChange={(event) => setDeleteAccountConfirm(event.target.value)}
                />
              </label>
              <button
                className="settings-secondary-action"
                type="button"
                disabled={busy || deleteAccountConfirm !== 'DELETE ACCOUNT'}
                onClick={() =>
                  void runBusy(async () => {
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
  newPassword,
  confirmPassword,
  onNewPassword,
  onConfirmPassword,
}: {
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
          value={confirmPassword}
          onChange={(event) => onConfirmPassword(event.target.value)}
        />
      </label>
    </>
  );
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
