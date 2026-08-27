import type { Tank, Milestone, LogEntry } from '../types';
import { buildPhaseSegments } from './planSummary';
import { MOOD_ORDER, moodToScore, type Mood } from './constants';

// Story Mode's computation layer (2d). Pure, testable functions for each
// slide's real content — same role lib/milestones.ts plays for the
// milestone system: logic proven standalone before it ever touches UI.
// Started in 2c with just the pre-flight inventory; this is where the
// rest lands, in the same file rather than a second one, so nothing
// about the inventory's own data sources drifts out of sync with what
// the real slides actually compute.

export interface StoryInventoryItem {
  key: string;
  label: string;
  count: number;
  // Below a meaningful threshold for the slide that would draw on this —
  // not necessarily zero (phase variety needs at least 2 to compare).
  shallow: boolean;
  shallowNote?: string;
}

export interface StoryInventory {
  items: StoryInventoryItem[];
  hasAnyShallow: boolean;
}

// --- Roster "star of the tank" ---
// Defined before computeStoryInventory below so the inventory's
// logHighlights shallow-check can call it directly, rather than
// re-implementing the same "does anything actually repeat" condition a
// second time and risking the two drifting apart — same reasoning as
// the phaseDiversity/buildPhaseSegments fix above.

export interface RosterStar {
  itemIds: string[]; // more than one only in a genuine tie — never picks an arbitrary winner
  itemNames: string[];
  count: number;
}

// Counts highlight occurrences per roster item across every log entry,
// not just the most recent one. Undefined if nothing's ever been
// highlighted — OR if nothing has been highlighted more than once yet.
// That second case matters: with several distinct items each highlighted
// exactly once, a naive "show whatever's tied for the max" would
// technically be correct but misleading in spirit — it isn't really a
// spotlight, it's just "everything highlighted so far," and it gets
// worse (more items, uglier tie) the more the picker gets used early on,
// not better. A real "star" requires something to have actually
// repeated. A tie at count >= 2 is still shown honestly (every item tied
// for the top count, never an arbitrary winner) — it's only a tie at
// count 1 specifically that gets treated as "not enough signal yet."
export function computeRosterStar(tank: Tank): RosterStar | undefined {
  const counts = new Map<string, number>();
  for (const entry of tank.logs) {
    for (const itemId of entry.highlightedRosterItemIds ?? []) {
      counts.set(itemId, (counts.get(itemId) ?? 0) + 1);
    }
  }
  if (counts.size === 0) return undefined;

  const maxCount = Math.max(...counts.values());
  if (maxCount < 2) return undefined;

  const itemIds = [...counts.entries()].filter(([, c]) => c === maxCount).map(([id]) => id);

  const itemNames = itemIds.map((id) => tank.roster.find((r) => r.id === id)?.name ?? '(removed item)');

  return { itemIds, itemNames, count: maxCount };
}

// Which log entry's photo, if any, represents the roster star. Only
// meaningful for a clear single winner (a genuine tie can span
// unrelated categories, so the roster-spotlight slide doesn't try to
// pair a photo with a tie at all) — callers should only invoke this once
// they already know they have a single star, not a tied one.
//
// A roster item can be highlighted across several entries; picking
// "which photo" isn't arbitrary once there's more than one candidate.
// Scores each candidate entry by how eventful it was — its own additions
// count, its own highlight count, and whether a phase was tagged — on
// the reasoning that an entry doing more that day is more likely to be
// the moment actually worth representing, not just any entry that
// happened to mention this item. Ties at the top score get a random
// pick among themselves rather than an arbitrary fixed order, since nothing
// in the data itself breaks the tie honestly.
export function pickRosterHighlightPhoto(tank: Tank, itemId: string): string | undefined {
  const candidates = tank.logs.filter(
    (l) => (l.highlightedRosterItemIds ?? []).includes(itemId) && (l.photoUrls?.length ?? 0) > 0
  );
  if (candidates.length === 0) return undefined;

  const eventfulness = (l: LogEntry) =>
    (l.additions?.length ?? 0) + (l.highlightedRosterItemIds?.length ?? 0) + (l.phase ? 1 : 0);

  const maxScore = Math.max(...candidates.map(eventfulness));
  const topCandidates = candidates.filter((l) => eventfulness(l) === maxScore);
  const chosenEntry = topCandidates[Math.floor(Math.random() * topCandidates.length)];

  const photos = chosenEntry.photoUrls ?? [];
  return photos[Math.floor(Math.random() * photos.length)];
}

