import { useRef, type PointerEvent as ReactPointerEvent } from 'react';

import { useDialogFocusTrap } from '../../components/ui/useDialogFocusTrap';

interface ConfirmDeleteDialogProps {
  title?: string;
  count?: number;
  context?: 'selection' | 'trash';
  onCancel(): void;
  onConfirm(): void;
}

export function ConfirmDeleteDialog({
  title = '',
  count,
  context = 'selection',
  onCancel,
  onConfirm,
}: ConfirmDeleteDialogProps) {
  const dialogRef = useRef<HTMLDivElement>(null);
  const cancelRef = useRef<HTMLButtonElement>(null);
  useDialogFocusTrap(dialogRef, { onEscape: onCancel, initialFocusRef: cancelRef });

  const handleLayerPointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (event.target === event.currentTarget) onCancel();
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

  return (
    <div className="confirm-dialog-layer" onPointerDown={handleLayerPointerDown}>
      <div
        ref={dialogRef}
        tabIndex={-1}
        className="confirm-dialog"
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="confirm-delete-title"
        aria-describedby="confirm-delete-description"
      >
        <h2 id="confirm-delete-title">
          {emptyingTrash
            ? 'Empty trash?'
            : isBulk
              ? `Delete ${count} notes permanently?`
              : 'Delete note permanently?'}
        </h2>
        <p id="confirm-delete-description">{description} This cannot be undone.</p>
        <div className="confirm-dialog-actions">
          <button ref={cancelRef} type="button" onClick={onCancel}>
            Cancel
          </button>
          <button className="confirm-dialog-danger" type="button" onClick={onConfirm}>
            Delete permanently
          </button>
        </div>
      </div>
    </div>
  );
}
