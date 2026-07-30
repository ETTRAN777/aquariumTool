import { useEffect } from 'react';

// The single entry point for both Drive directions, replacing a
// standalone "Upload to Drive" navbar button. Fixes a real asymmetry:
// Upload used to be one click away and always visible, while Download was
// buried inside the Import screen — easy to reach for Upload out of habit
// without ever pausing to check what's actually sitting in Drive first.
// Putting both choices behind one deliberate click closes that gap.
export default function DrivePickerModal({
  open,
  onUpload,
  onDownload,
  onCancel,
}: {
  open: boolean;
  onUpload: () => void;
  onDownload: () => void;
  onCancel: () => void;
}) {
  useEffect(() => {
    if (!open) return;
    function handleKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onCancel();
    }
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [open, onCancel]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm px-4"
      onClick={onCancel}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="drive-picker-title"
        onClick={(e) => e.stopPropagation()}
        className="card p-5 max-w-sm w-full"
      >
        <h2 id="drive-picker-title" className="font-display text-lg font-semibold text-foam mb-1">
          Optional: Google Drive Sync for Multi-Device Use
        </h2>
        <p className="text-xs text-foam-dim leading-relaxed mb-5">
          Manual — only runs when you choose Upload or Download below. Nothing
          happens automatically or in the background.
        </p>
        <div className="flex flex-col gap-2">
          <button onClick={onUpload} className="btn btn-primary text-left">
            Upload — back up this device's data to Drive
          </button>
          <button onClick={onDownload} className="btn btn-secondary text-left">
            Download — bring in your Drive backup
          </button>
          <button onClick={onCancel} className="btn btn-ghost text-xs mt-1">
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}
