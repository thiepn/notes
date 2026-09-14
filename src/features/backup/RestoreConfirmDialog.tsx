import { useRef, type PointerEvent as ReactPointerEvent } from 'react';

import { useDialogFocusTrap } from '../../components/ui/useDialogFocusTrap';

interface RestoreConfirmDialogProps {
  fileName: string;
  busy?: boolean;
  error?: string | null;
  onCancel(): void;
  onConfirm(): void;
}

export function RestoreConfirmDialog({
  fileName,
  busy = false,
  error = null,
  onCancel,
  onConfirm,
}: RestoreConfirmDialogProps) {
  const dialogRef = useRef<HTMLDivElement>(null);
  const cancelRef = useRef<HTMLButtonElement>(null);

  useDialogFocusTrap(
    dialogRef,
    busy
      ? { initialFocusRef: cancelRef }
      : {
          onEscape: onCancel,
          initialFocusRef: cancelRef,
        },
  );

  const handleLayerPointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (!busy && event.target === event.currentTarget) onCancel();
  };

  const describedBy = error
    ? 'restore-confirm-description restore-confirm-error'
    : 'restore-confirm-description';

  return (
    <div className="confirm-dialog-layer" onPointerDown={handleLayerPointerDown}>
      <div
        ref={dialogRef}
        tabIndex={-1}
        className="confirm-dialog"
        role="alertdialog"
        aria-modal="true"
        aria-busy={busy || undefined}
        aria-labelledby="restore-confirm-title"
        aria-describedby={describedBy}
      >
        <h2 id="restore-confirm-title">Restore and replace local library?</h2>
        <p id="restore-confirm-description">
          The validated backup “{fileName}” will replace the complete local Notes library. Notes
          downloads a fresh safety backup of the current device before replacement begins.
        </p>
        {error ? (
          <p id="restore-confirm-error" role="alert">
            {error}
          </p>
        ) : null}
        <div className="confirm-dialog-actions">
          <button ref={cancelRef} type="button" disabled={busy} onClick={onCancel}>
            Cancel
          </button>
          <button
            className="confirm-dialog-danger"
            type="button"
            disabled={busy}
            onClick={onConfirm}
          >
            {busy ? 'Restoring…' : 'Restore library'}
          </button>
        </div>
      </div>
    </div>
  );
}
