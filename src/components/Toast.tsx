import { useEffect } from 'react';

// Replaces window.alert() for validation/error messages — these aren't
// decisions (that's ConfirmModal's job), just "here's why that didn't
// work," so a lightweight auto-dismissing banner is the right weight
// rather than a full modal blocking interaction.
export default function Toast({
  message,
  onDismiss,
  tone = 'error',
}: {
  message: string | null;
  onDismiss: () => void;
  // 'error' (the original, still the default — every existing caller sends
  // none) is "here's why that didn't work." 'success' is for something
  // that resolved itself with no action needed from the person — coral
  // would wrongly read as a problem for news that's actually good.
  tone?: 'error' | 'success';
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
        className={`card border px-4 py-3 text-sm shadow-lg flex items-start gap-3 ${
          tone === 'success' ? 'border-moss/40 text-moss-light' : 'border-coral/40 text-coral'
        }`}
      >
        <span className="flex-1 leading-relaxed">{message}</span>
        <button
          onClick={onDismiss}
          aria-label="Dismiss"
          className={`shrink-0 leading-none text-base ${
            tone === 'success' ? 'text-moss-light/70 hover:text-moss-light' : 'text-coral/70 hover:text-coral'
          }`}
        >
          ✕
        </button>
      </div>
    </div>
  );
}