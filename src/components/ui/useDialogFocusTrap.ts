import { useEffect, useEffectEvent, type RefObject } from 'react';

const FOCUSABLE_SELECTOR = [
  'a[href]',
  'button:not([disabled])',
  'input:not([disabled])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  '[contenteditable="true"]',
  '[tabindex]:not([tabindex="-1"])',
].join(',');

interface DialogFocusOptions<TInitial extends HTMLElement> {
  enabled?: boolean;
  onEscape?: () => void;
  initialFocusRef?: RefObject<TInitial | null>;
}

export function useDialogFocusTrap<
  TContainer extends HTMLElement,
  TInitial extends HTMLElement = HTMLElement,
>(containerRef: RefObject<TContainer | null>, options: DialogFocusOptions<TInitial> = {}): void {
  const handleEscape = useEffectEvent((event: KeyboardEvent) => {
    if (!options.onEscape) return;
    event.preventDefault();
    event.stopPropagation();
    options.onEscape();
  });
  const setupDialog = useEffectEvent(() => {
    const container = containerRef.current;
    if (!container || options.enabled === false) return;
    const isTopmost = () => {
      const dialogs = Array.from(
        document.querySelectorAll<HTMLElement>('[aria-modal="true"]'),
      ).filter((node) => node.getClientRects().length > 0);
      const top = dialogs.at(-1);
      return !top || top === container;
    };
    const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const frame = window.requestAnimationFrame(() => {
      if (!isTopmost() || container.contains(document.activeElement)) return;
      const target =
        options.initialFocusRef?.current ?? focusableElements(container)[0] ?? container;
      target.focus({ preventScroll: true });
    });

    const handleKeyDown = (event: KeyboardEvent) => {
      if (!isTopmost() || event.defaultPrevented) return;
      if (event.key === 'Escape') {
        handleEscape(event);
        return;
      }
      if (event.key !== 'Tab') return;
      const focusable = focusableElements(container);
      if (focusable.length === 0) {
        event.preventDefault();
        container.focus({ preventScroll: true });
        return;
      }
      const active = document.activeElement;
      const index = focusable.findIndex((element) => element === active);
      if (event.shiftKey && (index <= 0 || !container.contains(active))) {
        event.preventDefault();
        focusable.at(-1)?.focus({ preventScroll: true });
      } else if (!event.shiftKey && (index === focusable.length - 1 || index < 0)) {
        event.preventDefault();
        focusable[0]?.focus({ preventScroll: true });
      }
    };

    document.addEventListener('keydown', handleKeyDown, true);
    return () => {
      window.cancelAnimationFrame(frame);
      document.removeEventListener('keydown', handleKeyDown, true);
      if (!previous?.isConnected) return;
      window.requestAnimationFrame(() => {
        const active = document.activeElement;
        const focusIsUnclaimed =
          active === null || active === document.body || active === document.documentElement;
        if (focusIsUnclaimed && previous.isConnected) previous.focus({ preventScroll: true });
      });
    };
  });

  useEffect(() => setupDialog(), [options.enabled]);
}

function focusableElements(container: HTMLElement): HTMLElement[] {
  return Array.from(container.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)).filter(
    (element) => {
      if (element.hidden || element.tabIndex < 0 || element.getClientRects().length === 0)
        return false;
      if (element.closest('[inert], [aria-hidden="true"]')) return false;
      if (getComputedStyle(element).visibility === 'hidden') return false;
      return true;
    },
  );
}
