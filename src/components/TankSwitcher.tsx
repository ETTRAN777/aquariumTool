import { useEffect, useRef, useState } from 'react';
import type { Tank } from '../types';

// Replaces a native <select> for the header tank switcher. Native selects
// can't reliably ellipsis-truncate their own rendered text across
// browsers — there's no clean CSS solution, MDN itself calls the select
// element "notoriously difficult to style" for exactly this reason — so a
// long tank name just grew the whole header instead of truncating,
// pushing the nav row around with it. This is a plain button + custom
// menu instead, so ordinary CSS truncation (overflow/text-overflow) just
// works like it does everywhere else in the app.
export default function TankSwitcher({
  tanks,
  activeTank,
  onSwitch,
  onNewTank,
}: {
  tanks: Tank[];
  activeTank: Tank;
  onSwitch: (id: string) => void;
  onNewTank: () => void;
}) {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function handleClickOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    function handleKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false);
    }
    document.addEventListener('mousedown', handleClickOutside);
    window.addEventListener('keydown', handleKey);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      window.removeEventListener('keydown', handleKey);
    };
  }, [open]);

  return (
    <div ref={containerRef} className="relative min-w-0">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="listbox"
        aria-expanded={open}
        title={activeTank.name}
        className="font-display text-3xl md:text-4xl font-semibold text-foam bg-transparent border-none outline-none cursor-pointer -ml-1 max-w-full min-w-0 flex items-center gap-1.5 text-left leading-tight hover:text-amber transition-colors"
      >
        <span className="truncate min-w-0">{activeTank.name}</span>
        <svg
          width="20"
          height="20"
          viewBox="0 0 20 20"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          className={`shrink-0 transition-transform ${open ? 'rotate-180' : ''}`}
          aria-hidden="true"
        >
          <path d="M5 7.5L10 12.5L15 7.5" />
        </svg>
      </button>

      {open && (
        <div role="listbox" className="absolute z-40 mt-2 min-w-[220px] max-w-sm card p-1.5 space-y-0.5">
          {tanks.map((t) => (
            <button
              key={t.id}
              type="button"
              role="option"
              aria-selected={t.id === activeTank.id}
              title={t.name}
              onClick={() => {
                onSwitch(t.id);
                setOpen(false);
              }}
              className={`block w-full text-left px-3 py-1.5 rounded-md text-sm truncate transition-colors ${
                t.id === activeTank.id
                  ? 'bg-moss text-foam'
                  : 'text-foam-dim hover:text-foam hover:bg-deepwater-2'
              }`}
            >
              {t.name}
            </button>
          ))}
          <div className="border-t border-moss/20 my-1" />
          <button
            type="button"
            onClick={() => {
              onNewTank();
              setOpen(false);
            }}
            className="block w-full text-left px-3 py-1.5 rounded-md text-sm text-amber hover:bg-deepwater-2 transition-colors"
          >
            + New tank…
          </button>
        </div>
      )}
    </div>
  );
}