// One count per slide in 2d's proposed slide list (opening excluded —
// tank name + age is direct data, not something that can be "shallow").
export function computeStoryInventory(tank: Tank): StoryInventory {
  const majorMilestoneCount = tank.milestones.filter((m) => m.major).length;

  const logHighlightCount = tank.logs.reduce(
    (sum, l) => sum + (l.highlightedRosterItemIds?.length ?? 0),
    0
  );
  // Shallow means "the real slide won't show anything," not just "the
  // raw count is zero" — computeRosterStar needs an actual repeat
  // (see its own comment above), so a tank with several distinct
  // one-time highlights and a nonzero count here would still skip the
  // slide. Checked directly against the same function the slide itself
  // calls, not a re-derived approximation of its rule.
  const hasRosterStar = computeRosterStar(tank) !== undefined;

  const moodTaggedCount = tank.logs.filter((l) => l.mood).length;

  // Phase segments, not raw log.phase tags — the actual pacing
  // superlative below is built on buildPhaseSegments (phase-change
  // milestones, the same authoritative source the progress-check-prompt
  // already trusts), so the inventory needs to check the same thing it's
  // actually promising. A tank could have several distinct phase *tags*
  // scattered across log entries while having only one real recorded
  // transition (or vice versa) — checking segment count instead of
  // distinct log.phase values keeps the promise accurate to what the
  // real slide will do.
  const phaseSegmentCount = buildPhaseSegments(tank).length;

  const healthEventCount = tank.milestones.filter((m) => m.type === 'health-event').length;

  const items: StoryInventoryItem[] = [
    {
      key: 'majorMilestones',
      label: 'Major milestones',
      count: majorMilestoneCount,
      shallow: majorMilestoneCount === 0,
      shallowNote: majorMilestoneCount === 0 ? 'No major milestones yet — the reel will be thin.' : undefined,
    },
    {
      key: 'logHighlights',
      label: 'Log highlights',
      count: logHighlightCount,
      shallow: !hasRosterStar,
      shallowNote: !hasRosterStar
        ? logHighlightCount === 0
          ? 'No highlighted roster items yet.'
          : 'Nothing highlighted more than once yet — the spotlight slide needs a real repeat.'
        : undefined,
    },
    {
      key: 'moodTagged',
      label: 'Mood-tagged entries',
      count: moodTaggedCount,
      shallow: moodTaggedCount === 0,
      shallowNote: moodTaggedCount === 0 ? 'No mood data — the mood slide will be skipped.' : undefined,
    },
    {
      key: 'phaseDiversity',
      label: 'Build phases logged',
      count: phaseSegmentCount,
      shallow: phaseSegmentCount < 2,
      shallowNote:
        phaseSegmentCount < 2 ? 'Not enough phase variety yet for a pacing comparison.' : undefined,
    },
    {
      key: 'healthEvents',
      label: 'Health events',
      count: healthEventCount,
      shallow: healthEventCount === 0,
      shallowNote: healthEventCount === 0 ? 'No health events logged — this slide will be skipped.' : undefined,
    },
  ];

  return {
    items,
    hasAnyShallow: items.some((i) => i.shallow),
  };
}

// --- Phase-pacing superlative ---

export interface PhasePacingSuperlative {
  longest: { phase: string; days: number; isCurrent: boolean };
  shortest: { phase: string; days: number; isCurrent: boolean };
}

// Reuses buildPhaseSegments (planSummary.ts) rather than re-deriving
// phase timing from scratch — same segments the progress-check-prompt
// already computes and trusts. Undefined below 2 segments, matching the
// inventory's own shallow threshold: a single segment has nothing to be
// "longest" or "shortest" relative to.
//
// `isCurrent` matters for how 2e phrases the result — the most recent
// segment's duration is "so far," not a settled final number (it's still
// accumulating days), so a currently-ongoing phase landing as the
// "longest" needs different, more hedged framing than a phase that's
// actually finished.
export function computePhasePacingSuperlative(tank: Tank): PhasePacingSuperlative | undefined {
  const segments = buildPhaseSegments(tank);
  if (segments.length < 2) return undefined;

  let longestIdx = 0;
  let shortestIdx = 0;
  segments.forEach((s, i) => {
    if (s.days > segments[longestIdx].days) longestIdx = i;
    if (s.days < segments[shortestIdx].days) shortestIdx = i;
  });

  const lastIdx = segments.length - 1;
  return {
    longest: { phase: segments[longestIdx].phase, days: segments[longestIdx].days, isCurrent: longestIdx === lastIdx },
    shortest: { phase: segments[shortestIdx].phase, days: segments[shortestIdx].days, isCurrent: shortestIdx === lastIdx },
  };
}

