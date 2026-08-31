import { useRef, useState, type ChangeEvent } from 'react';
import { FileArchive, Import, PackageCheck, ShieldCheck, TriangleAlert } from 'lucide-react';

import { notesDatabase } from '../../db';
import { GoogleKeepImportRepository } from './googleKeepRepository';
import { MAX_KEEP_ARCHIVE_BYTES, type PreparedKeepImport } from './googleKeepImport';

const keepImportRepository = new GoogleKeepImportRepository(notesDatabase);

interface GoogleKeepImportPanelProps {
  onImported(): Promise<void> | void;
}

export function GoogleKeepImportPanel({ onImported }: GoogleKeepImportPanelProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [selected, setSelected] = useState<PreparedKeepImport | null>(null);
  const [busy, setBusy] = useState<'inspect' | 'import' | null>(null);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const inspectFiles = async (event: ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.target.files ?? []);
    event.target.value = '';
    if (files.length === 0) return;

    setSelected(null);
    setBusy('inspect');
    setStatusMessage(null);
    setErrorMessage(null);

    try {
      const totalBytes = files.reduce((total, file) => total + file.size, 0);
      if (totalBytes > MAX_KEEP_ARCHIVE_BYTES) {
        throw new Error(
          'The selected Takeout archives exceed the 512 MB browser import safety limit.',
        );
      }
      const prepared = await keepImportRepository.inspect(files);
      setSelected(prepared);
      setStatusMessage('Takeout inspected. No local notes have been changed.');
    } catch (error) {
      setErrorMessage(toErrorMessage(error));
    } finally {
      setBusy(null);
    }
  };

  const importNotes = async () => {
    if (!selected || selected.stats.importableNotes === 0 || busy) return;
    setBusy('import');
    setStatusMessage(null);
    setErrorMessage(null);

    try {
      const result = await keepImportRepository.importPrepared(selected);
      setSelected(null);
      setStatusMessage(
        `Imported ${result.importedNotes} Google Keep ${result.importedNotes === 1 ? 'note' : 'notes'} without replacing existing local notes.`,
      );
      await onImported();
    } catch (error) {
      setErrorMessage(toErrorMessage(error));
    } finally {
      setBusy(null);
    }
  };

  return (
    <section className="backup-card keep-import-card" aria-labelledby="keep-import-title">
      <div className="backup-card-icon" aria-hidden="true">
        <Import />
      </div>
      <div className="backup-card-copy">
        <p className="backup-eyebrow">Google Keep migration</p>
        <h2 id="keep-import-title">Import Google Takeout</h2>
        <p>
          Select the ZIP file Google Takeout gives you. You can select multiple ZIP parts together.
          Notes previews everything locally before importing and never replaces existing notes.
        </p>
        <div className="backup-assurance">
          <ShieldCheck aria-hidden="true" />
          <span>
            Re-importing the same Keep source is safe: previously imported source notes are detected
            and skipped instead of duplicated.
          </span>
        </div>
      </div>

      <input
        ref={inputRef}
        className="backup-file-input"
        type="file"
        accept="application/zip,.zip"
        multiple
        aria-label="Choose Google Takeout archives"
        onChange={(event) => void inspectFiles(event)}
      />
      <button
        className="backup-button backup-button-secondary"
        type="button"
        disabled={busy !== null}
        onClick={() => inputRef.current?.click()}
      >
        <FileArchive aria-hidden="true" />
        {busy === 'inspect' ? 'Inspecting Takeout…' : 'Choose Google Takeout ZIP'}
      </button>

      {selected ? (
        <div className="backup-preview keep-import-preview" aria-label="Google Keep import preview">
          <div className="backup-preview-heading">
            <div>
              <strong>{formatArchiveSummary(selected.archiveNames)}</strong>
              <span>{selected.stats.jsonFiles} Keep JSON files inspected</span>
            </div>
            <span className="backup-valid-badge">Preview ready</span>
          </div>

          <dl className="backup-stats">
            <ImportStat label="Ready to import" value={selected.stats.importableNotes} />
            <ImportStat label="Already imported" value={selected.stats.alreadyImportedNotes} />
            <ImportStat label="Text notes" value={selected.stats.textNotes} />
            <ImportStat label="Checklists" value={selected.stats.checklistNotes} />
            <ImportStat label="Labels" value={selected.stats.labels} />
            <ImportStat label="Attachments" value={selected.stats.attachments} />
          </dl>

          <div className="keep-import-assurance">
            <PackageCheck aria-hidden="true" />
            <div>
              <strong>Existing Notes data stays in place.</strong>
              <span>
                Keep colors, labels, pin/archive/trash state, timestamps, check states, attachment
                bytes, and an initial import revision are added in one transaction.
              </span>
            </div>
          </div>

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
            disabled={selected.stats.importableNotes === 0 || busy !== null}
            onClick={() => void importNotes()}
          >
            <Import aria-hidden="true" />
            {busy === 'import'
              ? 'Importing…'
              : selected.stats.importableNotes === 0
                ? 'Nothing new to import'
                : `Import ${selected.stats.importableNotes} ${selected.stats.importableNotes === 1 ? 'note' : 'notes'}`}
          </button>
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

function formatArchiveSummary(names: string[]): string {
  if (names.length === 1) return names[0] ?? 'Google Takeout';
  return `${names.length} Takeout ZIP files`;
}

function toErrorMessage(error: unknown): string {
  if (error instanceof Error && error.message.trim()) return error.message;
  return 'Google Keep Takeout could not be inspected or imported.';
}
