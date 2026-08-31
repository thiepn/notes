export interface LifecycleToastState {
  id: string;
  message: string;
  undo?: () => Promise<void>;
}

interface LifecycleToastProps {
  toast: LifecycleToastState;
  onUndo(): void;
}

export function LifecycleToast({ toast, onUndo }: LifecycleToastProps) {
  return (
    <div className="lifecycle-toast" role="status" aria-live="polite">
      <span>{toast.message}</span>
      {toast.undo ? (
        <button type="button" onClick={onUndo}>
          Undo
        </button>
      ) : null}
    </div>
  );
}
