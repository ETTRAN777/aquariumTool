import type { Tank, LogEntry, Milestone, LogPhase } from '../types';
import { LOG_PHASE_LABELS, CATEGORY_LABELS } from './constants';
import { tankLifetimeDuration, formatTankAge } from './duration';

// 15c — schema + functions only, no UI. Everything here is either a pure
// function (testable the same way duration.ts's were) or wiring called
// from DataContext's save flow. Milestone.major, and the three functions
// below, are what actually implement it; the Milestone type itself and
// its other fields already exist from 15a.

// ---------------------------------------------------------------------
// Fallback description generation
// ---------------------------------------------------------------------

// Auto-created milestones (both kinds below) never have a hand-typed
// description — nobody clicked anything to create them. This generates
// display text for a blank description at READ time, not at creation
// time, so editing a linked entry's mood later automatically changes
// what a phase-change milestone reads like next time it's shown, with
// nothing needing to be re-touched on the Milestone record itself.
// Never called for a milestone that already has a real description — an
// actual user-written one always wins over the generated fallback.
export function buildFallbackDescription(
  milestone: Milestone,
  tank: Tank,
  linkedEntry?: LogEntry,
  options?: { includeAgePrefix?: boolean }
): string {
  // Skippable because some display contexts (the compact major-milestone
  // cards on Timeline) already show the raw date prominently elsewhere
  // in the same card — repeating "Week 4 Day 0 (28 Days):" as a prefix
  // there is pure redundancy that eats into an already-tight character
  // budget. Defaults to included everywhere else, where the age context
  // genuinely adds information the surrounding UI doesn't already show.
  const includeAgePrefix = options?.includeAgePrefix ?? true;
  const lifetime = includeAgePrefix ? tankLifetimeDuration(tank) : null;
  const agePrefix = lifetime ? `${formatTankAge(lifetime)}: ` : '';

  switch (milestone.type) {
    case 'phase-change': {
      const phaseLabel = milestone.phase ? LOG_PHASE_LABELS[milestone.phase] : 'a new stage';
      const gentle = linkedEntry?.mood === 'concerned' || linkedEntry?.mood === 'watching';
      return gentle
        ? `${agePrefix}The tank moves into ${phaseLabel}. Watching closely as this stage begins.`
        : `${agePrefix}A new chapter begins — the tank moves into ${phaseLabel}.`;
    }

    case 'roster-addition': {
      const itemId = milestone.relatedRosterItemIds?.[0];
      const item = itemId ? tank.roster.find((r) => r.id === itemId) : undefined;
      const itemName = item?.name ?? '(removed item)';
      const plural = (item?.quantity ?? 1) > 1;

      if (!milestone.major) {
        return `${itemName} ${plural ? 'join' : 'joins'} the tank.`;
      }
      if (item?.category === 'livestock') {
        return `${agePrefix}${itemName} ${plural ? 'arrive' : 'arrives'} — the first of their kind in this tank.`;
      }
      const categoryLabel = item ? CATEGORY_LABELS[item.category].toLowerCase() : 'addition';
      return `${agePrefix}${itemName} ${plural ? 'arrive' : 'arrives'} — the first ${categoryLabel} for this tank.`;
    }

    // health-event and custom are manual-only (no auto-detection signal
    // exists for either), so there's nothing computed to draw from —
    // stating that plainly beats inventing a reason the user didn't give.
    case 'health-event':
    case 'custom':
      return 'No further detail was recorded for this milestone.';
  }
}

// ---------------------------------------------------------------------
// Auto-milestone recomputation
// ---------------------------------------------------------------------

