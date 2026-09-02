import { useCallback, useEffect, useRef, useState, type ChangeEvent } from 'react';
import {
  Clock3,
  DatabaseBackup,
  Download,
  FileCheck2,
  HardDriveUpload,
  Scale,
  ShieldCheck,
  TriangleAlert,
} from 'lucide-react';
import { ZodError } from 'zod';

import { notesDatabase } from '../../db';
import { GoogleKeepImportPanel } from '../import/GoogleKeepImportPanel';
import { MAX_BACKUP_FILE_BYTES, type BackupStats, type PreparedBackup } from './backupFormat';
import {
  LAST_MANUAL_BACKUP_KEY,
  backupComparisonRows,
  backupVersionLabel,
  formatBackupAge,
  formatBackupBytes,
  formatBackupCount,
  formatBackupDelta,
  readLastManualBackup,
  writeLastManualBackup,
  type LastManualBackup,
} from './backupPresentation';
import { BackupRepository, backupFilename } from './backupRepository';

const backupRepository = new BackupRepository(notesDatabase);

interface BackupWorkspaceProps {
  onRestored(): Promise<void> | void;
  onImported?(): Promise<void> | void;
}

interface SelectedBackup {
  fileName: string;
  fileSize: number;
  prepared: PreparedBackup;
}

