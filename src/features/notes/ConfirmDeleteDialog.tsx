import { useRef, type PointerEvent as ReactPointerEvent } from 'react';

import { useDialogFocusTrap } from '../../components/ui/useDialogFocusTrap';

interface ConfirmDeleteDialogProps {
  title?: string;
  count?: number;
  context?: 'selection' | 'trash';
  busy?: boolean;
  error?: string | null;
  onCancel(): void;
  onConfirm(): void;
}

export function ConfirmDeleteDialog({
  title = '',
  count,
  context = 'selection',
  busy = false,
  error = null,
  onCancel,
  onConfirm,
}: ConfirmDeleteDialogProps) {
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

  const emptyingTrash = context === 'trash' && count !== undefined;
  const isBulk = count !== undefined && count > 1;
  const description = emptyingTrash
    ? `${count} ${count === 1 ? 'note' : 'notes'} in Trash will be permanently deleted.`
    : isBulk
      ? `${count} selected notes will be permanently deleted.`
      : title
        ? `“${title}” will be permanently deleted.`
        : 'This note will be permanently deleted.';
  const describedBy = error
    ? 'confirm-delete-description confirm-delete-error'
    : 'confirm-delete-description';

  return (
    <div className="confirm-dialog-layer" onPointerDown={handleLayerPointerDown}>
      <div
        ref={dialogRef}
        tabIndex={-1}
        className="confirm-dialog"
        role="alertdialog"
        aria-modal="true"
        aria-busy={busy || undefined}
        aria-labelledby="confirm-delete-title"
        aria-describedby={describedBy}
      >
        <h2 id="confirm-delete-title">
          {emptyingTrash
            ? 'Empty trash?'
            : isBulk
              ? `Delete ${count} notes permanently?`
              : 'Delete note permanently?'}
        </h2>
        <p id="confirm-delete-description">{description} This cannot be undone.</p>
        {error ? (
          <p id="confirm-delete-error" role="alert">
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
            {busy ? 'Deleting…' : 'Delete permanently'}
          </button>
        </div>
      </div>
    </div>
  );
}
