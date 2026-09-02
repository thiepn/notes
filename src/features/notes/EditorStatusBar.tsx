import { editorSaveLabel, formatEditorSavedTime } from './editorInsights';

type EditorStatus = 'idle' | 'saving' | 'error';

interface EditorStatusBarProps {
  status: EditorStatus;
  hasPendingChanges: boolean;
  lastSavedAt: number;
  metrics: string[];
  errorMessage: string | null;
  onRetry(): void;
}

export function EditorStatusBar({
  status,
  hasPendingChanges,
  lastSavedAt,
  metrics,
  errorMessage,
  onRetry,
}: EditorStatusBarProps) {
  const saveLabel = editorSaveLabel(status, hasPendingChanges);
  const saveState =
    status === 'error'
      ? 'error'
      : status === 'saving'
        ? 'saving'
        : hasPendingChanges
          ? 'pending'
          : 'saved';

  return (
    <div className="note-editor-state" aria-live="polite">
      {errorMessage ? (
        <span className="note-editor-error" role="alert">
          {errorMessage}
          <button type="button" onClick={onRetry}>
            Retry
          </button>
        </span>
      ) : (
        <div className="note-editor-status-line">
          <span className="note-editor-save-indicator" data-state={saveState}>
            <span className="note-editor-save-dot" aria-hidden="true" />
            {saveLabel}
          </span>
          {metrics.map((metric) => (
            <span className="note-editor-metric" key={metric}>
              {metric}
            </span>
          ))}
          <time
            className="note-editor-updated"
            dateTime={new Date(lastSavedAt).toISOString()}
            title={new Date(lastSavedAt).toLocaleString()}
          >
            Updated {formatEditorSavedTime(lastSavedAt)}
          </time>
        </div>
      )}
    </div>
  );
}

export function EditorCloseButton({ onClick }: { onClick(): void }) {
  return (
    <button
      className="note-editor-close"
      type="button"
      aria-label="Close"
      aria-keyshortcuts="Control+Enter Meta+Enter"
      title="Close and save (Ctrl/Cmd+Enter)"
      onClick={onClick}
    >
      <span>Close</span>
      <kbd className="note-editor-close-shortcut" aria-hidden="true">
        Ctrl/⌘ ↵
      </kbd>
    </button>
  );
}
