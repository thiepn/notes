import {
  useEffect,
  useId,
  useRef,
  type KeyboardEvent as ReactKeyboardEvent,
  type ReactNode,
} from 'react';

type EditorActionPopoverKind = 'dialog' | 'menu';
type FocusTarget = 'first' | 'last';

interface EditorActionPopoverProps {
  kind: EditorActionPopoverKind;
  label: string;
  triggerLabel: string;
  triggerIcon: ReactNode;
  open: boolean;
  onOpenChange(open: boolean): void;
  onBeforeOpen?(): void;
  surfaceClassName: string;
  children: ReactNode;
}

const DIALOG_CONTROL_SELECTOR = [
  'button:not([disabled])',
  'a[href]',
  'input:not([disabled])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
].join(',');

export function EditorActionPopover({
  kind,
  label,
  triggerLabel,
  triggerIcon,
  open,
  onOpenChange,
  onBeforeOpen,
  surfaceClassName,
  children,
}: EditorActionPopoverProps) {
  const triggerRef = useRef<HTMLButtonElement>(null);
  const surfaceRef = useRef<HTMLDivElement>(null);
  const initialFocusRef = useRef<FocusTarget>('first');
  const surfaceId = useId();

  useEffect(() => {
    if (!open) return;

    const focusFrame = window.requestAnimationFrame(() => {
      const controls = surfaceControls(surfaceRef.current, kind);
      const target = initialFocusRef.current === 'last' ? controls.at(-1) : controls[0];
      (target ?? surfaceRef.current)?.focus({ preventScroll: true });
    });

    const handlePointerDown = (event: PointerEvent) => {
      const target = event.target;
      if (!(target instanceof Node)) return;
      if (triggerRef.current?.contains(target) || surfaceRef.current?.contains(target)) return;
      onOpenChange(false);
    };

    const handleFocusIn = (event: FocusEvent) => {
      const target = event.target;
      if (!(target instanceof Node)) return;
      if (triggerRef.current?.contains(target) || surfaceRef.current?.contains(target)) return;
      onOpenChange(false);
    };

    document.addEventListener('pointerdown', handlePointerDown, true);
    document.addEventListener('focusin', handleFocusIn, true);
    return () => {
      window.cancelAnimationFrame(focusFrame);
      document.removeEventListener('pointerdown', handlePointerDown, true);
      document.removeEventListener('focusin', handleFocusIn, true);
    };
  }, [kind, onOpenChange, open]);

  const openWithFocus = (target: FocusTarget) => {
    initialFocusRef.current = target;
    onBeforeOpen?.();
    onOpenChange(true);
  };

  const closeAndRestoreFocus = () => {
    triggerRef.current?.focus({ preventScroll: true });
    onOpenChange(false);
  };

  const handleTriggerKeyDown = (event: ReactKeyboardEvent<HTMLButtonElement>) => {
    if (kind !== 'menu') return;
    if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp') return;
    event.preventDefault();
    openWithFocus(event.key === 'ArrowUp' ? 'last' : 'first');
  };

  const handleSurfaceKeyDown = (event: ReactKeyboardEvent<HTMLDivElement>) => {
    if (event.key === 'Escape') {
      const target = event.target;
      const nestedDialog = target instanceof Element ? target.closest<HTMLElement>('[role="dialog"]') : null;
      if (
        nestedDialog &&
        nestedDialog !== surfaceRef.current &&
        surfaceRef.current?.contains(nestedDialog)
      ) {
        return;
      }
      event.preventDefault();
      event.stopPropagation();
      closeAndRestoreFocus();
      return;
    }

    if (kind !== 'menu') return;
    if (!['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) return;
    const controls = surfaceControls(surfaceRef.current, 'menu');
    if (controls.length === 0) return;
    const currentIndex = controls.findIndex((control) => control === document.activeElement);
    let nextIndex = currentIndex;
    if (event.key === 'ArrowDown') {
      nextIndex = currentIndex < 0 ? 0 : (currentIndex + 1) % controls.length;
    } else if (event.key === 'ArrowUp') {
      nextIndex = currentIndex <= 0 ? controls.length - 1 : currentIndex - 1;
    } else if (event.key === 'Home') {
      nextIndex = 0;
    } else if (event.key === 'End') {
      nextIndex = controls.length - 1;
    }
    event.preventDefault();
    event.stopPropagation();
    controls[nextIndex]?.focus({ preventScroll: true });
  };

  return (
    <div className="note-editor-menu-slot">
      <button
        ref={triggerRef}
        className="note-editor-secondary"
        type="button"
        aria-expanded={open}
        aria-haspopup={kind}
        aria-controls={surfaceId}
        onKeyDown={handleTriggerKeyDown}
        onClick={() => {
          if (open) onOpenChange(false);
          else openWithFocus('first');
        }}
      >
        {triggerIcon}
        {triggerLabel}
      </button>
      {open ? (
        <div
          id={surfaceId}
          ref={surfaceRef}
          className={surfaceClassName}
          role={kind}
          aria-label={label}
          tabIndex={-1}
          onKeyDown={handleSurfaceKeyDown}
        >
          {children}
        </div>
      ) : null}
    </div>
  );
}

function surfaceControls(
  surface: HTMLElement | null,
  kind: EditorActionPopoverKind,
): HTMLElement[] {
  if (!surface) return [];
  const selector = kind === 'menu' ? '[role="menuitem"]:not([disabled])' : DIALOG_CONTROL_SELECTOR;
  return Array.from(surface.querySelectorAll<HTMLElement>(selector)).filter((element) => {
    if (element.hidden || element.tabIndex < 0 || element.getClientRects().length === 0)
      return false;
    if (element.closest('[inert], [aria-hidden="true"]')) return false;
    return getComputedStyle(element).visibility !== 'hidden';
  });
}
