import { useState } from 'react';
import type { RosterItem, RosterLink } from '../types';
import { STATUS_ORDER, STATUS_LABELS, CATEGORY_LABELS, CATEGORY_ORDER, groupRosterByCategory } from '../lib/constants';

// The consolidated Log-entry roster picker (Story Mode 2b). Deliberately
// modeled on the old RosterLinkPicker's own add flow — a grouped select +
// "+ Add" button — rather than showing every roster item as a chip all
// the time: with a roster of 10+ items across 5 categories, an always-
// visible chip grid would be a wall of controls on every single log
// entry, most of which won't touch roster status or highlights at all.
// Adding stays deliberately sparse; only items you've actually brought
// in ever show a pill.
//
// Once added, a pill carries two independent toggles:
//
//   ✨ Highlight — this item mattered enough to remember about this
//   entry. Purely subjective, feeds LogEntry.highlightedRosterItemIds
//   (2a) and, downstream, Story Mode's roster-highlight slide (2d).
//
//   📦 Status — this item reached a specific SourcingStatus as of this
//   entry. Objective, feeds LogEntry.additions — same RosterLink shape
//   Checklist.tsx's rosterLinks already uses, just a retrospective
//   record here instead of a forward-looking gate.
//
// The two are decoupled rather than living behind one combined control:
// turning Status on suggests Highlight as a default (most people
// highlighting a status change also want the narrative flag), but
// either can be set without the other, and removing the pill clears
// both — RosterLinkPicker itself is untouched, still used as-is by
// Checklist.tsx's single-status forward-looking gate.
export default function RosterHighlightPicker({
  roster,
  links,
  onChangeLinks,
  highlightedIds,
  onChangeHighlighted,
}: {
  roster: RosterItem[];
  links: RosterLink[];
  onChangeLinks: (links: RosterLink[]) => void;
  highlightedIds: string[];
  onChangeHighlighted: (ids: string[]) => void;
}) {
  // Which items currently have a pill showing. Seeded once from whatever
  // the entry already has set (so editing an existing entry shows its
  // real pills), then grows/shrinks purely through explicit Add/Remove —
  // a pill with neither toggle set has nothing to reconstruct it from on
  // reload, which is fine: it never represented saved data in the first
  // place, only "I brought this into view but haven't decided yet."
  const [addedIds, setAddedIds] = useState<string[]>(() =>
    Array.from(new Set([...links.map((l) => l.rosterItemId), ...highlightedIds]))
  );
  const groupedRoster = groupRosterByCategory(roster);
  const addableRoster = roster.filter((r) => !addedIds.includes(r.id));
  const [pickItemId, setPickItemId] = useState(addableRoster[0]?.id ?? '');

  function addItem() {
    if (!pickItemId || addedIds.includes(pickItemId)) return;
    setAddedIds((prev) => [...prev, pickItemId]);
    const next = addableRoster.find((r) => r.id !== pickItemId);
    setPickItemId(next?.id ?? '');
  }

  function removeItem(itemId: string) {
    setAddedIds((prev) => prev.filter((id) => id !== itemId));
    if (links.some((l) => l.rosterItemId === itemId)) {
      onChangeLinks(links.filter((l) => l.rosterItemId !== itemId));
    }
    if (highlightedIds.includes(itemId)) {
      onChangeHighlighted(highlightedIds.filter((id) => id !== itemId));
    }
  }

  function toggleHighlight(itemId: string) {
    onChangeHighlighted(
      highlightedIds.includes(itemId)
        ? highlightedIds.filter((id) => id !== itemId)
        : [...highlightedIds, itemId]
    );
  }

  // Off → on defaults to 'arrived' and auto-suggests Highlight (only on
  // this transition, never re-forced if the user already un-highlighted
  // it). On → cycling advances through STATUS_ORDER, same interaction as
  // Roster page's own "click a status pill to advance it."
  function toggleOrCycleStatus(itemId: string) {
    const existing = links.find((l) => l.rosterItemId === itemId);
    if (!existing) {
      onChangeLinks([...links, { rosterItemId: itemId, requiredStatus: 'arrived' }]);
      if (!highlightedIds.includes(itemId)) onChangeHighlighted([...highlightedIds, itemId]);
      return;
    }
    const idx = STATUS_ORDER.indexOf(existing.requiredStatus);
    const next = STATUS_ORDER[(idx + 1) % STATUS_ORDER.length];
    onChangeLinks(links.map((l) => (l.rosterItemId === itemId ? { ...l, requiredStatus: next } : l)));
  }

  function clearStatus(itemId: string) {
    onChangeLinks(links.filter((l) => l.rosterItemId !== itemId));
  }

  if (roster.length === 0) return null;

  return (
    <div>
      {addedIds.length > 0 && (
        <div className="flex flex-wrap gap-1.5 mb-2">
          {addedIds.map((itemId) => {
            const item = roster.find((r) => r.id === itemId);
            const link = links.find((l) => l.rosterItemId === itemId);
            const highlighted = highlightedIds.includes(itemId);
            return (
              <span
                key={itemId}
                className="pill text-xs py-1 pl-2 pr-1 bg-deepwater-2 border border-moss/30 gap-1"
              >
                {item?.name ?? '(removed item)'}
                <button
                  type="button"
                  onClick={() => toggleHighlight(itemId)}
                  title={highlighted ? 'Remove highlight' : 'Highlight this item for this entry'}
                  className={`rounded px-1 transition-colors ${
                    highlighted ? 'bg-amber/25 text-amber' : 'text-foam-dim/50 hover:text-amber'
                  }`}
                >
                  ✨
                </button>
                <button
                  type="button"
                  onClick={() => toggleOrCycleStatus(itemId)}
                  title={link ? `Reached: ${STATUS_LABELS[link.requiredStatus]} — click to advance` : 'Mark a status reached this entry'}
                  className={`rounded px-1 transition-colors ${
                    link ? 'bg-sand/25 text-sand' : 'text-foam-dim/50 hover:text-sand'
                  }`}
                >
                  📦{link ? ` ${STATUS_LABELS[link.requiredStatus]}` : ''}
                </button>
                {link && (
                  <button
                    type="button"
                    onClick={() => clearStatus(itemId)}
                    aria-label="Clear status for this item"
                    title="Clear status"
                    className="text-foam-dim/50 hover:text-sand px-0.5 text-[10px]"
                  >
                    ✕
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => removeItem(itemId)}
                  aria-label="Remove this item from the entry"
                  title="Remove from this entry"
                  className="text-foam-dim/50 hover:text-coral ml-0.5"
                >
                  ✕
                </button>
              </span>
            );
          })}
        </div>
      )}
      {addableRoster.length > 0 && (
        <div className="flex gap-2">
          <select
            value={pickItemId}
            onChange={(e) => setPickItemId(e.target.value)}
            className="field flex-1"
          >
            {CATEGORY_ORDER.filter((cat) => groupedRoster[cat]?.some((r) => addableRoster.includes(r))).map((cat) => (
              <optgroup key={cat} label={CATEGORY_LABELS[cat]}>
                {groupedRoster[cat]!.filter((r) => addableRoster.includes(r)).map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.name}
                  </option>
                ))}
              </optgroup>
            ))}
          </select>
          <button type="button" onClick={addItem} className="btn btn-ghost px-3">
            + Add
          </button>
        </div>
      )}
    </div>
  );
}