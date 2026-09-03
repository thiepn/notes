from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def read(path: str) -> str:
    return (ROOT / path).read_text()


def write(path: str, content: str) -> None:
    (ROOT / path).write_text(content)


def replace_once(path: str, old: str, new: str) -> None:
    content = read(path)
    count = content.count(old)
    if count != 1:
        raise RuntimeError(f"Expected exactly one match in {path}, found {count}")
    write(path, content.replace(old, new, 1))


write(
    "src/components/ui/useDialogFocusTrap.ts",
    """import { useEffect, useEffectEvent, type RefObject } from 'react';

const FOCUSABLE_SELECTOR = [
  'a[href]',
  'button:not([disabled])',
  'input:not([disabled])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  '[tabindex]:not([tabindex=\"-1\"])',
].join(',');

interface DialogFocusOptions<TInitial extends HTMLElement> {
  onEscape?: () => void;
  initialFocusRef?: RefObject<TInitial | null>;
}

export function useDialogFocusTrap<
  TContainer extends HTMLElement,
  TInitial extends HTMLElement = HTMLElement,
>(containerRef: RefObject<TContainer | null>, options: DialogFocusOptions<TInitial> = {}): void {
  const setupDialog = useEffectEvent(() => {
    const container = containerRef.current;
    if (!container) return;
    const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const frame = window.requestAnimationFrame(() => {
      const target = options.initialFocusRef?.current ?? focusableElements(container)[0] ?? container;
      target.focus();
    });

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && options.onEscape) {
        event.preventDefault();
        event.stopPropagation();
        options.onEscape();
        return;
      }
      if (event.key !== 'Tab') return;
      const focusable = focusableElements(container);
      if (focusable.length === 0) {
        event.preventDefault();
        container.focus();
        return;
      }
      const active = document.activeElement;
      const index = focusable.findIndex((element) => element === active);
      if (event.shiftKey && (index <= 0 || !container.contains(active))) {
        event.preventDefault();
        focusable.at(-1)?.focus();
      } else if (!event.shiftKey && (index === focusable.length - 1 || index < 0)) {
        event.preventDefault();
        focusable[0]?.focus();
      }
    };

    document.addEventListener('keydown', handleKeyDown, true);
    return () => {
      window.cancelAnimationFrame(frame);
      document.removeEventListener('keydown', handleKeyDown, true);
      if (previous?.isConnected) window.requestAnimationFrame(() => previous.focus());
    };
  });

  useEffect(() => setupDialog(), []);
}

function focusableElements(container: HTMLElement): HTMLElement[] {
  return Array.from(container.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)).filter(
    (element) => !element.hidden && element.getClientRects().length > 0,
  );
}
""",
)

replace_once(
    "src/features/notes/NotesWorkspace.tsx",
    """  useEffect(() => {\n    if (!captureRequest || mode !== 'notes') return;\n    if (captureRequest.kind === 'checklist') {\n      setTextCaptureRequestId(undefined);\n      setChecklistCaptureOpen(true);\n    } else {\n      setChecklistCaptureOpen(false);\n      setTextCaptureRequestId(captureRequest.id);\n    }\n    onCaptureRequestHandled?.(captureRequest.id);\n  }, [captureRequest, mode, onCaptureRequestHandled]);\n""",
    """  useEffect(() => {\n    if (!captureRequest || mode !== 'notes') return;\n    const request = captureRequest;\n    const frame = window.requestAnimationFrame(() => {\n      if (request.kind === 'checklist') {\n        setTextCaptureRequestId(undefined);\n        setChecklistCaptureOpen(true);\n      } else {\n        setChecklistCaptureOpen(false);\n        setTextCaptureRequestId(request.id);\n      }\n      onCaptureRequestHandled?.(request.id);\n    });\n    return () => window.cancelAnimationFrame(frame);\n  }, [captureRequest, mode, onCaptureRequestHandled]);\n""",
)

replace_once(
    "src/features/storage/StorageHealthSettings.tsx",
    """  useEffect(() => {\n    void refresh();\n  }, [refresh]);\n""",
    """  useEffect(() => {\n    let cancelled = false;\n    void readStorageHealth().then((nextHealth) => {\n      if (!cancelled) setHealth(nextHealth);\n    });\n    return () => {\n      cancelled = true;\n    };\n  }, []);\n""",
)
