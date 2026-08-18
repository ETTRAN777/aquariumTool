import type { Tank, LogPhase } from '../types';
import { parseIsoDate, toIsoDate, todayIso } from './date';

// Real calendar-breakdown duration math for 2.0's lifetime/per-phase
// counters. Naive division (days/30 for months, days/365 for years)
// drifts and doesn't round-trip — this walks forward by whole calendar
// years, then whole calendar months, then whole weeks, then leftover
// days, so start + years + months + (weeks*7 + days) always reconstructs
// exactly back to end. Same rigor as date.ts's addDays/parseIsoDate
// local-day handling, extended to the two JS Date footguns that come up
// once you're adding years/months instead of just days:
//   - Date#setMonth silently OVERFLOWS on short months (Jan 31 + 1 month
//     natively becomes Mar 3, not Feb 28/29) — addCalendarMonths clamps.
//   - Date#setFullYear on Feb 29 in a non-leap target year silently rolls
//     to Mar 1 — addCalendarYears clamps to Feb 28 instead.

export interface CalendarDuration {
  years: number;
  months: number;
  weeks: number;
  days: number; // leftover days after weeks are subtracted
  totalDays: number; // whole-span day count, for sorting/comparison
}

// Both of these iterate one step at a time internally rather than jumping
// straight to +n in a single setFullYear/setMonth call — that matters
// once a clamp actually fires partway through. A single 4-year jump from
// Feb 29, 2024 would land on Feb 29, 2028 (2028 is also a leap year), but
// the intermediate year (2025) isn't, so the FIRST year-step clamps to
// Feb 28 — and once that's happened, every subsequent step continues
// from Feb 28, never "recovering" back to Feb 29 even in a later leap
// year. Iterating ensures a direct n-step call always agrees with what n
// sequential 1-step calls would produce (which is what the main walk
// below actually does) — a single-jump version would silently disagree
// with the iterative one in exactly this kind of edge case.
export function addCalendarYears(d: Date, n: number): Date {
  const step = n >= 0 ? 1 : -1;
  let result = d;
  for (let i = 0; i < Math.abs(n); i++) {
    const wasFeb29 = result.getMonth() === 1 && result.getDate() === 29;
    const next = new Date(result);
    next.setFullYear(result.getFullYear() + step);
    if (wasFeb29 && next.getMonth() !== 1) {
      next.setDate(0); // rolled to Mar 1 because the target year isn't a leap year — back up to Feb 28
    }
    result = next;
  }
  return result;
}

export function addCalendarMonths(d: Date, n: number): Date {
  const step = n >= 0 ? 1 : -1;
  let result = d;
  for (let i = 0; i < Math.abs(n); i++) {
    const day = result.getDate();
    const next = new Date(result.getFullYear(), result.getMonth() + step, 1);
    const daysInTargetMonth = new Date(next.getFullYear(), next.getMonth() + 1, 0).getDate();
    next.setDate(Math.min(day, daysInTargetMonth));
    result = next;
  }
  return result;
}

// Signed: if endIso is before startIso (e.g. a misconfigured future
// Tank.startDate), the magnitude is computed on the swapped pair and
// every field comes back negated, rather than throwing or silently
// clamping to zero — an honest, if unusual, real answer.
export function calendarDurationBetween(startIso: string, endIso: string): CalendarDuration {
  const forward = endIso >= startIso;
  const startStr = forward ? startIso : endIso;
  const endStr = forward ? endIso : startIso;
  const start = parseIsoDate(startStr);
  const end = parseIsoDate(endStr);

  let years = 0;
  let cursor = start;
  while (true) {
    const next = addCalendarYears(cursor, 1);
    if (next > end) break;
    cursor = next;
    years++;
  }

  let months = 0;
  while (true) {
    const next = addCalendarMonths(cursor, 1);
    if (next > end) break;
    cursor = next;
    months++;
  }

  const msPerDay = 24 * 60 * 60 * 1000;
  const remainingDays = Math.round((end.getTime() - cursor.getTime()) / msPerDay);
  const weeks = Math.floor(remainingDays / 7);
  const days = remainingDays % 7;
  const totalDays = Math.round((end.getTime() - start.getTime()) / msPerDay);

  const sign = forward ? 1 : -1;
  return {
    years: years * sign,
    months: months * sign,
    weeks: weeks * sign,
    days: days * sign,
    totalDays: totalDays * sign,
  };
}

