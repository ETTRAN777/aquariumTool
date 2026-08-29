import { todayIso, parseIsoDate } from './date';
import type { ScheduleTask } from '../types';

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
  return {
    label: parseIsoDate(dateStr).toLocaleDateString(undefined, { month: 'short', day: 'numeric' }),
    tone: 'later',
  };
}

export const TONE_CLASSES: Record<string, string> = {
  overdue: 'bg-coral/20 text-coral',
  today: 'bg-amber/20 text-amber',
  soon: 'bg-sand/15 text-sand',
  later: 'bg-moss/15 text-foam-dim',
};

// The single most relevant task to show somewhere with room for exactly
// one — the most overdue task if anything's overdue, otherwise the
// soonest upcoming one. Undefined if the schedule is empty or every task
// is done, matching the "silent unless known" pattern used everywhere
// else in this app rather than showing an empty/placeholder task.
export function pickMostRelevantTask(schedule: ScheduleTask[]): ScheduleTask | undefined {
  const active = schedule.filter((t) => !t.done);
  const overdue = active
    .filter((t) => daysUntil(t.dueDate) < 0)
    .sort((a, b) => a.dueDate.localeCompare(b.dueDate));
  if (overdue.length > 0) return overdue[0];
  return active.slice().sort((a, b) => a.dueDate.localeCompare(b.dueDate))[0];
}