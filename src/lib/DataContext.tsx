import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import type { AppData, Tank, RosterItem, LogEntry, CustomFieldDef, ScheduleTask, Milestone } from '../types';
import { loadData, saveData } from './storage';
import { todayIso, addDays, toIsoDate } from './date';
import { recomputeAutoMilestones } from './milestones';

interface DataContextValue {
  data: AppData;
  setData: (data: AppData) => void;
  activeTank: Tank | undefined;
  updateTank: (tank: Tank) => void;
  createTank: (tank: Tank) => void;
  deleteTank: (id: string) => void;
  setActiveTankId: (id: string) => void;
  setCustomFields: (fields: CustomFieldDef[]) => void;
  addRosterItem: (item: RosterItem) => void;
  updateRosterItem: (item: RosterItem) => void;
  deleteRosterItem: (id: string) => void;
  toggleTask: (id: string) => void;
  addLogEntry: (entry: LogEntry) => void;
  updateLogEntry: (entry: LogEntry) => void;
  deleteLogEntry: (id: string) => void;
  addScheduleTask: (task: ScheduleTask) => void;
  updateScheduleTask: (task: ScheduleTask) => void;
  deleteScheduleTask: (id: string) => void;
  completeScheduleTask: (id: string) => void;
  addMilestone: (milestone: Milestone) => void;
  updateMilestone: (milestone: Milestone) => void;
  deleteMilestone: (id: string) => void;
}

const DataContext = createContext<DataContextValue | null>(null);

