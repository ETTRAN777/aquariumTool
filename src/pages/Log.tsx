import { useState } from 'react';
import { useData } from '../lib/DataContext';
import type { LogEntry, WaterParams, CustomFieldDef, CustomFieldValue } from '../types';
import { resizeImageToBase64 } from '../lib/storage';

const MOOD_LABELS: Record<NonNullable<LogEntry['mood']>, string> = {
  thriving: '🌿 Thriving',
  stable: '💧 Stable',
  watching: '👀 Watching',
  concerned: '⚠️ Concerned',
};

export default function Log() {
  const { activeTank, addLogEntry, updateLogEntry, deleteLogEntry } = useData();
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<string | null>(null);

  if (!activeTank) return null;
  const customFields = activeTank.customFields;

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="font-display text-2xl font-semibold">Weekly Log</h2>
          <p className="text-sm text-foam-dim mt-1">The build log and journal, one entry at a time.</p>
        </div>
        <button
          onClick={() => {
            setEditingId(null);
            setShowForm((s) => !s);
          }}
          className="btn btn-primary"
        >
          {showForm ? 'Cancel' : '+ New entry'}
        </button>
      </div>

      {showForm && (
        <EntryForm
          weekNumber={activeTank.logs.length + 1}
          customFields={customFields}
          onSubmit={(entry) => {
            addLogEntry(entry);
            setShowForm(false);
          }}
          onCancel={() => setShowForm(false)}
          submitLabel="Publish entry"
        />
      )}

      <div className="space-y-3">
        {activeTank.logs.map((entry) =>
          editingId === entry.id ? (
            <EntryForm
              key={entry.id}
              initial={entry}
              customFields={customFields}
              onSubmit={(updated) => {
                updateLogEntry({ ...updated, id: entry.id, date: entry.date, weekLabel: entry.weekLabel });
                setEditingId(null);
              }}
              onCancel={() => setEditingId(null)}
              submitLabel="Save changes"
              editing
            />
          ) : (
            <article
              key={entry.id}
              className="card overflow-hidden hover:border-amber/30 transition-colors"
            >
              <button
                onClick={() => setExpanded(expanded === entry.id ? null : entry.id)}
                className="w-full text-left p-5"
              >
                <div className="flex items-center justify-between gap-3 flex-wrap">
                  <p className="font-mono text-xs text-sand uppercase tracking-wide">
                    {entry.weekLabel} · {new Date(entry.date).toLocaleDateString()}
                    {entry.mood && <span className="ml-2">{MOOD_LABELS[entry.mood]}</span>}
                  </p>
                  {customFields.length > 0 && entry.customValues && (
                    <span className="text-xs font-mono text-foam-dim">
                      {customFields
                        .filter((f) => entry.customValues?.[f.id] !== undefined)
                        .slice(0, 2)
                        .map((f) => `${f.label}: ${formatValue(entry.customValues![f.id])}`)
                        .join(' · ')}
                    </span>
                  )}
                </div>
                <h3 className="font-display text-xl font-semibold mt-1">{entry.title}</h3>
                <p className={`text-foam-dim mt-2 ${expanded === entry.id ? '' : 'line-clamp-2'}`}>
                  {entry.body}
                </p>
              </button>

              {expanded === entry.id && (
                <div className="px-5 pb-5 space-y-4">
                  {entry.params && Object.keys(entry.params).length > 0 && (
                    <div className="flex flex-wrap gap-2">
                      {Object.entries(entry.params).map(([key, val]) =>
                        val !== undefined ? (
                          <span
                            key={key}
                            className="pill py-1 px-2 font-mono text-xs bg-deepwater-2 border border-moss/30"
                          >
                            {paramLabel(key)}: <strong className="text-amber ml-1">{val}</strong>
                          </span>
                        ) : null
                      )}
                    </div>
                  )}
                  {customFields.length > 0 && entry.customValues && (
                    <div className="flex flex-wrap gap-2">
                      {customFields.map((f) => {
                        const val = entry.customValues?.[f.id];
                        if (val === undefined) return null;
                        return (
                          <span
                            key={f.id}
                            className="pill py-1 px-2 font-mono text-xs bg-sand/10 border border-sand/20 text-sand"
                          >
                            {f.label}: <strong className="ml-1">{formatValue(val)}</strong>
                          </span>
                        );
                      })}
                    </div>
                  )}
                  {entry.photoUrls && entry.photoUrls.length > 0 && (
                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                      {entry.photoUrls.map((url, i) => (
                        <img
                          key={i}
                          src={url}
                          alt={`${entry.title} photo ${i + 1}`}
                          className="rounded-md border border-moss/30 aspect-square object-cover"
                        />
                      ))}
                    </div>
                  )}
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => {
                        setShowForm(false);
                        setEditingId(entry.id);
                      }}
                      className="btn-icon"
                    >
                      Edit
                    </button>
                    <button
                      onClick={() => deleteLogEntry(entry.id)}
                      className="btn-icon danger"
                    >
                      Delete entry
                    </button>
                  </div>
                </div>
              )}
            </article>
          )
        )}
        {activeTank.logs.length === 0 && (
          <p className="text-foam-dim text-sm py-8 text-center">
            No entries yet. Start documenting once the build begins.
          </p>
        )}
      </div>
    </div>
  );
}

