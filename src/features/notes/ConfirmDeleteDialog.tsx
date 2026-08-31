import { useEffect, type PointerEvent as ReactPointerEvent } from 'react';

interface ConfirmDeleteDialogProps {
  title?: string;
  count?: number;
  onCancel(): void;
  onConfirm(): void;
}

export function ConfirmDeleteDialog({
  title = '',
  count,
  onCancel,
  onConfirm,
}: ConfirmDeleteDialogProps) {
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        onCancel();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onCancel]);

  const handleLayerPointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (event.target === event.currentTarget) onCancel();
  };

  const isBulk = count !== undefined && count > 1;
  const description = isBulk
    ? `${count} selected notes will be permanently deleted.`
    : title
      ? `“${title}” will be permanently deleted.`
      : 'This note will be permanently deleted.';

  return (
    <div className="confirm-dialog-layer" onPointerDown={handleLayerPointerDown}>
      <div
        className="confirm-dialog"
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="confirm-delete-title"
        aria-describedby="confirm-delete-description"
      >
        <h2 id="confirm-delete-title">
          {isBulk ? `Delete ${count} notes permanently?` : 'Delete note permanently?'}
        </h2>
        <p id="confirm-delete-description">{description} This cannot be undone.</p>
        <div className="confirm-dialog-actions">
          <button type="button" autoFocus onClick={onCancel}>
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
