import { useState } from 'react';
import { useData } from '../lib/DataContext';
import { STATUS_ORDER, STATUS_LABELS, CATEGORY_LABELS } from '../lib/constants';
import type { RosterItem, SourcingStatus } from '../types';

type SortMode = 'default' | 'category' | 'status';

export default function Roster() {
  const { activeTank, addRosterItem, updateRosterItem, deleteRosterItem } = useData();
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [filter, setFilter] = useState<RosterItem['category'] | 'all'>('all');
  const [sortMode, setSortMode] = useState<SortMode>('default');

  if (!activeTank) return null;

  let items = activeTank.roster.filter((r) => filter === 'all' || r.category === filter);
  if (sortMode === 'category') {
    const categoryOrder = Object.keys(CATEGORY_LABELS) as RosterItem['category'][];
    items = [...items].sort(
      (a, b) => categoryOrder.indexOf(a.category) - categoryOrder.indexOf(b.category)
    );
  } else if (sortMode === 'status') {
    // Established at top, working down to Idea at the bottom — the
    // opposite of STATUS_ORDER's own ascending-progress order.
    items = [...items].sort(
      (a, b) => STATUS_ORDER.indexOf(b.status) - STATUS_ORDER.indexOf(a.status)
    );
  }

  // Items still at "Idea" haven't actually been committed to yet, so they
  // don't count toward the running estimate — only once something's
  // promoted to Wishlist or further does its cost start counting.
  const totalCost = activeTank.roster
    .filter((r) => r.status !== 'idea')
    .reduce((sum, r) => sum + (r.cost ?? 0), 0);

  function cycleStatus(item: RosterItem) {
    const idx = STATUS_ORDER.indexOf(item.status);
    const next = STATUS_ORDER[(idx + 1) % STATUS_ORDER.length];
    updateRosterItem({ ...item, status: next });
  }

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
        <div>
          <h2 className="font-display text-2xl font-semibold">Roster</h2>
          <p className="text-sm text-foam-dim mt-1">
            Everything going into the tank — click a status pill to advance it.
            {totalCost > 0 && (
              <span className="font-mono text-foam ml-2">
                · ~${totalCost.toFixed(2)} estimated
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

      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap gap-2">
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
        <div className="flex flex-wrap gap-2">
          <SortPill active={sortMode === 'default'} onClick={() => setSortMode('default')} label="Default order" />
          <SortPill active={sortMode === 'category'} onClick={() => setSortMode('category')} label="By category" />
          <SortPill active={sortMode === 'status'} onClick={() => setSortMode('status')} label="By status" />
        </div>
      </div>

      {showForm && (
        <ItemForm
          onSubmit={(item) => {
            addRosterItem(item);
            setShowForm(false);
          }}
          onCancel={() => setShowForm(false)}
          submitLabel="Add to roster"
        />
      )}

      <div className="grid gap-3">
        {items.map((item) =>
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
            />
          ) : (
            <div
              key={item.id}
              className={`card p-4 flex flex-col sm:flex-row sm:items-center gap-3 ${
                item.status === 'idea' ? 'border-dashed opacity-70' : ''
              }`}
            >
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
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
                  onClick={() => deleteRosterItem(item.id)}
                  className="btn-icon danger"
                  aria-label={`Remove ${item.name}`}
                >
                  ✕
                </button>
              </div>
            </div>
          )
        )}
        {items.length === 0 && (
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
      className={`pill py-1.5 px-3 text-xs ${
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
      className={`pill py-1.5 px-3 ${
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
}: {
  initial?: RosterItem;
  onSubmit: (item: RosterItem) => void;
  onCancel: () => void;
  submitLabel: string;
  editing?: boolean;
}) {
  const [name, setName] = useState(initial?.name ?? '');
  const [category, setCategory] = useState<RosterItem['category']>(initial?.category ?? 'plant');
  const [status, setStatus] = useState<SourcingStatus>(initial?.status ?? 'wishlist');
  const [detail, setDetail] = useState(initial?.detail ?? '');
  const [source, setSource] = useState(initial?.source ?? '');
  const [quantity, setQuantity] = useState(initial?.quantity?.toString() ?? '');
  const [cost, setCost] = useState(initial?.cost?.toString() ?? '');

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    onSubmit({
      id: initial?.id ?? crypto.randomUUID(),
      name: name.trim(),
      category,
      status,
      detail: detail.trim() || undefined,
      source: source.trim() || undefined,
      quantity: quantity ? Number(quantity) : undefined,
      cost: cost ? Number(cost) : undefined,
    });
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
        value={quantity}
        onChange={(e) => setQuantity(e.target.value)}
        className="field"
      />
      <input
        placeholder="Est. cost (optional)"
        type="number"
        step="0.01"
        value={cost}
        onChange={(e) => setCost(e.target.value)}
        className="field"
      />
      <input
        placeholder="Detail (optional)"
        value={detail}
        onChange={(e) => setDetail(e.target.value)}
        className="field sm:col-span-2"
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
