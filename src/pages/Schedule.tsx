import { useMemo, useState } from 'react';
import { useData } from '../lib/DataContext';
import { useConfirmDelete } from '../lib/useConfirmDelete';
import { todayIso, toIsoDate, parseIsoDate, addDays } from '../lib/date';
import type { ScheduleTask } from '../types';

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

function daysUntil(dateStr: string): number {
  const today = parseIsoDate(todayIso());
  const due = parseIsoDate(dateStr);
  return Math.round((due.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
}

function formatDue(dateStr: string): { label: string; tone: 'overdue' | 'today' | 'soon' | 'later' } {
  const diff = daysUntil(dateStr);
  if (diff < 0) return { label: `${Math.abs(diff)}d overdue`, tone: 'overdue' };
  if (diff === 0) return { label: 'Due today', tone: 'today' };
  if (diff <= 3) return { label: `In ${diff}d`, tone: 'soon' };
  return {
    label: parseIsoDate(dateStr).toLocaleDateString(undefined, { month: 'short', day: 'numeric' }),
    tone: 'later',
  };
}

const TONE_CLASSES: Record<string, string> = {
  overdue: 'bg-coral/20 text-coral',
  today: 'bg-amber/20 text-amber',
  soon: 'bg-sand/15 text-sand',
  later: 'bg-moss/15 text-foam-dim',
};

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
interface CalendarOccurrence {
  task: ScheduleTask;
  date: string;
  actual: boolean;
}

function occurrencesInRange(
  schedule: ScheduleTask[],
  rangeStart: string,
  rangeEnd: string
): CalendarOccurrence[] {
  const occurrences: CalendarOccurrence[] = [];
  for (const t of schedule) {
    if (t.done) continue;
    // A task's own endDate (if set) is a hard ceiling on top of the
    // calendar's visible range — never project past it, even if the
    // visible month extends further.
    const cap = t.endDate && t.endDate < rangeEnd ? t.endDate : rangeEnd;
    if (t.dueDate >= rangeStart && t.dueDate <= rangeEnd && (!t.endDate || t.dueDate <= t.endDate)) {
      occurrences.push({ task: t, date: t.dueDate, actual: true });
    }
    if (t.recurrenceDays) {
      let d = t.dueDate;
      while (true) {
        d = addDays(d, t.recurrenceDays);
        if (d > cap) break;
        if (d >= rangeStart) occurrences.push({ task: t, date: d, actual: false });
      }
    }
  }
  return occurrences;
}

export default function Schedule() {
  const { activeTank, addScheduleTask, updateScheduleTask, deleteScheduleTask, completeScheduleTask } =
    useData();
  const [editingId, setEditingId] = useState<string | null>(null);
  const [showAdd, setShowAdd] = useState(false);
  const [justLinked, setJustLinked] = useState<string | null>(null);
  const { pendingId: pendingDeleteId, handleClick: handleDeleteClick } = useConfirmDelete();

  const now = new Date();
  const [viewYear, setViewYear] = useState(now.getFullYear());
  const [viewMonth, setViewMonth] = useState(now.getMonth());
  const [selectedDate, setSelectedDate] = useState(todayIso());

  if (!activeTank) return null;
  const tank = activeTank;
  const { schedule } = tank;

  function handleComplete(task: ScheduleTask) {
    const today = todayIso();
    const hadMatchingLog = tank.logs.some((l) => toIsoDate(new Date(l.date)) === today);
    completeScheduleTask(task.id);
    if (hadMatchingLog) {
      setJustLinked(task.id);
      setTimeout(() => setJustLinked((cur) => (cur === task.id ? null : cur)), 3500);
    }
  }

  const active = schedule.filter((t) => !t.done);
  const finished = schedule.filter((t) => t.done);
  const overdue = active
    .filter((t) => daysUntil(t.dueDate) < 0)
    .sort((a, b) => a.dueDate.localeCompare(b.dueDate));

  const grid = useMemo(() => buildMonthGrid(viewYear, viewMonth), [viewYear, viewMonth]);
  const gridStart = toIsoDate(grid[0]);
  const gridEnd = toIsoDate(grid[41]);

  const occurrencesByDate = useMemo(() => {
    const map = new Map<string, CalendarOccurrence[]>();
    for (const occ of occurrencesInRange(active, gridStart, gridEnd)) {
      const list = map.get(occ.date) ?? [];
      list.push(occ);
      map.set(occ.date, list);
    }
    return map;
  }, [active, gridStart, gridEnd]);

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
    <div className="max-w-4xl mx-auto space-y-6">
      <div>
        <h2 className="font-display text-2xl font-semibold">Schedule</h2>
      </div>

      {overdue.length > 0 && (
        <div className="card border-coral/40 p-3 flex flex-wrap items-center gap-2">
          <span className="text-xs font-mono text-coral uppercase tracking-wide shrink-0">
            ⚠ Overdue
          </span>
          {overdue.map((t) => (
            <button
              key={t.id}
              onClick={() => jumpTo(t.dueDate)}
              className="pill text-[11px] py-1 px-2 bg-coral/15 text-coral hover:bg-coral/25 transition-colors"
            >
              {t.label} · {formatDue(t.dueDate).label}
            </button>
          ))}
        </div>
      )}

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
                className={`min-h-16 sm:min-h-20 rounded-md border p-1.5 text-left transition-colors flex flex-col gap-1 ${
                  isSelected
                    ? 'border-amber bg-amber/10'
                    : isToday
                    ? 'border-amber/50 bg-deepwater-2'
                    : 'border-moss/15 hover:border-moss/40 bg-deepwater-2/50'
                } ${!inMonth ? 'opacity-35' : ''}`}
              >
                <span
                  className={`text-xs font-mono ${isToday ? 'text-amber font-bold' : 'text-foam-dim'}`}
                >
                  {d.getDate()}
                </span>
                <div className="flex flex-wrap gap-0.5">
                  {shown.map((occ, i) => (
                    <span
                      key={`${occ.task.id}-${i}`}
                      className={
                        occ.actual
                          ? `w-1.5 h-1.5 rounded-full ${DOT_CLASSES[formatDue(occ.date).tone]}`
                          : 'w-1.5 h-1.5 rounded-full border border-moss-light bg-transparent'
                      }
                      title={occ.actual ? occ.task.label : `${occ.task.label} (upcoming)`}
                    />
                  ))}
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

            // Projected future occurrence, not the task's actual current
            // dueDate — nothing to complete/edit/delete against this
            // specific date, since only the real occurrence carries state.
            if (!occ.actual) {
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
                    {formatDue(task.dueDate).tone === 'later'
                      ? parseIsoDate(task.dueDate).toLocaleDateString()
                      : formatDue(task.dueDate).label.toLowerCase()}
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

            const due = formatDue(task.dueDate);
            const deleting = pendingDeleteId === task.id;

            return (
              <li key={task.id} className="card p-4">
                <div className="flex items-start gap-3">
                  <button
                    onClick={() => handleComplete(task)}
                    aria-label="Mark done"
                    className="mt-0.5 shrink-0 w-6 h-6 rounded-full border-2 border-amber flex items-center justify-center text-xs hover:bg-amber/20 transition-colors"
                  >
                    ✓
                  </button>

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
                      {task.endDate && (
                        <span className="pill text-[11px] py-0.5 px-2 bg-moss/15 text-foam-dim">
                          ⏱ ends {parseIsoDate(task.endDate).toLocaleDateString()}
                        </span>
                      )}
                      {justLinked === task.id && (
                        <span className="text-[11px] text-moss-light">🔗 linked to today's log</span>
                      )}
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

      {finished.length > 0 && (
        <div className="pt-4 border-t border-moss/15">
          <p className="field-label mb-2">Completed one-offs</p>
          <ul className="space-y-1.5">
            {finished.map((task) => (
              <li
                key={task.id}
                className="flex items-center justify-between text-xs text-foam-dim/70 px-1"
              >
                <span className="line-through">{task.label}</span>
                <div className="flex items-center gap-2">
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

  const preset = RECURRENCE_PRESETS.find((p) => p.label === presetLabel)!;
  const recurrenceDays =
    preset.days === null ? undefined : preset.days === -1 ? Number(customDays) || undefined : preset.days;

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!label.trim() || !dueDate) return;
    if (recurrenceDays && endDate && endDate < dueDate) {
      alert("End date can't be before the next due date.");
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
    });
  }

  return (
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
      <div className="flex gap-2">
        <button type="submit" className="btn btn-secondary">
          {initial ? 'Save' : 'Add reminder'}
        </button>
        <button type="button" onClick={onCancel} className="btn btn-ghost">
          Cancel
        </button>
      </div>
    </form>
  );
}
