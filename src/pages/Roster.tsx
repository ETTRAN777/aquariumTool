import { useEffect, useState } from 'react';
import { useData } from '../lib/DataContext';
import { useConfirmDelete } from '../lib/useConfirmDelete';
import { STATUS_ORDER, STATUS_LABELS, CATEGORY_LABELS, statusMeetsRequirement } from '../lib/constants';
import type { RosterItem, SourcingStatus, Tank } from '../types';
import AutoResizeTextarea from '../components/AutoResizeTextarea';
import {
  sortByGroup,
  sectionsByGroup,
  addGroup,
  renameGroup,
  deleteGroup,
  moveGroup,
  assignItemToGroup,
  MAX_GROUP_NAME_LENGTH,
  type GroupResult,
} from '../lib/rosterGroups';

type SortMode = 'default' | 'category' | 'status';

export default function Roster() {
  const { activeTank, addRosterItem, updateRosterItem, deleteRosterItem, updateTank } = useData();
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [filter, setFilter] = useState<RosterItem['category'] | 'all'>('all');
  const [sortMode, setSortMode] = useState<SortMode>('default');
  const { pendingId: pendingDeleteId, handleClick: handleDeleteClick } = useConfirmDelete();
  // Roster groups (lib/rosterGroups.ts) — only the Default view uses them.
  const [addingGroup, setAddingGroup] = useState(false);
  const [newGroupName, setNewGroupName] = useState('');
  const [renamingGroup, setRenamingGroup] = useState<string | null>(null);
  const [renameDraft, setRenameDraft] = useState('');
  const [groupError, setGroupError] = useState<string | null>(null);
  const [dragId, setDragId] = useState<string | null>(null);
  // Which section is being dragged over: a group name, or '' for ungrouped.
  const [dragOver, setDragOver] = useState<string | null>(null);

  // Browsers barely auto-scroll while a card is being dragged, so a group
  // further than one screen away was unreachable. While dragging, scroll the
  // page ourselves whenever the pointer is near the top or bottom edge.
  useEffect(() => {
    if (dragId === null) return;
    const EDGE = 100; // px from the viewport edge where scrolling starts
    const MAX_SPEED = 24; // px per frame, reached right at the edge
    let pointerY: number | null = null;
    let frame = 0;
    const onDragOver = (e: DragEvent) => {
      pointerY = e.clientY;
    };
    const tick = () => {
      if (pointerY !== null) {
        const fromBottom = window.innerHeight - pointerY;
        let speed = 0;
        if (pointerY < EDGE) speed = -MAX_SPEED * Math.min(1, (EDGE - pointerY) / EDGE);
        else if (fromBottom < EDGE) speed = MAX_SPEED * Math.min(1, (EDGE - fromBottom) / EDGE);
        if (speed !== 0) window.scrollBy(0, speed);
      }
      frame = requestAnimationFrame(tick);
    };
    document.addEventListener('dragover', onDragOver);
    frame = requestAnimationFrame(tick);
    return () => {
      document.removeEventListener('dragover', onDragOver);
      cancelAnimationFrame(frame);
    };
  }, [dragId]);

  if (!activeTank) return null;

  // Starred is always a SECOND-priority sort key, never a first one — it
  // never overrides what the active sort mode is actually for, only
  // breaks ties within it. A plain multi-key comparator is safe here in
  // a way the original implementation wasn't: that version conditioned
  // the starred comparison on category equality (returning 0 for
  // cross-category pairs), which isn't a valid total order — non-
  // transitive comparators are undefined behavior for Array.sort() and
  // only "worked" by accident when items already happened to be
  // pre-grouped by category. Every branch below compares by its real
  // primary key first, falling back to starred only on an actual tie —
  // that's always a valid total order, so a single sort() per branch is
  // correct and sufficient; no custom algorithm needed anywhere.
  const starredTiebreak = (a: RosterItem, b: RosterItem) => (b.starred ? 1 : 0) - (a.starred ? 1 : 0);

  let items = activeTank.roster.filter((r) => filter === 'all' || r.category === filter);
  if (sortMode === 'category') {
    const categoryOrder = Object.keys(CATEGORY_LABELS) as RosterItem['category'][];
    items = [...items].sort((a, b) => {
      const catDiff = categoryOrder.indexOf(a.category) - categoryOrder.indexOf(b.category);
      return catDiff !== 0 ? catDiff : starredTiebreak(a, b);
    });
  } else if (sortMode === 'status') {
    // Established at top, working down to Idea at the bottom — the
    // opposite of STATUS_ORDER's own ascending-progress order. Starred
    // only breaks ties WITHIN the same status — it can't pull a starred
    // "Arrived" item ahead of an unstarred "Established" one, which
    // would contradict what this sort is actually for.
    items = [...items].sort((a, b) => {
      const statusDiff = STATUS_ORDER.indexOf(b.status) - STATUS_ORDER.indexOf(a.status);
      return statusDiff !== 0 ? statusDiff : starredTiebreak(a, b);
    });
  } else {
    // Default order: no primary key at all (that's the point of
    // "default") — starred is the only thing that moves anything,
    // pulling every starred item to the top of the list regardless of
    // category. True whether filter is "all" or a single category —
    // with one category shown, this is trivially the same result as
    // floating within it; with all shown, it's the only way starring
    // means anything visible, since nothing else groups categories
    // together for it to float within.
    //
    // With roster groups defined, the user's own group order is the
    // primary key and starred only breaks ties inside a group — the same
    // bucket-first shape as the category and status sorts above, so a
    // star can never lift an item out of its group.
    const listed = activeTank.rosterGroups ?? [];
    items = listed.length > 0 ? sortByGroup(items, listed, starredTiebreak) : [...items].sort(starredTiebreak);
  }

  const groups = activeTank.rosterGroups ?? [];
  // Groups apply in every sort: the active sort orders items inside each
  // group instead of replacing the groups.
  const groupsOn = groups.length > 0;
  const sections = groupsOn ? sectionsByGroup(items, groups, activeTank.rosterGroupScopes, filter) : null;
  // The groups shown under the current filter, in list order; the move
  // arrows are relative to these, not to groups hidden by the filter.
  const visibleGroups = sections ? sections.flatMap((s) => (s.name === null ? [] : [s.name])) : [];

  // Items still at "Idea" haven't actually been committed to yet, so they
  // don't count toward either number below — only once something's
  // promoted to Wishlist or further does its cost start counting.
  const budgetedItems = activeTank.roster.filter((r) => r.status !== 'idea');

  // Points back to the roster item's own auto-created "first appearance"
  // milestone, if one exists (per the recompute rules in lib/milestones.ts
  // — every distinct item gets exactly one, tied to whichever entry
  // mentioned it first). Not every item has one — e.g. anything added
  // before 15c shipped, or before its first log-entry mention — so this
  // stays a plain lookup, never fabricated.
  function findFirstAddedMilestone(item: RosterItem) {
    return activeTank!.milestones.find(
      (m) => m.type === 'roster-addition' && m.relatedRosterItemIds?.includes(item.id)
    );
  }
  // Estimate: every wishlist-or-later item's cost, whether that number is
  // still a guess or the item's already been bought — same total this
  // page has always shown, just given a name now that there's a second
  // number to distinguish it from.
  const estimateTotal = budgetedItems.reduce((sum, r) => sum + (r.cost ?? 0), 0);
  // Actual: the subset of that same set which has actually been ordered
  // or further — so as items move through the pipeline, this number
  // organically shifts from "guess" toward "what I really spent," using
  // the exact same `cost` field rather than a second entered value.
  const orderedPlusItems = budgetedItems.filter((r) => statusMeetsRequirement(r.status, 'ordered'));
  const actualTotal = orderedPlusItems.reduce((sum, r) => sum + (r.cost ?? 0), 0);
  // Once every budgeted item has reached ordered-or-later, Estimate and
  // Actual cover the exact same set and are mathematically identical —
  // recomputed fresh on every render, so adding a new wishlist item later
  // automatically splits the display back into two numbers on its own.
  const allBudgetedItemsOrdered = budgetedItems.length > 0 && orderedPlusItems.length === budgetedItems.length;

  const [copiedList, setCopiedList] = useState<'full' | 'no-desc' | null>(null);

  function copyRosterList(variant: 'full' | 'no-desc') {
    // Deliberately NOT grouped by category the way planSummary.ts's full
    // roster section is — the whole point here is "whatever's visible
    // right now, in this exact order," so a starred item floated to the
    // top by the active sort has to stay at the top of the copied text
    // too, not get silently re-sorted back into category groups.
    const filterLabel = filter === 'all' ? 'All' : CATEGORY_LABELS[filter];
    const sortLabel =
      sortMode === 'default' ? 'Default order' : sortMode === 'category' ? 'By category' : 'By status';
    const lines = [`Roster — ${filterLabel}, ${sortLabel}`, ''];
    const pushItem = (item: RosterItem) => {
      const qty = item.quantity && item.quantity > 1 ? `${item.quantity}x ` : '';
      const status = STATUS_LABELS[item.status];
      const detail = variant === 'full' && item.detail ? ` — ${item.detail}` : '';
      lines.push(`- ${qty}${item.name} (${status})${detail}`);
    };
    if (sections) {
      for (const section of sections) {
        if (section.items.length === 0) continue;
        if (section.name !== null) lines.push(`${section.name}:`);
        section.items.forEach(pushItem);
        lines.push('');
      }
      while (lines[lines.length - 1] === '') lines.pop();
    } else {
      items.forEach(pushItem);
    }
    if (items.length === 0) lines.push('(Nothing matches this filter.)');
    navigator.clipboard
      .writeText(lines.join('\n'))
      .then(() => {
        setCopiedList(variant);
        setTimeout(() => setCopiedList(null), 2000);
      })
      .catch(() => {
        // Clipboard permission denied or unavailable — fail quietly rather
        // than throw, same as every other copy button in the app.
      });
  }

  function cycleStatus(item: RosterItem) {
    const idx = STATUS_ORDER.indexOf(item.status);
    const next = STATUS_ORDER[(idx + 1) % STATUS_ORDER.length];
    updateRosterItem({ ...item, status: next });
  }

  // Runs a groups operation against the latest tank and reports its error
  // (a blank or duplicate name) back to the page.
  function applyGroupChange(change: (tank: Tank) => GroupResult): boolean {
    let error: string | undefined;
    updateTank((tank) => {
      const result = change(tank);
      if (result.error !== undefined) {
        error = result.error;
        return tank;
      }
      return result.tank;
    });
    setGroupError(error ?? null);
    return error === undefined;
  }

  function submitNewGroup() {
    if (applyGroupChange((t) => addGroup(t, newGroupName, filter === 'all' ? undefined : filter))) {
      setNewGroupName('');
      setAddingGroup(false);
    }
  }

  function submitRename(from: string) {
    if (applyGroupChange((t) => renameGroup(t, from, renameDraft))) {
      setRenamingGroup(null);
    }
  }

  function dropOnGroup(group: string | undefined, itemId: string) {
    updateTank((tank) => assignItemToGroup(tank, itemId, group));
    setDragId(null);
    setDragOver(null);
  }

  function renderItem(item: RosterItem) {
    return (
          editingId === item.id ? (
            <ItemForm
              key={item.id}
              initial={item}
              onSubmit={(updated) => {
                updateRosterItem({ ...updated, id: item.id });
                setEditingId(null);
              }}
              onCancel={() => setEditingId(null)}
              submitLabel="Save changes"
              editing
              groups={groups}
            />
          ) : (
            <div
              key={item.id}
              draggable={groupsOn}
              onDragStart={(e) => {
                e.dataTransfer.setData('text/plain', item.id);
                e.dataTransfer.effectAllowed = 'move';
                setDragId(item.id);
              }}
              onDragEnd={() => {
                setDragId(null);
                setDragOver(null);
              }}
              className={`card p-4 flex flex-col sm:flex-row sm:items-center gap-3 ${
                item.status === 'idea' ? 'border-dashed opacity-70' : ''
              } ${groupsOn ? 'cursor-grab' : ''} ${dragId === item.id ? 'opacity-40' : ''}`}
            >
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <button
                    onClick={() => updateRosterItem({ ...item, starred: !item.starred })}
                    className={`text-sm transition-colors ${
                      item.starred ? 'text-amber' : 'text-foam-dim/30 hover:text-foam-dim/60'
                    }`}
                    title={item.starred ? 'Unstar' : 'Star — floats to the top of its category'}
                    aria-label={item.starred ? 'Unstar this item' : 'Star this item'}
                  >
                    {item.starred ? '★' : '☆'}
                  </button>
                  <button
                    onClick={() => setFilter(item.category)}
                    className="pill py-0.5 px-2 font-mono text-[10px] uppercase tracking-wide text-sand bg-sand/10 hover:bg-sand/20 transition-colors"
                    title={`Filter to ${CATEGORY_LABELS[item.category]}`}
                  >
                    {CATEGORY_LABELS[item.category]}
                  </button>
                  <h3 className="font-medium">{item.name}</h3>
                  {item.quantity ? (
                    <span className="text-xs text-foam-dim">×{item.quantity}</span>
                  ) : null}
                  {item.cost !== undefined && (
                    <span
                      className={`font-mono text-xs ${
                        item.status === 'idea' ? 'text-foam-dim/50 line-through' : 'text-sand'
                      }`}
                      title={item.status === 'idea' ? "Not counted while it's just an idea" : undefined}
                    >
                      ${item.cost.toFixed(2)}
                    </span>
                  )}
                </div>
                {item.detail && (
                  <p className="text-sm text-foam-dim mt-1.5 leading-relaxed">{item.detail}</p>
                )}
                {item.source && (
                  <p className="text-xs text-foam-dim/70 mt-1 font-mono">from {item.source}</p>
                )}
                {(() => {
                  const m = findFirstAddedMilestone(item);
                  return m ? (
                    <p className="text-xs text-amber/80 mt-1 font-mono">
                      {m.major ? '🎉' : '📦'} First added {new Date(m.date).toLocaleDateString()}
                    </p>
                  ) : null;
                })()}
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <button
                  onClick={() => cycleStatus(item)}
                  className={`pill py-1.5 px-3 ${statusColor(item.status)}`}
                  title="Click to advance status"
                >
                  {STATUS_LABELS[item.status]}
                </button>
                <button
                  onClick={() => {
                    setShowForm(false);
                    setEditingId(item.id);
                  }}
                  className="btn-icon"
                  aria-label={`Edit ${item.name}`}
                >
                  Edit
                </button>
                <button
                  onClick={() => handleDeleteClick(item.id, () => deleteRosterItem(item.id))}
                  className={`btn-icon ${
                    pendingDeleteId === item.id ? 'text-amber' : 'danger'
                  }`}
                  aria-label={
                    pendingDeleteId === item.id
                      ? `Click again to confirm removing ${item.name}`
                      : `Remove ${item.name}`
                  }
                  title={pendingDeleteId === item.id ? 'Click again to confirm' : undefined}
                >
                  {pendingDeleteId === item.id ? '✓' : '✕'}
                </button>
              </div>
            </div>
          )
    );
  }

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
        <div>
          <h2 className="font-display text-2xl font-semibold">Roster</h2>
          <p className="text-sm text-foam-dim mt-1">
            Everything going into the tank — click a status pill to advance it.
            {estimateTotal > 0 && (
              <span className="font-mono text-foam ml-2">
                {allBudgetedItemsOrdered
                  ? `· $${actualTotal.toFixed(2)} total cost`
                  : actualTotal > 0
                    ? `· ~$${estimateTotal.toFixed(2)} estimated · $${actualTotal.toFixed(2)} actual`
                    : `· ~$${estimateTotal.toFixed(2)} estimated`}
              </span>
            )}
          </p>
        </div>
        <button
          onClick={() => {
            setEditingId(null);
            setShowForm((s) => !s);
          }}
          className="btn btn-primary self-start"
        >
          {showForm ? 'Cancel' : '+ Add item'}
        </button>
      </div>

      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-2">
        <div className="flex flex-nowrap md:flex-wrap gap-2 overflow-x-auto scrollbar-hide -mx-6 px-6 md:mx-0 md:px-0 md:overflow-visible">
          <FilterPill active={filter === 'all'} onClick={() => setFilter('all')} label="All" />
          {(Object.keys(CATEGORY_LABELS) as RosterItem['category'][]).map((cat) => (
            <FilterPill
              key={cat}
              active={filter === cat}
              onClick={() => setFilter(cat)}
              label={CATEGORY_LABELS[cat]}
            />
          ))}
        </div>
        <div className="flex flex-nowrap md:flex-wrap gap-2 overflow-x-auto scrollbar-hide -mx-6 px-6 md:mx-0 md:px-0 md:overflow-visible">
          <SortPill active={sortMode === 'default'} onClick={() => setSortMode('default')} label="Default order" />
          <SortPill active={sortMode === 'category'} onClick={() => setSortMode('category')} label="By category" />
          <SortPill active={sortMode === 'status'} onClick={() => setSortMode('status')} label="By status" />
        </div>
      </div>

      <div className="flex items-center gap-3">
        <button
          onClick={() => copyRosterList('full')}
          className="font-mono text-xs text-foam-dim/70 hover:text-amber transition-colors"
        >
          {copiedList === 'full' ? '✓ Copied to clipboard' : '📋 Copy visible list'}
        </button>
        <span className="text-foam-dim/30 text-xs">·</span>
        <button
          onClick={() => copyRosterList('no-desc')}
          className="font-mono text-xs text-foam-dim/70 hover:text-amber transition-colors"
        >
          {copiedList === 'no-desc' ? '✓ Copied to clipboard' : 'no description'}
        </button>
        <>
            <span className="text-foam-dim/30 text-xs">·</span>
            {addingGroup ? (
              <form
                className="flex items-center gap-2 flex-wrap"
                onSubmit={(e) => {
                  e.preventDefault();
                  submitNewGroup();
                }}
              >
                <input
                  autoFocus
                  value={newGroupName}
                  onChange={(e) => setNewGroupName(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Escape') {
                      setAddingGroup(false);
                      setGroupError(null);
                    }
                  }}
                  placeholder="Group name"
                  aria-label="New group name"
                  maxLength={MAX_GROUP_NAME_LENGTH}
                  className="field py-1 text-sm w-40"
                />
                <button type="submit" className="font-mono text-xs text-amber hover:underline">
                  Add
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setAddingGroup(false);
                    setGroupError(null);
                  }}
                  className="font-mono text-xs text-foam-dim/70 hover:text-amber transition-colors"
                >
                  Cancel
                </button>
                {groupError && <span className="text-xs text-coral">{groupError}</span>}
              </form>
            ) : (
              <button
                onClick={() => {
                  setGroupError(null);
                  setAddingGroup(true);
                }}
                className="font-mono text-xs text-foam-dim/70 hover:text-amber transition-colors"
              >
                + Add group
              </button>
            )}
          </>
      </div>

      {showForm && (
        <ItemForm
          onSubmit={(item) => {
            addRosterItem(item);
            setShowForm(false);
          }}
          onCancel={() => setShowForm(false)}
          submitLabel="Add to roster"
          defaultCategory={filter !== 'all' ? filter : undefined}
          groups={groups}
        />
      )}

      <div className="grid gap-3">
        {sections
          ? sections.map((section) => {
              const key = section.name ?? '';
              // The ungrouped drop zone only exists while something is being
              // dragged (or when there are ungrouped items to show), so a
              // fully grouped roster has no extra element at the bottom.
              if (section.name === null && section.items.length === 0 && !dragId) return null;
              // Under a filter that shows none of the groups, the ungrouped
              // items are just the list: no divider, and nothing to drop on.
              const anyGroupShown = sections.some((x) => x.name !== null);
              if (section.name === null && !anyGroupShown) return <div key="__ungrouped__" className="grid gap-3">{section.items.map(renderItem)}</div>;
              return (
                <section
                  key={key || '__ungrouped__'}
                  onDragOver={(e) => {
                    if (!dragId) return;
                    e.preventDefault();
                    setDragOver(key);
                  }}
                  onDragLeave={(e) => {
                    if (!e.currentTarget.contains(e.relatedTarget as Node | null)) {
                      setDragOver((cur) => (cur === key ? null : cur));
                    }
                  }}
                  onDrop={(e) => {
                    if (!dragId) return;
                    e.preventDefault();
                    dropOnGroup(section.name ?? undefined, dragId);
                  }}
                  className={`grid gap-3 rounded-lg transition-colors ${
                    dragOver === key ? 'bg-amber/5 outline outline-1 outline-amber/40 -m-2 p-2' : ''
                  }`}
                >
                  <GroupHeader
                    name={section.name}
                    index={section.name === null ? -1 : visibleGroups.indexOf(section.name)}
                    total={visibleGroups.length}
                    renaming={section.name !== null && renamingGroup === section.name}
                    renameDraft={renameDraft}
                    onRenameDraft={setRenameDraft}
                    onStartRename={() => {
                      if (section.name === null) return;
                      setGroupError(null);
                      setRenameDraft(section.name);
                      setRenamingGroup(section.name);
                    }}
                    onSubmitRename={() => {
                      if (section.name !== null) submitRename(section.name);
                    }}
                    onCancelRename={() => {
                      setRenamingGroup(null);
                      setGroupError(null);
                    }}
                    onMove={(dir) => {
                      if (section.name !== null) updateTank((t) => moveGroup(t, section.name!, dir, visibleGroups));
                    }}
                    confirmingDelete={pendingDeleteId === `group:${section.name}`}
                    onDelete={() => {
                      if (section.name === null) return;
                      handleDeleteClick(`group:${section.name}`, () =>
                        updateTank((t) => deleteGroup(t, section.name!))
                      );
                    }}
                    error={section.name !== null && renamingGroup === section.name ? groupError : null}
                    dragging={dragId !== null}
                  />
                  {section.items.map(renderItem)}
                  {section.name !== null && section.items.length === 0 && (
                    <p className="text-xs text-foam-dim/60 px-1">
                      Nothing in this group yet. Drag items here, or choose a group when editing an item.
                    </p>
                  )}
                </section>
              );
            })
          : items.map(renderItem)}
        {items.length === 0 && !sections && (
          <p className="text-foam-dim text-sm py-8 text-center">Nothing here yet.</p>
        )}
      </div>
    </div>
  );
}

