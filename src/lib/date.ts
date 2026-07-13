// Local-calendar-day ISO helpers. `Date#toISOString()` always reports the
// UTC calendar day, which silently rolls over to the "wrong" day for any
// timezone behind UTC (e.g. US zones) during evening hours — that mismatch
// was the actual root cause of schedule tasks behaving strangely: "today"
// computed via toISOString() could disagree with the local day an
// <input type="date"> or a calendar cell was using. These helpers work in
// local time consistently everywhere a date-only string is involved.

export function todayIso(): string {
  return toIsoDate(new Date());
}

export function toIsoDate(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(
    d.getDate()
  ).padStart(2, '0')}`;
}

// `new Date('YYYY-MM-DD')` parses as UTC midnight per spec, which is the
// wrong instant to compare against local "today" — this parses as local
// midnight instead, matching toIsoDate's own local components.
export function parseIsoDate(dateStr: string): Date {
  const [y, m, d] = dateStr.split('-').map(Number);
  return new Date(y, m - 1, d);
}

export function addDays(dateStr: string, days: number): string {
  const d = parseIsoDate(dateStr);
  d.setDate(d.getDate() + days);
  return toIsoDate(d);
}
