import { useRef, useState, type ChangeEvent } from 'react';
import { DatabaseBackup, Download, FileCheck2, HardDriveUpload, ShieldCheck, TriangleAlert } from 'lucide-react';
import { ZodError } from 'zod';

import { notesDatabase } from '../../db';
import { BackupRepository, backupFilename } from './backupRepository';
import { MAX_BACKUP_FILE_BYTES, type PreparedBackup } from './backupFormat';

const backupRepository = new BackupRepository(notesDatabase);

interface BackupWorkspaceProps {
  onRestored(): Promise<void> | void;
}

interface SelectedBackup {
  fileName: string;
  fileSize: number;
  prepared: PreparedBackup;
}

export function BackupWorkspace({ onRestored }: BackupWorkspaceProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [selected, setSelected] = useState<SelectedBackup | null>(null);
  const [confirmed, setConfirmed] = useState(false);
  const [busy, setBusy] = useState<'export' | 'inspect' | 'restore' | null>(null);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const downloadCurrentBackup = async () => {
    setBusy('export');
    setErrorMessage(null);
    setStatusMessage(null);
    try {
      const backup = await backupRepository.exportBackup();
      triggerJsonDownload(backup.json, backup.filename);
      setStatusMessage(`Full backup created with ${backup.stats.notes} notes and ${backup.stats.revisions} saved versions.`);
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
      triggerJsonDownload(
        safety.json,
        backupFilename(safety.document.exportedAt, 'notes-before-restore'),
      );
      const stats = await backupRepository.restorePrepared(selected.prepared);
      setStatusMessage(`Restore complete. ${stats.notes} notes recovered.`);
      await onRestored();
    } catch (error) {
      setErrorMessage(toErrorMessage(error));
    } finally {
      setBusy(null);
    }
  };

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
            Export every note, checklist row, label relationship, attachment, saved version, and database setting into one versioned JSON file.
          </p>
          <div className="backup-assurance">
            <ShieldCheck aria-hidden="true" />
            <span>The backup is validated before it is downloaded. Attachment bytes include an independent SHA-256 integrity check.</span>
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

      <section className="backup-card" aria-labelledby="backup-restore-title">
        <div className="backup-card-icon" aria-hidden="true">
          <HardDriveUpload />
        </div>
        <div className="backup-card-copy">
          <p className="backup-eyebrow">Disaster recovery</p>
          <h2 id="backup-restore-title">Restore from a backup</h2>
          <p>
            Choose a Notes backup to validate it first. Validation is read-only; nothing on this device changes until you explicitly restore.
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
                <span>{formatBytes(selected.fileSize)}</span>
              </div>
              <span className="backup-valid-badge">Validated</span>
            </div>
            <dl className="backup-stats">
              <BackupStat label="Notes" value={selected.prepared.stats.notes} />
              <BackupStat label="Checklist rows" value={selected.prepared.stats.checklistItems} />
              <BackupStat label="Labels" value={selected.prepared.stats.labels} />
              <BackupStat label="Attachments" value={selected.prepared.stats.attachments} />
              <BackupStat label="Saved versions" value={selected.prepared.stats.revisions} />
              <BackupStat label="Exported" value={formatTimestamp(selected.prepared.document.exportedAt)} />
            </dl>

            <div className="backup-restore-warning">
              <TriangleAlert aria-hidden="true" />
              <div>
                <strong>This replaces the complete local library.</strong>
                <span>Before replacement starts, Notes automatically downloads a fresh safety backup of the current device.</span>
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
        <h2 id="backup-details-title">What is preserved</h2>
        <p>
          P12 restores database records exactly: IDs, timestamps, lifecycle state, labels, checklist structure, attachments, and P11 revision history. Temporary editor recovery journals and UI-only local preferences are intentionally not part of the library backup.
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

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  const units = ['KB', 'MB', 'GB'];
  let value = bytes / 1024;
  let unit = units[0];
  for (let index = 1; index < units.length && value >= 1024; index += 1) {
    value /= 1024;
    unit = units[index];
  }
  return `${value.toFixed(value >= 10 ? 1 : 2)} ${unit}`;
}

function toErrorMessage(error: unknown): string {
  if (error instanceof ZodError) return 'This file is not a supported Notes backup.';
  if (error instanceof Error && error.message.trim()) return error.message;
  return 'Backup or restore could not be completed.';
}