export function BackupWorkspace({ onRestored, onImported }: BackupWorkspaceProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [selected, setSelected] = useState<SelectedBackup | null>(null);
  const [confirmed, setConfirmed] = useState(false);
  const [busy, setBusy] = useState<'export' | 'inspect' | 'restore' | null>(null);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [currentStats, setCurrentStats] = useState<BackupStats | null>(null);
  const [lastManualBackup, setLastManualBackup] = useState<LastManualBackup | null>(
    readLastManualBackup,
  );

  const refreshCurrentStats = useCallback(async () => {
    try {
      setCurrentStats(await backupRepository.currentStats());
    } catch {
      setCurrentStats(null);
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    void backupRepository.currentStats().then(
      (stats) => {
        if (!cancelled) setCurrentStats(stats);
      },
      () => {
        if (!cancelled) setCurrentStats(null);
      },
    );
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    const handleStorage = (event: StorageEvent) => {
      if (event.key === LAST_MANUAL_BACKUP_KEY) setLastManualBackup(readLastManualBackup());
    };
    window.addEventListener('storage', handleStorage);
    return () => window.removeEventListener('storage', handleStorage);
  }, []);

  const downloadCurrentBackup = async () => {
    setBusy('export');
    setErrorMessage(null);
    setStatusMessage(null);
    try {
      const backup = await backupRepository.exportBackup();
      const fileBytes = new Blob([backup.json], { type: 'application/json' }).size;
      triggerJsonDownload(backup.json, backup.filename);
      const activity: LastManualBackup = {
        exportedAt: backup.document.exportedAt,
        filename: backup.filename,
        fileBytes,
      };
      writeLastManualBackup(activity);
      setLastManualBackup(activity);
      setCurrentStats(backup.stats);
      setStatusMessage(
        `Full backup downloaded as ${backup.filename} (${formatBackupBytes(fileBytes)}). ${backup.stats.totalRecords} database records were validated.`,
      );
    } catch (error) {
      setErrorMessage(toErrorMessage(error));
    } finally {
      setBusy(null);
    }
  };

  const inspectFile = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;

    setSelected(null);
    setConfirmed(false);
    setBusy('inspect');
    setErrorMessage(null);
    setStatusMessage(null);

    try {
      if (file.size > MAX_BACKUP_FILE_BYTES) {
        throw new Error('This backup is larger than the 512 MB restore safety limit.');
      }
      const prepared = await backupRepository.inspectBackup(await file.text());
      setSelected({ fileName: file.name, fileSize: file.size, prepared });
      setStatusMessage('Backup validated. No local data has been changed.');
    } catch (error) {
      setErrorMessage(toErrorMessage(error));
    } finally {
      setBusy(null);
    }
  };

  const restore = async () => {
    if (!selected || !confirmed || busy) return;
    setBusy('restore');
    setErrorMessage(null);
    setStatusMessage(null);

    try {
      const safety = await backupRepository.exportBackup();
      const safetyFilename = backupFilename(safety.document.exportedAt, 'notes-before-restore');
      triggerJsonDownload(safety.json, safetyFilename);
      const stats = await backupRepository.restorePrepared(selected.prepared);
      setCurrentStats(stats);
      setConfirmed(false);
      setStatusMessage(
        `Restore complete. ${stats.notes} notes, ${stats.attachments} attachments, and ${stats.reminders} reminders recovered. Safety backup downloaded as ${safetyFilename}.`,
      );
      await onRestored();
    } catch (error) {
      setErrorMessage(toErrorMessage(error));
    } finally {
      setBusy(null);
    }
  };

  const handleImported = async () => {
    await refreshCurrentStats();
    await onImported?.();
  };

  const comparisonRows =
    selected && currentStats ? backupComparisonRows(currentStats, selected.prepared.stats) : [];

  return (
    <div className="backup-workspace">
      <section className="backup-card backup-primary" aria-labelledby="backup-download-title">
        <div className="backup-card-icon" aria-hidden="true">
          <DatabaseBackup />
        </div>
        <div className="backup-card-copy">
          <p className="backup-eyebrow">Full local backup</p>
          <h2 id="backup-download-title">Back up this device</h2>
          <p>
            Export every note, checklist row, label relationship, attachment, reminder, saved
            version, and database setting into one versioned JSON file.
          </p>
          <div className="backup-assurance">
            <ShieldCheck aria-hidden="true" />
            <span>
              The backup is validated before it is downloaded. Attachment bytes include an
              independent SHA-256 integrity check.
            </span>
          </div>
          <div className="backup-device-readiness" aria-label="Current backup readiness">
            <div>
              <Scale aria-hidden="true" />
              <span>
                <strong>Current library</strong>
                <small>
                  {currentStats
                    ? `${formatBackupCount(currentStats.notes, 'note')} · ${formatBackupCount(currentStats.attachments, 'attachment')} · ${formatBackupCount(currentStats.reminders, 'reminder')} · ${formatBackupCount(currentStats.totalRecords, 'record')}`
                    : 'Counting local records…'}
                </small>
              </span>
            </div>
            <div>
              <Clock3 aria-hidden="true" />
              <span>
                <strong>Last manual backup</strong>
                <small>
                  {lastManualBackup
                    ? `${formatBackupAge(lastManualBackup.exportedAt)} · ${formatTimestamp(lastManualBackup.exportedAt)} · ${formatBackupBytes(lastManualBackup.fileBytes)}`
                    : 'No manual backup recorded on this browser yet'}
                </small>
              </span>
            </div>
          </div>
        </div>
        <button
          className="backup-button backup-button-primary"
          type="button"
          disabled={busy !== null}
          onClick={() => void downloadCurrentBackup()}
        >
          <Download aria-hidden="true" />
          {busy === 'export' ? 'Building backup…' : 'Download full backup'}
        </button>
      </section>

      <GoogleKeepImportPanel onImported={handleImported} />

      <section className="backup-card" aria-labelledby="backup-restore-title">
        <div className="backup-card-icon" aria-hidden="true">
          <HardDriveUpload />
        </div>
        <div className="backup-card-copy">
          <p className="backup-eyebrow">Disaster recovery</p>
          <h2 id="backup-restore-title">Restore from a backup</h2>
          <p>
            Choose a Notes backup to validate it first. Validation is read-only; nothing on this
            device changes until you explicitly restore.
          </p>
        </div>

        <input
          ref={inputRef}
          className="backup-file-input"
          type="file"
          accept="application/json,.json"
          aria-label="Choose backup file"
          onChange={(event) => void inspectFile(event)}
        />
        <button
          className="backup-button backup-button-secondary"
          type="button"
          disabled={busy !== null}
          onClick={() => inputRef.current?.click()}
        >
          <FileCheck2 aria-hidden="true" />
          {busy === 'inspect' ? 'Validating…' : 'Choose and validate backup'}
        </button>

        {selected ? (
          <div className="backup-preview" aria-label="Validated backup preview">
            <div className="backup-preview-heading">
              <div>
                <strong>{selected.fileName}</strong>
                <span>
                  {formatBackupBytes(selected.fileSize)} ·{' '}
                  {backupVersionLabel(selected.prepared.document)}
                </span>
                <small className="backup-freshness">
                  {formatBackupAge(selected.prepared.document.exportedAt)} · exported{' '}
                  {formatTimestamp(selected.prepared.document.exportedAt)}
                </small>
              </div>
              <span className="backup-valid-badge">Validated</span>
            </div>
            <dl className="backup-stats">
              <BackupStat label="Notes" value={selected.prepared.stats.notes} />
              <BackupStat label="Checklist rows" value={selected.prepared.stats.checklistItems} />
              <BackupStat label="Labels" value={selected.prepared.stats.labels} />
              <BackupStat label="Attachments" value={selected.prepared.stats.attachments} />
              <BackupStat label="Reminders" value={selected.prepared.stats.reminders} />
              <BackupStat label="Saved versions" value={selected.prepared.stats.revisions} />
              <BackupStat label="All records" value={selected.prepared.stats.totalRecords} />
            </dl>

            {currentStats ? (
              <div className="backup-comparison-wrap">
                <div className="backup-comparison-heading">
                  <Scale aria-hidden="true" />
                  <div>
                    <strong>Compare before replacing</strong>
                    <span>Incoming counts are compared with the current local database.</span>
                  </div>
                </div>
                <div className="backup-comparison-scroll">
                  <table className="backup-comparison" aria-label="Current library versus backup">
                    <thead>
                      <tr>
                        <th scope="col">Content</th>
                        <th scope="col">This device</th>
                        <th scope="col">Backup</th>
                        <th scope="col">Change</th>
                      </tr>
                    </thead>
                    <tbody>
                      {comparisonRows.map((row) => (
                        <tr key={row.key}>
                          <th scope="row">{row.label}</th>
                          <td>{row.current}</td>
                          <td>{row.incoming}</td>
                          <td
                            data-delta={row.delta === 0 ? 'same' : row.delta > 0 ? 'more' : 'less'}
                          >
                            {formatBackupDelta(row.delta)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            ) : null}

            <div className="backup-restore-warning">
              <TriangleAlert aria-hidden="true" />
              <div>
                <strong>This replaces the complete local library.</strong>
                <span>
                  Before replacement starts, Notes automatically downloads a fresh safety backup of
                  the current device.
                </span>
              </div>
            </div>

            <label className="backup-confirmation">
              <input
                type="checkbox"
                checked={confirmed}
                onChange={(event) => setConfirmed(event.target.checked)}
              />
              <span>I understand that this backup will replace the current local library.</span>
            </label>

            <button
              className="backup-button backup-button-danger"
              type="button"
              disabled={!confirmed || busy !== null}
              onClick={() => void restore()}
            >
              <HardDriveUpload aria-hidden="true" />
              {busy === 'restore' ? 'Restoring…' : 'Restore and replace local library'}
            </button>
          </div>
        ) : null}
      </section>

      {statusMessage ? (
        <p className="backup-status" role="status">
          {statusMessage}
        </p>
      ) : null}
      {errorMessage ? (
        <p className="backup-error" role="alert">
          {errorMessage}
        </p>
      ) : null}

      <section className="backup-details" aria-labelledby="backup-details-title">
        <h2 id="backup-details-title">Portability and recovery</h2>
        <p>
          Full backups replace and recover the complete local Notes library, including reminders.
          Google Keep import is intentionally different: it adds validated Takeout notes to the
          existing library, merges labels by normalized name, preserves recognized source state and
          attachments, and records imported sources so the same Keep export is not duplicated later.
        </p>
      </section>
    </div>
  );
}

function BackupStat({ label, value }: { label: string; value: string | number }) {
  return (
    <div>
      <dt>{label}</dt>
      <dd>{value}</dd>
    </div>
  );
}

function triggerJsonDownload(json: string, filename: string): void {
  const url = URL.createObjectURL(new Blob([json], { type: 'application/json' }));
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  anchor.rel = 'noopener';
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 0);
}

function formatTimestamp(timestamp: number): string {
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(timestamp));
}

function toErrorMessage(error: unknown): string {
  if (error instanceof ZodError) return 'This file is not a supported Notes backup.';
  if (error instanceof Error && error.message.trim()) return error.message;
  return 'Backup or restore could not be completed.';
}
