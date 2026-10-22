import { useMemo, useState } from 'react';
import { useData } from '../lib/DataContext';
import { useConfirmDelete } from '../lib/useConfirmDelete';
import { todayIso, toIsoDate, parseIsoDate, addDays } from '../lib/date';
import {
  daysUntil,
  formatDue,
  effectiveDueDate,
  scheduleAnchorDate,
  missedCycleCount,
  TONE_CLASSES,
} from '../lib/schedule';
import type { ScheduleTask, Tank } from '../types';
import Toast from '../components/Toast';

// Preset recurrence intervals cover the common cases (daily feeding, weekly
// water changes, biweekly dosing, monthly filter media swaps) without asking
// someone to know their cadence in days. "Custom" drops to a raw number
// input for anything else.
const RECURRENCE_PRESETS: { label: string; days: number | null }[] = [
  { label: 'One-off (no repeat)', days: null },
  { label: 'Daily', days: 1 },
  { label: 'Every 3 days', days: 3 },
  { label: 'Weekly', days: 7 },
  { label: 'Every 2 weeks', days: 14 },
  { label: 'Monthly', days: 30 },
  { label: 'Custom…', days: -1 },
];

const WEEKDAY_LABELS = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];

const DOT_CLASSES: Record<string, string> = {
  overdue: 'bg-coral',
  today: 'bg-amber',
  soon: 'bg-sand',
  later: 'bg-moss-light',
};

// 6 full weeks (42 cells) so the grid height never jumps between months —
// a small thing, but it's what makes a calendar feel native instead of
// like a list wearing a grid costume.
function buildMonthGrid(year: number, month: number): Date[] {
  const firstOfMonth = new Date(year, month, 1);
  const start = new Date(firstOfMonth);
  start.setDate(start.getDate() - start.getDay());
  return Array.from({ length: 42 }, (_, i) => {
    const d = new Date(start);
    d.setDate(start.getDate() + i);
    return d;
  });
}

// A recurring task only has ONE real, actionable occurrence at any time —
// its stored dueDate. But a calendar that only ever shows a weekly task on
// a single date doesn't read as "weekly" at all. This projects every future
// occurrence a recurring task would land on within the visible range, so
// the grid actually looks like a recurring schedule. Only the true dueDate
// occurrence is "actual" (interactive); everything projected forward from it
// is a preview — there's no per-occurrence completion state to attach a
// complete/edit/delete action to, since completing the real occurrence is
// what rolls the whole task forward.
// 'actual' is the task's one real, currently-due occurrence; 'preview' is
// a future recurrence projected forward from it, with no state of its own
// (see the comment above occurrencesInRange). 'completed' is new: the
// specific day a recurring task was actually completed on, surfaced
// separately from 'actual' because completing a recurring task rolls its
// one real occurrence forward past today — without this, the day it was
// completed on would show nothing at all, which read as the completion
// having silently failed rather than having happened. 'failed' is v2.5:
// a tracked task's occurrence that was explicitly marked failed rather
// than completed — only tracked tasks can ever produce one (see
// occurrencesInRange).
interface CalendarOccurrence {
  task: ScheduleTask;
  date: string;
  kind: 'actual' | 'preview' | 'completed' | 'failed';
}