function formatValue(val: CustomFieldValue): string {
  if (typeof val === 'boolean') return val ? 'Yes' : 'No';
  return String(val);
}

function paramLabel(key: string) {
  const labels: Record<string, string> = {
    temperature: 'Temp °F',
    ph: 'pH',
    gh: 'GH',
    kh: 'KH',
    tds: 'TDS',
    ammonia: 'NH₃',
    nitrite: 'NO₂',
    nitrate: 'NO₃',
  };
  return labels[key] ?? key;
}

function EntryForm({
  initial,
  weekNumber,
  customFields,
  onSubmit,
  onCancel,
  submitLabel,
  editing = false,
}: {
  initial?: LogEntry;
  weekNumber?: number;
  customFields: CustomFieldDef[];
  onSubmit: (entry: LogEntry) => void;
  onCancel: () => void;
  submitLabel: string;
  editing?: boolean;
}) {
  const [title, setTitle] = useState(initial?.title ?? '');
  const [body, setBody] = useState(initial?.body ?? '');
  const [mood, setMood] = useState<LogEntry['mood']>(initial?.mood ?? 'stable');
  const [params, setParams] = useState<WaterParams>(initial?.params ?? {});
  const [customValues, setCustomValues] = useState<Record<string, CustomFieldValue>>(
    initial?.customValues ?? {}
  );
  const [photos, setPhotos] = useState<string[]>(initial?.photoUrls ?? []);
  const [uploading, setUploading] = useState(false);

  async function handlePhotos(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? []);
    if (files.length === 0) return;
    setUploading(true);
    try {
      const results = await Promise.all(files.map((f) => resizeImageToBase64(f)));
      setPhotos((prev) => [...prev, ...results]);
    } catch {
      alert('Could not process one of those images.');
    }
    setUploading(false);
    e.target.value = '';
  }

  function removePhoto(index: number) {
    setPhotos((prev) => prev.filter((_, i) => i !== index));
  }

  function setCustomValue(fieldId: string, value: CustomFieldValue | undefined) {
    setCustomValues((prev) => {
      const next = { ...prev };
      if (value === undefined || value === '') {
        delete next[fieldId];
      } else {
        next[fieldId] = value;
      }
      return next;
    });
  }

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim() || !body.trim()) return;
    onSubmit({
      id: initial?.id ?? crypto.randomUUID(),
      weekLabel: initial?.weekLabel ?? `Week ${weekNumber}`,
      date: initial?.date ?? new Date().toISOString(),
      title: title.trim(),
      body: body.trim(),
      mood,
      params,
      customValues: Object.keys(customValues).length ? customValues : undefined,
      photoUrls: photos.length ? photos : undefined,
    });
  }

  function setParam(key: keyof WaterParams, value: string) {
    setParams((prev) => ({ ...prev, [key]: value === '' ? undefined : Number(value) }));
  }

  return (
    <form onSubmit={submit} className={`card p-5 space-y-4 ${editing ? 'border-amber/40' : ''}`}>
      <input
        placeholder="Entry title"
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        className="field font-medium"
        required
      />
      <textarea
        placeholder="What happened this week?"
        value={body}
        onChange={(e) => setBody(e.target.value)}
        rows={4}
        className="field resize-y"
        required
      />

      <div>
        <p className="field-label">Mood</p>
        <div className="flex gap-2 flex-wrap">
          {(Object.keys(MOOD_LABELS) as LogEntry['mood'][]).map((m) => (
            <button
              type="button"
              key={m}
              onClick={() => setMood(m)}
              className={`pill py-1.5 px-3 ${
                mood === m
                  ? 'bg-moss text-foam'
                  : 'bg-deepwater-2 text-foam-dim border border-moss/30'
              }`}
            >
              {MOOD_LABELS[m!]}
            </button>
          ))}
        </div>
      </div>

      <div>
        <p className="field-label">Water parameters</p>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          <ParamInput label="Temp °F" value={params.temperature} onChange={(v) => setParam('temperature', v)} />
          <ParamInput label="pH" step="0.1" value={params.ph} onChange={(v) => setParam('ph', v)} />
          <ParamInput label="GH" value={params.gh} onChange={(v) => setParam('gh', v)} />
          <ParamInput label="KH" value={params.kh} onChange={(v) => setParam('kh', v)} />
          <ParamInput label="TDS" value={params.tds} onChange={(v) => setParam('tds', v)} />
          <ParamInput label="NH₃" step="0.1" value={params.ammonia} onChange={(v) => setParam('ammonia', v)} />
          <ParamInput label="NO₂" step="0.1" value={params.nitrite} onChange={(v) => setParam('nitrite', v)} />
          <ParamInput label="NO₃" value={params.nitrate} onChange={(v) => setParam('nitrate', v)} />
        </div>
      </div>

      {customFields.length > 0 && (
        <div>
          <p className="field-label">This tank's tracking fields</p>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
            {customFields.map((f) => (
              <CustomFieldInput
                key={f.id}
                field={f}
                value={customValues[f.id]}
                onChange={(v) => setCustomValue(f.id, v)}
              />
            ))}
          </div>
          <p className="text-[11px] text-foam-dim/60 mt-2">
            Manage these in Settings — add, rename, or remove tracking fields anytime.
          </p>
        </div>
      )}

      <div>
        <label className="field-label">Photos</label>
        <input
          type="file"
          accept="image/*"
          multiple
          onChange={handlePhotos}
          className="text-sm text-foam-dim file:mr-3 file:px-3 file:py-1.5 file:rounded-md file:border file:border-moss/30 file:bg-transparent file:text-foam-dim file:text-xs file:cursor-pointer hover:file:text-foam hover:file:border-moss/60 file:transition-colors"
        />
        {uploading && <p className="text-xs text-foam-dim mt-2">Processing…</p>}
        {photos.length > 0 && (
          <div className="grid grid-cols-4 gap-2 mt-3">
            {photos.map((p, i) => (
              <div key={i} className="relative group">
                <img
                  src={p}
                  className="rounded-md border border-moss/30 aspect-square object-cover"
                  alt=""
                />
                <button
                  type="button"
                  onClick={() => removePhoto(i)}
                  aria-label="Remove photo"
                  className="absolute top-1 right-1 w-5 h-5 rounded-full bg-deepwater/90 border border-moss/40 text-foam-dim hover:text-coral hover:border-coral/50 flex items-center justify-center text-xs leading-none transition-colors"
                >
                  ✕
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="flex gap-2">
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

function CustomFieldInput({
  field,
  value,
  onChange,
}: {
  field: CustomFieldDef;
  value: CustomFieldValue | undefined;
  onChange: (v: CustomFieldValue | undefined) => void;
}) {
  if (field.type === 'boolean') {
    return (
      <label className="flex items-center gap-2 text-xs text-foam-dim bg-deepwater-2 border border-moss/30 rounded-md px-3 py-2">
        <input
          type="checkbox"
          checked={value === true}
          onChange={(e) => onChange(e.target.checked)}
        />
        {field.label}
      </label>
    );
  }

  if (field.type === 'number') {
    return (
      <div>
        <label className="text-[10px] text-foam-dim font-mono uppercase tracking-wide">
          {field.label}
        </label>
        <input
          type="number"
          defaultValue={typeof value === 'number' ? value : ''}
          onChange={(e) => onChange(e.target.value === '' ? undefined : Number(e.target.value))}
          className="field font-mono text-sm mt-0.5 px-2 py-1.5"
        />
      </div>
    );
  }

  return (
    <div>
      <label className="text-[10px] text-foam-dim font-mono uppercase tracking-wide">
        {field.label}
      </label>
      <input
        type="text"
        defaultValue={typeof value === 'string' ? value : ''}
        onChange={(e) => onChange(e.target.value === '' ? undefined : e.target.value)}
        className="field text-sm mt-0.5 px-2 py-1.5"
      />
    </div>
  );
}

function ParamInput({
  label,
  step = '1',
  value,
  onChange,
}: {
  label: string;
  step?: string;
  value?: number;
  onChange: (v: string) => void;
}) {
  return (
    <div>
      <label className="text-[10px] text-foam-dim font-mono uppercase tracking-wide">
        {label}
      </label>
      <input
        type="number"
        step={step}
        defaultValue={value ?? ''}
        onChange={(e) => onChange(e.target.value)}
        className="field font-mono text-sm mt-0.5 px-2 py-1.5"
      />
    </div>
  );
}
