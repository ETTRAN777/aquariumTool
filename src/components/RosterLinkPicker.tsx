import { useState } from 'react';
import type { RosterItem, RosterLink, SourcingStatus } from '../types';
import { STATUS_ORDER, STATUS_LABELS } from '../lib/constants';

// Shared by Checklist.tsx (rosterLinks — a forward-looking gate: "don't
// mark this step done until this item reaches this status") and Log.tsx
// (LogEntry.additions — a retrospective record: "this item reached this
// status as of this entry"). Same underlying shape and interaction
// mechanics either way, so the picker itself is one component — only the
// instruction text differs, via the `label` prop, since the two uses mean
// genuinely different things despite sharing a type.
export default function RosterLinkPicker({
  roster,
  links,
  onChange,
  label = 'Wait on a roster item reaching a status',
}: {
  roster: RosterItem[];
  links: RosterLink[];
  onChange: (links: RosterLink[]) => void;
  label?: string;
}) {
  const [pickItemId, setPickItemId] = useState(roster[0]?.id ?? '');
  const [pickStatus, setPickStatus] = useState<SourcingStatus>('arrived');

  function addLink() {
    if (!pickItemId) return;
    if (links.some((l) => l.rosterItemId === pickItemId)) return; // no dupes
    onChange([...links, { rosterItemId: pickItemId, requiredStatus: pickStatus }]);
  }

  function removeLink(rosterItemId: string) {
    onChange(links.filter((l) => l.rosterItemId !== rosterItemId));
  }

  return (
    <div>
      <p className="text-[10px] text-foam-dim font-mono uppercase tracking-wide mb-1">{label}</p>
      {links.length > 0 && (
        <div className="flex flex-wrap gap-1.5 mb-2">
          {links.map((l) => {
            const item = roster.find((r) => r.id === l.rosterItemId);
            return (
              <span
                key={l.rosterItemId}
                className="pill text-[11px] py-1 pl-2 pr-1 bg-sand/15 text-sand gap-1"
              >
                📦 {item?.name ?? '(removed item)'} → {STATUS_LABELS[l.requiredStatus]}
                <button
                  type="button"
                  onClick={() => removeLink(l.rosterItemId)}
                  className="hover:text-coral ml-1"
                  aria-label="Remove roster link"
                >
                  ✕
                </button>
              </span>
            );
          })}
        </div>
      )}
      {roster.length > 0 && (
        <div className="flex gap-2">
          <select
            value={pickItemId}
            onChange={(e) => setPickItemId(e.target.value)}
            className="field flex-1"
          >
            {roster.map((r) => (
              <option key={r.id} value={r.id}>
                {r.name}
              </option>
            ))}
          </select>
          <select
            value={pickStatus}
            onChange={(e) => setPickStatus(e.target.value as SourcingStatus)}
            className="field w-36"
          >
            {STATUS_ORDER.map((s) => (
              <option key={s} value={s}>
                {STATUS_LABELS[s]}
              </option>
            ))}
          </select>
          <button type="button" onClick={addLink} className="btn btn-ghost px-3">
            + Add
          </button>
        </div>
      )}
    </div>
  );
}