function occurrencesInRange(
  schedule: ScheduleTask[],
  rangeStart: string,
  rangeEnd: string,
  anchorDate: string | undefined
): CalendarOccurrence[] {
  const occurrences: CalendarOccurrence[] = [];
  for (const t of schedule) {
    if (t.done) continue;
    // A one-off task with no honest corrected date (effectiveDueDate
    // returns null — see its own comment in schedule.ts) still gets
    // plotted at its own raw dueDate rather than hidden from the
    // calendar entirely. It's flagged separately in the aside as
    // needing a new date, but still has to be reachable through the
    // normal calendar/day-agenda flow — that's exactly how the aside
    // now navigates to it, rather than a second, separate edit surface.
    const effective = effectiveDueDate(t, anchorDate) ?? t.dueDate;
    const cap = t.endDate && t.endDate < rangeEnd ? t.endDate : rangeEnd;
    if (effective >= rangeStart && effective <= rangeEnd && (!t.endDate || effective <= t.endDate)) {
      occurrences.push({ task: t, date: effective, kind: 'actual' });
    }
    if (t.recurrenceDays) {
      let d = effective;
      while (true) {
        d = addDays(d, t.recurrenceDays);
        if (d > cap) break;
        if (d >= rangeStart) occurrences.push({ task: t, date: d, kind: 'preview' });
      }
      // A tracked task's full completionHistory — every resolved
      // occurrence, not just the most recent — so a backlog that's been
      // resolved one cycle at a time (see resolveScheduleTask in
      // DataContext) actually shows up as several distinct marks on the
      // calendar rather than only ever the last one. An untracked task
      // has no completionHistory at all, so it falls back to the
      // original single-dot lastCompletedDate behavior unchanged.
      if (t.trackCompletionHistory && t.completionHistory) {
        for (const entry of t.completionHistory) {
          if (entry.date === effective) continue; // same guard as below
          if (entry.date >= rangeStart && entry.date <= rangeEnd) {
            occurrences.push({ task: t, date: entry.date, kind: entry.outcome });
          }
        }
      } else if (
        // The day this task was last completed doesn't otherwise appear
        // anywhere — completing it rolled dueDate/effective past today, so
        // without this the completed day would just show nothing, and
        // completing looked identical to the task silently vanishing.
        // Guarded against equaling `effective` for the (currently
        // unreachable in practice, since completion always rolls strictly
        // past today — see resolveScheduleTask's do/while) case of a
        // hand-edited dueDate landing back on the same day as the last
        // completion, which would otherwise double up as both an 'actual'
        // and a 'completed' entry for one occurrence.
        t.lastCompletedDate &&
        t.lastCompletedDate !== effective &&
        t.lastCompletedDate >= rangeStart &&
        t.lastCompletedDate <= rangeEnd
      ) {
        occurrences.push({ task: t, date: t.lastCompletedDate, kind: 'completed' });
      }
    }
  }
  return occurrences;
}

// The no-active-tank guard lives here, in a wrapper, rather than as an
// early return partway through the component that holds the hooks. The
// old version returned null before two useMemo calls further down —
// a Rules of Hooks violation: the hook count differed between the
// render that hit the guard and the ones that didn't, which React treats
// as an error the first time activeTank flips between missing and
// present while this page is mounted. Splitting it means every hook in
// ScheduleView runs on every render, unconditionally, and activeTank is
// simply never null by the time it gets there (which also removes the
// need for the narrowing the early return used to provide).
export default function Schedule() {
  const { activeTank } = useData();
  if (!activeTank) return null;
  return <ScheduleView activeTank={activeTank} />;
}

