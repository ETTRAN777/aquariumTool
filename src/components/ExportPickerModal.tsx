import { useEffect, useState } from 'react';
import type { Tank } from '../types';

// Export previously always included every tank, regardless of which one
// was active — the filename was cosmetically prefixed with the active
// tank's name, which was misleading (a file named "shrimp-tank-backup..."
// actually contained every other tank too). This picker makes scope
// explicit instead of implicit.
export default function ExportPickerModal({
  open,
  tanks,
  activeTank,
  onExport,
  onCancel,
}: {
  open: boolean;
  tanks: Tank[];
  activeTank: Tank;
  onExport: (tanks: Tank[], stripImages: boolean) => void;
  onCancel: () => void;
}) {
  const [chooseOpen, setChooseOpen] = useState(false);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [stripImages, setStripImages] = useState(false);

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
        aria-labelledby="export-picker-title"
        onClick={(e) => e.stopPropagation()}
        className="card p-5 max-w-sm w-full"
      >
        <h2 id="export-picker-title" className="font-display text-lg font-semibold text-foam mb-4">
          Export backup
        </h2>
        <div className="flex flex-col gap-2">
          <button onClick={() => onExport(tanks, stripImages)} className="btn btn-primary text-left">
            All tanks ({tanks.length})
          </button>
          <button onClick={() => onExport([activeTank], stripImages)} className="btn btn-secondary text-left">
            Just "{activeTank.name}"
          </button>

          <button
            type="button"
            onClick={() => setChooseOpen((s) => !s)}
            className="text-xs text-amber hover:underline text-left mt-1"
          >
            {chooseOpen ? 'Hide tank picker' : `Choose specific tanks (${selectedIds.length} selected)`}
          </button>

          {chooseOpen && (
            <div className="space-y-2">
              <div className="max-h-40 overflow-y-auto border border-moss/20 rounded-md p-2 space-y-1">
                {tanks.map((t) => (
                  <label key={t.id} className="flex items-center gap-2 text-xs text-foam-dim">
                    <input
                      type="checkbox"
                      checked={selectedIds.includes(t.id)}
                      onChange={(e) =>
                        setSelectedIds((prev) =>
                          e.target.checked ? [...prev, t.id] : prev.filter((id) => id !== t.id)
                        )
                      }
                    />
                    {t.name}
                  </label>
                ))}
              </div>
              <button
                onClick={() => onExport(tanks.filter((t) => selectedIds.includes(t.id)), stripImages)}
                disabled={selectedIds.length === 0}
                className="btn btn-secondary text-xs w-full disabled:opacity-50"
              >
                Export {selectedIds.length} tank{selectedIds.length === 1 ? '' : 's'}
              </button>
            </div>
          )}

          <button
            type="button"
            onClick={() => setStripImages((s) => !s)}
            className="text-xs text-amber hover:underline text-left"
            title="Log photos are almost always the bulk of a backup's size — leaving them out keeps the file small for pasting into an AI assistant, without losing anything else. Still a fully valid backup either way."
          >
            {stripImages
              ? '📷 Photos excluded — smaller file, AI-friendly'
              : '📷 Include photos (larger file)'}
          </button>

          <button onClick={onCancel} className="btn btn-ghost text-xs mt-1">
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}