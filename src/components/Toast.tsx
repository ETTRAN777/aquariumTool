import { useEffect } from 'react';

// Replaces window.alert() for validation/error messages — these aren't
// decisions (that's ConfirmModal's job), just "here's why that didn't
// work," so a lightweight auto-dismissing banner is the right weight
// rather than a full modal blocking interaction.
export default function Toast({
  message,
  onDismiss,
}: {
  message: string | null;
  onDismiss: () => void;
}) {
  useEffect(() => {
    if (!message) return;
    const timer = setTimeout(onDismiss, 5000);
    return () => clearTimeout(timer);
  }, [message, onDismiss]);

  if (!message) return null;

  return (
    <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 w-[calc(100%-2rem)] max-w-md px-4">
      <div
        role="alert"
        className="card border border-coral/40 px-4 py-3 text-sm text-coral shadow-lg flex items-start gap-3"
      >
        <span className="flex-1 leading-relaxed">{message}</span>
        <button
          onClick={onDismiss}
          aria-label="Dismiss"
          className="text-coral/70 hover:text-coral shrink-0 leading-none text-base"
        >
          ✕
        </button>
      </div>
    </div>
  );
}