function ScheduleView({ activeTank }: { activeTank: Tank }) {
  const { addScheduleTask, updateScheduleTask, deleteScheduleTask, completeScheduleTask, failScheduleTask } =
    useData();
  const [editingId, setEditingId] = useState<string | null>(null);
  const [showAdd, setShowAdd] = useState(false);
  const [justLinked, setJustLinked] = useState<string | null>(null);
  const { pendingId: pendingDeleteId, handleClick: handleDeleteClick } = useConfirmDelete();

  const now = new Date();
  const [viewYear, setViewYear] = useState(now.getFullYear());
  const [viewMonth, setViewMonth] = useState(now.getMonth());
  const [selectedDate, setSelectedDate] = useState(todayIso());

  const tank = activeTank;
  const { schedule } = tank;
  // Computed once, reused everywhere below — a "Built" milestone's date
  // when one exists, tank.startDate otherwise. See scheduleAnchorDate's
  // own comment in schedule.ts for why this isn't just tank.startDate
  // directly anymore.
  const anchorDate = scheduleAnchorDate(tank);

  function handleComplete(task: ScheduleTask) {
    const today = todayIso();
    const hadMatchingLog = tank.logs.some((l) => toIsoDate(new Date(l.date)) === today);
    completeScheduleTask(task.id);
    if (hadMatchingLog) {
      setJustLinked(task.id);
      setTimeout(() => setJustLinked((cur) => (cur === task.id ? null : cur)), 3500);
    }
  }

  // No justLinked handling here — failing a task didn't actually happen,
  // so there's nothing to attach to today's log.
  function handleFail(task: ScheduleTask) {
    failScheduleTask(task.id);
  }

  const active = schedule.filter((t) => !t.done);
  const finished = schedule.filter((t) => t.done);

  // Every active task's corrected date, computed once here and reused by
  // the overdue banner, the calendar, and the aside below — never each
  // one computing its own copy that could quietly drift from the others.
  const activeWithEffective = active.map((t) => ({ task: t, effective: effectiveDueDate(t, anchorDate) }));
  // One-off tasks dated before the tank's own start, with no honest date
  // to compute — see effectiveDueDate's own comment for why these are
  // deliberately not auto-placed. Surfaced only in the aside.
  const needsNewDate = activeWithEffective.filter((x) => x.effective === null).map((x) => x.task);
  const overdue = activeWithEffective
    .filter((x): x is { task: ScheduleTask; effective: string } => x.effective !== null && daysUntil(x.effective) < 0)
    .sort((a, b) => a.effective.localeCompare(b.effective));

  const grid = useMemo(() => buildMonthGrid(viewYear, viewMonth), [viewYear, viewMonth]);
  const gridStart = toIsoDate(grid[0]);
  const gridEnd = toIsoDate(grid[41]);

  const occurrencesByDate = useMemo(() => {
    const map = new Map<string, CalendarOccurrence[]>();
    for (const occ of occurrencesInRange(active, gridStart, gridEnd, anchorDate)) {
      const list = map.get(occ.date) ?? [];
      list.push(occ);
      map.set(occ.date, list);
    }
    return map;
  }, [active, gridStart, gridEnd, anchorDate]);

  const monthLabel = new Date(viewYear, viewMonth, 1).toLocaleDateString(undefined, {
    month: 'long',
    year: 'numeric',
  });

  function changeMonth(delta: number) {
    const d = new Date(viewYear, viewMonth + delta, 1);
    setViewYear(d.getFullYear());
    setViewMonth(d.getMonth());
  }

  function jumpTo(dateStr: string) {
    const d = parseIsoDate(dateStr);
    setViewYear(d.getFullYear());
    setViewMonth(d.getMonth());
    setSelectedDate(dateStr);
    setShowAdd(false);
    setEditingId(null);
  }

  const selectedOccurrences = (occurrencesByDate.get(selectedDate) ?? []).sort((a, b) =>
    a.task.label.localeCompare(b.task.label)
  );
  const selectedLabel = parseIsoDate(selectedDate).toLocaleDateString(undefined, {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
  });

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      <div>
        <h2 className="font-display text-2xl font-semibold">Schedule</h2>
      </div>

      {overdue.length > 0 && (
        <div className="card border-coral/40 p-3 flex flex-wrap items-center gap-2">
          <span className="text-xs font-mono text-coral uppercase tracking-wide shrink-0">
            ⚠ Overdue
          </span>
          {overdue.map(({ task, effective }) => (
            <button
              key={task.id}
              onClick={() => jumpTo(effective)}
              className="pill text-[11px] py-1 px-2 bg-coral/15 text-coral hover:bg-coral/25 transition-colors"
            >
              {task.label} · {formatDue(effective).label}
            </button>
          ))}
        </div>
      )}

      {/* Calendar + day agenda stay the primary, familiar flow; the aside
          alongside is purely supplementary — every active task, regardless
          of what month the calendar happens to be showing, so nothing can
          go unnoticed just because it isn't in the visible range. Found
          necessary directly: a real task sat undiscovered for months
          because nothing outside the current month's grid ever surfaced it. */}
      <div className="grid lg:grid-cols-[1fr_320px] gap-6 items-start">
      <div className="space-y-6">
      {/* Calendar */}
      <div className="card p-4">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-1">
            <button onClick={() => changeMonth(-1)} className="btn-icon" aria-label="Previous month">
              ‹
            </button>
            <p className="font-display text-lg font-semibold w-40 text-center">{monthLabel}</p>
            <button onClick={() => changeMonth(1)} className="btn-icon" aria-label="Next month">
              ›
            </button>
          </div>
          <button onClick={() => jumpTo(todayIso())} className="btn btn-ghost text-xs py-1.5 px-3">
            Today
          </button>
        </div>

        <div className="grid grid-cols-7 gap-1 mb-1">
          {WEEKDAY_LABELS.map((w, i) => (
            <p
              key={i}
              className="text-center text-[10px] font-mono uppercase tracking-wide text-foam-dim/60 py-1"
            >
              {w}
            </p>
          ))}
        </div>

        <div className="grid grid-cols-7 gap-1">
          {grid.map((d) => {
            const dateStr = toIsoDate(d);
            const inMonth = d.getMonth() === viewMonth;
            const isToday = dateStr === todayIso();
            const isSelected = dateStr === selectedDate;
            const isStartDate = !!tank.startDate && dateStr === tank.startDate;
            const dayOccurrences = occurrencesByDate.get(dateStr) ?? [];
            const shown = dayOccurrences.slice(0, 3);
            const overflow = dayOccurrences.length - shown.length;

            return (
              <button
                key={dateStr}
                onClick={() => {
                  setSelectedDate(dateStr);
                  setShowAdd(false);
                  setEditingId(null);
                }}
                className={`relative min-h-16 sm:min-h-20 rounded-md border p-1.5 text-left transition-colors flex flex-col gap-1 ${
                  isSelected
                    ? 'border-amber bg-amber/10'
                    : isToday
                    ? 'border-amber/50 bg-deepwater-2'
                    : 'border-moss/15 hover:border-moss/40 bg-deepwater-2/50'
                } ${!inMonth ? 'opacity-35' : ''}`}
              >
                {/* A corner overlay, not a third row in the cell's own
                    flex column — the cell is already tight at min-h-16 on
                    mobile with the day number and occurrence dots; a solid,
                    bolder pill riding outside the normal flow reads clearly
                    at a glance without competing for that limited space or
                    risking overflow. Solid fill rather than the subtle
                    translucent pill treatment used elsewhere on purpose —
                    this one specific day is meant to stand out, not blend
                    in the way an ordinary status pill would. */}
                {isStartDate && (
                  <span
                    title="Tank start date"
                    className="absolute -top-1.5 -right-1.5 pill text-[9px] leading-none py-0.5 px-1.5 bg-amber text-deepwater font-bold shadow-sm"
                  >
                    🌊 Start
                  </span>
                )}
                <span
                  className={`text-xs font-mono ${isToday ? 'text-amber font-bold' : 'text-foam-dim'}`}
                >
                  {d.getDate()}
                </span>
                <div className="flex flex-wrap gap-0.5">
                  {shown.map((occ, i) =>
                    occ.kind === 'completed' || occ.kind === 'failed' ? (
                      // Icon badge, not a plain dot — a resolved tracked
                      // occurrence gets an actual check or X, legible at
                      // a glance rather than just "something happened,
                      // check the tooltip." See the design exploration:
                      // this was the recommended option over a bigger
                      // dot, a corner flag, or a ring, specifically
                      // because every other shape on this calendar
                      // already means something else.
                      <span
                        key={`${occ.task.id}-${i}`}
                        title={`${occ.task.label} (${occ.kind === 'completed' ? 'completed' : 'failed'})`}
                        className={`w-3 h-3 rounded-full inline-flex items-center justify-center text-[7px] leading-none font-bold text-foam ${
                          occ.kind === 'completed' ? 'bg-moss' : 'bg-coral'
                        }`}
                      >
                        {occ.kind === 'completed' ? '✓' : '✕'}
                      </span>
                    ) : (
                      <span
                        key={`${occ.task.id}-${i}`}
                        className={
                          occ.kind === 'actual'
                            ? `w-1.5 h-1.5 rounded-full ${DOT_CLASSES[formatDue(occ.date).tone]}`
                            : 'w-1.5 h-1.5 rounded-full border border-moss-light bg-transparent'
                        }
                        title={occ.kind === 'actual' ? occ.task.label : `${occ.task.label} (upcoming)`}
                      />
                    )
                  )}
                  {overflow > 0 && (
                    <span className="text-[9px] text-foam-dim leading-none">+{overflow}</span>
                  )}
                </div>
              </button>
            );
          })}
        </div>

        <p className="text-[11px] text-foam-dim/60 mt-3 flex items-center gap-3">
          <span className="inline-flex items-center gap-1">
            <span className="w-1.5 h-1.5 rounded-full bg-sand inline-block" /> due
          </span>
          <span className="inline-flex items-center gap-1">
            <span className="w-1.5 h-1.5 rounded-full border border-moss-light inline-block" /> upcoming
            recurrence (preview)
          </span>
          <span className="inline-flex items-center gap-1">
            <span className="w-3 h-3 rounded-full bg-moss inline-flex items-center justify-center text-[6px] text-foam font-bold">
              ✓
            </span>{' '}
            completed
          </span>
          <span className="inline-flex items-center gap-1">
            <span className="w-3 h-3 rounded-full bg-coral inline-flex items-center justify-center text-[6px] text-foam font-bold">
              ✕
            </span>{' '}
            failed
          </span>
        </p>
      </div>

      {/* Selected day agenda */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="font-display text-lg font-semibold">{selectedLabel}</h3>
          {!showAdd && (
            <button
              onClick={() => {
                setShowAdd(true);
                setEditingId(null);
              }}
              className="btn btn-secondary text-xs py-1.5 px-3"
            >
              + New reminder
            </button>
          )}
        </div>

        {showAdd && (
          <TaskForm
            defaultDueDate={selectedDate}
            onSave={(t) => {
              addScheduleTask(t);
              setShowAdd(false);
            }}
            onCancel={() => setShowAdd(false)}
          />
        )}

        {selectedOccurrences.length === 0 && !showAdd && (
          <div className="card border-dashed p-6 text-center">
            <p className="text-foam-dim text-sm">Nothing due this day.</p>
          </div>
        )}

        <ul className="space-y-2">
          {selectedOccurrences.map((occ) => {
            const task = occ.task;

            // A recurring task's own last completion, surfaced on the day
            // it actually happened — see occurrencesInRange's comment for
            // why this exists at all. Read-only, like the preview case
            // below: the real occurrence to act on is elsewhere now (its
            // dueDate already rolled forward), not this day.
            if (occ.kind === 'completed' || occ.kind === 'failed') {
              const isFail = occ.kind === 'failed';
              const next = effectiveDueDate(task, anchorDate);
              // A 'staysDue' task's fail doesn't roll next forward at
              // all — next is just its own still-current, still-overdue
              // dueDate, so "Next due" would read as nonsense here ("next
              // due 3d overdue" right next to the X that just caused it).
              // staysDue is only possible when the occurrence itself is
              // a fail, so this only ever hides the caption on that case.
              const staysDueFail = isFail && task.onMissedCycle === 'staysDue';
              return (
                <li key={`${task.id}-${occ.kind}`} className="card p-3 opacity-70">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className={isFail ? 'text-coral text-sm' : 'text-moss text-sm'}>
                      {isFail ? '✕' : '✓'}
                    </span>
                    <p className={`text-sm text-foam-dim ${isFail ? '' : 'line-through'}`}>{task.label}</p>
                    <span
                      className={`pill text-[11px] py-0.5 px-2 ${
                        isFail ? 'bg-coral/15 text-coral' : 'bg-moss/15 text-foam-dim'
                      }`}
                    >
                      {isFail ? 'marked failed this day' : 'done this day'}
                    </span>
                    {/* Only reachable here now, not on the 'actual' card below —
                        a recurring task's occurrence has already rolled forward
                        by the time this note would render, so this was
                        previously dead code there (see handleComplete: the
                        state update and this note land in the same render,
                        but by then the occurrence for `today` isn't `actual`
                        anymore, it's this 'completed' entry). Never shown for
                        a fail — failing didn't actually happen. */}
                    {!isFail && justLinked === task.id && (
                      <span className="text-[11px] text-moss-light">🔗 linked to today's log</span>
                    )}
                  </div>
                  {staysDueFail ? (
                    <p className="text-[11px] text-coral/80 mt-1.5">
                      Still due — marking it failed doesn't move this one on.
                    </p>
                  ) : (
                    next && (
                      <p className="text-[11px] text-foam-dim/50 mt-1.5">
                        Next due{' '}
                        {(() => {
                          const due = formatDue(next);
                          return due.tone === 'later'
                            ? parseIsoDate(next).toLocaleDateString()
                            : due.label.toLowerCase();
                        })()}
                        .
                      </p>
                    )
                  )}
                </li>
              );
            }

            // Projected future occurrence, not the task's actual current
            // dueDate — nothing to complete/edit/delete against this
            // specific date, since only the real occurrence carries state.
            if (occ.kind === 'preview') {
              return (
                <li
                  key={`${task.id}-preview`}
                  className="card border-dashed border-moss/25 p-3 opacity-80"
                >
                  <div className="flex items-center gap-2">
                    <span className="text-sand text-sm">↻</span>
                    <p className="text-sm text-foam-dim">{task.label}</p>
                    <span className="pill text-[11px] py-0.5 px-2 bg-moss/10 text-foam-dim/70">
                      upcoming · every {task.recurrenceDays}d
                    </span>
                  </div>
                  <p className="text-[11px] text-foam-dim/50 mt-1.5">
                    Preview only — becomes actionable once it's actually due, on{' '}
                    {(() => {
                      // The real, current occurrence's corrected date, not
                      // task.dueDate directly — this preview is a future
                      // instance beyond that one, and the caption is
                      // specifically about when the actionable one lands.
                      const actualDue = effectiveDueDate(task, anchorDate)!;
                      const due = formatDue(actualDue);
                      return due.tone === 'later' ? parseIsoDate(actualDue).toLocaleDateString() : due.label.toLowerCase();
                    })()}
                    {task.endDate ? ` (series ends ${parseIsoDate(task.endDate).toLocaleDateString()})` : ''}
                    .
                  </p>
                </li>
              );
            }

            if (editingId === task.id) {
              return (
                <li key={task.id}>
                  <TaskForm
                    initial={task}
                    onSave={(t) => {
                      updateScheduleTask(t);
                      setEditingId(null);
                    }}
                    onCancel={() => setEditingId(null)}
                  />
                </li>
              );
            }

            const due = formatDue(occ.date);
            const deleting = pendingDeleteId === task.id;
            const tracked = !!task.trackCompletionHistory && !!task.recurrenceDays;
            const missed = tracked ? missedCycleCount(task) : 0;

            return (
              <li key={task.id} className="card p-4">
                <div className="flex items-start gap-3">
                  {/* v2.5: a solid-moss rectangular button, not the
                      round amber-bordered circle used everywhere else on
                      this page — a deliberate new look for this update
                      rather than matching the older convention, so it
                      reads as one pair with the Fail button beside it. */}
                  <button
                    onClick={() => handleComplete(task)}
                    className="btn btn-secondary shrink-0 text-xs py-1.5 px-3"
                  >
                    ✓ Complete
                  </button>
                  {tracked && (
                    <button
                      onClick={() => handleFail(task)}
                      className="btn btn-outline-danger shrink-0 text-xs py-1.5 px-3"
                    >
                      ✕ Fail
                    </button>
                  )}

                  <div className="flex-1 min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="text-sm font-medium text-foam">{task.label}</p>
                      <span className={`pill text-[11px] py-0.5 px-2 ${TONE_CLASSES[due.tone]}`}>
                        {due.label}
                      </span>
                      {task.recurrenceDays && (
                        <span className="pill text-[11px] py-0.5 px-2 bg-moss/15 text-foam-dim">
                          ↻ every {task.recurrenceDays}d
                        </span>
                      )}
                      {missed > 1 && (
                        <span
                          title="Each Complete or Fail only resolves one cycle — click resolves the oldest first."
                          className="pill text-[11px] py-0.5 px-2 bg-amber/15 text-amber"
                        >
                          ⚠ {missed} missed cycles
                        </span>
                      )}
                      {task.endDate && (
                        <span className="pill text-[11px] py-0.5 px-2 bg-moss/15 text-foam-dim">
                          ⏱ ends {parseIsoDate(task.endDate).toLocaleDateString()}
                        </span>
                      )}
                      {/* justLinked's note used to be here, but this card is
                          the occurrence's *next* due date by the time a
                          completion has happened — see the 'completed'
                          branch above, where the note is actually reachable
                          for a recurring task. A completed one-off has no
                          equivalent occurrence card at all (see `finished`
                          below), so it still can't show this note anywhere;
                          flagged, not fixed here — out of this bug's scope. */}
                    </div>
                    {task.detail && (
                      <p className="text-xs text-foam-dim mt-1.5 leading-relaxed">{task.detail}</p>
                    )}
                    {task.lastCompletedDate && (
                      <p className="text-[11px] text-foam-dim/60 mt-1">
                        Last done {parseIsoDate(task.lastCompletedDate).toLocaleDateString()}
                      </p>
                    )}
                  </div>

                  <div className="flex items-center gap-1 shrink-0">
                    <button onClick={() => setEditingId(task.id)} className="btn-icon" aria-label="Edit">
                      ✎
                    </button>
                    <button
                      onClick={() => handleDeleteClick(task.id, () => deleteScheduleTask(task.id))}
                      className={`btn-icon danger ${deleting ? 'text-coral' : ''}`}
                      aria-label={deleting ? 'Confirm delete' : 'Delete'}
                    >
                      {deleting ? 'Confirm?' : '✕'}
                    </button>
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      </div>
      </div>{/* close main column */}

      <aside className="card p-4 space-y-3">
        <p className="field-label">All reminders</p>
        {active.length === 0 && <p className="text-xs text-foam-dim/60">Nothing scheduled yet.</p>}
        <ul className="space-y-1.5">
          {activeWithEffective
            .filter((x): x is { task: ScheduleTask; effective: string } => x.effective !== null)
            .sort((a, b) => a.effective.localeCompare(b.effective))
            .map(({ task, effective }) => {
              const due = formatDue(effective);
              return (
                <li key={task.id}>
                  <button
                    onClick={() => jumpTo(effective)}
                    className="w-full text-left rounded-md border border-moss/15 hover:border-moss/40 bg-deepwater-2/50 p-2 transition-colors"
                  >
                    <p className="text-xs text-foam truncate">{task.label}</p>
                    <div className="flex items-center gap-1 mt-1 flex-wrap">
                      <span className={`pill text-[10px] py-0.5 px-1.5 ${TONE_CLASSES[due.tone]}`}>
                        {due.label}
                      </span>
                      {task.recurrenceDays && (
                        <span className="pill text-[10px] py-0.5 px-1.5 bg-moss/15 text-foam-dim">
                          ↻ every {task.recurrenceDays}d
                        </span>
                      )}
                    </div>
                  </button>
                </li>
              );
            })}
        </ul>

        {needsNewDate.length > 0 && (
          <div className="pt-3 border-t border-amber/20 space-y-2">
            <p className="text-[11px] font-mono uppercase tracking-wide text-amber">
              ⚠ Needs a new date
            </p>
            {needsNewDate.map((task) => (
              <button
                key={task.id}
                onClick={() => jumpTo(task.dueDate)}
                className="w-full text-left rounded-md border border-amber/30 bg-amber/5 p-2 hover:border-amber/50 transition-colors"
              >
                <p className="text-xs text-foam truncate">{task.label}</p>
                <p className="text-[10px] text-amber/80 mt-0.5">
                  Dated before the tank's own start — tap to jump there and pick a real date.
                </p>
              </button>
            ))}
          </div>
        )}
      </aside>
      </div>{/* close grid */}

      {finished.length > 0 && (
        <div className="pt-4 border-t border-moss/15">
          <p className="field-label mb-2">Completed one-offs</p>
          <ul className="space-y-1.5">
            {finished.map((task) => (
              <li
                key={task.id}
                className="flex items-center justify-between text-xs text-foam-dim/70 px-1"
              >
                <div className="flex items-center gap-2 min-w-0">
                  <span className="line-through truncate">{task.label}</span>
                  {justLinked === task.id && (
                    <span className="text-moss-light shrink-0">🔗 linked to today's log</span>
                  )}
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  {task.lastCompletedDate && (
                    <span>{parseIsoDate(task.lastCompletedDate).toLocaleDateString()}</span>
                  )}
                  <button
                    onClick={() => handleDeleteClick(task.id, () => deleteScheduleTask(task.id))}
                    className="btn-icon danger"
                    aria-label="Delete"
                  >
                    {pendingDeleteId === task.id ? 'Confirm?' : '✕'}
                  </button>
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

function TaskForm({
  initial,
  defaultDueDate,
  onSave,
  onCancel,
}: {
  initial?: ScheduleTask;
  defaultDueDate?: string;
  onSave: (task: ScheduleTask) => void;
  onCancel: () => void;
}) {
  const isRecurring = initial?.recurrenceDays !== undefined;
  const matchingPreset = RECURRENCE_PRESETS.find((p) => p.days === (initial?.recurrenceDays ?? null));

  const [label, setLabel] = useState(initial?.label ?? '');
  const [detail, setDetail] = useState(initial?.detail ?? '');
  const [dueDate, setDueDate] = useState(initial?.dueDate ?? defaultDueDate ?? todayIso());
  const [endDate, setEndDate] = useState(initial?.endDate ?? '');
  const [presetLabel, setPresetLabel] = useState(
    matchingPreset?.label ?? (isRecurring ? 'Custom…' : 'One-off (no repeat)')
  );
  const [customDays, setCustomDays] = useState(
    isRecurring && !matchingPreset ? String(initial?.recurrenceDays) : ''
  );
  const [trackCompletionHistory, setTrackCompletionHistory] = useState(
    initial?.trackCompletionHistory ?? false
  );
  const [onMissedCycle, setOnMissedCycle] = useState<'moveOn' | 'staysDue'>(
    initial?.onMissedCycle ?? 'moveOn'
  );
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  const preset = RECURRENCE_PRESETS.find((p) => p.label === presetLabel)!;
  const recurrenceDays =
    preset.days === null ? undefined : preset.days === -1 ? Number(customDays) || undefined : preset.days;

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!label.trim() || !dueDate) return;
    if (recurrenceDays && endDate && endDate < dueDate) {
      setToastMessage("End date can't be before the next due date.");
      return;
    }
    onSave({
      id: initial?.id ?? crypto.randomUUID(),
      label: label.trim(),
      detail: detail.trim() || undefined,
      dueDate,
      recurrenceDays,
      // endDate only means anything for a recurring series — drop it if
      // the task isn't (or is no longer) recurring, so switching a task
      // back to one-off doesn't leave a dangling, meaningless end date.
      endDate: recurrenceDays && endDate ? endDate : undefined,
      done: initial?.done,
      lastCompletedDate: initial?.lastCompletedDate,
      // trackCompletionHistory/onMissedCycle only mean anything for a
      // recurring task — dropped alongside endDate above if the task
      // isn't (or is no longer) recurring, same reasoning. completionHistory
      // itself is never editable here; it's only ever written by
      // resolveScheduleTask, so it's simply carried forward untouched.
      trackCompletionHistory: recurrenceDays ? trackCompletionHistory : undefined,
      onMissedCycle: recurrenceDays && trackCompletionHistory ? onMissedCycle : undefined,
      completionHistory: initial?.completionHistory,
    });
  }

  return (
    <>
    <form onSubmit={submit} className="card border-amber/40 p-4 space-y-3">
      <div>
        <p className="field-label">Reminder</p>
        <input
          value={label}
          onChange={(e) => setLabel(e.target.value)}
          className="field"
          placeholder="e.g. Water change, Dose Bacter AE, Feed"
          required
        />
      </div>
      <div>
        <p className="field-label">Detail (optional)</p>
        <input
          value={detail}
          onChange={(e) => setDetail(e.target.value)}
          className="field"
          placeholder="Amounts, notes, anything worth remembering"
        />
      </div>
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="flex-1">
          <p className="field-label">{recurrenceDays ? 'Next due' : 'Due date'}</p>
          <input
            type="date"
            value={dueDate}
            onChange={(e) => setDueDate(e.target.value)}
            className="field"
            required
          />
        </div>
        <div className="flex-1">
          <p className="field-label">Repeats</p>
          <select value={presetLabel} onChange={(e) => setPresetLabel(e.target.value)} className="field">
            {RECURRENCE_PRESETS.map((p) => (
              <option key={p.label} value={p.label}>
                {p.label}
              </option>
            ))}
          </select>
        </div>
        {preset.days === -1 && (
          <div className="flex-1">
            <p className="field-label">Every N days</p>
            <input
              type="number"
              min={1}
              value={customDays}
              onChange={(e) => setCustomDays(e.target.value)}
              className="field"
              placeholder="e.g. 10"
              required
            />
          </div>
        )}
      </div>
      {recurrenceDays && (
        <div>
          <p className="field-label">Ends on (optional)</p>
          <input
            type="date"
            value={endDate}
            onChange={(e) => setEndDate(e.target.value)}
            min={dueDate}
            className="field sm:w-56"
          />
          <p className="text-[11px] text-foam-dim/60 mt-1">
            Leave blank to repeat indefinitely. Once set, the series retires itself the first
            time completing it would roll past this date.
          </p>
        </div>
      )}
      {recurrenceDays && (
        <div className="space-y-2 pt-1 border-t border-moss/15">
          <label className="flex items-center gap-2 pt-2">
            <input
              type="checkbox"
              checked={trackCompletionHistory}
              onChange={(e) => setTrackCompletionHistory(e.target.checked)}
              className="accent-amber"
            />
            <span className="text-sm text-foam">Track completion history</span>
          </label>
          <p className="text-[11px] text-foam-dim/60">
            Adds a Fail option alongside Complete, and marks each resolved occurrence with a
            check or an X on the calendar instead of just rolling the due date forward silently.
          </p>
          {trackCompletionHistory && (
            <div className="pt-1">
              <p className="field-label">When a cycle is missed</p>
              <select
                value={onMissedCycle}
                onChange={(e) => setOnMissedCycle(e.target.value as 'moveOn' | 'staysDue')}
                className="field sm:w-72"
              >
                <option value="moveOn">Move on — it can't be made up (e.g. daily misting)</option>
                <option value="staysDue">Stay due — keep it due until it's actually done (e.g. water change)</option>
              </select>
              <p className="text-[11px] text-foam-dim/60 mt-1">
                Only changes what Fail does. "Move on" rolls to the next cycle like Complete
                would; "Stay due" leaves the due date exactly where it is.
              </p>
            </div>
          )}
        </div>
      )}
      <div className="flex gap-2">
        <button type="submit" className="btn btn-secondary">
          {initial ? 'Save' : 'Add reminder'}
        </button>
        <button type="button" onClick={onCancel} className="btn btn-ghost">
          Cancel
        </button>
      </div>
    </form>
    <Toast message={toastMessage} onDismiss={() => setToastMessage(null)} />
    </>
  );
}