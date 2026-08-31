import { useRef, useState, type ChangeEvent, type DragEvent, type RefCallback } from 'react';
import {
  FileArchive,
  FolderOpen,
  Import,
  PackageCheck,
  ShieldCheck,
  TriangleAlert,
  UploadCloud,
} from 'lucide-react';

import { notesDatabase } from '../../db';
import {
  DEFAULT_GOOGLE_KEEP_IMPORT_SELECTION,
  GoogleKeepImportRepository,
  type GoogleKeepImportResult,
  type GoogleKeepImportSelection,
} from './googleKeepRepository';
import {
  MAX_KEEP_ARCHIVE_BYTES,
  type KeepImportProgress,
  type PreparedKeepImport,
} from './googleKeepImport';

const keepImportRepository = new GoogleKeepImportRepository(notesDatabase);

interface GoogleKeepImportPanelProps {
  onImported(): Promise<void> | void;
}

interface DisplayProgress {
  completed: number;
  total: number;
  message: string;
}

export function GoogleKeepImportPanel({ onImported }: GoogleKeepImportPanelProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const directoryInputRef = useRef<HTMLInputElement>(null);
  const [selected, setSelected] = useState<PreparedKeepImport | null>(null);
  const [selection, setSelection] = useState<GoogleKeepImportSelection>({
    ...DEFAULT_GOOGLE_KEEP_IMPORT_SELECTION,
  });
  const [busy, setBusy] = useState<'inspect' | 'import' | null>(null);
  const [progress, setProgress] = useState<DisplayProgress | null>(null);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [storageWarning, setStorageWarning] = useState<string | null>(null);
  const [result, setResult] = useState<GoogleKeepImportResult | null>(null);

  const setDirectoryInput: RefCallback<HTMLInputElement> = (node) => {
    directoryInputRef.current = node;
    if (node) node.setAttribute('webkitdirectory', '');
  };

  const inspectFiles = async (files: File[]) => {
    if (files.length === 0 || busy) return;

    setSelected(null);
    setResult(null);
    setBusy('inspect');
    setProgress({ completed: 0, total: files.length, message: 'Reading selected files…' });
    setStatusMessage(null);
    setErrorMessage(null);
    setStorageWarning(null);

    try {
      const totalBytes = files.reduce((total, file) => total + file.size, 0);
      if (totalBytes > MAX_KEEP_ARCHIVE_BYTES) {
        throw new Error(
          'The selected Google Keep files exceed the 512 MB browser import safety limit.',
        );
      }
      const prepared = await keepImportRepository.inspect(files, (next: KeepImportProgress) => {
        setProgress(next);
      });
      setSelected(prepared);
      setStorageWarning(await estimateStorageWarning(prepared));
      setStatusMessage('Google Keep source inspected. No local notes have been changed.');
    } catch (error) {
      setErrorMessage(toErrorMessage(error));
    } finally {
      setBusy(null);
      setProgress(null);
    }
  };

  const handleInputFiles = (event: ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.target.files ?? []);
    event.target.value = '';
    void inspectFiles(files);
  };

  const handleDrop = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    if (busy) return;
    void inspectFiles(Array.from(event.dataTransfer.files));
  };

  const importNotes = async () => {
    if (!selected || selectedNoteCount(selected, selection) === 0 || busy) return;
    setBusy('import');
    setStatusMessage(null);
    setErrorMessage(null);
    setResult(null);
    setProgress({
      completed: 0,
      total: selectedNoteCount(selected, selection),
      message: 'Preparing import…',
    });

    try {
      const imported = await keepImportRepository.importPrepared(selected, selection, setProgress);
      setResult(imported);
      setSelected(null);
      setStorageWarning(null);
      setStatusMessage(
        `Google Keep import complete. ${imported.importedNotes} ${imported.importedNotes === 1 ? 'note' : 'notes'} added without replacing existing local notes.`,
      );
      await onImported();
    } catch (error) {
      setErrorMessage(toErrorMessage(error));
    } finally {
      setBusy(null);
      setProgress(null);
    }
  };

  const pendingNotes = selected ? selectedNoteCount(selected, selection) : 0;
  const pendingAttachments = selected ? selectedAttachmentCount(selected, selection) : 0;

  return (
    <section className="backup-card keep-import-card" aria-labelledby="keep-import-title">
      <div className="backup-card-icon" aria-hidden="true">
        <Import />
      </div>
      <div className="backup-card-copy">
        <p className="backup-eyebrow">Google Keep migration</p>
        <h2 id="keep-import-title">Import Google Takeout</h2>
        <p>
          Import a Takeout ZIP directly, select an extracted Keep folder, or choose individual Keep
          files. Notes scans and previews everything locally before any database write happens.
        </p>
        <div className="backup-assurance">
          <ShieldCheck aria-hidden="true" />
          <span>Your Google Keep files stay on this device. Nothing is uploaded.</span>
        </div>
      </div>

      <input
        ref={inputRef}
        className="backup-file-input"
        type="file"
        accept="application/zip,.zip,application/json,.json,text/html,.html,image/*,audio/*,application/pdf"
        multiple
        aria-label="Choose Google Takeout archives"
        onChange={handleInputFiles}
      />
      <input
        ref={setDirectoryInput}
        className="backup-file-input"
        type="file"
        multiple
        aria-label="Choose extracted Google Keep folder"
        onChange={handleInputFiles}
      />

      <div
        className="keep-import-dropzone"
        onDragOver={(event) => event.preventDefault()}
        onDrop={handleDrop}
      >
        <UploadCloud aria-hidden="true" />
        <div>
          <strong>Drop Takeout ZIPs or extracted Keep files here</strong>
          <span>
            JSON is preferred. HTML is used only when a matching JSON note is unavailable.
          </span>
        </div>
        <div className="keep-import-source-actions">
          <button
            className="backup-button backup-button-secondary keep-import-source-button"
            type="button"
            disabled={busy !== null}
            onClick={() => inputRef.current?.click()}
          >
            <FileArchive aria-hidden="true" />
            {busy === 'inspect' ? 'Scanning…' : 'Choose files or Takeout ZIP'}
          </button>
          <button
            className="backup-button backup-button-secondary keep-import-source-button"
            type="button"
            disabled={busy !== null}
            onClick={() => directoryInputRef.current?.click()}
          >
            <FolderOpen aria-hidden="true" />
            Choose extracted Keep folder
          </button>
        </div>
      </div>

      <details className="keep-import-help">
        <summary>How to export Google Keep</summary>
        <ol>
          <li>Open Google Takeout and deselect everything.</li>
          <li>Select Google Keep, create the export, and download it.</li>
          <li>Import the ZIP here directly, or extract it and select the Keep folder.</li>
        </ol>
      </details>

      {progress ? (
        <div className="keep-import-progress" role="status" aria-live="polite">
          <progress max={Math.max(progress.total, 1)} value={progress.completed} />
          <span>{progress.message}</span>
        </div>
      ) : null}

      {selected ? (
        <div className="backup-preview keep-import-preview" aria-label="Google Keep import preview">
          <div className="backup-preview-heading">
            <div>
              <strong>{formatSourceSummary(selected)}</strong>
              <span>
                {selected.stats.jsonFiles} JSON · {selected.stats.htmlFiles} HTML inspected
              </span>
            </div>
            <span className="backup-valid-badge">Preview ready</span>
          </div>

          <dl className="backup-stats">
            <ImportStat label="Ready to import" value={selected.stats.importableNotes} />
            <ImportStat label="Already imported" value={selected.stats.alreadyImportedNotes} />
            <ImportStat label="Active" value={selected.stats.activeNotes} />
            <ImportStat label="Archived" value={selected.stats.archivedNotes} />
            <ImportStat label="Trash" value={selected.stats.trashedNotes} />
            <ImportStat label="Pinned" value={selected.stats.pinnedNotes} />
            <ImportStat label="Labels" value={selected.stats.labels} />
            <ImportStat label="Attachments" value={selected.stats.attachments} />
            <ImportStat label="HTML fallback" value={selected.stats.htmlFallbackNotes} />
          </dl>

          <fieldset className="keep-import-options">
            <legend>Import</legend>
            <label>
              <input
                type="checkbox"
                checked={selection.active}
                onChange={(event) =>
                  setSelection((current) => ({ ...current, active: event.target.checked }))
                }
              />
              <span>Active notes ({selected.stats.activeNotes})</span>
            </label>
            <label>
              <input
                type="checkbox"
                checked={selection.archived}
                onChange={(event) =>
                  setSelection((current) => ({ ...current, archived: event.target.checked }))
                }
              />
              <span>Archived notes ({selected.stats.archivedNotes})</span>
            </label>
            <label>
              <input
                type="checkbox"
                checked={selection.trashed}
                onChange={(event) =>
                  setSelection((current) => ({ ...current, trashed: event.target.checked }))
                }
              />
              <span>Trashed notes ({selected.stats.trashedNotes})</span>
            </label>
            <label>
              <input
                type="checkbox"
                checked={selection.attachments}
                onChange={(event) =>
                  setSelection((current) => ({ ...current, attachments: event.target.checked }))
                }
              />
              <span>
                Attachments ({pendingAttachments}, {formatBytes(selected.stats.attachmentBytes)})
              </span>
            </label>
          </fieldset>

          <div className="keep-import-assurance">
            <PackageCheck aria-hidden="true" />
            <div>
              <strong>Existing Notes data stays in place.</strong>
              <span>
                Keep colors, labels, pin/archive/trash state, timestamps, check states, supported
                attachments, and an initial import revision become native Notes data.
              </span>
            </div>
          </div>

          {selection.attachments && storageWarning ? (
            <div className="keep-import-storage-warning">
              <TriangleAlert aria-hidden="true" />
              <span>{storageWarning}</span>
            </div>
          ) : null}

          {selected.stats.warningCount > 0 ? (
            <details className="keep-import-warnings">
              <summary>
                <TriangleAlert aria-hidden="true" />
                {selected.stats.warningCount} import{' '}
                {selected.stats.warningCount === 1 ? 'warning' : 'warnings'}
              </summary>
              <ul>
                {selected.warnings.map((warning, index) => (
                  <li key={`${warning.source}:${warning.message}:${index}`}>
                    <strong>{warning.source}</strong>
                    <span>{warning.message}</span>
                  </li>
                ))}
              </ul>
              {selected.stats.warningCount > selected.warnings.length ? (
                <p>Only the first {selected.warnings.length} warnings are shown.</p>
              ) : null}
            </details>
          ) : null}

          <button
            className="backup-button backup-button-primary keep-import-submit"
            type="button"
            disabled={pendingNotes === 0 || busy !== null}
            onClick={() => void importNotes()}
          >
            <Import aria-hidden="true" />
            {busy === 'import'
              ? 'Importing…'
              : pendingNotes === 0
                ? 'Nothing selected to import'
                : `Import ${pendingNotes} ${pendingNotes === 1 ? 'note' : 'notes'}`}
          </button>
        </div>
      ) : null}

      {result ? (
        <div className="backup-preview keep-import-result" aria-label="Google Keep import result">
          <div className="backup-preview-heading">
            <div>
              <strong>Google Keep import complete</strong>
              <span>Imported data is now ordinary local Notes data.</span>
            </div>
            <span className="backup-valid-badge">Complete</span>
          </div>
          <dl className="backup-stats">
            <ImportStat label="Notes imported" value={result.importedNotes} />
            <ImportStat label="Labels created" value={result.createdLabels} />
            <ImportStat label="Attachments" value={result.importedAttachments} />
            <ImportStat label="Selection skipped" value={result.skippedBySelection} />
            <ImportStat label="Already imported" value={result.skippedAlreadyImported} />
          </dl>
        </div>
      ) : null}

      {statusMessage ? (
        <p className="backup-status keep-import-message" role="status">
          {statusMessage}
        </p>
      ) : null}
      {errorMessage ? (
        <p className="backup-error keep-import-message" role="alert">
          {errorMessage}
        </p>
      ) : null}
    </section>
  );
}