function statusColor(status: SourcingStatus) {
  switch (status) {
    case 'idea':
      return 'bg-transparent text-foam-dim/60 border border-dashed border-foam-dim/30';
    case 'wishlist':
      return 'bg-foam/10 text-foam-dim';
    case 'ordered':
      return 'bg-sand/20 text-sand-light';
    case 'arrived':
      return 'bg-amber/20 text-amber';
    case 'acclimating':
      return 'bg-moss-light/20 text-moss-light';
    case 'established':
      return 'bg-moss text-foam';
  }
}

function SortPill({
  active,
  onClick,
  label,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
}) {
  return (
    <button
      onClick={onClick}
      className={`pill py-1.5 px-3 text-xs shrink-0 whitespace-nowrap ${
        active
          ? 'bg-moss text-foam'
          : 'bg-deepwater text-foam-dim hover:text-foam border border-moss/30'
      }`}
    >
      {label}
    </button>
  );
}

function FilterPill({
  active,
  onClick,
  label,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
}) {
  return (
    <button
      onClick={onClick}
      className={`pill py-1.5 px-3 shrink-0 whitespace-nowrap ${
        active
          ? 'bg-moss text-foam'
          : 'bg-deepwater text-foam-dim hover:text-foam border border-moss/30'
      }`}
    >
      {label}
    </button>
  );
}

