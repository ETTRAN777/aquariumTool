import { useState } from 'react';
import { useData } from '../lib/DataContext';
import { TARGET_TRAIT_PRESETS } from '../data/targetTraitPresets';
import {
  aggregateWaterParamTarget,
  computeParamStatus,
  computePredationThreats,
  waterParamLabel,
  buildResearchPrompt,
  type TargetStatus,
} from '../lib/targets';
import type { RosterItem, RosterItemTrait, WaterParams, CustomFieldType, CustomFieldValue } from '../types';

const FRESHWATER_PARAMS: (keyof WaterParams)[] = ['temperature', 'ph', 'gh', 'kh', 'tds'];
const SALTWATER_PARAMS: (keyof WaterParams)[] = ['temperature', 'ph', 'salinity'];

const STATUS_STYLES: Record<TargetStatus, { label: string; classes: string }> = {
  'no-target': { label: 'No targets set', classes: 'border-moss/15 bg-deepwater-2' },
  'no-data': { label: 'Not logged yet', classes: 'border-sand/25 bg-sand/5' },
  conflict: { label: '⚠ Conflicting targets', classes: 'border-coral/40 bg-coral/10' },
  ok: { label: '✓ Within target', classes: 'border-moss/30 bg-moss/10' },
  alert: { label: '⚠ Out of target', classes: 'border-coral/40 bg-coral/10' },
};

