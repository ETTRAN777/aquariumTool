import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import type {
  AppData,
  Tank,
  RosterItem,
  RosterLink,
  LogEntry,
  CustomFieldDef,
  ScheduleTask,
  Milestone,
  SourcingStatus,
} from '../types';
import { loadData, saveData, migrateInlinePhotosToIndexedDb, type SaveFailureReason } from './storage';
import { deletePhotos } from './photoStore';
import { collectPhotoRefIds, droppedPhotoIds } from './photoRefs';
import { todayIso, addDays, toIsoDate } from './date';
import { recomputeAutoMilestones } from './milestones';
import { STATUS_ORDER } from './constants';

// 3i — the Log ↔ Roster sync question, settled: one-way, forward-only,
// no retroactive effect. A log entry's 📦 roster link (RosterLink,
// {rosterItemId, requiredStatus}) asserts "this item reached at least
// this status by now." If requiredStatus outranks the item's CURRENT
// RosterItem.status in STATUS_ORDER, the roster item advances to match —
// in the same save as the log entry, not a separate recompute pass.
// Equal-or-behind is a silent no-op, never a downgrade: a direct
// Roster-page edit always keeps the last word going backward, which is
// what makes two independent writers to RosterItem.status safe instead
// of a fight over who's right. Index comparison (not a strict required-
// sequence) is deliberate too — a log entry can legitimately assert a
// status several steps ahead of the item's current one (bought in
// person, straight into the tank the same day: wishlist -> acclimating,
// skipping ordered AND arrived in one write) and that's exactly as valid
// as a single-step advance. Never mutates its arguments.
function syncRosterStatusForward(
  roster: RosterItem[],
  links: RosterLink[] | undefined
): { roster: RosterItem[]; changes: { itemName: string; status: SourcingStatus }[] } {
  if (!links || links.length === 0) return { roster, changes: [] };
  const changes: { itemName: string; status: SourcingStatus }[] = [];
  const nextRoster = roster.map((item) => {
    const link = links.find((l) => l.rosterItemId === item.id);
    if (!link) return item;
    if (STATUS_ORDER.indexOf(link.requiredStatus) <= STATUS_ORDER.indexOf(item.status)) return item;
    changes.push({ itemName: item.name, status: link.requiredStatus });
    return { ...item, status: link.requiredStatus };
  });
  return { roster: nextRoster, changes };
}

interface DataContextValue {
  data: AppData;
  setData: (data: AppData) => void;
  // Non-null while the most recent attempt to persist to localStorage has
  // failed — clears itself the next time a save succeeds (e.g. after the
  // person frees up space), so the warning never outlives the problem.
  // Only ever reaches this state once the automatic recovery below has
  // already been tried and genuinely couldn't fix it on its own.
  saveFailure: SaveFailureReason | null;
  // Set briefly after a quota failure gets fixed automatically (see the
  // save effect) — Layout surfaces this as a transient, no-action-needed
  // toast. Null the rest of the time, including while nothing has gone
  // wrong at all.
  autoFreedStorage: { migratedCount: number; bytesFreed: number } | null;
  // Call once the person has seen/dismissed the auto-freed-storage toast —
  // without this, Layout has no correct way to tell "already shown" from
  // "a new event with the same photo count," since the count alone isn't
  // a reliable identity for the event.
  clearAutoFreedStorage: () => void;
  // Set briefly whenever saving a log entry pushes one or more roster
  // items' sourcing status forward (see syncRosterStatusForward above) —
  // Layout surfaces this as a transient, no-action-needed toast, same
  // pattern as autoFreedStorage. Null the rest of the time, including
  // while a log entry's roster links don't advance anything (already
  // caught up, or no links at all).
  rosterStatusSync: { itemName: string; status: SourcingStatus }[] | null;
  clearRosterStatusSync: () => void;
  activeTank: Tank | undefined;
  updateTank: (tankOrUpdater: Tank | ((prev: Tank) => Tank)) => void;
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
  failScheduleTask: (id: string) => void;
  addMilestone: (milestone: Milestone) => void;
  updateMilestone: (milestone: Milestone) => void;
  deleteMilestone: (id: string) => void;
}