function ItemForm({
  initial,
  onSubmit,
  onCancel,
  submitLabel,
  editing = false,
  defaultCategory,
  groups,
}: {
  initial?: RosterItem;
  onSubmit: (item: RosterItem) => void;
  onCancel: () => void;
  submitLabel: string;
  editing?: boolean;
  // Only meaningful for the Add flow — editing an existing item always
  // uses that item's own real category regardless of whatever filter
  // happens to be active on the page behind it.
  defaultCategory?: RosterItem['category'];
  // The tank's own roster groups; the Group picker only shows when there are
  // any, so a roster without groups sees no new control.
  groups: string[];
}) {
  const [name, setName] = useState(initial?.name ?? '');
  const [category, setCategory] = useState<RosterItem['category']>(initial?.category ?? defaultCategory ?? 'plant');
  const [status, setStatus] = useState<SourcingStatus>(initial?.status ?? 'wishlist');
  const [detail, setDetail] = useState(initial?.detail ?? '');
  const [source, setSource] = useState(initial?.source ?? '');
  const [quantity, setQuantity] = useState(initial?.quantity?.toString() ?? '');
  const [cost, setCost] = useState(initial?.cost?.toString() ?? '');
  const [group, setGroup] = useState(initial?.group ?? '');

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    // min="0" on the inputs handles the common case (typing/spinning a
    // negative value natively blocks form submission), but this is the
    // real guard — never trust a browser attribute alone, same as
    // everywhere else in this app. A negative value is treated as if the
    // field were left empty, not silently written as-is.
    const parsedQuantity = quantity ? Number(quantity) : undefined;
    const parsedCost = cost ? Number(cost) : undefined;
    // Start from the item being edited so everything this form doesn't
    // show (stars, notes, compatibility traits and sizes, group) survives a
    // save instead of being dropped.
    const next: RosterItem = {
      ...initial,
      id: initial?.id ?? crypto.randomUUID(),
      name: name.trim(),
      category,
      status,
      detail: detail.trim() || undefined,
      source: source.trim() || undefined,
      quantity: parsedQuantity !== undefined && parsedQuantity >= 0 ? parsedQuantity : undefined,
      cost: parsedCost !== undefined && parsedCost >= 0 ? parsedCost : undefined,
    };
    if (group) next.group = group;
    else delete next.group;
    onSubmit(next);
  }

  return (
    <form
      onSubmit={submit}
      className={`card p-4 grid sm:grid-cols-2 gap-3 ${editing ? 'border-amber/40' : ''}`}
    >
      <input
        placeholder="Item name"
        value={name}
        onChange={(e) => setName(e.target.value)}
        className="field sm:col-span-2 font-medium"
        required
      />
      <select
        value={category}
        onChange={(e) => setCategory(e.target.value as RosterItem['category'])}
        className="field"
      >
        {(Object.keys(CATEGORY_LABELS) as RosterItem['category'][]).map((cat) => (
          <option key={cat} value={cat}>
            {CATEGORY_LABELS[cat]}
          </option>
        ))}
      </select>
      <select
        value={status}
        onChange={(e) => setStatus(e.target.value as SourcingStatus)}
        className="field"
        title="Start at Idea for something you haven't committed to yet — its cost won't count until you promote it"
      >
        {STATUS_ORDER.map((s) => (
          <option key={s} value={s}>
            {STATUS_LABELS[s]}
          </option>
        ))}
      </select>
      <input
        placeholder="Quantity (optional)"
        type="number"
        min="0"
        value={quantity}
        onChange={(e) => setQuantity(e.target.value)}
        className="field"
      />
      <input
        placeholder="Est. cost (optional)"
        type="number"
        min="0"
        step="0.01"
        value={cost}
        onChange={(e) => setCost(e.target.value)}
        className="field"
      />
      {groups.length > 0 && (
        <select
          value={group}
          onChange={(e) => setGroup(e.target.value)}
          className="field sm:col-span-2"
          aria-label="Group"
        >
          <option value="">No group</option>
          {groups.map((g) => (
            <option key={g} value={g}>
              {g}
            </option>
          ))}
        </select>
      )}
      <AutoResizeTextarea
        placeholder="Detail (optional)"
        value={detail}
        onChange={setDetail}
        className="field sm:col-span-2 resize-none overflow-hidden leading-relaxed"
      />
      <input
        placeholder="Source (optional)"
        value={source}
        onChange={(e) => setSource(e.target.value)}
        className="field sm:col-span-2"
      />
      <div className="sm:col-span-2 flex gap-2">
        <button type="submit" className="btn btn-secondary flex-1">
          {submitLabel}
        </button>
        <button type="button" onClick={onCancel} className="btn btn-ghost">
          Cancel
        </button>
      </div>
    </form>
  );
}