export default function Targets() {
  const { activeTank, updateRosterItem } = useData();
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [threatListOpenId, setThreatListOpenId] = useState<string | null>(null);

  if (!activeTank) return null;
  const tank = activeTank;

  const relevantParams = tank.waterType === 'saltwater' ? SALTWATER_PARAMS : FRESHWATER_PARAMS;
  const targetableItems = tank.roster.filter(
    (r) => r.category === 'livestock' || r.category === 'plant'
  );

  function latestValue(param: keyof WaterParams): number | undefined {
    const entry = tank.logs.find((l) => l.params?.[param] !== undefined);
    return entry?.params?.[param];
  }

  function copyPrompt(item: RosterItem) {
    const prompt = buildResearchPrompt(item, tank.waterType);
    navigator.clipboard
      .writeText(prompt)
      .then(() => {
        setCopiedId(item.id);
        setTimeout(() => setCopiedId((cur) => (cur === item.id ? null : cur)), 2000);
      })
      .catch(() => {
        // Clipboard permission denied or unavailable — fail quietly rather
        // than throw.
      });
  }

  function setWaterParamTarget(
    item: RosterItem,
    param: keyof WaterParams,
    field: 'min' | 'max',
    rawValue: string
  ) {
    const num = rawValue === '' ? undefined : Number(rawValue);
    const nextForParam = { ...item.waterParamTargets?.[param], [field]: num };
    const waterParamTargets = { ...item.waterParamTargets };
    if (nextForParam.min === undefined && nextForParam.max === undefined) {
      delete waterParamTargets[param];
    } else {
      waterParamTargets[param] = nextForParam;
    }
    updateRosterItem({ ...item, waterParamTargets });
  }

  function setMouthSize(item: RosterItem, rawValue: string) {
    updateRosterItem({
      ...item,
      mouthSizeMm: rawValue === '' ? undefined : Number(rawValue),
    });
  }

  function setAdultSize(item: RosterItem, rawValue: string) {
    updateRosterItem({
      ...item,
      adultSizeIn: rawValue === '' ? undefined : Number(rawValue),
    });
  }

  function togglePredatorOverride(item: RosterItem) {
    updateRosterItem({ ...item, predatorRiskOverride: !item.predatorRiskOverride });
  }

  function addTrait(item: RosterItem, label: string, type: CustomFieldType) {
    const traits: RosterItemTrait[] = [
      ...(item.traits ?? []),
      { id: crypto.randomUUID(), label, type, value: undefined },
    ];
    updateRosterItem({ ...item, traits });
  }

  function updateTraitValue(item: RosterItem, traitId: string, value: CustomFieldValue | undefined) {
    const traits = (item.traits ?? []).map((t) => (t.id === traitId ? { ...t, value } : t));
    updateRosterItem({ ...item, traits });
  }

  function removeTrait(item: RosterItem, traitId: string) {
    const traits = (item.traits ?? []).filter((t) => t.id !== traitId);
    updateRosterItem({ ...item, traits });
  }

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      <div>
        <h2 className="font-display text-2xl font-semibold">Compatibility</h2>
        <p className="text-sm text-foam-dim mt-1">
          Set researched target ranges per livestock/plant item below — the tank-wide target for
          each water parameter is automatically the range that works for everything you've added,
          checked against your most recent logged reading. Mouth Size and Adult Size (livestock
          only) automatically compute a Predation Risk flag on anything whose mouth is big enough
          to threaten something smaller elsewhere in the roster — nothing else here is computed
          for you, only recorded for your own reference. Nothing is fetched or guessed; the "Copy
          research prompt" button hands the actual research step to whatever AI you already use.
        </p>
      </div>

      {/* Tank-wide summary */}
      <div className="card p-5">
        <p className="field-label mb-3">Tank-wide targets</p>
        {targetableItems.length === 0 ? (
          <p className="text-sm text-foam-dim">
            Add some livestock or plants on the Roster page first, then come back here to set
            their targets.
          </p>
        ) : (
          <div className="space-y-2">
            {relevantParams.map((param) => {
              const aggregated = aggregateWaterParamTarget(tank.roster, param);
              const current = latestValue(param);
              const status = computeParamStatus(aggregated, current);
              const style = STATUS_STYLES[status];
              return (
                <div
                  key={param}
                  className={`flex flex-wrap items-center gap-x-4 gap-y-1 p-3 rounded-lg border ${style.classes}`}
                >
                  <span className="font-mono text-sm font-semibold w-24 shrink-0">
                    {waterParamLabel(param)}
                  </span>
                  {aggregated ? (
                    <span className="text-xs text-foam">
                      Target: {aggregated.min ?? '—'} to {aggregated.max ?? '—'}
                      {aggregated.conflict && (
                        <span className="text-coral ml-1">
                          ({aggregated.minContributor} needs ≥{aggregated.min}, but{' '}
                          {aggregated.maxContributor} needs ≤{aggregated.max})
                        </span>
                      )}
                    </span>
                  ) : (
                    <span className="text-xs text-foam-dim/60">No targets set for this yet</span>
                  )}
                  {current !== undefined && (
                    <span className="text-xs font-mono text-sand">current: {current}</span>
                  )}
                  <span className="ml-auto text-[11px] font-semibold pill py-0.5 px-2 bg-deepwater-2">
                    {style.label}
                  </span>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Per-item editors */}
      {targetableItems.length > 0 && (
        <div className="space-y-3">
          {targetableItems.map((item) => {
            const isExpanded = expandedId === item.id;
            const threats = computePredationThreats(tank.roster, item);
            const isThreatListOpen = threatListOpenId === item.id;
            return (
              <div key={item.id} className="card p-4">
                <button
                  onClick={() => setExpandedId(isExpanded ? null : item.id)}
                  className="w-full flex items-start justify-between text-left gap-3"
                >
                  <div className="min-w-0">
                    <span className="text-sm font-medium text-foam">
                      {item.name}
                      <span className="text-xs text-foam-dim ml-2">({item.category})</span>
                    </span>
                    {/* Pills stay visible whether or not the card is expanded — a
                        Predation Risk flag or a researched trait shouldn't disappear
                        the moment you collapse the card back down. The click-to-list
                        interaction only activates once expanded, below. */}
                    <div className="flex flex-wrap gap-1.5 mt-1.5">
                      {threats.length > 0 && (
                        <span className="pill text-[11px] py-0.5 px-2 bg-coral/20 text-coral border border-coral/40 font-semibold">
                          ⚠ Predation Risk
                        </span>
                      )}
                      {item.predatorRiskOverride && (
                        <span className="pill text-[11px] py-0.5 px-2 bg-moss/15 text-foam-dim">
                          Predator check excluded
                        </span>
                      )}
                      {(item.traits ?? []).map((trait) => (
                        <span
                          key={trait.id}
                          className="pill text-[11px] py-0.5 px-2 bg-sand/10 text-sand border border-sand/20"
                        >
                          {trait.label}: {formatTraitValue(trait)}
                        </span>
                      ))}
                    </div>
                  </div>
                  <span className="text-xs text-foam-dim shrink-0">{isExpanded ? '▲' : '▼'}</span>
                </button>

                {isExpanded && (
                  <div className="mt-4 space-y-5">
                    {threats.length > 0 && (
                      <div className="rounded-lg border border-coral/40 bg-coral/10 overflow-hidden">
                        <button
                          type="button"
                          onClick={() =>
                            setThreatListOpenId(isThreatListOpen ? null : item.id)
                          }
                          className="w-full flex items-center justify-between gap-2 px-3 py-2 text-left"
                        >
                          <span className="text-xs text-coral">
                            <span className="font-semibold">⚠ Predation Risk</span> — This
                            stock may prey on other roster items
                          </span>
                          <span className="text-[11px] text-coral shrink-0">
                            {isThreatListOpen ? 'Hide ▲' : `Show ${threats.length} ▼`}
                          </span>
                        </button>
                        {isThreatListOpen && (
                          <ul className="px-3 pb-3 space-y-1">
                            {threats.map((t) => (
                              <li key={t.preyId} className="text-xs text-coral/90">
                                • {t.preyName}
                              </li>
                            ))}
                          </ul>
                        )}
                      </div>
                    )}

                    <button
                      onClick={() => copyPrompt(item)}
                      className="btn btn-secondary text-xs py-1.5 px-3"
                    >
                      {copiedId === item.id ? '✓ Copied to clipboard' : '📋 Copy research prompt'}
                    </button>

                    <div>
                      <p className="field-label mb-2">Water parameter targets (optional)</p>
                      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                        {relevantParams.map((param) => (
                          <div key={param}>
                            <label className="text-[11px] text-foam-dim block mb-1">
                              {waterParamLabel(param)}
                            </label>
                            <div className="flex gap-1">
                              <input
                                type="number"
                                step="any"
                                placeholder="min"
                                value={item.waterParamTargets?.[param]?.min ?? ''}
                                onChange={(e) => setWaterParamTarget(item, param, 'min', e.target.value)}
                                className="field text-xs px-2 py-1.5"
                              />
                              <input
                                type="number"
                                step="any"
                                placeholder="max"
                                value={item.waterParamTargets?.[param]?.max ?? ''}
                                onChange={(e) => setWaterParamTarget(item, param, 'max', e.target.value)}
                                className="field text-xs px-2 py-1.5"
                              />
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>

                    {item.category === 'livestock' && (
                      <div>
                        <p className="field-label mb-2">Predation risk</p>
                        <div className="grid grid-cols-2 gap-3">
                          <div>
                            <label className="text-[11px] text-foam-dim block mb-1">
                              Mouth Size (mm)
                            </label>
                            <input
                              type="number"
                              step="any"
                              min="0"
                              value={item.mouthSizeMm ?? ''}
                              onChange={(e) => setMouthSize(item, e.target.value)}
                              className="field text-xs px-2 py-1.5"
                            />
                          </div>
                          <div>
                            <label className="text-[11px] text-foam-dim block mb-1">
                              Adult Size (in)
                            </label>
                            <input
                              type="number"
                              step="any"
                              min="0"
                              value={item.adultSizeIn ?? ''}
                              onChange={(e) => setAdultSize(item, e.target.value)}
                              className="field text-xs px-2 py-1.5"
                            />
                          </div>
                        </div>
                        <label className="flex items-center gap-2 mt-2 text-[11px] text-foam-dim">
                          <input
                            type="checkbox"
                            checked={item.predatorRiskOverride ?? false}
                            onChange={() => togglePredatorOverride(item)}
                          />
                          Exclude this item's mouth size from the predation check (e.g.
                          Otocinclus — a moderate mouth size that isn't actually a predation threat)
                        </label>
                      </div>
                    )}

                    <div>
                      <p className="field-label mb-2">Other traits</p>
                      {(item.traits ?? []).length > 0 && (
                        <div className="space-y-2 mb-3">
                          {item.traits!.map((trait) => (
                            <div key={trait.id} className="flex items-center gap-2">
                              <span className="text-xs text-foam-dim w-36 shrink-0 truncate">
                                {trait.label}
                              </span>
                              <TraitInput
                                trait={trait}
                                onChange={(v) => updateTraitValue(item, trait.id, v)}
                              />
                              <button
                                onClick={() => removeTrait(item, trait.id)}
                                className="btn-icon danger text-xs shrink-0"
                                aria-label="Remove trait"
                              >
                                ✕
                              </button>
                            </div>
                          ))}
                        </div>
                      )}
                      <TraitPresetPicker
                        item={item}
                        onAdd={(label, type) => addTrait(item, label, type)}
                      />
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function formatTraitValue(trait: RosterItemTrait): string {
  if (trait.value === undefined) return '—';
  if (typeof trait.value === 'boolean') return trait.value ? 'Yes' : 'No';
  return String(trait.value);
}

function TraitInput({
  trait,
  onChange,
}: {
  trait: RosterItemTrait;
  onChange: (value: CustomFieldValue | undefined) => void;
}) {
  if (trait.type === 'boolean') {
    return (
      <div className="flex gap-1">
        <button
          type="button"
          onClick={() => onChange(true)}
          className={`text-xs rounded px-2 py-1 border ${
            trait.value === true
              ? 'border-moss bg-moss/20 text-foam'
              : 'border-moss/30 text-foam-dim hover:border-moss/60'
          }`}
        >
          Yes
        </button>
        <button
          type="button"
          onClick={() => onChange(false)}
          className={`text-xs rounded px-2 py-1 border ${
            trait.value === false
              ? 'border-coral bg-coral/20 text-foam'
              : 'border-moss/30 text-foam-dim hover:border-moss/60'
          }`}
        >
          No
        </button>
      </div>
    );
  }

  if (trait.type === 'number') {
    return (
      <input
        type="number"
        step="any"
        value={typeof trait.value === 'number' ? trait.value : ''}
        onChange={(e) => onChange(e.target.value === '' ? undefined : Number(e.target.value))}
        className="field text-xs px-2 py-1 flex-1"
      />
    );
  }

  return (
    <input
      type="text"
      value={typeof trait.value === 'string' ? trait.value : ''}
      onChange={(e) => onChange(e.target.value === '' ? undefined : e.target.value)}
      className="field text-xs px-2 py-1 flex-1"
    />
  );
}

function TraitPresetPicker({
  item,
  onAdd,
}: {
  item: RosterItem;
  onAdd: (label: string, type: CustomFieldType) => void;
}) {
  const [customLabel, setCustomLabel] = useState('');
  const [customType, setCustomType] = useState<CustomFieldType>('text');

  const existingLabels = new Set((item.traits ?? []).map((t) => t.label));
  const applicable = item.category === 'plant' ? 'plant' : 'livestock';
  const presets = TARGET_TRAIT_PRESETS.filter(
    (p) => p.appliesTo === applicable && !existingLabels.has(p.label)
  );

  return (
    <div className="space-y-2">
      {presets.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {presets.map((p) => (
            <button
              key={p.label}
              type="button"
              onClick={() => onAdd(p.label, p.type)}
              className="pill text-[11px] py-1 px-2 bg-sand/10 text-sand border border-sand/20 hover:bg-sand/20 transition-colors"
            >
              + {p.label}
            </button>
          ))}
        </div>
      )}
      <div className="flex gap-1.5">
        <input
          value={customLabel}
          onChange={(e) => setCustomLabel(e.target.value)}
          placeholder="Custom trait name"
          className="field text-xs px-2 py-1 flex-1"
        />
        <select
          value={customType}
          onChange={(e) => setCustomType(e.target.value as CustomFieldType)}
          className="field text-xs px-2 py-1 w-24"
        >
          <option value="text">Text</option>
          <option value="number">Number</option>
          <option value="boolean">Yes/No</option>
        </select>
        <button
          type="button"
          onClick={() => {
            if (!customLabel.trim()) return;
            onAdd(customLabel.trim(), customType);
            setCustomLabel('');
          }}
          className="btn btn-ghost text-xs px-3"
        >
          Add
        </button>
      </div>
    </div>
  );
}
