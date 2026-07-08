import { useState } from 'react';
import { useData } from '../lib/DataContext';
import { TANK_TEMPLATES, buildTankFromTemplate, type TankTemplate } from '../data/templates';
import { importData } from '../lib/storage';
import type { Tank } from '../types';

export default function CreateTank({ onDone }: { onDone?: () => void }) {
  const { createTank } = useData();
  const [selected, setSelected] = useState<TankTemplate | null>(null);
  const [name, setName] = useState('');
  const [sizeGallons, setSizeGallons] = useState('10');
  const [dimensions, setDimensions] = useState('');
  const [style, setStyle] = useState('');

  const [importedTanks, setImportedTanks] = useState<Tank[] | null>(null);
  const [importError, setImportError] = useState<string | null>(null);

  function pickTemplate(t: TankTemplate) {
    setSelected(t);
    if (t.suggestedStyle && !style) setStyle(t.suggestedStyle);
  }

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim() || !selected) return;
    const tank = buildTankFromTemplate(selected, {
      name: name.trim(),
      sizeGallons: Number(sizeGallons) || 10,
      dimensions: dimensions.trim(),
      style: style.trim(),
    });
    createTank(tank);
    onDone?.();
  }

  async function handleImportFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setImportError(null);
    try {
      const data = await importData(file);
      if (data.tanks.length === 0) {
        setImportError('That file has no tanks in it.');
        setImportedTanks(null);
      } else {
        setImportedTanks(data.tanks);
      }
    } catch {
      setImportError('Could not read that file — is it a tank tracker backup?');
      setImportedTanks(null);
    }
    e.target.value = '';
  }

  function importTank(tank: Tank) {
    // Fresh id — this is landing alongside whatever tanks already exist,
    // never overwriting them, so it can't collide even if the same backup
    // gets imported more than once.
    createTank({ ...tank, id: crypto.randomUUID() });
    onDone?.();
  }

  return (
    <div className="max-w-3xl mx-auto py-10 space-y-8">
      <div className="text-center">
        <p className="font-mono text-xs tracking-widest text-amber uppercase mb-2">
          {onDone ? 'New tank' : 'Welcome'}
        </p>
        <h1 className="font-display text-4xl font-semibold">
          {onDone ? 'Set up a new tank' : "Let's set up your first tank"}
        </h1>
        <p className="text-foam-dim mt-2">
          Start from a template to pre-fill useful tracking fields, start blank and build it
          your own way, or import a tank from a backup file — all one click.
        </p>
      </div>

      <div className="grid sm:grid-cols-2 gap-3">
        {TANK_TEMPLATES.map((t) => (
          <button
            key={t.id}
            onClick={() => pickTemplate(t)}
            className={`text-left p-4 rounded-lg border transition-colors ${
              selected?.id === t.id
                ? 'border-amber bg-amber/10'
                : 'border-moss/30 bg-deepwater hover:border-moss/60'
            } ${t.id === 'blank' ? 'sm:col-span-2' : ''}`}
          >
            <h3 className="font-display text-lg font-semibold">{t.name}</h3>
            <p className="text-sm text-foam-dim mt-1">{t.description}</p>
            {t.customFields.length > 0 && (
              <div className="flex flex-wrap gap-1.5 mt-3">
                {t.customFields.map((f) => (
                  <span key={f.label} className="pill text-[11px] py-1 px-2 bg-sand/10 text-sand">
                    {f.label}
                  </span>
                ))}
              </div>
            )}
          </button>
        ))}
      </div>

      {selected && (
        <form onSubmit={submit} className="card p-5 space-y-3">
          <p className="field-label">
            Tank details — {selected.name}
          </p>
          <input
            placeholder="Tank name (e.g. The Shrimp Tank, Guppy 20L)"
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="field font-medium"
            required
            autoFocus
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
              <label className="field-label">Dimensions (optional)</label>
              <input
                value={dimensions}
                onChange={(e) => setDimensions(e.target.value)}
                placeholder='20" x 10" x 12"'
                className="field"
              />
            </div>
            <div>
              <label className="field-label">Style (optional)</label>
              <input
                value={style}
                onChange={(e) => setStyle(e.target.value)}
                placeholder={selected.suggestedStyle || 'Low-tech planted'}
                className="field"
              />
            </div>
          </div>
          <div className="flex gap-2">
            <button type="submit" className="btn btn-primary flex-1">
              Create tank
            </button>
            {onDone && (
              <button type="button" onClick={onDone} className="btn btn-ghost">
                Cancel
              </button>
            )}
          </div>
        </form>
      )}

      <div className="flex items-center gap-3">
        <div className="flex-1 h-px bg-moss/20" />
        <p className="font-mono text-xs text-foam-dim/60 uppercase tracking-widest">or</p>
        <div className="flex-1 h-px bg-moss/20" />
      </div>

      <div className="card p-5 space-y-3">
        <div>
          <p className="field-label">Import a tank from a backup file</p>
          <p className="text-xs text-foam-dim">
            Bring in a tank from another device or an older backup — it's added alongside
            whatever tanks you already have, nothing gets overwritten.
          </p>
        </div>
        <input
          type="file"
          accept="application/json"
          onChange={handleImportFile}
          className="text-sm text-foam-dim file:mr-3 file:px-3 file:py-1.5 file:rounded-md file:border file:border-moss/30 file:bg-transparent file:text-foam-dim file:text-xs file:cursor-pointer hover:file:text-foam hover:file:border-moss/60 file:transition-colors"
        />
        {importError && <p className="text-xs text-coral">{importError}</p>}
        {importedTanks && (
          <div className="space-y-2 pt-2 border-t border-moss/15">
            {importedTanks.map((t) => (
              <div
                key={t.id}
                className="flex items-center justify-between gap-3 bg-deepwater-2 rounded-md px-3 py-2"
              >
                <div>
                  <p className="text-sm text-foam font-medium">{t.name}</p>
                  <p className="text-xs text-foam-dim">
                    {t.sizeGallons} gal · {t.roster.length} roster items ·{' '}
                    {t.checklist.length} checklist steps · {t.logs.length} log entries
                  </p>
                </div>
                <button
                  onClick={() => importTank(t)}
                  className="btn btn-secondary shrink-0"
                >
                  Import this tank
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