// The divider above each group: its name, a rule, and small borderless
// controls on the right end of the rule (move up/down, rename, delete). The
// ungrouped section at the bottom has a rule but no name or controls — and
// only shows its rule while groups exist and something is being dragged or
// there are ungrouped items.
function GroupHeader({
  name,
  index,
  total,
  renaming,
  renameDraft,
  onRenameDraft,
  onStartRename,
  onSubmitRename,
  onCancelRename,
  onMove,
  confirmingDelete,
  onDelete,
  error,
  dragging,
}: {
  name: string | null;
  index: number;
  total: number;
  renaming: boolean;
  renameDraft: string;
  onRenameDraft: (v: string) => void;
  onStartRename: () => void;
  onSubmitRename: () => void;
  onCancelRename: () => void;
  onMove: (dir: -1 | 1) => void;
  confirmingDelete: boolean;
  onDelete: () => void;
  error: string | null;
  dragging: boolean;
}) {
  const control =
    'px-1.5 py-1 text-xs text-foam-dim/60 hover:text-amber transition-colors disabled:opacity-25 disabled:hover:text-foam-dim/60';
  if (name === null) {
    return (
      <div className="flex items-center gap-3" aria-hidden={!dragging}>
        <div className="h-px flex-1 bg-moss/30" />
        {dragging && <span className="text-xs text-foam-dim/60">Drop here to take out of its group</span>}
      </div>
    );
  }
  return (
    <div>
      <div className="flex items-center gap-3">
        {renaming ? (
          <input
            autoFocus
            value={renameDraft}
            onChange={(e) => onRenameDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                onSubmitRename();
              } else if (e.key === 'Escape') {
                onCancelRename();
              }
            }}
            onBlur={onCancelRename}
            aria-label={`Rename group ${name}`}
            maxLength={MAX_GROUP_NAME_LENGTH}
            className="field py-1 text-sm w-44"
          />
        ) : (
          <h3 className="font-display text-base font-semibold text-foam">{name}</h3>
        )}
        <div className="h-px flex-1 bg-moss/30" />
        <div className="flex items-center">
          <button
            type="button"
            className={control}
            onClick={() => onMove(-1)}
            disabled={index <= 0}
            aria-label={`Move ${name} up`}
            title="Move group up"
          >
            ↑
          </button>
          <button
            type="button"
            className={control}
            onClick={() => onMove(1)}
            disabled={index >= total - 1}
            aria-label={`Move ${name} down`}
            title="Move group down"
          >
            ↓
          </button>
          <button
            type="button"
            className={control}
            onMouseDown={(e) => e.preventDefault()}
            onClick={onStartRename}
            aria-label={`Rename ${name}`}
            title="Rename group"
          >
            Rename
          </button>
          <button
            type="button"
            className={`${control} ${confirmingDelete ? '!text-amber' : ''}`}
            onClick={onDelete}
            aria-label={
              confirmingDelete
                ? `Click again to delete group ${name} (its items are kept)`
                : `Delete group ${name}`
            }
            title={confirmingDelete ? 'Click again — items are kept, just ungrouped' : 'Delete group (items are kept)'}
          >
            {confirmingDelete ? '✓' : '✕'}
          </button>
        </div>
      </div>
      {error && <p className="text-xs text-coral mt-1">{error}</p>}
    </div>
  );
}