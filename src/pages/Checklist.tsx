import { useState } from 'react';
import { useData } from '../lib/DataContext';
import { STATUS_ORDER, STATUS_LABELS, statusMeetsRequirement } from '../lib/constants';
import type { ChecklistTask, RosterLink, SourcingStatus } from '../types';

export default function Checklist() {
  const { activeTank, updateTank, toggleTask } = useData();
  if (!activeTank) return null;
  const tank = activeTank;
  const { checklist, roster } = tank;
  const [newLabel, setNewLabel] = useState('');
  const [newDetail, setNewDetail] = useState('');
  const [newDeps, setNewDeps] = useState<string[]>([]);
  const [newRosterLinks, setNewRosterLinks] = useState<RosterLink[]>([]);
  const [showAddDeps, setShowAddDeps] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);

  function rosterLinkSatisfied(link: RosterLink) {
    const item = roster.find((r) => r.id === link.rosterItemId);
    if (!item) return true; // item was deleted — don't block on something that no longer exists
    return statusMeetsRequirement(item.status, link.requiredStatus);
  }

  function isLocked(task: ChecklistTask) {
    if (task.done) return false;
    const depsOk = !task.dependsOn || task.dependsOn.every(
      (depId) => checklist.find((c) => c.id === depId)?.done
    );
    const rosterOk = !task.rosterLinks || task.rosterLinks.every(rosterLinkSatisfied);
    return !(depsOk && rosterOk);
  }

  function transitiveDeps(id: string, seen = new Set<string>()): Set<string> {
    const task = checklist.find((c) => c.id === id);
    if (!task?.dependsOn) return seen;
    for (const depId of task.dependsOn) {
      if (!seen.has(depId)) {
        seen.add(depId);
        transitiveDeps(depId, seen);
      }
    }
    return seen;
  }

  function wouldCreateCycle(taskId: string, candidateId: string): boolean {
    if (taskId === candidateId) return true;
    return transitiveDeps(candidateId).has(taskId);
  }

  function isOrderValid(list: ChecklistTask[]): boolean {
    const indexOf = new Map(list.map((t, i) => [t.id, i]));
    return list.every((t) =>
      (t.dependsOn ?? []).every((depId) => {
        const depIdx = indexOf.get(depId);
        const ownIdx = indexOf.get(t.id)!;
        return depIdx === undefined || depIdx < ownIdx;
      })
    );
  }

  function moveTask(id: string, direction: 'up' | 'down') {
    const idx = checklist.findIndex((c) => c.id === id);
    const swapWith = direction === 'up' ? idx - 1 : idx + 1;
    if (swapWith < 0 || swapWith >= checklist.length) return;

    const reordered = [...checklist];
    [reordered[idx], reordered[swapWith]] = [reordered[swapWith], reordered[idx]];

    if (!isOrderValid(reordered)) {
      alert(
        "Can't move a step ahead of something it depends on — remove that dependency first if you want to reorder it."
      );
      return;
    }
    updateTank({ ...tank, checklist: reordered });
  }

  function addTask(e: React.FormEvent) {
    e.preventDefault();
    if (!newLabel.trim()) return;
    const newTask: ChecklistTask = {
      id: crypto.randomUUID(),
      label: newLabel.trim(),
      detail: newDetail.trim() || undefined,
      done: false,
      dependsOn: newDeps.length ? newDeps : undefined,
      rosterLinks: newRosterLinks.length ? newRosterLinks : undefined,
    };
    updateTank({ ...tank, checklist: [...checklist, newTask] });
    setNewLabel('');
    setNewDetail('');
    setNewDeps([]);
    setNewRosterLinks([]);
    setShowAddDeps(false);
  }

  function removeTask(id: string) {
    updateTank({
      ...tank,
      checklist: checklist
        .filter((c) => c.id !== id)
        .map((c) => ({ ...c, dependsOn: c.dependsOn?.filter((d) => d !== id) })),
    });
  }

  function saveEdit(updated: ChecklistTask) {
    const nextList = checklist.map((c) => (c.id === updated.id ? updated : c));
    if (!isOrderValid(nextList)) {
      alert(
        "That dependency would put this step behind something later in the list. Move the step down first, or pick a different dependency."
      );
      return;
    }
    updateTank({ ...tank, checklist: nextList });
    setEditingId(null);
  }

  const doneCount = checklist.filter((c) => c.done).length;

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      <div>
        <h2 className="font-display text-2xl font-semibold">Build Checklist</h2>
        <p className="text-sm text-foam-dim mt-1">
          {doneCount} of {checklist.length} done. Steps can wait on other steps, or on a
          roster item reaching a status — like a step staying locked until its item shows
          "Arrived" on the Roster.
        </p>
      </div>

      <ol className="space-y-2">
        {checklist.map((task, i) => {
          const locked = isLocked(task);

          if (editingId === task.id) {
            return (
              <li key={task.id}>
                <EditForm
                  task={task}
                  allTasks={checklist}
                  roster={roster}
                  wouldCreateCycle={wouldCreateCycle}
                  onSave={saveEdit}
                  onCancel={() => setEditingId(null)}
                />
              </li>
            );
          }

          return (
            <li
              key={task.id}
              className={`card p-4 transition-colors ${
                locked ? 'opacity-50' : ''
              }`}
            >
              <div className="flex items-start gap-3">
                <button
                  onClick={() => !locked && toggleTask(task.id)}
                  disabled={locked}
                  aria-label={task.done ? 'Mark incomplete' : 'Mark complete'}
                  className={`mt-0.5 shrink-0 w-5 h-5 rounded-full border-2 flex items-center justify-center text-[10px] transition-colors ${
                    task.done
                      ? 'bg-moss border-moss text-foam'
                      : locked
                      ? 'border-foam-dim/30 cursor-not-allowed'
                      : 'border-amber cursor-pointer hover:bg-amber/20'
                  }`}
                >
                  {task.done ? '✓' : ''}
                </button>

                <div className="flex-1 min-w-0">
                  <p
                    className={`text-sm font-medium leading-snug ${
                      task.done ? 'line-through text-foam' : 'text-foam'
                    }`}
                  >
                    <span className="font-mono text-xs text-sand mr-2">
                      {String(i + 1).padStart(2, '0')}
                    </span>
                    {task.label}
                  </p>
                  {task.detail && (
                    <p className="text-xs text-foam-dim mt-1.5 leading-relaxed">
                      {task.detail}
                    </p>
                  )}
                  {(task.dependsOn?.length || task.rosterLinks?.length) ? (
                    <div className="flex flex-wrap gap-1.5 mt-2">
                      {task.dependsOn?.map((d) => {
                        const dep = checklist.find((c) => c.id === d);
                        const depDone = dep?.done;
                        return (
                          <span
                            key={d}
                            className={`pill text-[11px] py-1 px-2 ${
                              depDone
                                ? 'bg-moss/15 text-foam-dim/70'
                                : 'bg-coral/15 text-coral'
                            }`}
                          >
                            {dep?.label ?? '(removed step)'}
                          </span>
                        );
                      })}
                      {task.rosterLinks?.map((link, idx) => {
                        const item = roster.find((r) => r.id === link.rosterItemId);
                        const satisfied = rosterLinkSatisfied(link);
                        return (
                          <span
                            key={idx}
                            className={`pill text-[11px] py-1 px-2 ${
                              satisfied ? 'bg-moss/15 text-foam-dim/70' : 'bg-sand/15 text-sand'
                            }`}
                          >
                            📦 {item?.name ?? '(removed item)'} → {STATUS_LABELS[link.requiredStatus]}
                          </span>
                        );
                      })}
                    </div>
                  ) : null}
                </div>
              </div>

              <div className="flex items-center justify-between mt-3 pt-3 border-t border-moss/15">
                <div className="flex items-center gap-0.5 rounded-md border border-moss/20 overflow-hidden">
                  <button
                    onClick={() => moveTask(task.id, 'up')}
                    disabled={i === 0}
                    aria-label="Move step up"
                    className="btn-icon rounded-none"
                  >
                    ▲
                  </button>
                  <div className="w-px self-stretch bg-moss/20" />
                  <button
                    onClick={() => moveTask(task.id, 'down')}
                    disabled={i === checklist.length - 1}
                    aria-label="Move step down"
                    className="btn-icon rounded-none"
                  >
                    ▼
                  </button>
                </div>

                <div className="flex items-center gap-1">
                  <button onClick={() => setEditingId(task.id)} className="btn-icon">
                    Edit
                  </button>
                  <button
                    onClick={() => removeTask(task.id)}
                    className="btn-icon danger"
                  >
                    Remove
                  </button>
                </div>
              </div>
            </li>
          );
        })}
      </ol>

      <form onSubmit={addTask} className="card p-4 space-y-3">
        <p className="field-label">Add a custom step</p>
        <input
          value={newLabel}
          onChange={(e) => setNewLabel(e.target.value)}
          placeholder="Step name"
          className="field"
        />
        <input
          value={newDetail}
          onChange={(e) => setNewDetail(e.target.value)}
          placeholder="Detail (optional)"
          className="field"
        />

        <button
          type="button"
          onClick={() => setShowAddDeps((s) => !s)}
          className="text-xs text-amber hover:underline"
        >
          {showAddDeps
            ? 'Hide dependency picker'
            : `Lock this step behind other steps or roster items (${newDeps.length + newRosterLinks.length} selected)`}
        </button>

        {showAddDeps && (
          <div className="space-y-3">
            <div>
              <p className="text-[10px] text-foam-dim font-mono uppercase tracking-wide mb-1">
                Wait on these steps
              </p>
              <div className="max-h-32 overflow-y-auto border border-moss/20 rounded-md p-2 space-y-1">
                {checklist.map((c) => (
                  <label key={c.id} className="flex items-center gap-2 text-xs text-foam-dim">
                    <input
                      type="checkbox"
                      checked={newDeps.includes(c.id)}
                      onChange={(e) =>
                        setNewDeps((prev) =>
                          e.target.checked ? [...prev, c.id] : prev.filter((d) => d !== c.id)
                        )
                      }
                    />
                    {c.label}
                  </label>
                ))}
              </div>
            </div>
            <RosterLinkPicker
              roster={roster}
              links={newRosterLinks}
              onChange={setNewRosterLinks}
            />
          </div>
        )}

        <button type="submit" className="btn btn-secondary">
          Add step
        </button>
      </form>
    </div>
  );
}

