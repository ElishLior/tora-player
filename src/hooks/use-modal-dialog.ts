'use client';

import { useEffect, useRef, type RefObject } from 'react';

const FOCUSABLE = 'a[href], button:not([disabled]), input:not([disabled]), select, textarea, [tabindex]:not([tabindex="-1"])';

/**
 * Keyboard behaviour of a modal `role="dialog"` element (give it tabIndex={-1}):
 * focus moves into it on mount (`[data-autofocus]` or the dialog), Tab stays
 * inside, Escape closes it, and focus returns to the opener on unmount — or to
 * `fallbackFocus` when the opener left the page (the mini player swaps with the
 * full player). Keys from a nested dialog, or while a menu inside is open
 * (`aria-expanded="true"`, the menu closes itself), are left alone.
 */
export function useModalDialog(
  ref: RefObject<HTMLElement | null>,
  onClose: () => void,
  fallbackFocus?: string,
) {
  const onCloseRef = useRef(onClose);
  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    (dialog.querySelector<HTMLElement>('[data-autofocus]') ?? dialog).focus();

    const handleKey = (e: KeyboardEvent) => {
      const target = e.target instanceof Element ? e.target : null;
      if (target?.closest('[role="dialog"]') !== dialog) return;

      if (e.key === 'Escape') {
        if (dialog.querySelector('[aria-expanded="true"]')) return;
        e.preventDefault();
        onCloseRef.current();
        return;
      }
      if (e.key !== 'Tab') return;
      const items = Array.from(dialog.querySelectorAll<HTMLElement>(FOCUSABLE)).filter(
        (el) => el.closest('[role="dialog"]') === dialog && el.getClientRects().length > 0,
      );
      const first = items[0];
      const last = items[items.length - 1];
      if (!first || !last) return;
      if (e.shiftKey && (target === first || target === dialog)) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && target === last) {
        e.preventDefault();
        first.focus();
      }
    };

    document.addEventListener('keydown', handleKey);
    return () => {
      document.removeEventListener('keydown', handleKey);
      // After the closing render: the opener may have been replaced meanwhile.
      requestAnimationFrame(() => {
        const active = document.activeElement;
        if (active && active !== document.body && active.isConnected) return;
        const target = opener?.isConnected
          ? opener
          : fallbackFocus
            ? document.querySelector<HTMLElement>(fallbackFocus)
            : null;
        target?.focus();
      });
    };
  }, [ref, fallbackFocus]);
}