export function DataProvider({ children }: { children: ReactNode }) {
  const [data, setDataState] = useState<AppData>(() => loadData());

  useEffect(() => {
    saveData(data);
  }, [data]);

  const activeTank = data.tanks.find((t) => t.id === data.activeTankId);

  function setData(next: AppData) {
    setDataState(next);
  }

  function updateTank(tank: Tank) {
    setDataState((prev) => ({
      ...prev,
      tanks: prev.tanks.map((t) => (t.id === tank.id ? tank : t)),
    }));
  }

  function createTank(tank: Tank) {
    setDataState((prev) => ({
      tanks: [...prev.tanks, tank],
      activeTankId: tank.id,
    }));
  }

  function deleteTank(id: string) {
    setDataState((prev) => {
      const remaining = prev.tanks.filter((t) => t.id !== id);
      const wasActive = prev.activeTankId === id;
      return {
        tanks: remaining,
        activeTankId: wasActive ? (remaining[0]?.id ?? '') : prev.activeTankId,
      };
    });
  }

  function setActiveTankId(id: string) {
    setDataState((prev) => ({ ...prev, activeTankId: id }));
  }

  // Guarded helpers below assume a tank is active — callers only render the UI
  // that uses them once a tank exists, so a missing activeTank is a no-op.

  function setCustomFields(fields: CustomFieldDef[]) {
    if (!activeTank) return;
    updateTank({ ...activeTank, customFields: fields });
  }

  function addRosterItem(item: RosterItem) {
    if (!activeTank) return;
    updateTank({ ...activeTank, roster: [...activeTank.roster, item] });
  }

  function updateRosterItem(item: RosterItem) {
    if (!activeTank) return;
    updateTank({
      ...activeTank,
      roster: activeTank.roster.map((r) => (r.id === item.id ? item : r)),
    });
  }

  function deleteRosterItem(id: string) {
    if (!activeTank) return;
    updateTank({ ...activeTank, roster: activeTank.roster.filter((r) => r.id !== id) });
  }

  function toggleTask(id: string) {
    if (!activeTank) return;
    updateTank({
      ...activeTank,
      checklist: activeTank.checklist.map((c) =>
        c.id === id ? { ...c, done: !c.done } : c
      ),
    });
  }

  // completeScheduleTask links forward (task completed -> today's log, if it
  // already exists). This covers the reverse order: log written AFTER a
  // task was already completed that same day. Any schedule task whose
  // lastCompletedDate matches this entry's calendar day, and isn't already
  // linked to some other log entry, gets attached here too — so linking
  // works regardless of which happens first.
  function addLogEntry(entry: LogEntry) {
    if (!activeTank) return;

    const entryDay = toIsoDate(new Date(entry.date));
    const alreadyLinkedIds = new Set(
      activeTank.logs.flatMap((l) => l.completedScheduleTaskIds ?? [])
    );
    const matchingTaskIds = activeTank.schedule
      .filter((t) => t.lastCompletedDate === entryDay && !alreadyLinkedIds.has(t.id))
      .map((t) => t.id);

    const finalEntry =
      matchingTaskIds.length > 0
        ? {
            ...entry,
            completedScheduleTaskIds: [...(entry.completedScheduleTaskIds ?? []), ...matchingTaskIds],
          }
        : entry;

    // 15c/15d: silent, no confirmation step — milestones are fully
    // recomputed from the tank's POST-save log state on every save
    // (add/update/delete), not appended incrementally. This is what
    // makes them reactive: deleting or editing the entry that triggered
    // one makes it disappear/update on the next save, rather than being
    // permanently stuck. See recomputeAutoMilestones' own comment for
    // exactly what's preserved (hand-edited title/description/major) vs.
    // recomputed fresh.
    const nextLogs = [finalEntry, ...activeTank.logs];
    updateTank({
      ...activeTank,
      logs: nextLogs,
      milestones: recomputeAutoMilestones({ ...activeTank, logs: nextLogs }),
    });
  }

  function updateLogEntry(entry: LogEntry) {
    if (!activeTank) return;
    const nextLogs = activeTank.logs.map((l) => (l.id === entry.id ? entry : l));
    updateTank({
      ...activeTank,
      logs: nextLogs,
      milestones: recomputeAutoMilestones({ ...activeTank, logs: nextLogs }),
    });
  }

  function deleteLogEntry(id: string) {
    if (!activeTank) return;
    const nextLogs = activeTank.logs.filter((l) => l.id !== id);
    updateTank({
      ...activeTank,
      logs: nextLogs,
      milestones: recomputeAutoMilestones({ ...activeTank, logs: nextLogs }),
    });
  }

  function addScheduleTask(task: ScheduleTask) {
    if (!activeTank) return;
    updateTank({ ...activeTank, schedule: [...activeTank.schedule, task] });
  }

  function updateScheduleTask(task: ScheduleTask) {
    if (!activeTank) return;
    updateTank({
      ...activeTank,
      schedule: activeTank.schedule.map((t) => (t.id === task.id ? task : t)),
    });
  }

  function deleteScheduleTask(id: string) {
    if (!activeTank) return;
    updateTank({ ...activeTank, schedule: activeTank.schedule.filter((t) => t.id !== id) });
  }

  // Manual milestone CRUD — for Timeline's "+ Add milestone" and its
  // edit/delete affordances. Distinct from the auto-creation in
  // addLogEntry/updateLogEntry above: those are silent and system-
  // generated (phase-change, roster-addition); these are the ones a
  // person actually types in themselves (health-event, custom, or a
  // manually-recorded phase-change/roster-addition with no linked entry
  // at all — e.g. "ordered the founding shrimp" before anything's
  // arrived to tag a log entry with).
  function addMilestone(milestone: Milestone) {
    if (!activeTank) return;
    updateTank({ ...activeTank, milestones: [...activeTank.milestones, milestone] });
  }

  function updateMilestone(milestone: Milestone) {
    if (!activeTank) return;
    updateTank({
      ...activeTank,
      milestones: activeTank.milestones.map((m) => (m.id === milestone.id ? milestone : m)),
    });
  }

  function deleteMilestone(id: string) {
    if (!activeTank) return;
    updateTank({ ...activeTank, milestones: activeTank.milestones.filter((m) => m.id !== id) });
  }

  // Marking a task done: recurring tasks roll dueDate forward by
  // recurrenceDays — critically, stepping forward from the task's OWN
  // current dueDate each time, not from "today". Advancing from today was
  // the original approach, but it meant completing the same task twice on
  // the same real-world day always recomputed the identical target date —
  // so a second completion looked like it did nothing, and the task
  // appeared permanently stuck once its due date happened to land on
  // today. Stepping from the task's own dueDate instead guarantees every
  // completion moves it forward, and the catch-up loop below still lands
  // on the next actually-upcoming occurrence if it had fallen badly
  // overdue, rather than requiring one click per missed interval. If the
  // task has an optional endDate and the next occurrence would land past
  // it, the series retires (done: true) instead of continuing forever.
  // One-off tasks just get marked done. Either way, if — and only if — a
  // log entry already exists for today, this task's id is attached to it
  // so the log shows what maintenance happened that day. No matching log
  // entry means no log entry gets created; the schedule update still
  // happens on its own.
  function completeScheduleTask(id: string) {
    if (!activeTank) return;
    const task = activeTank.schedule.find((t) => t.id === id);
    if (!task) return;

    const today = todayIso();

    const schedule = activeTank.schedule.map((t) => {
      if (t.id !== id) return t;
      if (t.recurrenceDays) {
        let next = t.dueDate;
        do {
          next = addDays(next, t.recurrenceDays);
        } while (next < today);
        // Rolling forward would push past the series' own end date — treat
        // this completion as the last one instead of producing a dueDate
        // beyond the boundary the user set.
        if (t.endDate && next > t.endDate) {
          return { ...t, done: true, lastCompletedDate: today };
        }
        return { ...t, dueDate: next, lastCompletedDate: today };
      }
      return { ...t, done: true, lastCompletedDate: today };
    });

    // l.date is a full timestamp (new Date().toISOString()), so it's
    // converted to its own local calendar day rather than sliced as a UTC
    // string — otherwise a log made late in the evening could compare as
    // "yesterday" against today's local date and silently fail to link.
    const matchingLog = activeTank.logs.find((l) => toIsoDate(new Date(l.date)) === today);
    const logs = matchingLog
      ? activeTank.logs.map((l) =>
          l.id === matchingLog.id
            ? {
                ...l,
                completedScheduleTaskIds: [...(l.completedScheduleTaskIds ?? []), id],
              }
            : l
        )
      : activeTank.logs;

    updateTank({ ...activeTank, schedule, logs });
  }

  return (
    <DataContext.Provider
      value={{
        data,
        setData,
        activeTank,
        updateTank,
        createTank,
        deleteTank,
        setActiveTankId,
        setCustomFields,
        addRosterItem,
        updateRosterItem,
        deleteRosterItem,
        toggleTask,
        addLogEntry,
        updateLogEntry,
        deleteLogEntry,
        addScheduleTask,
        updateScheduleTask,
        deleteScheduleTask,
        completeScheduleTask,
        addMilestone,
        updateMilestone,
        deleteMilestone,
      }}
    >
      {children}
    </DataContext.Provider>
  );
}

export function useData() {
  const ctx = useContext(DataContext);
  if (!ctx) throw new Error('useData must be used within DataProvider');
  return ctx;
}