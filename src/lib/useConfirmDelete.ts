import { useRef, useState } from 'react';

/**
 * Arms a delete action on first click (button should swap to a confirm
 * state, e.g. ✕ → ✓), and actually performs it on a second click within
 * `timeoutMs`. Auto-disarms after the timeout so a stray click days later
 * can't land on an armed button and delete something unintended.
 */
export function useConfirmDelete(timeoutMs = 3000) {
  const [pendingId, setPendingId] = useState<string | null>(null);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  function handleClick(id: string, onConfirm: () => void) {
    if (pendingId === id) {
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
      setPendingId(null);
      onConfirm();
      return;
    }
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    setPendingId(id);
    timeoutRef.current = setTimeout(() => setPendingId(null), timeoutMs);
  }

  return { pendingId, handleClick };
}
