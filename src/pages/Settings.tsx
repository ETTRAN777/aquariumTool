import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useData } from '../lib/DataContext';
import { PRESET_FIELDS } from '../data/presetFields';
import type { CustomFieldDef, CustomFieldType } from '../types';

const TYPE_LABELS: Record<CustomFieldType, string> = {
  number: 'Number',
  text: 'Text',
  boolean: 'Yes / No',
};

export default function Settings() {
  const { activeTank, updateTank, setCustomFields, deleteTank } = useData();
  const navigate = useNavigate();

  const [name, setName] = useState(activeTank?.name ?? '');
  const [sizeGallons, setSizeGallons] = useState(activeTank?.sizeGallons.toString() ?? '');
  const [dimensions, setDimensions] = useState(activeTank?.dimensions ?? '');
  const [style, setStyle] = useState(activeTank?.style ?? '');
  const [waterType, setWaterType] = useState<'freshwater' | 'saltwater'>(
    activeTank?.waterType ?? 'freshwater'
  );

  const [newFieldLabel, setNewFieldLabel] = useState('');
  const [newFieldType, setNewFieldType] = useState<CustomFieldType>('number');
  const [showPresets, setShowPresets] = useState(false);

  if (!activeTank) return null;

  function saveTankInfo(e: React.FormEvent) {
    e.preventDefault();
    if (!activeTank || !name.trim()) return;
    updateTank({
      ...activeTank,
      name: name.trim(),
      sizeGallons: Number(sizeGallons) || activeTank.sizeGallons,
      dimensions: dimensions.trim() || undefined,
      style: style.trim() || undefined,
      waterType,
    });
  }

  function addField(e: React.FormEvent) {
    e.preventDefault();
    if (!activeTank || !newFieldLabel.trim()) return;
    const field: CustomFieldDef = {
      id: crypto.randomUUID(),
      label: newFieldLabel.trim(),
      type: newFieldType,
    };
    setCustomFields([...activeTank.customFields, field]);
    setNewFieldLabel('');
  }

  function addPresetField(label: string, type: CustomFieldType) {
    if (!activeTank) return;
    const field: CustomFieldDef = { id: crypto.randomUUID(), label, type };
    setCustomFields([...activeTank.customFields, field]);
  }

  function removeField(id: string) {
    if (!activeTank) return;
    setCustomFields(activeTank.customFields.filter((f) => f.id !== id));
  }

  function handleDeleteTank() {
    if (!activeTank) return;
    const confirmed = confirm(
      `Delete "${activeTank.name}" and everything in it — roster, checklist, and every log entry? This can't be undone (unless you've exported a backup).`
    );
    if (!confirmed) return;
    deleteTank(activeTank.id);
    navigate('/');
  }

  const existingLabels = new Set(activeTank.customFields.map((f) => f.label));
  const availablePresets = PRESET_FIELDS.filter((p) => !existingLabels.has(p.label));
  const otherWaterType = activeTank.waterType === 'freshwater' ? 'saltwater' : 'freshwater';
  // "all" presets ride along with the tank's own water type — they're
  // relevant either way, and duplicating them into both groups would just
  // be confusing rather than more useful.
  const primaryPresets = availablePresets.filter(
    (p) => p.waterType === activeTank.waterType || p.waterType === 'all'
  );
  const secondaryPresets = availablePresets.filter((p) => p.waterType === otherWaterType);

  return (
    <div className="max-w-2xl mx-auto space-y-8">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="font-display text-2xl font-semibold">Tank Settings</h2>
          <p className="text-sm text-foam-dim mt-1">
            Rename the tank, adjust its details, and decide what it tracks.
          </p>
        </div>
        <button onClick={() => navigate('/new-tank')} className="btn btn-secondary shrink-0">
          + New Tank
        </button>
      </div>

      <form onSubmit={saveTankInfo} className="card p-5 space-y-3">
        <p className="field-label">Tank info</p>
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          className="field font-medium"
          placeholder="Tank name"
          required
        />
        <div className="grid sm:grid-cols-3 gap-3">
          <div>
            <label className="field-label">Size (gallons)</label>
            <input
              type="number"
              value={sizeGallons}
              onChange={(e) => setSizeGallons(e.target.value)}
              className="field"
            />
          </div>
          <div>
            <label className="field-label">Dimensions</label>
            <input
              value={dimensions}
              onChange={(e) => setDimensions(e.target.value)}
              className="field"
            />
          </div>
          <div>
            <label className="field-label">Style</label>
            <input value={style} onChange={(e) => setStyle(e.target.value)} className="field" />
          </div>
        </div>
        <div>
          <label className="field-label">Water type</label>
          <select
            value={waterType}
            onChange={(e) => setWaterType(e.target.value as 'freshwater' | 'saltwater')}
            className="field sm:w-56"
          >
            <option value="freshwater">Freshwater</option>
            <option value="saltwater">Saltwater</option>
          </select>
          <p className="text-[11px] text-foam-dim/60 mt-1">
            Controls which preset tracking fields show up below, and whether salinity appears
            on the Weekly Log and Parameters pages.
          </p>
        </div>
        <button type="submit" className="btn btn-secondary">
          Save changes
        </button>
      </form>

      <div className="card p-5 space-y-3">
        <div>
          <p className="field-label">Custom tracking fields</p>
          <p className="text-xs text-foam-dim">
            These show up as inputs on every Weekly Log entry, and numeric ones get charted
            on the Parameters page automatically.
          </p>
        </div>

        {activeTank.customFields.length > 0 && (
          <ul className="space-y-2">
            {activeTank.customFields.map((f) => (
              <li
                key={f.id}
                className="flex items-center justify-between gap-3 bg-deepwater-2 rounded-md px-3 py-2"
              >
                <div className="flex items-center gap-2">
                  <span className="text-sm text-foam">{f.label}</span>
                  <span className="pill text-[10px] py-0.5 px-2 bg-moss/15 text-foam-dim">
                    {TYPE_LABELS[f.type]}
                  </span>
                </div>
                <button
                  onClick={() => removeField(f.id)}
                  className="btn-icon danger"
                  aria-label={`Remove ${f.label} field`}
                >
                  Remove
                </button>
              </li>
            ))}
          </ul>
        )}
        {activeTank.customFields.length === 0 && (
          <p className="text-xs text-foam-dim py-2">No custom fields yet.</p>
        )}

        {availablePresets.length > 0 && (
          <div className="pt-2 border-t border-moss/15">
            <button
              type="button"
              onClick={() => setShowPresets((s) => !s)}
              className="text-xs text-amber hover:underline"
            >
              {showPresets ? 'Hide presets' : `Add from preset (${availablePresets.length} available)`}
            </button>
            {showPresets && (
              <div className="mt-2 space-y-2.5">
                {primaryPresets.length > 0 && (
                  <div>
                    <p className="text-[10px] text-foam-dim/60 uppercase tracking-wide mb-1">
                      {activeTank.waterType === 'freshwater' ? 'Freshwater' : 'Saltwater'} presets
                    </p>
                    <div className="flex flex-wrap gap-1.5">
                      {primaryPresets.map((p) => (
                        <button
                          key={p.label}
                          type="button"
                          onClick={() => addPresetField(p.label, p.type)}
                          className="pill text-xs py-1.5 px-3 bg-sand/10 text-sand border border-sand/20 hover:bg-sand/20 transition-colors"
                        >
                          + {p.label}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
                {secondaryPresets.length > 0 && (
                  <div className="pt-2 border-t border-moss/10">
                    <p className="text-[10px] text-foam-dim/60 uppercase tracking-wide mb-1">
                      {otherWaterType === 'freshwater' ? 'Freshwater' : 'Saltwater'} presets
                    </p>
                    <div className="flex flex-wrap gap-1.5">
                      {secondaryPresets.map((p) => (
                        <button
                          key={p.label}
                          type="button"
                          onClick={() => addPresetField(p.label, p.type)}
                          className="pill text-xs py-1.5 px-3 bg-sand/10 text-sand border border-sand/20 hover:bg-sand/20 transition-colors"
                        >
                          + {p.label}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        <form
          onSubmit={addField}
          className="grid grid-cols-[1fr_auto] sm:grid-cols-[1fr_140px_auto] gap-2 pt-2 border-t border-moss/15"
        >
          <input
            value={newFieldLabel}
            onChange={(e) => setNewFieldLabel(e.target.value)}
            placeholder="Field name (e.g. Fry count)"
            className="field col-span-2 sm:col-span-1"
          />
          <select
            value={newFieldType}
            onChange={(e) => setNewFieldType(e.target.value as CustomFieldType)}
            className="field"
          >
            {(Object.keys(TYPE_LABELS) as CustomFieldType[]).map((t) => (
              <option key={t} value={t}>
                {TYPE_LABELS[t]}
              </option>
            ))}
          </select>
          <button type="submit" className="btn btn-secondary whitespace-nowrap">
            Add field
          </button>
        </form>
      </div>

      <div className="card border-coral/30 p-5 space-y-3">
        <p className="field-label text-coral">Danger zone</p>
        <p className="text-xs text-foam-dim">
          Deletes this tank and everything in it. Export a backup first if you want to keep it.
        </p>
        <button onClick={handleDeleteTank} className="btn bg-coral/15 text-coral hover:bg-coral/25">
          Delete this tank
        </button>
      </div>
    </div>
  );
}