function ImportStat({ label, value }: { label: string; value: number }) {
  return (
    <div>
      <dt>{label}</dt>
      <dd>{value}</dd>
    </div>
  );
}

function formatSourceSummary(prepared: PreparedKeepImport): string {
  if (prepared.archiveNames.length === 1) return prepared.archiveNames[0] ?? 'Google Keep source';
  return `${prepared.archiveNames.length} selected source files`;
}

function selectedNoteCount(
  prepared: PreparedKeepImport,
  selection: GoogleKeepImportSelection,
): number {
  return prepared.notes.filter((note) => {
    if (note.trashed) return selection.trashed;
    if (note.archived) return selection.archived;
    return selection.active;
  }).length;
}

function selectedAttachmentCount(
  prepared: PreparedKeepImport,
  selection: GoogleKeepImportSelection,
): number {
  if (!selection.attachments) return 0;
  return prepared.notes
    .filter((note) => {
      if (note.trashed) return selection.trashed;
      if (note.archived) return selection.archived;
      return selection.active;
    })
    .reduce((total, note) => total + note.attachments.length, 0);
}

async function estimateStorageWarning(prepared: PreparedKeepImport): Promise<string | null> {
  const estimateStorage = navigator.storage?.estimate;
  if (!estimateStorage) return null;
  try {
    const estimate = await estimateStorage.call(navigator.storage);
    if (estimate.quota === undefined) return null;
    const available = Math.max(0, estimate.quota - (estimate.usage ?? 0));
    const textBytes = prepared.notes.reduce(
      (total, note) =>
        total + (note.title.length + note.content.length) * 2 + note.items.length * 64,
      0,
    );
    const required = prepared.stats.attachmentBytes + textBytes;
    if (required <= available * 0.8) return null;
    return `This import may need about ${formatBytes(required)}, while the browser reports about ${formatBytes(available)} free. Disable attachments or free browser storage before importing.`;
  } catch {
    return null;
  }
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  const units = ['KB', 'MB', 'GB'];
  let value = bytes / 1024;
  let unit = units[0] ?? 'KB';
  for (let index = 1; index < units.length && value >= 1024; index += 1) {
    value /= 1024;
    unit = units[index] ?? unit;
  }
  return `${value.toFixed(value >= 10 ? 1 : 2)} ${unit}`;
}

function toErrorMessage(error: unknown): string {
  if (error instanceof Error && error.message.trim()) return error.message;
  return 'Google Keep Takeout could not be inspected or imported.';
}