// --- Milestone reel ---

// A single reel "stop" — either one milestone on its own, or a group of
// roster-addition milestones that all trace back to the same log entry.
// Grouping matters for real, not cosmetic, reasons: without it, a single
// big "purchases made" entry that produced several roster-addition
// milestones at once would show up as several near-identical reel
// stops, each displaying the same underlying entry — reads as a bug
// (the same slide repeating) rather than several real distinct
// moments, because they aren't several distinct moments; they're one.
export type MilestoneReelStop =
  | { kind: 'single'; date: string; milestone: Milestone }
  | { kind: 'group'; date: string; linkedLogEntryId: string; milestones: Milestone[] };

// Same grouping rule Timeline.tsx already uses for its own feed — only
// roster-addition milestones sharing a linkedLogEntryId get bundled;
// phase-change/health-event/custom milestones always stay their own
// stop, even if they happen to share an entry with a group (a phase
// change and a shopping trip can genuinely be the same real-world
// moment without needing to be visually merged the way several roster
// additions from one entry do). Reused rather than re-derived so the
// two don't drift into disagreeing about what counts as "the same
// moment."
export function computeMilestoneReel(tank: Tank): MilestoneReelStop[] {
  const majors = tank.milestones.filter((m) => m.major);

  const rosterGroups = new Map<string, Milestone[]>();
  const singles: Milestone[] = [];
  for (const m of majors) {
    if (m.type === 'roster-addition' && m.linkedLogEntryId) {
      const arr = rosterGroups.get(m.linkedLogEntryId) ?? [];
      arr.push(m);
      rosterGroups.set(m.linkedLogEntryId, arr);
    } else {
      singles.push(m);
    }
  }

  const stops: MilestoneReelStop[] = [
    ...singles.map((m) => ({ kind: 'single' as const, date: m.date, milestone: m })),
    ...[...rosterGroups.entries()].map(([linkedLogEntryId, milestones]) => ({
      kind: 'group' as const,
      date: milestones[0].date,
      linkedLogEntryId,
      milestones,
    })),
  ];

  return stops.sort((a, b) => a.date.localeCompare(b.date));
}

// --- Mood vibe — the one place real inference happens ---

export interface MoodVibe {
  dominantMood: Mood;
  averageScore: number; // 1 (concerned) – 4 (thriving), see moodToScore/MOOD_ORDER
  distribution: Record<Mood, number>;
}

// Guardrail reasoned through explicitly, not drifted into: the rest of
// this app stays fully deterministic; this is the one deliberate
// exception, since Story Mode is "pure sentiment" the same way Spotify
// Wrapped characterizes real listening stats rather than just listing
// them. The line that still holds absolutely: pattern → characterization
// is fine, pattern → causation is not. This function only ever computes
// WHAT the mood pattern is (dominant mood, average, distribution) — it
// deliberately does NOT compute or expose anything correlating mood
// against other events (health events, phase changes), even as a side
// data point, specifically so a later slide can't be tempted into
// implying one caused the other. If a chronological juxtaposition is
// ever wanted, it belongs in 2e's rendering (two true facts placed side
// by side), never as a "correlation" value computed here.
export function computeMoodVibe(tank: Tank): MoodVibe | undefined {
  const moods = tank.logs.map((l) => l.mood).filter((m): m is Mood => Boolean(m));
  if (moods.length === 0) return undefined;

  const distribution = Object.fromEntries(MOOD_ORDER.map((m) => [m, 0])) as Record<Mood, number>;
  for (const m of moods) distribution[m]++;

  let dominantMood = moods[0];
  for (const m of MOOD_ORDER) {
    if (distribution[m] > distribution[dominantMood]) dominantMood = m;
  }

  const scores = moods.map((m) => moodToScore(m)).filter((s): s is number => s !== undefined);
  const averageScore = scores.reduce((sum, s) => sum + s, 0) / scores.length;

  return { dominantMood, averageScore, distribution };
}

// --- Health-event acknowledgment ---

// Chronological, factual only — deliberately exposes nothing beyond the
// milestones themselves. No derived "did things get worse after this"
// signal is computed here, for the same reason mood vibe above doesn't
// compute a correlation value: that's exactly the kind of thing that
// tempts a causal-sounding sentence later, so it's safer not to compute
// it at all than to compute it and trust every future call site to
// resist misusing it.
export function computeHealthEventAcknowledgment(tank: Tank): Milestone[] {
  return tank.milestones.filter((m) => m.type === 'health-event').sort((a, b) => a.date.localeCompare(b.date));
}