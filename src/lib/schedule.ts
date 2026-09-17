import { todayIso, parseIsoDate, addDays } from './date';
import type { ScheduleTask, Tank } from '../types';
import { builtMilestone } from './milestones';

// Extracted from Schedule.tsx so both the Schedule page and the widget
// route (Widget.tsx) share one definition of "how many days until this
// is due" and "what does that look like as a label/tone" — same
// reasoning as every other shared-logic extraction in this app
// (buildPhaseSegments, groupRosterByCategory): one source of truth, not
// two copies that can quietly drift apart.

export function daysUntil(dateStr: string): number {
  const today = parseIsoDate(todayIso());
  const due = parseIsoDate(dateStr);
  return Math.round((due.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
}

export function formatDue(dateStr: string): { label: string; tone: 'overdue' | 'today' | 'soon' | 'later' } {
  const diff = daysUntil(dateStr);
  if (diff < 0) return { label: `${Math.abs(diff)}d overdue`, tone: 'overdue' };
  if (diff === 0) return { label: 'Due today', tone: 'today' };
  if (diff <= 3) return { label: `In ${diff}d`, tone: 'soon' };
  // Bare month/day reads as "already passed" for anything genuinely far
  // out — found and worked around once already, locally, in Widget.tsx
  // (its own "(in Nd)" addition on top of this same label). Fixed here
  // at the source instead now that a second consumer (Schedule's own
  // aside, listing tasks regardless of what month is in view) hit the
  // identical ambiguity — ambiguous days should never be pushed back
  // downstream a second time on the same underlying label. Widget's own
  // "(in Nd)" addition stays layered on top of this, not replaced —
  // different, complementary axis of information (how far vs. which
  // year), not a duplicate fix.
  const due = parseIsoDate(dateStr);
  const sameYear = due.getFullYear() === parseIsoDate(todayIso()).getFullYear();
  return {
    label: due.toLocaleDateString(
      undefined,
      sameYear ? { month: 'short', day: 'numeric' } : { month: 'short', day: 'numeric', year: 'numeric' }
    ),
    tone: 'later',
  };
}

export const TONE_CLASSES: Record<string, string> = {
  overdue: 'bg-coral/20 text-coral',
  today: 'bg-amber/20 text-amber',
  soon: 'bg-sand/15 text-sand',
  later: 'bg-moss/15 text-foam-dim',
};

// A task can't meaningfully be "due" before the tank it belongs to has
// actually started — confirmed on a real tank's real data (a DIY reef
// build, startDate months out, every schedule task already reading as
// overdue against today's date despite there being no water in the
// tank yet). Corrects a task's dueDate against a real anchor date before
// anything else in this file ever sees it.
//
// Takes the anchor directly rather than a Tank, and doesn't know or care
// where it came from — scheduleAnchorDate() below is the one place that
// decides whether that's a "Built" milestone's date or tank.startDate;
// this function just needs a single date string to walk from.
//
// Recurring tasks get walked forward through their own cadence to find
// the first honest occurrence on/after the anchor — same endDate-as-
// ceiling logic occurrencesInRange already uses, so a series that would
// already be over by the time the tank starts correctly reports null
// rather than a nonsensical occurrence past its own end.
//
// One-off tasks are NOT auto-computed — deliberately. Placing a one-off
// relative to the anchor mathematically would need a *tracked prior*
// anchor to compute a delta against, which only exists if one was ever
// recorded, and often won't be; not worth building for a case that only
// partially covers itself. null here means "needs a new date picked by
// hand," never "no date at all" — the caller's job is to treat it as a
// real, distinct case, not silently drop it.
export function effectiveDueDate(task: ScheduleTask, anchorDate: string | undefined): string | null {
  if (!anchorDate || task.dueDate >= anchorDate) return task.dueDate;
  if (!task.recurrenceDays) return null;
  let d = task.dueDate;
  while (d < anchorDate) {
    d = addDays(d, task.recurrenceDays);
    if (task.endDate && d > task.endDate) return null;
  }
  return d;
}

// What effectiveDueDate should actually anchor against — a real "Built"
// milestone's date when one exists, tank.startDate otherwise. Decided
// directly, not left as tank.startDate alone: startDate can validly mean
// "when I started planning," which isn't the same thing as "when the
// tank physically started running" (the thing schedule tasks — water
// changes, feeding — actually need to know). The Built milestone's date
// always wins when it exists, regardless of whether it falls before or
// after startDate chronologically; there's no reconciliation between the
// two, just a straight priority order.
export function scheduleAnchorDate(tank: Tank): string | undefined {
  return builtMilestone(tank)?.date ?? tank.startDate;
}

// The single most relevant task to show somewhere with room for exactly
// one — the most overdue task if anything's overdue, otherwise the
// soonest upcoming one. Undefined if the schedule is empty, every task
// is done, or nothing has a real effective date yet (a schedule that's
// entirely one-off tasks still waiting on a tank start has nothing
// genuinely "relevant" to surface in a glance context — that's a
// Schedule-page-only concern, not a Widget/Dashboard one), matching the
// "silent unless known" pattern used everywhere else in this app rather
// than showing an empty/placeholder task.
export function pickMostRelevantTask(schedule: ScheduleTask[], anchorDate?: string): ScheduleTask | undefined {
  const withEffectiveDate = schedule
    .filter((t) => !t.done)
    .map((t) => ({ task: t, effective: effectiveDueDate(t, anchorDate) }))
    .filter((x): x is { task: ScheduleTask; effective: string } => x.effective !== null);
  const overdue = withEffectiveDate
    .filter((x) => daysUntil(x.effective) < 0)
    .sort((a, b) => a.effective.localeCompare(b.effective));
  if (overdue.length > 0) return overdue[0].task;
  return withEffectiveDate.slice().sort((a, b) => a.effective.localeCompare(b.effective))[0]?.task;
}