const DataContext = createContext<DataContextValue | null>(null);

export function DataProvider({ children }: { children: ReactNode }) {
  const [data, setDataState] = useState<AppData>(() => loadData());

  const [saveFailure, setSaveFailure] = useState<SaveFailureReason | null>(null);
  const [autoFreedStorage, setAutoFreedStorage] = useState<
    { migratedCount: number; bytesFreed: number } | null
  >(null);
  const [rosterStatusSync, setRosterStatusSync] = useState<
    { itemName: string; status: SourcingStatus }[] | null
  >(null);
  function clearRosterStatusSync() {
    setRosterStatusSync(null);
  }

  // The photo references the last SUCCESSFULLY SAVED data held. Once a save
  // lands, any reference that was in the previous saved data and isn't in
  // this one is unreachable, so its Blob gets deleted. Keyed to saved data,
  // not to in-memory state: if a save fails, the stored copy still points
  // at the old photos, and deleting them then would leave a reload with
  // dangling references.
  const savedPhotoIds = useRef<Set<string> | null>(null);

  useEffect(() => {
    // A full quota almost always means photos — they're the one thing in
    // this app's data that gets genuinely large — and moving them to
    // IndexedDB is a mechanical fix with no real judgment call in it, not
    // something to make the person diagnose and click a button for. This
    // is deliberately narrower than the Settings "Free up local storage"
    // button it reuses: it only ever fires in response to an actual
    // failure, and only for 'quota' specifically — 'unavailable' means
    // storage is blocked outright (e.g. some private-browsing modes),
    // which moving data to a DIFFERENT storage API can't fix, so that
    // case is left exactly as it already was, no migration attempted.
    let cancelled = false;
    (async () => {
      const result = saveData(data);
      if (result.ok) {
        const current = collectPhotoRefIds(data);
        const previous = savedPhotoIds.current;
        savedPhotoIds.current = current;
        if (previous) {
          const dropped = droppedPhotoIds(previous, current);
          if (dropped.length > 0) void deletePhotos(dropped).catch(() => {});
        }
        if (!cancelled) setSaveFailure(null);
        return;
      }
      if (result.reason === 'quota') {
        const referencedBefore = collectPhotoRefIds(data);
        const migration = await migrateInlinePhotosToIndexedDb(data);
        if (cancelled) {
          // The migration already wrote its Blobs, but this run's result is
          // being thrown away (the data changed underneath it, or React ran
          // the effect twice), so nothing will ever reference them.
          const created = droppedPhotoIds(collectPhotoRefIds(migration.data), referencedBefore);
          if (created.length > 0) void deletePhotos(created).catch(() => {});
          return;
        }
        if (migration.migratedCount > 0) {
          setAutoFreedStorage({
            migratedCount: migration.migratedCount,
            bytesFreed: migration.bytesFreed,
          });
          // Deliberately not a second saveData() call here: committing the
          // migrated data to state re-triggers this very effect, and that
          // next run's own saveData() is the real, authoritative retry —
          // its outcome (not an assumption that migrating necessarily
          // fixed it) is what actually decides whether saveFailure clears.
          setDataState(migration.data);
          return;
        }
      }
      if (!cancelled) setSaveFailure(result.reason);
    })();
    return () => {
      cancelled = true;
    };
  }, [data]);

  const activeTank = data.tanks.find((t) => t.id === data.activeTankId);

  function setData(next: AppData) {
    setDataState(next);
  }

  // Accepts either a full replacement Tank (fine for a single, deliberate
  // action that already holds fresh state — e.g. a form's one "Save"
  // click) or an updater function resolved against the LATEST tank state
  // at the moment this update actually applies. The updater form is what
  // makes rapid, back-to-back updates safe — e.g. starring several
  // roster items in quick succession, or clicking a checklist reorder
  // arrow repeatedly. Every function below that mutates the active tank
  // uses the updater form: each call resolves against whatever the
  // previous call already committed, rather than a snapshot
  // (activeTank, captured once per render) that can already be stale by
  // the time a later call in the same rapid sequence actually runs.
  // Building a whole next-Tank object from a stale snapshot and handing
  // it to setState is real data loss, not a display glitch — confirmed
  // exactly this way: starring multiple roster items quickly silently
  // dropped some of them, because each click's updateRosterItem call
  // captured whatever activeTank was at THAT render, and a later click's
  // update — built from an earlier, still-stale snapshot — overwrote the
  // whole tank and discarded the earlier click's change along with it.
  function updateTank(tankOrUpdater: Tank | ((prev: Tank) => Tank)) {
    setDataState((prev) => {
      if (typeof tankOrUpdater === 'function') {
        const current = prev.tanks.find((t) => t.id === prev.activeTankId);
        if (!current) return prev;
        const next = tankOrUpdater(current);
        return { ...prev, tanks: prev.tanks.map((t) => (t.id === next.id ? next : t)) };
      }
      return { ...prev, tanks: prev.tanks.map((t) => (t.id === tankOrUpdater.id ? tankOrUpdater : t)) };
    });
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
    updateTank((tank) => ({ ...tank, customFields: fields }));
  }

  function addRosterItem(item: RosterItem) {
    if (!activeTank) return;
    updateTank((tank) => ({ ...tank, roster: [...tank.roster, item] }));
  }

  function updateRosterItem(item: RosterItem) {
    if (!activeTank) return;
    updateTank((tank) => ({
      ...tank,
      roster: tank.roster.map((r) => (r.id === item.id ? item : r)),
    }));
  }

  function deleteRosterItem(id: string) {
    if (!activeTank) return;
    updateTank((tank) => ({ ...tank, roster: tank.roster.filter((r) => r.id !== id) }));
  }

  function toggleTask(id: string) {
    if (!activeTank) return;
    updateTank((tank) => ({
      ...tank,
      checklist: tank.checklist.map((c) => (c.id === id ? { ...c, done: !c.done } : c)),
    }));
  }

  // completeScheduleTask links forward (task completed -> today's log, if it
  // already exists). This covers the reverse order: log written AFTER a
  // task was already completed that same day. Any schedule task whose
  // lastCompletedDate matches this entry's calendar day, and isn't already
  // linked to some other log entry, gets attached here too — so linking
  // works regardless of which happens first.
  function addLogEntry(entry: LogEntry) {
    if (!activeTank) return;
    // Populated inside the updater below, read once it returns — see
    // syncRosterStatusForward's own comment for why this is forward-only
    // and index-based rather than a strict step-by-step sequence.
    let syncChanges: { itemName: string; status: SourcingStatus }[] = [];
    updateTank((tank) => {
      const entryDay = toIsoDate(new Date(entry.date));
      const alreadyLinkedIds = new Set(tank.logs.flatMap((l) => l.completedScheduleTaskIds ?? []));
      const matchingTaskIds = tank.schedule
        .filter((t) => t.lastCompletedDate === entryDay && !alreadyLinkedIds.has(t.id))
        .map((t) => t.id);

      const finalEntry =
        matchingTaskIds.length > 0
          ? {
              ...entry,
              completedScheduleTaskIds: [...(entry.completedScheduleTaskIds ?? []), ...matchingTaskIds],
            }
          : entry;

      const { roster: nextRoster, changes } = syncRosterStatusForward(tank.roster, finalEntry.additions);
      syncChanges = changes;

      // 15c/15d: silent, no confirmation step — milestones are fully
      // recomputed from the tank's POST-save log state on every save
      // (add/update/delete), not appended incrementally. This is what
      // makes them reactive: deleting or editing the entry that
      // triggered one makes it disappear/update on the next save,
      // rather than being permanently stuck. See recomputeAutoMilestones'
      // own comment for exactly what's preserved (hand-edited title/
      // description/major) vs. recomputed fresh.
      //
      // Re-sorted by date, newest first, not just prepended — before 3i's
      // backdating, every new entry WAS "now," so prepending and sorting
      // newest-first always agreed and nothing needed an explicit sort.
      // A backdated entry breaks that: it can land chronologically before
      // entries already in the array. Two real consumers silently trust
      // "array order already is newest-first" rather than sorting
      // themselves — this page's own list rendering (Log.tsx, plain
      // array order, no sort) and Charts.tsx's `[...logs].reverse()`
      // "chronological order" trick — so the invariant has to be upheld
      // here, once, rather than fixed in every place that assumed it.
      const nextLogs = [finalEntry, ...tank.logs].sort((a, b) => b.date.localeCompare(a.date));
      return {
        ...tank,
        roster: nextRoster,
        logs: nextLogs,
        milestones: recomputeAutoMilestones({ ...tank, logs: nextLogs }),
      };
    });
    if (syncChanges.length > 0) setRosterStatusSync(syncChanges);
  }

  function updateLogEntry(entry: LogEntry) {
    if (!activeTank) return;
    let syncChanges: { itemName: string; status: SourcingStatus }[] = [];
    updateTank((tank) => {
      const { roster: nextRoster, changes } = syncRosterStatusForward(tank.roster, entry.additions);
      syncChanges = changes;
      // Same re-sort as addLogEntry, same reason — editing an entry's
      // date (3l) can move it past its neighbors, and a plain in-place
      // replace wouldn't reflect that in array order.
      const nextLogs = tank.logs
        .map((l) => (l.id === entry.id ? entry : l))
        .sort((a, b) => b.date.localeCompare(a.date));
      return {
        ...tank,
        roster: nextRoster,
        logs: nextLogs,
        milestones: recomputeAutoMilestones({ ...tank, logs: nextLogs }),
      };
    });
    if (syncChanges.length > 0) setRosterStatusSync(syncChanges);
  }

  // Deliberately does NOT touch roster status — the ratchet only ever
  // pushes forward on save (see syncRosterStatusForward); deleting (or,
  // above, editing away) the entry that pushed it has zero retroactive
  // effect, same precedent as item 9's completion history. If a status
  // genuinely needs to come back down, that's a manual Roster-page edit.
  function deleteLogEntry(id: string) {
    if (!activeTank) return;
    updateTank((tank) => {
      const nextLogs = tank.logs.filter((l) => l.id !== id);
      return {
        ...tank,
        logs: nextLogs,
        milestones: recomputeAutoMilestones({ ...tank, logs: nextLogs }),
      };
    });
  }

  function addScheduleTask(task: ScheduleTask) {
    if (!activeTank) return;
    updateTank((tank) => ({ ...tank, schedule: [...tank.schedule, task] }));
  }

  function updateScheduleTask(task: ScheduleTask) {
    if (!activeTank) return;
    updateTank((tank) => ({
      ...tank,
      schedule: tank.schedule.map((t) => (t.id === task.id ? task : t)),
    }));
  }

  function deleteScheduleTask(id: string) {
    if (!activeTank) return;
    updateTank((tank) => ({ ...tank, schedule: tank.schedule.filter((t) => t.id !== id) }));
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
    updateTank((tank) => ({ ...tank, milestones: [...tank.milestones, milestone] }));
  }

  function updateMilestone(milestone: Milestone) {
    if (!activeTank) return;
    updateTank((tank) => ({
      ...tank,
      milestones: tank.milestones.map((m) => (m.id === milestone.id ? milestone : m)),
    }));
  }

  function deleteMilestone(id: string) {
    if (!activeTank) return;
    updateTank((tank) => ({ ...tank, milestones: tank.milestones.filter((m) => m.id !== id) }));
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
  // Shared by completeScheduleTask and failScheduleTask below — Complete
  // and Fail differ only in `outcome` and in what Fail does to dueDate
  // for a 'staysDue' tracked task, so the dueDate-advancing, endDate-
  // retirement, and log-linking logic stays in one place rather than two
  // near-identical copies that could drift.
  //
  // An untracked task keeps the exact old behavior: fallen behind, it
  // jumps straight to the first occurrence on/after today, silently,
  // with nothing recorded. A tracked task instead resolves exactly ONE
  // cycle per call — however many cycles are actually overdue, each
  // click (Complete or Fail) only ever advances past the single oldest
  // one, appending a completionHistory entry for it. That's deliberate,
  // not a missing feature: it's what turns "fell behind by 3 cycles"
  // into 3 individually-resolvable prompts (one per click, oldest first)
  // instead of one click silently absorbing all three — see
  // missedCycleCount in lib/schedule.ts for the badge that counts them.
  //
  // 'staysDue' (only meaningful on Fail, for a tracked recurring task)
  // deliberately does NOT advance dueDate at all: the task stays due
  // exactly where it was, because for a task like a water change, a
  // missed cycle is a problem that should get made up, not a cycle to
  // move past. 'moveOn' (the default, used by Complete always and by
  // Fail unless onMissedCycle is 'staysDue') rolls forward one cycle
  // normally — for a task like daily misting, a missed day genuinely
  // can't be made up, so there's nothing to stay due about.
  function resolveScheduleTask(id: string, outcome: 'completed' | 'failed') {
    if (!activeTank) return;
    updateTank((tank) => {
      const task = tank.schedule.find((t) => t.id === id);
      if (!task) return tank;

      const today = todayIso();

      const schedule = tank.schedule.map((t) => {
        if (t.id !== id) return t;

        if (!t.recurrenceDays) {
          // One-off: Fail has no later cycle to move on to or stay due
          // against, so it's a no-op (the UI doesn't offer it for
          // one-off tasks in the first place — see Schedule.tsx).
          if (outcome === 'failed') return t;
          return { ...t, done: true, lastCompletedDate: today };
        }

        const tracked = !!t.trackCompletionHistory;
        const resolvedDate = t.dueDate;
        const completionHistory = tracked
          ? [...(t.completionHistory ?? []), { date: resolvedDate, outcome }]
          : t.completionHistory;

        const staysDue = tracked && outcome === 'failed' && t.onMissedCycle === 'staysDue';
        if (staysDue) {
          return { ...t, completionHistory };
        }

        let next = resolvedDate;
        if (tracked) {
          // Resolve exactly this one cycle, regardless of how far behind
          // the task has fallen — see the function comment above.
          next = addDays(resolvedDate, t.recurrenceDays);
        } else {
          do {
            next = addDays(next, t.recurrenceDays);
          } while (next < today);
        }

        // Rolling forward would push past the series' own end date —
        // treat this resolution as the last one instead of producing a
        // dueDate beyond the boundary the user set.
        if (t.endDate && next > t.endDate) {
          return outcome === 'completed'
            ? { ...t, done: true, lastCompletedDate: today, completionHistory }
            : { ...t, done: true, completionHistory };
        }
        return outcome === 'completed'
          ? { ...t, dueDate: next, lastCompletedDate: today, completionHistory }
          : { ...t, dueDate: next, completionHistory };
      });

      // l.date is a full timestamp (new Date().toISOString()), so it's
      // converted to its own local calendar day rather than sliced as a
      // UTC string — otherwise a log made late in the evening could
      // compare as "yesterday" against today's local date and silently
      // fail to link. Only a real Complete links to today's log — a Fail
      // didn't actually happen, so there's nothing to attach.
      const matchingLog = tank.logs.find((l) => toIsoDate(new Date(l.date)) === today);
      const logs =
        outcome === 'completed' && matchingLog
          ? tank.logs.map((l) =>
              l.id === matchingLog.id
                ? { ...l, completedScheduleTaskIds: [...(l.completedScheduleTaskIds ?? []), id] }
                : l
            )
          : tank.logs;

      return { ...tank, schedule, logs };
    });
  }

  function completeScheduleTask(id: string) {
    resolveScheduleTask(id, 'completed');
  }

  function failScheduleTask(id: string) {
    resolveScheduleTask(id, 'failed');
  }

  return (
    <DataContext.Provider
      value={{
        data,
        setData,
        saveFailure,
        autoFreedStorage,
        clearAutoFreedStorage: () => setAutoFreedStorage(null),
        rosterStatusSync,
        clearRosterStatusSync,
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
        failScheduleTask,
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