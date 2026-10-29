import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useData } from '../lib/DataContext';
import { PRESET_FIELDS } from '../data/presetFields';
import type { CustomFieldDef, CustomFieldType } from '../types';
import { NAME_MAX_LENGTH, STYLE_MAX_LENGTH, closestStandardDimensions } from '../lib/constants';
import ConfirmModal from '../components/ConfirmModal';
import { migrateInlinePhotosToIndexedDb, formatBytes } from '../lib/storage';
import { isStoredPhotoRef, sumPhotoBytes, listPhotoIds, deletePhotos } from '../lib/photoStore';
import { collectPhotoRefIds } from '../lib/photoRefs';
import {
  TYPICAL_LOCAL_STORAGE_CAP,
  ensureLocalStorageCapMeasured,
  getOriginEstimate,
  localStorageUsedUnits,
  readCachedCap,
  type MeasuredCap,
} from '../lib/storageUsage';

const TYPE_LABELS: Record<CustomFieldType, string> = {
  number: 'Number',
  text: 'Text',
  boolean: 'Yes / No',
};

export default function Settings() {
  const { activeTank, updateTank, setCustomFields, deleteTank, data, setData } = useData();
  const navigate = useNavigate();
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [freeingStorage, setFreeingStorage] = useState(false);
  const [freeStorageResult, setFreeStorageResult] = useState<
    { migratedCount: number; bytesFreed: number } | 'error' | null
  >(null);

  // Storage meter (see lib/storageUsage.ts). The cap is measured once per
  // browser and remembered; until that lands, the bar falls back to the
  // documented typical figure and says so.
  const [lsUsed, setLsUsed] = useState(() => localStorageUsedUnits());
  const [lsCap, setLsCap] = useState<MeasuredCap | null>(() => readCachedCap());
  const [photoStats, setPhotoStats] = useState<{ count: number; bytes: number } | 'unavailable' | null>(null);
  const [originEstimate, setOriginEstimate] = useState<{ usage: number; quota: number } | null>(null);
  // Stored photos no log entry points at (see lib/photoRefs.ts). null until
  // counted.
  const [unusedPhotoCount, setUnusedPhotoCount] = useState<number | null>(null);
  const [clearUnusedOpen, setClearUnusedOpen] = useState(false);
  const [clearedUnused, setClearedUnused] = useState<number | null>(null);

  useEffect(() => {
    let cancelled = false;
    ensureLocalStorageCapMeasured().then((c) => {
      if (!cancelled && c) setLsCap(c);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  // Recomputed whenever the app's data changes or a migration finishes, so
  // the numbers move after "Free up local storage" runs instead of going
  // stale. Deferred one tick: DataProvider's save effect runs after this
  // component's effects in the same commit, so reading localStorage
  // immediately would still show the previous save.
  useEffect(() => {
    let cancelled = false;
    const t = setTimeout(() => {
      setLsUsed(localStorageUsedUnits());
      sumPhotoBytes()
        .then((s) => {
          if (!cancelled) setPhotoStats(s);
        })
        .catch(() => {
          if (!cancelled) setPhotoStats('unavailable');
        });
      getOriginEstimate().then((e) => {
        if (!cancelled) setOriginEstimate(e);
      });
      listPhotoIds()
        .then((ids) => {
          if (cancelled) return;
          const used = collectPhotoRefIds(data);
          setUnusedPhotoCount(ids.filter((id) => !used.has(id)).length);
        })
        .catch(() => {
          if (!cancelled) setUnusedPhotoCount(null);
        });
    }, 0);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [data, freeStorageResult]);

  const lsCapForBar = lsCap?.cap ?? TYPICAL_LOCAL_STORAGE_CAP;
  const lsPct = Math.min(100, Math.round((lsUsed / lsCapForBar) * 100));
  const lsTone = storageTone(lsPct);

  // Photo storage (IndexedDB). Its "cap" is the browser's own estimate for
  // the whole site, used exactly as given: the bar is that estimate's usage
  // over its quota, and it is fine if the bar never visibly fills. If the
  // browser ever refuses a write for being over quota, that is reported
  // separately by the save-failure banner, so the bar doesn't have to be
  // precise to be useful.
  const idbPct =
    originEstimate && originEstimate.quota > 0
      ? Math.min(100, (originEstimate.usage / originEstimate.quota) * 100)
      : 0;
  const idbTone = storageTone(idbPct);

  const [name, setName] = useState(activeTank?.name ?? '');
  const [sizeGallons, setSizeGallons] = useState(activeTank?.sizeGallons?.toString() ?? '');
  const [dimensions, setDimensions] = useState(activeTank?.dimensions ?? '');
  const [lengthIn, setLengthIn] = useState(activeTank?.lengthIn?.toString() ?? '');
  const [widthIn, setWidthIn] = useState(activeTank?.widthIn?.toString() ?? '');
  const [style, setStyle] = useState(activeTank?.style ?? '');
  const [waterType, setWaterType] = useState<'freshwater' | 'saltwater'>(
    activeTank?.waterType ?? 'freshwater'
  );
  const [startDate, setStartDate] = useState(activeTank?.startDate ?? '');

  const [newFieldLabel, setNewFieldLabel] = useState('');
  const [newFieldType, setNewFieldType] = useState<CustomFieldType>('number');
  const [showPresets, setShowPresets] = useState(false);

  // Counted from the plain string length, matching migrateInlinePhotosToIndexedDb's
  // own accounting — this is specifically "how much shorter would the
  // localStorage JSON be," the actual quota pressure, not the photo's real
  // byte size (which is somewhat smaller, since this length includes the
  // base64 inflation that storing it as a Blob removes entirely).
  const { legacyPhotoCount, legacyPhotoBytes } = useMemo(() => {
    let count = 0;
    let bytes = 0;
    for (const t of data.tanks) {
      for (const l of t.logs) {
        for (const url of l.photoUrls ?? []) {
          if (!isStoredPhotoRef(url)) {
            count += 1;
            bytes += url.length;
          }
        }
      }
    }
    return { legacyPhotoCount: count, legacyPhotoBytes: bytes };
  }, [data.tanks]);

  async function handleFreeStorage() {
    setFreeingStorage(true);
    setFreeStorageResult(null);
    try {
      const { data: migrated, migratedCount, bytesFreed } = await migrateInlinePhotosToIndexedDb(data);
      setData(migrated);
      setFreeStorageResult({ migratedCount, bytesFreed });
    } catch (err) {
      console.error(err);
      setFreeStorageResult('error');
    } finally {
      setFreeingStorage(false);
    }
  }

  // Re-lists at click time and compares against the data as it is right
  // now, so nothing added since the count was taken can be removed.
  async function clearUnusedPhotos() {
    setClearUnusedOpen(false);
    try {
      const used = collectPhotoRefIds(data);
      const unused = (await listPhotoIds()).filter((id) => !used.has(id));
      await deletePhotos(unused);
      setClearedUnused(unused.length);
      setUnusedPhotoCount(0);
      sumPhotoBytes()
        .then(setPhotoStats)
        .catch(() => setPhotoStats('unavailable'));
      getOriginEstimate().then(setOriginEstimate);
    } catch (err) {
      console.error(err);
    }
  }

  if (!activeTank) return null;

  function saveTankInfo(e: React.FormEvent) {
    e.preventDefault();
    if (!activeTank || !name.trim()) return;
    const resolvedGallons = Number(sizeGallons) || activeTank.sizeGallons;
    updateTank({
      ...activeTank,
      name: name.trim(),
      sizeGallons: resolvedGallons,
      dimensions: dimensions.trim() || closestStandardDimensions(resolvedGallons),
      lengthIn: lengthIn.trim() ? Number(lengthIn) : undefined,
      widthIn: widthIn.trim() ? Number(widthIn) : undefined,
      style: style.trim() || undefined,
      waterType,
      startDate: startDate.trim(),
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
            <label className="field-label">Short description</label>
            <input
              value={style}
              onChange={(e) => setStyle(e.target.value)}
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
        <div className="grid sm:grid-cols-3 gap-3">
          <div>
            <label className="field-label">Length (in, optional)</label>
            <input
              type="number"
              value={lengthIn}
              onChange={(e) => setLengthIn(e.target.value)}
              className="field"
            />
          </div>
          <div>
            <label className="field-label">Width (in, optional)</label>
            <input
              type="number"
              value={widthIn}
              onChange={(e) => setWidthIn(e.target.value)}
              className="field"
            />
          </div>
          <div>
            <label className="field-label">Start date (optional)</label>
            <input
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              className="field"
            />
            <p className="text-[11px] text-foam-dim/60 mt-1">
              Powers Timeline's "Your Tank is X old" and the Dashboard's build-stage duration.
            </p>
          </div>
        </div>
        <p className="text-[11px] text-foam-dim/70 -mt-2">
          Length/Width power the Compatibility page's minimum-tank-size check
          — separate from the free-text Dimensions above, since that can't be
          compared against a researched number.
        </p>
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
            on the Log and Parameters pages.
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
            These show up as inputs on every Log entry, and numeric ones get charted
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

      {/* Always shown now: the meter is useful on its own, long before
          anything needs freeing. The migration messaging below still only
          appears when there's something to migrate or a result to show —
          legacyPhotoCount alone would make the success message vanish the
          instant a migration succeeds (it drops to 0 in the same render
          that sets freeStorageResult), hence the second condition. */}
      <div className="card p-5 space-y-4">
        <p className="field-label">Local storage</p>

        <StorageMeter
          label="Saved data"
          used={formatStorage(lsUsed)}
          cap={
            lsCap
              ? `${lsCap.atLeast ? 'at least ' : ''}${formatStorage(lsCap.cap)}`
              : `about ${formatStorage(TYPICAL_LOCAL_STORAGE_CAP)}`
          }
          pct={lsPct}
          tone={lsTone}
          ariaLabel="Saved data used"
        >
          Your tanks, logs, roster and settings, plus any photos still stored the old way. Approximate —{' '}
          {lsCap
            ? "this browser's limit was measured once and is remembered."
            : "still measuring this browser's limit; the bar uses the typical figure until then."}
          {lsPct >= 80 && ' Getting close to the limit — exporting a backup is a good idea.'}
        </StorageMeter>

        {originEstimate ? (
          <StorageMeter
            label="Photos and other site storage"
            used={formatStorage(originEstimate.usage)}
            cap={formatStorage(originEstimate.quota)}
            pct={idbPct}
            tone={idbTone}
            ariaLabel="Photo and site storage used"
          >
            {photoStats && photoStats !== 'unavailable'
              ? `${photoStats.count} photo${photoStats.count === 1 ? '' : 's'}, about ${formatStorage(photoStats.bytes)}, kept in your browser's photo storage. `
              : ''}
            The limit is your browser's own rough estimate for this whole site, so treat the bar as a
            guide: it may never visibly fill, and if the browser does run out of room, Tidemark will
            tell you when a save fails.
          </StorageMeter>
        ) : (
          <div className="space-y-1.5">
            <p className="text-sm text-foam">Photos</p>
            <p className="font-display text-2xl font-semibold text-moss-light tabular-nums">
              {photoStats === null
                ? 'Checking…'
                : photoStats === 'unavailable'
                  ? 'Unavailable in this browser'
                  : `${formatStorage(photoStats.bytes)} · ${photoStats.count} photo${photoStats.count === 1 ? '' : 's'}`}
            </p>
            <p className="text-xs text-foam-dim">
              Kept in your browser's photo storage. This browser doesn't report a limit for it.
            </p>
          </div>
        )}

        {unusedPhotoCount !== null && unusedPhotoCount > 0 && (
          <div className="rounded-lg border border-amber/40 bg-amber/5 p-3 space-y-2">
            <p className="text-sm text-foam">
              {unusedPhotoCount} stored photo{unusedPhotoCount === 1 ? ' is' : 's are'} not used by any
              log entry.
            </p>
            <p className="text-xs text-foam-dim">
              These are leftovers, for example from replacing a tank with an import or deleting a tank.
              Nothing you can see in your tanks uses them, so removing them only frees space.
            </p>
            <button type="button" className="btn btn-secondary" onClick={() => setClearUnusedOpen(true)}>
              Remove unused photos
            </button>
          </div>
        )}
        {clearedUnused !== null && (
          <p className="text-xs text-moss-light" role="status">
            Removed {clearedUnused} unused photo{clearedUnused === 1 ? '' : 's'}.
          </p>
        )}

        {(legacyPhotoCount > 0 || freeStorageResult) && (
        <div className="space-y-3">
          {legacyPhotoCount > 0 && (
            <p className="text-xs text-foam-dim">
              {legacyPhotoCount} photo{legacyPhotoCount === 1 ? '' : 's'} across every tank{' '}
              {legacyPhotoCount === 1 ? 'is' : 'are'} still stored the old way — inline in the same
              place as everything else the app saves, which is what a full quota looks like. Moving
              {legacyPhotoCount === 1 ? ' it' : ' them'} to the browser's photo storage instead frees
              up roughly {formatBytes(legacyPhotoBytes)} without losing or changing anything about the
              photos themselves — they'll look and work exactly the same everywhere in the app,
              including in an exported backup.
            </p>
          )}
          {legacyPhotoCount > 0 && (
            <button
              onClick={handleFreeStorage}
              disabled={freeingStorage}
              className="btn btn-secondary disabled:opacity-50"
            >
              {freeingStorage ? 'Freeing up storage…' : 'Free up local storage'}
            </button>
          )}
          {freeStorageResult === 'error' && (
            <p className="text-xs text-coral">
              Couldn't complete this — your browser may be blocking this kind of storage. Nothing
              was changed; your photos are exactly as they were.
            </p>
          )}
          {freeStorageResult && freeStorageResult !== 'error' && (
            <p className="text-xs text-moss-light">
              Moved {freeStorageResult.migratedCount} photo{freeStorageResult.migratedCount === 1 ? '' : 's'},
              freeing about {formatBytes(freeStorageResult.bytesFreed)}.
            </p>
          )}
        </div>
        )}
      </div>

      <div className="card border-coral/30 p-5 space-y-3">
        <p className="field-label text-coral">Danger zone</p>
        <p className="text-xs text-foam-dim">
          Deletes this tank and everything in it. Export a backup first if you want to keep it.
        </p>
        <button
          onClick={() => setDeleteConfirmOpen(true)}
          className="btn bg-coral/15 text-coral hover:bg-coral/25"
        >
          Delete this tank
        </button>
      </div>

      <ConfirmModal
        open={clearUnusedOpen}
        title="Remove unused photos?"
        message={`Remove ${unusedPhotoCount ?? 0} stored photo${unusedPhotoCount === 1 ? '' : 's'} that no log entry in any tank uses? This can't be undone.`}
        confirmLabel="Remove photos"
        danger
        onConfirm={() => void clearUnusedPhotos()}
        onCancel={() => setClearUnusedOpen(false)}
      />
      <ConfirmModal
        open={deleteConfirmOpen}
        title="Delete this tank?"
        message={`Delete "${activeTank.name}" and everything in it — roster, checklist, and every log entry? This can't be undone (unless you've exported a backup).`}
        confirmLabel="Delete tank"
        danger
        onConfirm={() => {
          setDeleteConfirmOpen(false);
          handleDeleteTank();
        }}
        onCancel={() => setDeleteConfirmOpen(false)}
      />
    </div>
  );
}

// One decimal below 100 MB, none above: "10.2 MB" but "10250 MB".
function formatStorage(bytes: number): string {
  const mb = bytes / (1024 * 1024);
  if (bytes >= 100 * 1024 * 1024) return `${Math.round(mb)} MB`;
  return formatBytes(bytes);
}

// Same thresholds the meter always used: amber from 70%, coral from 90%.
function storageTone(pct: number): { bar: string; text: string } {
  if (pct >= 90) return { bar: 'bg-coral', text: 'text-coral' };
  if (pct >= 70) return { bar: 'bg-amber', text: 'text-amber' };
  return { bar: 'bg-moss-light', text: 'text-moss-light' };
}

function StorageMeter({
  label,
  used,
  cap,
  pct,
  tone,
  ariaLabel,
  children,
}: {
  label: string;
  used: string;
  cap: string;
  pct: number;
  tone: { bar: string; text: string };
  ariaLabel: string;
  children: React.ReactNode;
}) {
  // A nonzero amount always shows at least a sliver, so a tiny share of a
  // huge limit doesn't read as an empty bar.
  const width = pct > 0 ? Math.max(pct, 1.5) : 0;
  const pctText = pct > 0 && pct < 1 ? 'under 1%' : `${Math.round(pct)}%`;
  return (
    <div className="space-y-2">
      <p className="text-sm text-foam">{label}</p>
      <p className="font-display tabular-nums leading-tight">
        <span className={`text-3xl font-semibold ${tone.text}`}>{used}</span>
        <span className="text-xl text-foam-dim"> / {cap}</span>
        <span className="ml-3 text-sm text-foam-dim">{pctText} used</span>
      </p>
      <div
        className="h-2.5 w-full rounded-full bg-foam/10 overflow-hidden"
        role="progressbar"
        aria-label={ariaLabel}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={Math.round(pct)}
      >
        <div className={`h-full rounded-full ${tone.bar}`} style={{ width: `${width}%` }} />
      </div>
      <p className="text-xs text-foam-dim">{children}</p>
    </div>
  );
}