// Driven by Tank.startDate — returns null (never a fabricated 0) when
// it isn't set, since "started today" and "start date unknown" are
// genuinely different states a consumer shouldn't have to guess between.
export function tankLifetimeDuration(tank: Tank): CalendarDuration | null {
  if (!tank.startDate) return null;
  return calendarDurationBetween(tank.startDate, todayIso());
}

// Driven by the EARLIEST log entry tagged with the given phase — not the
// first one in array order, which isn't guaranteed to be chronological.
// Returns null when no entry has this phase tagged at all, same
// no-fabricated-0 rule as tankLifetimeDuration.
export function tankPhaseDuration(tank: Tank, phase: LogPhase): CalendarDuration | null {
  const tagged = tank.logs.filter((l) => l.phase === phase);
  if (tagged.length === 0) return null;
  const earliest = tagged.reduce((a, b) => (b.date < a.date ? b : a));
  // LogEntry.date is a full ISO datetime (new Date().toISOString()), not
  // the local-date-only string parseIsoDate expects — normalize first.
  const startIso = toIsoDate(new Date(earliest.date));
  return calendarDurationBetween(startIso, todayIso());
}

// The tank's current phase — whichever phase the most recently DATED
// phase-tagged log entry carries (not the most recently created one;
// entries can be added or edited out of chronological order). undefined,
// never a fabricated default, when no entry has a phase tagged at all.
export function currentPhase(tank: Tank): LogPhase | undefined {
  const tagged = tank.logs.filter((l) => l.phase !== undefined);
  if (tagged.length === 0) return undefined;
  const latest = tagged.reduce((a, b) => (b.date > a.date ? b : a));
  return latest.phase;
}

// Cascades a CalendarDuration down to a human-readable "tank age" string,
// starting from the largest non-zero unit (up to years) and always
// running through week + day once expanded past a single unit — e.g.
// "Week 6 Day 5", or "Year 1 Month 2 Week 0 Day 4" once a tank's old
// enough for those units to matter. Appends the raw total day count in
// parentheses once expanded, since a number like "(2000 Days)" is
// genuinely striking at that scale, not just a repeat of what's already
// shown — but collapses to a bare "Day N" with no parenthetical when the
// tank isn't even a week old, since "(5 Days)" right next to "Day 5"
// would just be echoing the same number back. Reused as-is for both the
// milestone-description day-count prefix and Timeline's planned "Your
// Tank is X old" line — one formatter, not two.
// Always formats a POSITIVE magnitude, regardless of whether the
// underlying duration is past or future — deliberately sign-agnostic.
// calendarDurationBetween can return a negative duration on purpose (a
// future Tank.startDate — a genuinely real case, e.g. a far-off concept
// tank planned but not yet started), and the original version of this
// function didn't account for that: `d.totalDays < 7` is true for ANY
// negative number, so it always fell into the single-day collapse
// branch and printed the raw negative value verbatim — "Day -90" for a
// tank starting 90 days from now, regardless of how far out the date
// actually was. Fixed by taking the magnitude of every field up front.
// This function has no opinion on past vs. future — it's the CALLER's
// job to notice `d.totalDays < 0` and choose different surrounding
// wording ("starts in X" vs. "is X old"), since that's a real semantic
// difference, not just a formatting one.
export function formatTankAge(d: CalendarDuration): string {
  const years = Math.abs(d.years);
  const months = Math.abs(d.months);
  const weeks = Math.abs(d.weeks);
  const days = Math.abs(d.days);
  const totalDays = Math.abs(d.totalDays);

  if (totalDays < 7) {
    return `Day ${totalDays}`;
  }
  const parts: string[] = [];
  if (years > 0) parts.push(`Year ${years}`);
  if (years > 0 || months > 0) parts.push(`Month ${months}`);
  parts.push(`Week ${weeks}`);
  parts.push(`Day ${days}`);
  return `${parts.join(' ')} (${totalDays} Days)`;
}