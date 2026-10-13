import { useEffect, useRef, useState } from 'react';
import {
  Cloud,
  CloudOff,
  DatabaseBackup,
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
import { useNotesCoreSyncAdapter } from './coreAdapter';
import {
  hasNotesCoreConsent,
  changeNotesCoreConsent,
  getNotesCoreRevision,
  revokeNotesCoreOnAccountExit,
} from './coreConsent';
import { formatSyncActivity, syncAttentionCopy } from './syncPresentation';
import { inspectNotesNativeRecovery } from './recoveryPresentation';
import { readLastManualBackup } from '../backup/backupPresentation';
import { createNotesNativeHandoff, inspectNotesNativeHandoff } from './nativeRecoveryHandoff';
import {
  appendRecoveryEntry,
  nativeRecoveryEvidence,
  visibleRecoveryEntries,
  type RecoveryAction,
  type RecoveryHistory,
} from './recoveryHistory';

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

export function SyncSettings({ onOpenBackup }: { onOpenBackup?: () => void }) {
  const {
    status,
    email,
    accountId,
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
  const corePort = useNotesCoreSyncAdapter();
  // Account-scoped state is derived during render; no synchronous effect
  // reset is needed, and a previous owner's message never leaks to this one.
  const [corePreference, setCorePreference] = useState(() => ({
    ownerId: accountId,
    enabled: hasNotesCoreConsent(accountId),
  }));
  const coreConsent =
    corePreference.ownerId === accountId ? corePreference.enabled : hasNotesCoreConsent(accountId);
  const [coreMessage, setCoreMessage] = useState<{
    ownerId: string | null;
    text: string;
  } | null>(null);
  const [recoveryInspection, setRecoveryInspection] = useState<{
    ownerId: string | null;
    summary: string;
  } | null>(null);
  const [recoveryHistory, setRecoveryHistory] = useState<RecoveryHistory>({
    ownerId: accountId,
    entries: [],
  });
  const recoveryEntries = visibleRecoveryEntries(recoveryHistory, accountId);
  const deviceSummaryInputRef = useRef<HTMLInputElement>(null);
  const currentOwnerRef = useRef(accountId);
  const [deviceComparison, setDeviceComparison] = useState<{
    ownerId: string | null;
    message: string;
  } | null>(null);
  useEffect(() => {
    currentOwnerRef.current = accountId;
    // The original app's sign-out action clears owner-scoped local evidence.
    // Do not synchronously set React state during an identity effect.
  }, [accountId]);
  const recoveryEvidence = nativeRecoveryEvidence(status, lastSyncedAt);
  const recordRecovery = (action: RecoveryAction) => {
    setRecoveryHistory((previous) =>
      appendRecoveryEntry(
        previous,
        accountId,
        {
          action,
          nativeStatus: status,
          grantRevision: getNotesCoreRevision(accountId),
          lastConfirmedNativeSync: lastSyncedAt,
        },
        Date.now(),
      ),
    );
  };
  const [coreRequests, setCoreRequests] = useState<{
    ownerId: string | null;
    count: number;
  }>({ ownerId: accountId, count: 0 });
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

  // Invalidate Core's separate local grant before the original Notes
  // authentication service removes or changes the user session.
  const revokeCoreBeforeIdentityExit = (): void => {
    if (!accountId) return;
    revokeNotesCoreOnAccountExit(accountId);
    setRecoveryHistory({ ownerId: null, entries: [] });
    setDeviceComparison(null);
    setCorePreference({ ownerId: accountId, enabled: false });
  };

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

        {signedIn && accessGranted && !recoveryMode ? (
          <div className="settings-choice-list" data-testid="core-coordination-controls">
            <label>
              <span>
                <strong>Allow Core to request sync on this device</strong>
                <small>
                  Optional. Notes still uses its original private cloud and native 15-second
                  foreground sync. This permission only allows owner-verified coordination requests;
                  Core cannot read Notes or attachments.
                </small>
              </span>
              <input
                type="checkbox"
                data-testid="core-coordination-toggle"
                checked={coreConsent}
                disabled={busy || status === 'syncing'}
                onChange={(event) => {
                  const enabled = event.target.checked;
                  const saved = changeNotesCoreConsent(accountId, enabled);
                  if (saved) {
                    recordRecovery(enabled ? 'core-consent-enabled' : 'core-device-revoked');
                    setCorePreference({ ownerId: accountId, enabled });
                    setCoreMessage({
                      ownerId: accountId,
                      text: enabled
                        ? 'Core coordination allowed for this account on this device.'
                        : 'Core coordination revoked on this device. Native Notes sync continues.',
                    });
                  } else {
                    setCoreMessage({
                      ownerId: accountId,
                      text: 'Could not save the permission. Core coordination remains blocked.',
                    });
                  }
                }}
              />
            </label>
            {coreConsent ? (
              <button
                type="button"
                className="settings-secondary-action"
                data-testid="core-coordination-request"
                disabled={busy || status === 'syncing'}
                onClick={() =>
                  void runBusy('sync', async () => {
                    const outcome = await corePort.requestSync(accountId ?? '');
                    if (outcome === 'requested')
                      setCoreRequests((state) => ({
                        ownerId: accountId,
                        count: state.ownerId === accountId ? state.count + 1 : 1,
                      }));
                    setCoreMessage({
                      ownerId: accountId,
                      text:
                        outcome === 'requested'
                          ? 'Requested through the Notes sync engine. Check the Notes sync status above for confirmation.'
                          : 'Core request denied. Verify this device permission and Account access.',
                    });
                  })
                }
              >
                <RefreshCw aria-hidden="true" /> Request sync via Core
              </button>
            ) : null}
            <p className="settings-note" data-testid="b14-notes-device-consent-status">
              {coreConsent
                ? `Core requests allowed on this device (revision ${getNotesCoreRevision(accountId) ?? 'unknown'}). Native Notes alone confirms synchronization.`
                : 'Core requests denied on this device. Native Notes sync and backup remain available.'}
            </p>
            <button
              type="button"
              className="settings-secondary-action"
              data-testid="b14-notes-revoke-core"
              disabled={!coreConsent}
              onClick={() => {
                const changed = changeNotesCoreConsent(accountId, false);
                if (changed) {
                  recordRecovery('core-device-revoked');
                  setCorePreference({ ownerId: accountId, enabled: false });
                  setCoreMessage({
                    ownerId: accountId,
                    text: 'Core request grant revoked on this device. A running request cannot report success under its old revision.',
                  });
                } else {
                  setCoreMessage({
                    ownerId: accountId,
                    text: 'Unable to store device revocation. Do not rely on Core coordination; review this device.',
                  });
                }
              }}
            >
              Revoke Core requests on this device
            </button>
            {coreRequests.ownerId === accountId && coreRequests.count > 0 ? (
              <p className="settings-note">
                Core coordination requests this session: {coreRequests.count}. Native status remains
                authoritative.
              </p>
            ) : null}
            {coreMessage?.ownerId === accountId ? (
              <p role="status" className="settings-note">
                {coreMessage.text}
              </p>
            ) : null}
          </div>
        ) : null}

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

      <section
        className="settings-group"
        aria-label="Native recovery center"
        data-testid="b15-notes-recovery-center"
      >
        <div className="settings-group-copy">
          <strong>Recover this Notes workspace</strong>
          <span>
            Inspect the current native Notes state before retrying or restoring. This does not
            contact Core or certify independent storage custody.
          </span>
        </div>
        <div className="settings-choice-list">
          <button
            type="button"
            className="settings-secondary-action"
            data-testid="b15-notes-inspect-recovery"
            onClick={() => {
              const finding = inspectNotesNativeRecovery({
                ownerId: accountId,
                accessGranted,
                recoveryMode,
                status,
                lastSyncedAt,
                coreConsent,
              });
              recordRecovery('inspect');
              setRecoveryInspection({
                ownerId: accountId,
                summary:
                  'Native Notes ' +
                  finding.state +
                  ': ' +
                  finding.action +
                  ' External offsite custody NOT TESTED.',
              });
            }}
          >
            Inspect recovery options
          </button>
          <p role="status" aria-live="polite" data-testid="b15-notes-recovery-result">
            {recoveryInspection?.ownerId === accountId
              ? recoveryInspection.summary
              : 'No recovery inspection performed on this Account. Native Notes remain the only source of truth.'}
          </p>
          {signedIn && accessGranted && !recoveryMode ? (
            <button
              type="button"
              className="settings-secondary-action"
              data-testid="b15-notes-retry-native"
              disabled={busy || status === 'syncing'}
              onClick={() => {
                recordRecovery('native-retry-requested');
                void runBusy('sync', syncNow);
              }}
            >
              <RefreshCw aria-hidden="true" /> Retry using native Notes sync
            </button>
          ) : null}
          {onOpenBackup ? (
            <button
              type="button"
              className="settings-secondary-action"
              data-testid="b15-notes-open-backup"
              onClick={() => {
                recordRecovery('native-backup-opened');
                onOpenBackup?.();
              }}
            >
              <DatabaseBackup aria-hidden="true" /> Open native Backup &amp; import
            </button>
          ) : null}
          <div className="settings-choice-list" data-testid="b17-notes-device-handoff">
            <strong>Compare recovery readiness between devices</strong>
            <p className="settings-note">
              Share only a short original Notes metadata summary with another device you control.
              This is not a Notes backup, a cloud receipt or independent custody proof.
            </p>
            {signedIn && accessGranted && !recoveryMode ? (
              <>
                <button
                  type="button"
                  className="settings-secondary-action"
                  data-testid="b17-notes-export-summary"
                  onClick={() => {
                    try {
                      const now = Date.now();
                      const nativeSummary = createNotesNativeHandoff(
                        {
                          ownerId: accountId ?? '',
                          nativeStatus: status,
                          lastConfirmedNativeSync: lastSyncedAt,
                          manualBackupRecordedAt: readLastManualBackup()?.exportedAt ?? null,
                          coreDeviceRevision: getNotesCoreRevision(accountId),
                        },
                        now,
                      );
                      const url = URL.createObjectURL(
                        new Blob([JSON.stringify(nativeSummary, null, 2)], {
                          type: 'application/json',
                        }),
                      );
                      const link = document.createElement('a');
                      link.href = url;
                      link.download = 'thiepn-notes-device-recovery-summary.json';
                      document.body.append(link);
                      link.click();
                      link.remove();
                      window.setTimeout(() => URL.revokeObjectURL(url), 0);
                      setDeviceComparison({
                        ownerId: accountId,
                        message:
                          'Unsigned native device summary download requested. Verify the file was saved. No note contents were exported.',
                      });
                    } catch {
                      setDeviceComparison({
                        ownerId: accountId,
                        message:
                          'Unable to prepare a valid native summary. Check this device clock and Account session.',
                      });
                    }
                  }}
                >
                  Export this device recovery summary
                </button>
                <input
                  ref={deviceSummaryInputRef}
                  type="file"
                  accept=".json,application/json"
                  data-testid="b17-notes-compare-input"
                  aria-label="Choose a Notes device recovery summary"
                  hidden
                  onChange={(event) => {
                    const file = event.target.files?.[0];
                    event.target.value = '';
                    if (!file) return;
                    const startingOwner = accountId;
                    if (file.size > 4096) {
                      setDeviceComparison({
                        ownerId: startingOwner,
                        message: 'Device summary exceeds the 4 KB limit.',
                      });
                      return;
                    }
                    void file
                      .text()
                      .then((raw) => {
                        if (currentOwnerRef.current !== startingOwner) return;
                        const result = inspectNotesNativeHandoff(
                          raw,
                          startingOwner ?? '',
                          Date.now(),
                        );
                        setDeviceComparison({
                          ownerId: startingOwner,
                          message: result.status.toUpperCase() + ': ' + result.action,
                        });
                      })
                      .catch(() => {
                        if (currentOwnerRef.current === startingOwner)
                          setDeviceComparison({
                            ownerId: startingOwner,
                            message: 'Unable to read this device summary.',
                          });
                      });
                  }}
                />
                <button
                  type="button"
                  className="settings-secondary-action"
                  data-testid="b17-notes-compare-summary"
                  onClick={() => deviceSummaryInputRef.current?.click()}
                >
                  Compare another device summary
                </button>
              </>
            ) : (
              <p className="settings-note">
                Claim and authorize the original Notes workspace before using private device
                summaries.
              </p>
            )}
            <p role="status" data-testid="b17-notes-device-result" aria-live="polite">
              {deviceComparison?.ownerId === accountId
                ? deviceComparison.message
                : 'No device summary compared. External custody NOT TESTED.'}
            </p>
          </div>
          <div data-testid="b16-notes-evidence">
            <p className="settings-note">
              {recoveryEvidence.detail} External ciphertext custody NOT TESTED.
            </p>
            <strong>Recovery incident history on this device</strong>
            <p className="settings-note">
              Owner-scoped session observations only. A native backup was opened, not necessarily
              exported; a native sync retry was requested, not confirmed.
            </p>
            {recoveryEntries.length ? (
              <ol data-testid="b16-notes-incident-list">
                {[...recoveryEntries].reverse().map((entry, index) => (
                  <li key={entry.at + '-' + index}>
                    {new Date(entry.at).toLocaleTimeString()} · {entry.action.replaceAll('-', ' ')}
                    {' · '}Native {entry.nativeStatus}
                    {' · '}Device revision {entry.grantRevision ?? 'none'}
                    {' · '}Prior cloud confirmation{' '}
                    {entry.lastConfirmedNativeSync
                      ? new Date(entry.lastConfirmedNativeSync).toLocaleString()
                      : 'none'}
                  </li>
                ))}
              </ol>
            ) : (
              <p data-testid="b16-notes-history-empty" className="settings-note">
                No recovery actions in this session for this Account.
              </p>
            )}
          </div>
        </div>
      </section>

      <section
        className="settings-group"
        aria-label="Ecosystem sync dashboard"
        data-testid="b12-ecosystem-dashboard"
      >
        <div className="settings-group-copy">
          <strong>Ecosystem sync</strong>
          <span>
            Each THIEPN app controls its own records, Account permissions and sync status. No
            cross-app private records are loaded here.
          </span>
        </div>
        <div className="settings-choice-list">
          <div className="settings-setting-row">
            <span className="settings-row-icon" aria-hidden="true">
              <Cloud />
            </span>
            <span>
              <strong>Notes · {syncStatusLabel(status)}</strong>
              <small data-testid="b12-notes-native-status">
                {signedIn && accessGranted
                  ? status === 'synced' && lastSyncedAt
                    ? 'Confirmed by Notes at ' + new Date(lastSyncedAt).toLocaleString()
                    : status === 'pending'
                      ? 'Saved locally; Notes cloud confirmation is pending.'
                      : status === 'offline'
                        ? 'Offline. Your native Notes remain accessible; retry when online.'
                        : status === 'error'
                          ? 'Native Notes reported an error. Review the attention message above.'
                          : 'Notes owns the result of any synchronization request.'
                  : 'Local-only or workspace permission not granted.'}
              </small>
            </span>
          </div>
          <div className="settings-setting-row">
            <span>
              <strong>Library · separate app</strong>
              <small>
                Review reading-state sync, conflict choices and device consent in Library's own
                dashboard.
              </small>
            </span>
            <a href="/library/account" rel="noopener">
              Open Library sync
            </a>
          </div>
          <div className="settings-setting-row">
            <span>
              <strong>Hub · read-only metadata</strong>
              <small>
                Sharing is device-scoped and temporary. Hub does not synchronize Notes attachments
                or records.
              </small>
            </span>
            <a href="/" rel="noopener">
              Open Hub
            </a>
          </div>
          {onOpenBackup ? (
            <button
              className="settings-secondary-action"
              type="button"
              data-testid="b13-open-native-notes-backup"
              onClick={onOpenBackup}
            >
              <DatabaseBackup aria-hidden="true" /> Open native backup &amp; restore
            </button>
          ) : null}
          <p className="settings-note">
            For actual Notes backup or restore, use Settings → Data &amp; advanced → Backup &amp;
            import. Core's experimental recovery lab is synthetic and is not a live backup
            destination.
          </p>
        </div>
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
                onClick={() =>
                  void runBusy('signout-all', async () => {
                    revokeCoreBeforeIdentityExit();
                    await signOutAllDevices();
                  })
                }
              >
                Sign out everywhere
              </button>
            </div>
            <button
              className="settings-secondary-action"
              type="button"
              disabled={busy}
              onClick={() =>
                void runBusy('signout-local', async () => {
                  revokeCoreBeforeIdentityExit();
                  await signOut();
                })
              }
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
                    revokeCoreBeforeIdentityExit();
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
                    revokeCoreBeforeIdentityExit();
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
