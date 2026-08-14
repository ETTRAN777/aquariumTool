import { useState, useRef, useLayoutEffect } from 'react';
import type { FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { useData } from '../lib/DataContext';
import { useConfirmDelete } from '../lib/useConfirmDelete';
import { todayIso } from '../lib/date';
import type { Milestone, MilestoneType, LogEntry, LogPhase, RosterItem } from '../types';
import { LOG_PHASE_LABELS, LOG_PHASE_ORDER, MOOD_LABELS } from '../lib/constants';
import { tankLifetimeDuration, formatTankAge } from '../lib/duration';
import { buildFallbackDescription } from '../lib/milestones';

const MILESTONE_TYPE_LABELS: Record<MilestoneType, string> = {
  'phase-change': 'Phase change',
  'roster-addition': 'Roster addition',
  'health-event': 'Health event',
  custom: 'Custom',
};

// Importance ranking for roster-addition milestones sharing the same
// source log entry — most people care far more about what they actually
// wanted in the tank (livestock, then plants, then hardscape) than the
// equipment/substrate purchases that came along with it. "First for the
// tank" (major) is the primary sort key regardless of category; category
// order is the tiebreak within that, and among minors.
const CATEGORY_IMPORTANCE_RANK: Record<RosterItem['category'], number> = {
  livestock: 0,
  plant: 1,
  hardscape: 2,
  equipment: 3,
  substrate: 4,
};

function rosterAdditionImportance(m: Milestone, roster: RosterItem[]): [number, number] {
  const itemId = m.relatedRosterItemIds?.[0];
  const item = itemId ? roster.find((r) => r.id === itemId) : undefined;
  const categoryRank = item ? CATEGORY_IMPORTANCE_RANK[item.category] : 5; // unknown/removed item sorts last
  return [m.major ? 0 : 1, categoryRank];
}

// Gap-based proportional spacing for the major-milestones axis (mockup
// "Option A", confirmed over the evenly-spaced alternative). A big real
// time gap between two milestones should show up as real visual space —
// that's the whole point of a war-timeline aesthetic, showing which
// stretches were dense and which were quiet — but naive linear scaling
// (pixels = days * constant) breaks badly once a tank's history mixes
// day-scale and month-scale gaps in the same view: either the day-scale
// gaps collapse to nothing, or the month-scale gaps make the whole thing
// scroll forever. sqrt(days) compresses large gaps while still
// preserving relative ordering, which is why real timeline UIs commonly
// use it instead of a straight line. MAX_GAP is a ceiling so a
// multi-year gap doesn't make the strip absurdly wide.
//
// The floor is NOT a fixed constant — it's derived from the actual
// (dynamically measured) card width. Cards alternate above/below, so any
// two SAME-side cards are always 2 gaps apart; for those to never
// overlap, 2*gap must be at least cardWidth. A fixed floor tuned for a
// ~180px card would silently break once a long title pushes cardWidth up
// toward its 320px max — same-side cards would genuinely collide.
//
// "How many points there are" is already handled without a separate
// factor: total width is the SUM of every pairwise gap, so a timeline
// with more milestones is naturally wider — no extra scaling term needed
// on top of that.
const MAX_GAP_PX = 600;
const GAP_SQRT_SCALE = 34;
const SAME_SIDE_BREATHING_ROOM = 20; // extra clearance beyond exactly touching

function computeTimelinePositions(sorted: Milestone[], cardWidth: number): number[] {
  const minGapPx = cardWidth / 2 + SAME_SIDE_BREATHING_ROOM;
  const positions: number[] = [0];
  for (let i = 1; i < sorted.length; i++) {
    const prevMs = new Date(sorted[i - 1].date).getTime();
    const curMs = new Date(sorted[i].date).getTime();
    const daysGap = Math.max(0, (curMs - prevMs) / (24 * 60 * 60 * 1000));
    const gapPx = Math.min(minGapPx + GAP_SQRT_SCALE * Math.sqrt(daysGap), MAX_GAP_PX);
    positions.push(positions[i - 1] + gapPx);
  }
  return positions;
}

type FeedItem =
  | { kind: 'log'; date: string; entry: LogEntry }
  | { kind: 'milestone'; date: string; milestone: Milestone }
  | { kind: 'roster-group'; date: string; linkedLogEntryId: string; milestones: Milestone[] };

const MIN_CARD_WIDTH = 160;
const MAX_CARD_WIDTH = 320;

export default function Timeline() {
  const { activeTank, addMilestone, updateMilestone, deleteMilestone } = useData();
  const [expanded, setExpanded] = useState<string | null>(null);
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set());
  const [showAddForm, setShowAddForm] = useState(false);
  const [editingMilestone, setEditingMilestone] = useState<Milestone | null>(null);
  const { pendingId: pendingDeleteId, handleClick: handleDeleteClick } = useConfirmDelete();

  // Dynamic major-milestone card width: measured from each card's actual
  // title (natural, unwrapped width via scrollWidth), then every card
  // uses the WIDEST one — uniform sizing, driven by real content instead
  // of a guessed constant. Re-measures whenever the set of major
  // milestones actually changes (the .map().join() dependency compares
  // by content, not array reference, so it doesn't re-run every render).
  const titleRefs = useRef(new Map<string, HTMLHeadingElement>());
  const [cardWidth, setCardWidth] = useState(200);

  const majorMilestonesForSizing = activeTank?.milestones.filter((m) => m.major) ?? [];
  useLayoutEffect(() => {
    let max = 0;
    titleRefs.current.forEach((el) => {
      max = Math.max(max, el.scrollWidth);
    });
    if (max > 0) {
      const next = Math.min(Math.max(max + 28, MIN_CARD_WIDTH), MAX_CARD_WIDTH);
      setCardWidth((prev) => (prev === next ? prev : next));
    }
  }, [majorMilestonesForSizing.map((m) => m.id).join(',')]);

  function toggleGroup(id: string) {
    setExpandedGroups((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  if (!activeTank) return null;

  const lifetime = tankLifetimeDuration(activeTank);

  // Roster-addition milestones sharing the same source log entry get
  // grouped into one feed item — a single big "purchases made" entry can
  // produce half a dozen of these, and showing all of them individually
  // in the vertical feed is repetitive. Milestones with no
  // linkedLogEntryId (hand-created ones) can't be grouped this way — no
  // reliable shared key — so they render individually, same as before.
  const rosterGroups = new Map<string, Milestone[]>();
  const singleMilestones: Milestone[] = [];
  for (const m of activeTank.milestones) {
    if (m.type === 'roster-addition' && m.linkedLogEntryId) {
      const arr = rosterGroups.get(m.linkedLogEntryId) ?? [];
      arr.push(m);
      rosterGroups.set(m.linkedLogEntryId, arr);
    } else {
      singleMilestones.push(m);
    }
  }

  // Oldest-first, per the explicit call to make this read like a story
  // from the beginning rather than matching Log's newest-first journal
  // convention.
  const feed: FeedItem[] = [
    ...activeTank.logs.map((entry) => ({ kind: 'log' as const, date: entry.date, entry })),
    ...singleMilestones.map((milestone) => ({
      kind: 'milestone' as const,
      date: milestone.date,
      milestone,
    })),
    ...[...rosterGroups.entries()].map(([linkedLogEntryId, milestones]) => ({
      kind: 'roster-group' as const,
      date: milestones[0].date,
      linkedLogEntryId,
      milestones,
    })),
  ].sort((a, b) => a.date.localeCompare(b.date));

  function resolveLinkedEntry(milestone: Milestone): LogEntry | undefined {
    return milestone.linkedLogEntryId
      ? activeTank!.logs.find((l) => l.id === milestone.linkedLogEntryId)
      : undefined;
  }

  // Only ever falls back for auto-created milestones (phase-change,
  // roster-addition) or a manually-created one left blank on purpose —
  // an actual typed description always wins.
  function describeMilestone(milestone: Milestone, includeAgePrefix = true): string {
    return (
      milestone.description ??
      buildFallbackDescription(milestone, activeTank!, resolveLinkedEntry(milestone), { includeAgePrefix })
    );
  }

  function additionsLine(entry: LogEntry): string | null {
    if (!entry.additions || entry.additions.length === 0) return null;
    return entry.additions
      .map((a) => {
        const item = activeTank!.roster.find((r) => r.id === a.rosterItemId);
        const qty = item?.quantity && item.quantity > 1 ? `${item.quantity}× ` : '';
        return `${qty}${item?.name ?? '(removed item)'}`;
      })
      .join(', ');
  }

  // Reused both for standalone milestone feed items and for each visible
  // card within a roster-addition group below.
  function renderMilestoneCard(m: Milestone) {
    const deleting = pendingDeleteId === m.id;
    return (
      <div key={`m-${m.id}`} className="card p-5 border-2 border-amber/40 bg-amber/5">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="font-mono text-[10px] text-sand uppercase tracking-wide">
              {new Date(m.date).toLocaleDateString()} · {MILESTONE_TYPE_LABELS[m.type]}
            </p>
            <h3 className="font-display text-lg font-semibold mt-1">✨ {m.title}</h3>
            <p className="text-foam-dim mt-1 text-sm">{describeMilestone(m)}</p>
          </div>
          <div className="flex gap-1 flex-shrink-0">
            <button
              onClick={() => setEditingMilestone(m)}
              className="btn-icon"
              aria-label="Edit milestone"
            >
              ✎
            </button>
            <button
              onClick={() => handleDeleteClick(m.id, () => deleteMilestone(m.id))}
              className={`btn-icon danger ${deleting ? 'text-coral' : ''}`}
              aria-label={deleting ? 'Confirm delete' : 'Delete milestone'}
            >
              {deleting ? 'Confirm?' : '✕'}
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      <div>
        <h2 className="font-display text-2xl font-semibold">Timeline</h2>
        <p className="text-sm text-foam-dim mt-1">
          {lifetime ? (
            <>
              Your tank is{' '}
              <span className="text-amber font-medium">{formatTankAge(lifetime)}</span> old.
            </>
          ) : (
            <>
              Set a start date for this tank to see how old it is —{' '}
              <Link to="/settings" className="text-amber hover:underline">
                → settings
              </Link>
            </>
          )}
        </p>
      </div>

      {/* Major milestones — proportional axis line, the "greatest hits"
          above the full feed. Position reflects real elapsed time
          (compressed/clamped, see computeTimelinePositions), alternating
          callouts above/below the line so adjacent cards never overlap
          vertically. Only renders once there's at least one. */}
      {majorMilestonesForSizing.length > 0 && (
        <div>
          <p className="field-label mb-2">Major milestones</p>
          <div className="overflow-x-auto pb-2 scrollbar-hide">
            {(() => {
              const majorMilestones = [...majorMilestonesForSizing].sort((a, b) =>
                a.date.localeCompare(b.date)
              );
              const positions = computeTimelinePositions(majorMilestones, cardWidth);
              // Cards are centered on their dot (-translate-x-1/2), so the
              // FIRST dot needs enough left offset that a card centered on
              // it (half of cardWidth) never renders at a negative x — a
              // negative offset isn't just visually clipped, it's
              // permanently unreachable, since a scroll container can't
              // scroll to a negative position. EDGE_PAD covers that plus
              // a little breathing room on the right edge too.
              const EDGE_PAD = cardWidth / 2 + 10;
              const totalWidth = positions[positions.length - 1] + EDGE_PAD * 2;
              const containerHeight = 280;
              const axisTop = 140;
              return (
                <div
                  className="relative"
                  style={{ width: `${Math.max(totalWidth, cardWidth + 80)}px`, height: `${containerHeight}px` }}
                >
                  {/* axis line */}
                  <div
                    className="absolute bg-amber/50 rounded-full"
                    style={{
                      top: `${axisTop - 1.5}px`,
                      left: `${EDGE_PAD}px`,
                      width: `${positions[positions.length - 1]}px`,
                      height: '3px',
                    }}
                  />
                  {majorMilestones.map((m, i) => {
                    const x = positions[i] + EDGE_PAD;
                    const above = i % 2 === 0;
                    return (
                      <div key={m.id} className="absolute" style={{ left: `${x}px`, top: `${axisTop}px` }}>
                        {/* dot on the axis */}
                        <div className="absolute w-3.5 h-3.5 rounded-full bg-amber border-[3px] border-deepwater -translate-x-1/2 -translate-y-1/2" />
                        {/* stem */}
                        <div
                          className="absolute w-px bg-amber/40"
                          style={
                            above
                              ? { bottom: '2px', height: '20px', left: 0 }
                              : { top: '2px', height: '20px', left: 0 }
                          }
                        />
                        {/* callout card — width is the shared, dynamically
                            measured cardWidth, not a fixed guess */}
                        <div
                          className="absolute -translate-x-1/2 card p-3 border border-amber/30"
                          style={{ width: `${cardWidth}px`, ...(above ? { bottom: '24px' } : { top: '24px' }) }}
                        >
                          <p className="font-mono text-[9px] text-sand uppercase tracking-wide">
                            {new Date(m.date).toLocaleDateString()}
                          </p>
                          <h4
                            ref={(el) => {
                              if (el) titleRefs.current.set(m.id, el);
                              else titleRefs.current.delete(m.id);
                            }}
                            className="font-display font-semibold mt-0.5 text-xs leading-snug whitespace-nowrap overflow-hidden text-ellipsis"
                          >
                            {m.title}
                          </h4>
                          <p className="text-[11px] text-foam-dim mt-1 line-clamp-2">
                            {describeMilestone(m, false)}
                          </p>
                        </div>
                      </div>
                    );
                  })}
                </div>
              );
            })()}
          </div>
        </div>
      )}

      {/* Manual milestone creation — the only entry point that exists for
          health-event/custom, which have no auto-detection signal at
          all. Also usable to hand-create a phase-change/roster-addition
          milestone with no linked log entry (e.g. recording something
          before there's an entry to tag it from). */}
      <div>
        {!showAddForm && !editingMilestone && (
          <button
            onClick={() => setShowAddForm(true)}
            className="btn btn-secondary text-xs py-1.5 px-3"
          >
            + Add milestone
          </button>
        )}
        {(showAddForm || editingMilestone) && (
          <MilestoneForm
            initial={editingMilestone ?? undefined}
            roster={activeTank.roster}
            onSave={(m) => {
              if (editingMilestone) updateMilestone(m);
              else addMilestone(m);
              setShowAddForm(false);
              setEditingMilestone(null);
            }}
            onCancel={() => {
              setShowAddForm(false);
              setEditingMilestone(null);
            }}
          />
        )}
      </div>

      {/* The merged vertical feed itself. Log entries render collapsed
          by default (Log.tsx's own pattern, reused) — deliberately kept
          visually light, since whether full entries belong here at all
          is still an open question pending seeing it live. */}
      <div>
        <p className="field-label mb-2">Tank History</p>
        <div className="space-y-3">
          {feed.length === 0 && (
            <div className="card border-dashed p-6 text-center">
              <p className="text-foam-dim text-sm">
                Nothing recorded yet — write your first Log entry to begin.
              </p>
            </div>
          )}

          {feed.map((item) => {
            if (item.kind === 'milestone' && item.milestone.type === 'phase-change') {
              // Chapter-break divider, not a card — this IS what "phase
              // differs from the prior entry" looks like in the feed; the
              // milestone record and the divider are the same thing, not
              // two separate concepts layered on top of each other.
              return (
                <div key={`m-${item.milestone.id}`} className="flex items-center gap-3 py-1">
                  <div className="flex-1 h-px bg-amber/30" />
                  <p className="font-mono text-xs text-amber uppercase tracking-wide whitespace-nowrap">
                    🧭 {item.milestone.title}
                  </p>
                  <div className="flex-1 h-px bg-amber/30" />
                </div>
              );
            }

            if (item.kind === 'milestone') {
              return renderMilestoneCard(item.milestone);
            }

            if (item.kind === 'roster-group') {
              // Most people care far more about what they actually wanted
              // in the tank than the equipment/substrate that came along
              // with it — "first for the tank" (major) sorts first
              // regardless of category, then livestock > plant >
              // hardscape > equipment > substrate. Only the top 3 show by
              // default; the rest collapse behind a toggle rather than
              // repeating half a dozen near-identical cards for one big
              // shopping-trip entry.
              const sorted = [...item.milestones].sort((a, b) => {
                const [aMajor, aCat] = rosterAdditionImportance(a, activeTank.roster);
                const [bMajor, bCat] = rosterAdditionImportance(b, activeTank.roster);
                return aMajor - bMajor || aCat - bCat;
              });
              const isExpanded = expandedGroups.has(item.linkedLogEntryId);
              const visible = isExpanded ? sorted : sorted.slice(0, 3);
              return (
                <div key={`group-${item.linkedLogEntryId}`} className="space-y-3">
                  {visible.map((m) => renderMilestoneCard(m))}
                  {sorted.length > 3 && (
                    <button
                      onClick={() => toggleGroup(item.linkedLogEntryId)}
                      className="text-xs font-mono text-amber hover:underline pl-1"
                    >
                      {isExpanded ? '− Show less' : `+ ${sorted.length - 3} more from this entry`}
                    </button>
                  )}
                </div>
              );
            }


            // Log entry — collapsed by default, same visual language as
            // Log.tsx's own cards, kept lightweight on purpose.
            const entry = item.entry;
            const line = additionsLine(entry);
            return (
              <div
                key={`l-${entry.id}`}
                className="card overflow-hidden hover:border-amber/30 transition-colors"
              >
                <button
                  onClick={() => setExpanded(expanded === entry.id ? null : entry.id)}
                  className="w-full text-left p-4"
                >
                  <p className="font-mono text-xs text-sand uppercase tracking-wide">
                    {new Date(entry.date).toLocaleDateString()}
                    {entry.phase && (
                      <span className="ml-2 text-amber">🧭 {LOG_PHASE_LABELS[entry.phase]}</span>
                    )}
                    {entry.mood && <span className="ml-2">{MOOD_LABELS[entry.mood]}</span>}
                  </p>
                  <h4 className="font-display font-semibold mt-1">{entry.title}</h4>
                  {line && <p className="text-xs text-sand mt-1">📦 Added: {line}</p>}
                </button>
                {expanded === entry.id && (
                  <div className="px-4 pb-4">
                    <p className="text-foam-dim text-sm">{entry.body}</p>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function MilestoneForm({
  initial,
  roster,
  onSave,
  onCancel,
}: {
  initial?: Milestone;
  roster: RosterItem[];
  onSave: (m: Milestone) => void;
  onCancel: () => void;
}) {
  const [title, setTitle] = useState(initial?.title ?? '');
  const [date, setDate] = useState(initial?.date?.slice(0, 10) ?? todayIso());
  const [type, setType] = useState<MilestoneType>(initial?.type ?? 'custom');
  const [description, setDescription] = useState(initial?.description ?? '');
  const [phase, setPhase] = useState<LogPhase | undefined>(initial?.phase);
  const [relatedIds, setRelatedIds] = useState<string[]>(initial?.relatedRosterItemIds ?? []);
  const [major, setMajor] = useState(initial?.major ?? false);

  function toggleRelated(id: string) {
    setRelatedIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  }

  function submit(e: FormEvent) {
    e.preventDefault();
    if (!title.trim()) return;
    onSave({
      id: initial?.id ?? crypto.randomUUID(),
      title: title.trim(),
      description: description.trim() || undefined,
      date: new Date(date).toISOString(),
      type,
      phase: type === 'phase-change' ? phase : undefined,
      relatedRosterItemIds: relatedIds.length ? relatedIds : undefined,
      linkedLogEntryId: initial?.linkedLogEntryId,
      major,
    });
  }

  return (
    <form onSubmit={submit} className="card p-5 space-y-3">
      <div>
        <label className="field-label">Title</label>
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          className="field"
          required
          autoFocus
        />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="field-label">Date</label>
          <input
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            className="field"
            required
          />
        </div>
        <div>
          <label className="field-label">Type</label>
          <select
            value={type}
            onChange={(e) => setType(e.target.value as MilestoneType)}
            className="field"
          >
            {(Object.keys(MILESTONE_TYPE_LABELS) as MilestoneType[]).map((t) => (
              <option key={t} value={t}>
                {MILESTONE_TYPE_LABELS[t]}
              </option>
            ))}
          </select>
        </div>
      </div>

      {type === 'phase-change' && (
        <div>
          <label className="field-label">Phase</label>
          <select
            value={phase ?? ''}
            onChange={(e) => setPhase(e.target.value as LogPhase)}
            className="field"
            required
          >
            <option value="" disabled>
              Select a phase
            </option>
            {LOG_PHASE_ORDER.map((p) => (
              <option key={p} value={p}>
                {LOG_PHASE_LABELS[p]}
              </option>
            ))}
          </select>
        </div>
      )}

      {roster.length > 0 && (
        <div>
          <p className="field-label mb-1">Related roster items (optional)</p>
          <div className="flex flex-wrap gap-1.5">
            {roster.map((r) => (
              <button
                type="button"
                key={r.id}
                onClick={() => toggleRelated(r.id)}
                className={`pill text-xs py-1 px-2 ${
                  relatedIds.includes(r.id)
                    ? 'bg-sand/25 text-sand border border-sand/40'
                    : 'bg-deepwater-2 text-foam-dim border border-moss/30'
                }`}
              >
                {r.name}
              </button>
            ))}
          </div>
        </div>
      )}

      <div>
        <label className="field-label">Description (optional — leave blank for generated text)</label>
        <textarea
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          className="field"
          rows={3}
        />
      </div>

      <label className="flex items-center gap-2 text-sm text-foam-dim">
        <input type="checkbox" checked={major} onChange={(e) => setMajor(e.target.checked)} />
        Mark as a major milestone
      </label>

      <div className="flex gap-2">
        <button type="submit" className="btn btn-primary">
          Save
        </button>
        <button type="button" onClick={onCancel} className="btn btn-ghost">
          Cancel
        </button>
      </div>
    </form>
  );
}