function EditForm({
  task,
  allTasks,
  roster,
  wouldCreateCycle,
  onSave,
  onCancel,
}: {
  task: ChecklistTask;
  allTasks: ChecklistTask[];
  roster: import('../types').RosterItem[];
  wouldCreateCycle: (taskId: string, candidateId: string) => boolean;
  onSave: (t: ChecklistTask) => void;
  onCancel: () => void;
}) {
  const [label, setLabel] = useState(task.label);
  const [detail, setDetail] = useState(task.detail ?? '');
  const [deps, setDeps] = useState<string[]>(task.dependsOn ?? []);
  const [rosterLinks, setRosterLinks] = useState<RosterLink[]>(task.rosterLinks ?? []);

  function toggleDep(id: string) {
    setDeps((prev) => (prev.includes(id) ? prev.filter((d) => d !== id) : [...prev, id]));
  }

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!label.trim()) return;
    onSave({
      ...task,
      label: label.trim(),
      detail: detail.trim() || undefined,
      dependsOn: deps.length ? deps : undefined,
      rosterLinks: rosterLinks.length ? rosterLinks : undefined,
    });
  }

  return (
    <form onSubmit={submit} className="card border-amber/40 p-4 space-y-3">
      <input
        value={label}
        onChange={(e) => setLabel(e.target.value)}
        className="field font-medium"
        placeholder="Step name"
        required
      />
      <input
        value={detail}
        onChange={(e) => setDetail(e.target.value)}
        className="field"
        placeholder="Detail (optional)"
      />

      <div>
        <p className="field-label mb-1">Wait on these steps</p>
        <div className="max-h-32 overflow-y-auto border border-moss/20 rounded-md p-2 space-y-1">
          {allTasks
            .filter((c) => c.id !== task.id)
            .map((c) => {
              const blocked = wouldCreateCycle(task.id, c.id) && !deps.includes(c.id);
              return (
                <label
                  key={c.id}
                  className={`flex items-center gap-2 text-xs ${
                    blocked ? 'text-foam-dim/30 cursor-not-allowed' : 'text-foam-dim'
                  }`}
                >
                  <input
                    type="checkbox"
                    checked={deps.includes(c.id)}
                    disabled={blocked}
                    onChange={() => toggleDep(c.id)}
                  />
                  {c.label}
                  {blocked && ' (would create a loop)'}
                </label>
              );
            })}
        </div>
      </div>

      <RosterLinkPicker roster={roster} links={rosterLinks} onChange={setRosterLinks} />

      <div className="flex gap-2">
        <button type="submit" className="btn btn-secondary">
          Save
        </button>
        <button type="button" onClick={onCancel} className="btn btn-ghost">
          Cancel
        </button>
      </div>
    </form>
  );
}

