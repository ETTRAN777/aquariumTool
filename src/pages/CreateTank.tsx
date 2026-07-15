import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useData } from '../lib/DataContext';
import { TANK_TEMPLATES, buildTankFromTemplate, type TankTemplate } from '../data/templates';
import { importData, tankContentKey } from '../lib/storage';
import TankQuestionnaire from '../components/TankQuestionnaire';
import type { Tank, RecommendedRosterItem } from '../types';
import { NAME_MAX_LENGTH, STYLE_MAX_LENGTH, closestStandardDimensions } from '../lib/constants';

interface PendingTankDetails {
  name: string;
  sizeGallons: number;
  dimensions?: string;
  style?: string;
}

export default function CreateTank({ onDone }: { onDone?: () => void }) {
  const { data, createTank, updateTank } = useData();
  const [selected, setSelected] = useState<TankTemplate | null>(null);
  const [name, setName] = useState('');
  const [sizeGallons, setSizeGallons] = useState('');
  const [dimensions, setDimensions] = useState('');
  const [style, setStyle] = useState('');
  const [pendingDetails, setPendingDetails] = useState<PendingTankDetails | null>(null);
  const [sizeError, setSizeError] = useState<string | null>(null);

  const [importedTanks, setImportedTanks] = useState<Tank[] | null>(null);
  const [importError, setImportError] = useState<string | null>(null);

  function pickTemplate(t: TankTemplate) {
    setSelected(t);
    setSizeError(null);
  }

  function finishCreate(recommendedItems: RecommendedRosterItem[] = []) {
    if (!selected || !pendingDetails) return;
    const tank = buildTankFromTemplate(selected, pendingDetails, recommendedItems);
    createTank(tank);
    setPendingDetails(null);
    onDone?.();
  }

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim() || !selected) return;

    // The `required` attribute on the input blocks a fully-empty submit at
    // the browser level, but that's not airtight on its own — a value like
    // "-3" or "0" passes `required` (it's non-empty) while still being
    // meaningless as a tank size. This check is the real gate: it demands
    // an actual positive number rather than falling back to a default like
    // `Number(sizeGallons) || 10` would. That fallback pattern is the
    // trap — `Number('')` is `0`, which is falsy, so leaving the field
    // untouched (relying on the placeholder as if it were the value)
    // silently produced a real "10" tank behind the scenes. Blank was
    // never actually 10; it just looked like it because the placeholder
    // text is visually identical to real input. Rejecting it explicitly
    // here closes that gap.
    const parsedGallons = Number(sizeGallons);
    if (sizeGallons.trim() === '' || !Number.isFinite(parsedGallons) || parsedGallons <= 0) {
      setSizeError('Enter a tank size — this field can\'t be left blank.');
      return;
    }

    if (parsedGallons < selected.minGallons) {
      setSizeError(
        `${selected.name} needs at least ${selected.minGallons} gallons to work at all — this size won't support it. Try a bigger tank, or a different template.`
      );
      return;
    }
    setSizeError(null);

    // An empty description defaults to the template name — "Your Tank"
    // specifically for Blank, since it has no template name worth reusing.
    const defaultDescription = selected.id === 'blank' ? 'Your Tank' : selected.name;

    const details: PendingTankDetails = {
      name: name.trim(),
      sizeGallons: parsedGallons,
      dimensions: dimensions.trim() || closestStandardDimensions(parsedGallons),
      style: style.trim() || defaultDescription,
    };
    // Templates with a questionnaire attached pause here instead of
    // creating immediately — the tank gets built once the questionnaire
    // finishes (or is skipped), with whatever roster items came out of it.
    if (selected.questionnaire) {
      setPendingDetails(details);
      return;
    }
    const tank = buildTankFromTemplate(selected, details);
    createTank(tank);
    onDone?.();
  }

  async function handleImportFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setImportError(null);
    try {
      const parsed = await importData(file);
      if (parsed.tanks.length === 0) {
        setImportError('That file has no tanks in it.');
        setImportedTanks(null);
      } else {
        setImportedTanks(parsed.tanks);
      }
    } catch {
      setImportError('Could not read that file — is it a tank tracker backup?');
      setImportedTanks(null);
    }
    e.target.value = '';
  }

  // Fresh id — this is landing alongside whatever tanks already exist,
  // never overwriting them by default.
  function importAsNew(tank: Tank) {
    createTank({ ...tank, id: crypto.randomUUID() });
    onDone?.();
  }

  // Bulk version of importAsNew — only touches tanks with no name match in
  // the existing collection, so anything that needs a replace/keep-both
  // decision is left alone for the per-tank controls below. Fires onDone
  // once at the end instead of after every tank, which was the actual bug:
  // importAsNew closed the import view after the very first click, so a
  // backup with several brand-new tanks required reopening "New tank" once
  // per tank just to import the rest.
  function importAllNew() {
    if (!importedTanks) return;
    const newOnes = importedTanks.filter(
      (t) =>
        !data.tanks.find(
          (existing) => existing.name.trim().toLowerCase() === t.name.trim().toLowerCase()
        )
    );
    for (const t of newOnes) {
      createTank({ ...t, id: crypto.randomUUID() });
    }
    onDone?.();
  }

  function replaceExisting(imported: Tank, existingId: string) {
    updateTank({ ...imported, id: existingId });
    onDone?.();
  }

  if (pendingDetails && selected?.questionnaire) {
    return (
      <div className="max-w-2xl mx-auto py-10 space-y-6">
        <div className="text-center">
          <p className="font-mono text-xs tracking-widest text-amber uppercase mb-2">
            {selected.name} — a few quick questions
          </p>
          <h1 className="font-display text-3xl font-semibold">
            Let's find the right starting roster for "{pendingDetails.name}"
          </h1>
        </div>
        <TankQuestionnaire
          root={selected.questionnaire}
          sizeGallons={pendingDetails.sizeGallons}
          onComplete={(items) => finishCreate(items)}
          onSkip={() => finishCreate([])}
          onExit={() => {
            setPendingDetails(null);
            setSelected(null);
          }}
        />
      </div>
    );
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
          your own way, or hand your build plan to an AI assistant and import what it generates
          — all one click.
        </p>
      </div>

      <Link
        to="/docs"
        className="block card border-amber/40 hover:border-amber/70 hover:bg-amber/5 transition-colors p-4"
      >
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="font-mono text-[11px] text-amber uppercase tracking-widest mb-1">
              Have a build plan already?
            </p>
            <p className="text-sm text-foam">
              Paste our JSON format reference into an AI assistant along with your own plan,
              however detailed — it can generate a file you import directly below, no template
              or questionnaire needed.
            </p>
          </div>
          <span className="text-amber text-sm font-medium shrink-0">View docs →</span>
        </div>
      </Link>

      <div className="grid sm:grid-cols-2 gap-3">
        {TANK_TEMPLATES.map((t, i) => {
          // Last card gets the full row to itself whenever the total count
          // is odd, so a plain 2-column grid never leaves one dangling
          // half-width — this adjusts itself automatically as templates
          // are added or removed, no per-template id to keep in sync.
          const isDanglingLast = TANK_TEMPLATES.length % 2 !== 0 && i === TANK_TEMPLATES.length - 1;
          return (
            <button
              key={t.id}
              onClick={() => pickTemplate(t)}
              className={`text-left p-4 rounded-lg border transition-colors ${
                isDanglingLast ? 'sm:col-span-2' : ''
              } ${
                selected?.id === t.id
                  ? 'border-amber bg-amber/10'
                  : 'border-moss/30 bg-deepwater hover:border-moss/60'
              }`}
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
          );
        })}
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
            maxLength={NAME_MAX_LENGTH}
          />
          {name.length === NAME_MAX_LENGTH && (
            <p className="text-[11px] text-coral font-medium">
              ⚠ Tank names can't exceed {NAME_MAX_LENGTH} characters.
            </p>
          )}
          <div className="grid sm:grid-cols-3 gap-3">
            <div>
              <label className="field-label">Size (gallons)</label>
              <input
                type="number"
                value={sizeGallons}
                onChange={(e) => setSizeGallons(e.target.value)}
                placeholder="10"
                required
                min="0.1"
                step="any"
                className="field"
              />
              {selected.minGallons > 0.5 && (
                <p className="text-[11px] text-foam-dim/60 mt-1">
                  {selected.name} needs at least {selected.minGallons}gal
                </p>
              )}
            </div>
            <div>
              <label className="field-label">Dimensions (optional)</label>
              <input
                value={dimensions}
                onChange={(e) => setDimensions(e.target.value)}
                placeholder={closestStandardDimensions(Number(sizeGallons) || 10)}
                className="field"
              />
              <p className="text-[11px] text-foam-dim/60 mt-1">
                Autofills with approximation if blank
              </p>
            </div>
            <div>
              <label className="field-label">Short description (optional)</label>
              <input
                value={style}
                onChange={(e) => setStyle(e.target.value)}
                placeholder="e.g. Low-tech planted, biotope, minimalist hardscape, blackwater"
                className="field"
                maxLength={STYLE_MAX_LENGTH}
              />
              {style.length === STYLE_MAX_LENGTH && (
                <p className="text-[11px] text-coral font-medium mt-1">
                  ⚠ Short descriptions can't exceed {STYLE_MAX_LENGTH} characters.
                </p>
              )}
            </div>
          </div>
          {sizeError && (
            <div className="flex items-center gap-2 rounded-lg border border-coral/40 bg-coral/10 px-3 py-2">
              <span className="text-coral text-sm font-semibold">⚠</span>
              <p className="text-xs text-coral/90">{sizeError}</p>
            </div>
          )}
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
            Bring in a tank from another device or an older backup — new tanks land
            alongside whatever you already have. If a tank matches one you've already got,
            you'll be offered a choice instead of ending up with a duplicate.
          </p>
        </div>
        <input
          type="file"
          accept="application/json"
          onChange={handleImportFile}
          className="text-sm text-foam-dim file:mr-3 file:px-3 file:py-1.5 file:rounded-md file:border file:border-moss/30 file:bg-transparent file:text-foam-dim file:text-xs file:cursor-pointer hover:file:text-foam hover:file:border-moss/60 file:transition-colors"
        />
        {importError && <p className="text-xs text-coral">{importError}</p>}
        {importedTanks && (() => {
          const newOnes = importedTanks.filter(
            (t) =>
              !data.tanks.find(
                (existing) => existing.name.trim().toLowerCase() === t.name.trim().toLowerCase()
              )
          );
          return newOnes.length > 1 ? (
            <div className="flex items-center justify-between gap-3 bg-deepwater-2 rounded-md px-3 py-2">
              <p className="text-xs text-foam-dim">
                {newOnes.length} tanks in this file are brand new — bring them all in at once,
                or handle each one individually below.
              </p>
              <button onClick={importAllNew} className="btn btn-primary shrink-0 text-xs">
                Import all {newOnes.length} new tanks
              </button>
            </div>
          ) : null;
        })()}
        {importedTanks && (
          <div className="space-y-2 pt-2 border-t border-moss/15">
            {importedTanks.map((t) => {
              const existingByName = data.tanks.find(
                (existing) => existing.name.trim().toLowerCase() === t.name.trim().toLowerCase()
              );
              const isExactDuplicate =
                existingByName && tankContentKey(existingByName) === tankContentKey(t);

              return (
                <div key={t.id} className="bg-deepwater-2 rounded-md px-3 py-2 space-y-2">
                  <div className="flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-sm text-foam font-medium">{t.name}</p>
                      <p className="text-xs text-foam-dim">
                        {t.sizeGallons} gal · {t.roster.length} roster items ·{' '}
                        {t.checklist.length} checklist steps · {t.logs.length} log entries
                      </p>
                    </div>

                    {!existingByName && (
                      <button
                        onClick={() => importAsNew(t)}
                        className="btn btn-secondary shrink-0"
                      >
                        Import this tank
                      </button>
                    )}

                    {isExactDuplicate && (
                      <button
                        onClick={() => importAsNew(t)}
                        className="btn btn-ghost shrink-0 text-xs"
                        title="You already have an identical copy of this tank"
                      >
                        Import anyway (duplicate)
                      </button>
                    )}
                  </div>

                  {isExactDuplicate && (
                    <p className="text-xs text-foam-dim/70 pl-0.5">
                      ✓ Already have this exact tank — nothing new to bring in.
                    </p>
                  )}

                  {existingByName && !isExactDuplicate && (
                    <div className="space-y-1.5">
                      <p className="text-xs text-sand pl-0.5">
                        You already have a tank named "{existingByName.name}" with different
                        data — replace it, or keep both?
                      </p>
                      <div className="flex gap-2">
                        <button
                          onClick={() => replaceExisting(t, existingByName.id)}
                          className="btn btn-secondary text-xs"
                        >
                          Replace existing
                        </button>
                        <button
                          onClick={() => importAsNew(t)}
                          className="btn btn-ghost text-xs"
                        >
                          Keep both
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