// Replaces the earlier incremental "detect against this one entry"
// approach — this derives the FULL set of auto-created milestones fresh
// from tank.logs on every save (add/update/delete), rather than
// appending. Called from DataContext's addLogEntry/updateLogEntry/
// deleteLogEntry with the tank's POST-save log state; the returned array
// is meant to directly replace tank.milestones.
//
// This is what makes milestones genuinely reactive rather than
// write-once: deleting a log entry makes its milestone disappear (no
// orphaned record pointing at nothing), editing an entry's phase/
// additions away from what triggered a milestone removes it, and
// backfilling a genuinely-earlier-dated entry correctly reassigns a
// roster-addition milestone to it — the "known limitation" from the
// earlier incremental version no longer applies.
//
// Manually-created milestones (health-event/custom, or a hand-made
// phase-change/roster-addition with no linked entry) are identified by
// having no `linkedLogEntryId` and are NEVER touched — passed through
// untouched every time.
//
// Hand-edited text on an auto-created milestone survives re-saves too:
// title/description/major are only freshly computed the first time a
// given milestone (identified by its exact linkedLogEntryId + phase, or
// relatedRosterItemIds) comes into existence. On every later recompute,
// if that SAME identity still exists, its existing title/description/
// major are preserved rather than overwritten — so editing a milestone's
// text doesn't get silently reverted the next time an unrelated log
// entry is saved. If the underlying fact actually changes (e.g. an
// entry's phase gets corrected), that's treated as a different identity
// entirely — the stale milestone tied to the old phase simply isn't
// included in the new set, and a fresh one (new title, no stale
// description) takes its place.
export function recomputeAutoMilestones(tank: Tank): Milestone[] {
  const manual = tank.milestones.filter((m) => !m.linkedLogEntryId);
  const auto: Milestone[] = [];

  // --- Phase-change: walk phase-tagged entries in true date order,
  // creating a milestone wherever the phase differs from the prior one
  // (or is the first ever tagged). Always major.
  const phaseTagged = tank.logs
    .filter((l) => l.phase !== undefined)
    .sort((a, b) => a.date.localeCompare(b.date));

  let previousPhase: LogPhase | undefined;
  for (const entry of phaseTagged) {
    if (entry.phase !== previousPhase) {
      const existing = tank.milestones.find(
        (m) => m.type === 'phase-change' && m.linkedLogEntryId === entry.id && m.phase === entry.phase
      );
      auto.push({
        id: existing?.id ?? crypto.randomUUID(),
        title: existing?.title ?? `Entered ${LOG_PHASE_LABELS[entry.phase!]}`,
        description: existing?.description,
        date: entry.date,
        type: 'phase-change',
        phase: entry.phase,
        linkedLogEntryId: entry.id,
        major: existing?.major ?? true,
      });
    }
    previousPhase = entry.phase;
  }

  // --- Roster-addition: process every (entry, item) occurrence in true
  // chronological order — entry date first, then position within that
  // entry's `additions` array as a deterministic tiebreak for same-date
  // ties (e.g. two plants added in the same entry). The FIRST occurrence
  // of each distinct roster item, in that order, is its milestone; every
  // occurrence after that for the same item is ignored. major is true
  // for every livestock item, and true for the first non-livestock item
  // to claim each category — "claim" tracked in the same single pass, so
  // there's no separate tiebreak logic needed for the majorness question.
  type Occurrence = { entry: LogEntry; rosterItemId: string; orderInEntry: number };
  const occurrences: Occurrence[] = [];
  for (const entry of tank.logs) {
    (entry.additions ?? []).forEach((link, orderInEntry) => {
      occurrences.push({ entry, rosterItemId: link.rosterItemId, orderInEntry });
    });
  }
  occurrences.sort((a, b) => {
    if (a.entry.date !== b.entry.date) return a.entry.date < b.entry.date ? -1 : 1;
    return a.orderInEntry - b.orderInEntry;
  });

  const seenItems = new Set<string>();
  const claimedCategories = new Set<string>();
  for (const occ of occurrences) {
    if (seenItems.has(occ.rosterItemId)) continue;
    seenItems.add(occ.rosterItemId);

    const item = tank.roster.find((r) => r.id === occ.rosterItemId);
    let major: boolean;
    if (item?.category === 'livestock') {
      major = true;
    } else if (item) {
      major = !claimedCategories.has(item.category);
      if (major) claimedCategories.add(item.category);
    } else {
      major = false; // roster item was removed before this could be determined
    }

    const existing = tank.milestones.find(
      (m) => m.type === 'roster-addition' && m.relatedRosterItemIds?.includes(occ.rosterItemId)
    );
    auto.push({
      id: existing?.id ?? crypto.randomUUID(),
      title: existing?.title ?? `${item?.name ?? '(removed item)'} added`,
      description: existing?.description,
      date: occ.entry.date,
      type: 'roster-addition',
      relatedRosterItemIds: [occ.rosterItemId],
      linkedLogEntryId: occ.entry.id,
      major: existing?.major ?? major,
    });
  }

  return [...manual, ...auto];
}