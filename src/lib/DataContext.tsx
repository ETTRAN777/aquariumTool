import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import type { AppData, Tank, RosterItem, LogEntry, CustomFieldDef } from '../types';
import { loadData, saveData } from './storage';

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

  function addLogEntry(entry: LogEntry) {
    if (!activeTank) return;
    updateTank({ ...activeTank, logs: [entry, ...activeTank.logs] });
  }

  function updateLogEntry(entry: LogEntry) {
    if (!activeTank) return;
    updateTank({
      ...activeTank,
      logs: activeTank.logs.map((l) => (l.id === entry.id ? entry : l)),
    });
  }

  function deleteLogEntry(id: string) {
    if (!activeTank) return;
    updateTank({ ...activeTank, logs: activeTank.logs.filter((l) => l.id !== id) });
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