function RosterLinkPicker({
  roster,
  links,
  onChange,
}: {
  roster: import('../types').RosterItem[];
  links: RosterLink[];
  onChange: (links: RosterLink[]) => void;
}) {
  const [pickItemId, setPickItemId] = useState(roster[0]?.id ?? '');
  const [pickStatus, setPickStatus] = useState<SourcingStatus>('arrived');

  function addLink() {
    if (!pickItemId) return;
    if (links.some((l) => l.rosterItemId === pickItemId)) return; // no dupes
    onChange([...links, { rosterItemId: pickItemId, requiredStatus: pickStatus }]);
  }

  function removeLink(rosterItemId: string) {
    onChange(links.filter((l) => l.rosterItemId !== rosterItemId));
  }

  return (
    <div>
      <p className="text-[10px] text-foam-dim font-mono uppercase tracking-wide mb-1">
        Wait on a roster item reaching a status
      </p>
      {links.length > 0 && (
        <div className="flex flex-wrap gap-1.5 mb-2">
          {links.map((l) => {
            const item = roster.find((r) => r.id === l.rosterItemId);
            return (
              <span
                key={l.rosterItemId}
                className="pill text-[11px] py-1 pl-2 pr-1 bg-sand/15 text-sand gap-1"
              >
                📦 {item?.name ?? '(removed item)'} → {STATUS_LABELS[l.requiredStatus]}
                <button
                  type="button"
                  onClick={() => removeLink(l.rosterItemId)}
                  className="hover:text-coral ml-1"
                  aria-label="Remove roster link"
                >
                  ✕
                </button>
              </span>
            );
          })}
        </div>
      )}
      {roster.length > 0 && (
        <div className="flex gap-2">
          <select
            value={pickItemId}
            onChange={(e) => setPickItemId(e.target.value)}
            className="field flex-1"
          >
            {roster.map((r) => (
              <option key={r.id} value={r.id}>
                {r.name}
              </option>
            ))}
          </select>
          <select
            value={pickStatus}
            onChange={(e) => setPickStatus(e.target.value as SourcingStatus)}
            className="field w-36"
          >
            {STATUS_ORDER.map((s) => (
              <option key={s} value={s}>
                {STATUS_LABELS[s]}
              </option>
            ))}
          </select>
          <button type="button" onClick={addLink} className="btn btn-ghost px-3">
            + Add
          </button>
        </div>
      )}
    </div>
  );
}
