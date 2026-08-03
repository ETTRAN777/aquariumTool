import { useEffect, useRef, useState } from 'react';
import { useData } from '../lib/DataContext';
import { TARGET_TRAIT_PRESETS } from '../data/targetTraitPresets';
import { CATEGORY_LABELS } from '../lib/constants';
import {
  aggregateWaterParamTarget,
  computeParamStatus,
  checkMineralLoadConsistency,
  buildMineralLoadResearchPrompt,
  computePredationThreats,
  computeAggressionThreats,
  hasShoalingIssue,
  hasPlantHerbivoryRisk,
  hasTankSizeIssue,
  hasTankWidthIssue,
  waterParamLabel,
  buildResearchPrompt,
  type TargetStatus,
} from '../lib/targets';
import type { RosterItem, RosterItemTrait, WaterParams, CustomFieldType, CustomFieldValue } from '../types';

const FRESHWATER_PARAMS: (keyof WaterParams)[] = ['temperature', 'ph', 'gh', 'kh', 'tds'];
const SALTWATER_PARAMS: (keyof WaterParams)[] = ['temperature', 'ph', 'salinity'];

// Only two categories are ever targetable here (livestock/plant), so unlike
// Roster's fixed 5-category sort, "by category" just flip-flops which of
// the two goes on top — clicking it again while already active swaps
// leadCategory rather than needing a separate reverse mode.
type TargetableCategory = 'livestock' | 'plant';
type SortMode = 'default' | 'category';

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
  const [copiedMineralPrompt, setCopiedMineralPrompt] = useState(false);
  const [threatListOpenId, setThreatListOpenId] = useState<string | null>(null);
  const [aggressionListOpenId, setAggressionListOpenId] = useState<string | null>(null);
  const [filter, setFilter] = useState<TargetableCategory | 'all'>('all');
  const [sortMode, setSortMode] = useState<SortMode>('default');
  const [leadCategory, setLeadCategory] = useState<TargetableCategory>('livestock');

  if (!activeTank) return null;
  const tank = activeTank;

  const relevantParams = tank.waterType === 'saltwater' ? SALTWATER_PARAMS : FRESHWATER_PARAMS;
  // Unfiltered — the tank-wide summary and the "add something first" empty
  // state should reflect everything targetable regardless of the filter/sort
  // controls below, which only affect the per-item card list.
  const targetableItems = tank.roster.filter(
    (r) => r.category === 'livestock' || r.category === 'plant'
  );
  const mineralLoadCheck = checkMineralLoadConsistency(tank.roster);

  let displayedItems = targetableItems.filter((r) => filter === 'all' || r.category === filter);
  if (sortMode === 'category') {
    displayedItems = [...displayedItems].sort((a, b) => {
      const aRank = a.category === leadCategory ? 0 : 1;
      const bRank = b.category === leadCategory ? 0 : 1;
      return aRank - bRank;
    });
  }

  function toggleCategorySort() {
    if (sortMode !== 'category') {
      setSortMode('category');
    } else {
      setLeadCategory((c) => (c === 'livestock' ? 'plant' : 'livestock'));
    }
  }

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

  function copyMineralLoadPrompt() {
    if (!mineralLoadCheck) return;
    const prompt = buildMineralLoadResearchPrompt(tank, mineralLoadCheck);
    navigator.clipboard
      .writeText(prompt)
      .then(() => {
        setCopiedMineralPrompt(true);
        setTimeout(() => setCopiedMineralPrompt(false), 2000);
      })
      .catch(() => {});
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
          Set researched target ranges per item below — the tank-wide target for each parameter
          is the overlap that works for everything you've added.
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
              // GH, KH, and TDS are cross-checked against each other (see
              // checkMineralLoadConsistency) — but only a genuine
              // 'unreachable' result (no documented meter calibration can
              // reconcile the numbers) touches these rows, using the exact
              // same "conflict" pill/color a normal single-parameter
              // conflict already uses. The softer 'unlikely' tier stays
              // out of the rows entirely — it's a heads-up, not a
              // conflict, and lives only in the card below.
              const isMineralLoadRow = param === 'gh' || param === 'kh' || param === 'tds';
              const displayStatus =
                isMineralLoadRow && mineralLoadCheck?.status === 'unreachable' ? 'conflict' : status;
              const style = STATUS_STYLES[displayStatus];
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

      {/* Cross-parameter check: GH and KH targets, taken together, imply a
          real minimum mineral floor that a TDS ceiling can silently
          conflict with, since nothing else on this page cross-checks
          parameters against each other. Only renders once GH, KH, and a
          TDS ceiling are all actually set; silent otherwise, same rule as
          every other check on this page.

          Two tiers, reusing existing app colors rather than inventing a
          new palette:
          - 'unreachable' uses the exact same coral "conflict" style the
            row pills above use — a genuine, high-confidence mismatch.
          - 'unlikely' reuses the existing neutral "no-data" sand style —
            a soft heads-up, not a conflict, so it shouldn't look like one.
            No research-prompt button here; asking an AI to resolve a
            maybe isn't worth the ceremony. */}
      {mineralLoadCheck && mineralLoadCheck.status === 'unreachable' && (
        <div className={`card p-5 border ${STATUS_STYLES.conflict.classes}`}>
          <p className="field-label mb-2 text-coral">{STATUS_STYLES.conflict.label}: GH, KH, and TDS</p>
          <p className="text-xs text-foam-dim">
            This is a simple arithmetic check, not real aquarium chemistry — it converts GH and KH
            to a combined mineral mass and checks it against TDS even under the most TDS-minimizing
            meter calibration on record. GH ({mineralLoadCheck.ghMinPpm.toFixed(0)}–
            {mineralLoadCheck.ghMaxPpm.toFixed(0)} ppm as CaCO₃) and KH (
            {mineralLoadCheck.khMinPpm.toFixed(0)}–{mineralLoadCheck.khMaxPpm.toFixed(0)} ppm)
            together put a floor of{' '}
            <span className="text-foam font-medium">{mineralLoadCheck.hardFloorPpm.toFixed(0)} ppm</span>{' '}
            under the water — over the stated TDS ceiling of {mineralLoadCheck.tdsMax} ppm even at
            that most-forgiving calibration. No realistic meter reconciles these three numbers as
            set.
          </p>
          <button
            onClick={copyMineralLoadPrompt}
            className="btn btn-secondary text-xs py-1.5 px-3 mt-3"
          >
            {copiedMineralPrompt ? '✓ Copied to clipboard' : '📋 Copy research prompt'}
          </button>
        </div>
      )}

      {mineralLoadCheck && mineralLoadCheck.status === 'unlikely' && (
        <div className={`card p-5 border ${STATUS_STYLES['no-data'].classes}`}>
          <p className="field-label mb-2 text-sand">Worth double-checking: GH, KH, and TDS</p>
          <p className="text-xs text-foam-dim">
            Just arithmetic here, not real aquarium chemistry knowledge — under a typical meter
            calibration, GH + KH imply a mineral floor of{' '}
            <span className="text-foam font-medium">{mineralLoadCheck.typicalFloorPpm.toFixed(0)} ppm</span>{' '}
            against a TDS ceiling of {mineralLoadCheck.tdsMax} ppm. Not a hard conflict — this
            depends heavily on your specific meter's calibration — but worth a look once you've
            actually got water mixed to these targets.
          </p>
        </div>
      )}

      {/* Third tier: not a warning at all, just an FYI. Even when GH/KH/TDS
          are fully compatible, a real TDS meter reading could still climb
          toward the top of the calibration spread for this mineral load
          — worth knowing. Quotes the REALISTIC ceiling (scaled by the
          highest documented calibration factor), not the raw unscaled
          mass — no real meter reads at the unscaled figure, so quoting
          it would describe a number nothing could ever actually show.
          Only shows when the TDS ceiling doesn't already cover that
          realistic ceiling — once someone's TDS max is high enough that
          no real meter reading could exceed it, the note has nothing
          left to add. No card, no border, no color — deliberately the
          quietest possible treatment so it doesn't read as a warning
          when it isn't one. */}
      {mineralLoadCheck && mineralLoadCheck.status === 'ok' && !mineralLoadCheck.rawRangeWithinTds && (
        <p className="text-xs text-foam-dim/60 italic px-1">
          ℹ️ For reference: GH + KH imply a mineral load that could realistically read up to{' '}
          {mineralLoadCheck.realisticCeilingPpm.toFixed(0)} ppm on TDS (raw mass{' '}
          {mineralLoadCheck.minCombinedPpm.toFixed(0)}–{mineralLoadCheck.maxCombinedPpm.toFixed(0)} ppm as
          CaCO₃, scaled by the highest documented meter calibration factor). Not a conflict with your{' '}
          {mineralLoadCheck.tdsMax} ppm TDS target, just useful context.
        </p>
      )}

      {/* Per-item editors */}
      {targetableItems.length > 0 && (
        <div className="space-y-3">
          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-2">
            <div className="flex flex-nowrap md:flex-wrap gap-2 overflow-x-auto scrollbar-hide -mx-6 px-6 md:mx-0 md:px-0 md:overflow-visible">
              <FilterPill active={filter === 'all'} onClick={() => setFilter('all')} label="All" />
              <FilterPill
                active={filter === 'livestock'}
                onClick={() => setFilter('livestock')}
                label={CATEGORY_LABELS.livestock}
              />
              <FilterPill
                active={filter === 'plant'}
                onClick={() => setFilter('plant')}
                label={CATEGORY_LABELS.plant}
              />
            </div>
            <div className="flex flex-nowrap md:flex-wrap gap-2 overflow-x-auto scrollbar-hide -mx-6 px-6 md:mx-0 md:px-0 md:overflow-visible">
              <SortPill
                active={sortMode === 'default'}
                onClick={() => setSortMode('default')}
                label="Default order"
              />
              <SortPill
                active={sortMode === 'category'}
                onClick={toggleCategorySort}
                label={
                  sortMode === 'category'
                    ? `By category (${CATEGORY_LABELS[leadCategory]} first)`
                    : 'By category'
                }
              />
            </div>
          </div>
          {displayedItems.map((item) => {
            const isExpanded = expandedId === item.id;
            const threats = computePredationThreats(tank.roster, item);
            const isThreatListOpen = threatListOpenId === item.id;
            const aggressionThreats = computeAggressionThreats(tank.roster, item);
            const isAggressionListOpen = aggressionListOpenId === item.id;
            const shoalingIssue = hasShoalingIssue(item);
            const plantHerbivoryRisk = hasPlantHerbivoryRisk(tank.roster, item);
            const tankSizeIssue = hasTankSizeIssue(item, tank);
            const tankWidthIssue = hasTankWidthIssue(item, tank);
            return (
              <div key={item.id} className="card p-4">
                <button
                  onClick={() => setExpandedId(isExpanded ? null : item.id)}
                  className="w-full flex items-start justify-between text-left gap-3"
                >
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="pill py-0.5 px-2 font-mono text-[10px] uppercase tracking-wide text-sand bg-sand/10">
                        {CATEGORY_LABELS[item.category]}
                      </span>
                      <span className="text-sm font-medium text-foam">{item.name}</span>
                    </div>
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
                      {aggressionThreats.length > 0 && (
                        <span className="pill text-[11px] py-0.5 px-2 bg-amber/20 text-amber border border-amber/40 font-semibold">
                          ✂️ Fin-Nipping Risk
                        </span>
                      )}
                      {shoalingIssue && (
                        <span className="pill text-[11px] py-0.5 px-2 bg-amber/20 text-amber border border-amber/40 font-semibold">
                          👥 Below Min Group Size
                        </span>
                      )}
                      {plantHerbivoryRisk && (
                        <span className="pill text-[11px] py-0.5 px-2 bg-amber/20 text-amber border border-amber/40 font-semibold">
                          🌿 May Eat/Uproot Plants
                        </span>
                      )}
                      {tankSizeIssue && (
                        <span className="pill text-[11px] py-0.5 px-2 bg-amber/20 text-amber border border-amber/40 font-semibold">
                          📐 Tank Too Small (Length)
                        </span>
                      )}
                      {tankWidthIssue && (
                        <span className="pill text-[11px] py-0.5 px-2 bg-amber/20 text-amber border border-amber/40 font-semibold">
                          📐 Tank Too Small (Width)
                        </span>
                      )}
                      {item.predatorRiskOverride && (
                        <span className="pill text-[11px] py-0.5 px-2 bg-moss/15 text-foam-dim">
                          Predator check excluded
                        </span>
                      )}
                      {(item.traits ?? []).map((trait) => {
                        const traitText = `${trait.label}: ${formatTraitValue(trait)}`;
                        return (
                          <span
                            key={trait.id}
                            title={traitText}
                            className="pill text-[11px] py-0.5 px-2 bg-sand/10 text-sand border border-sand/20 max-w-[180px] truncate inline-block align-bottom"
                          >
                            {traitText}
                          </span>
                        );
                      })}
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

                    {aggressionThreats.length > 0 && (
                      <div className="rounded-lg border border-amber/40 bg-amber/10 overflow-hidden">
                        <button
                          type="button"
                          onClick={() =>
                            setAggressionListOpenId(isAggressionListOpen ? null : item.id)
                          }
                          className="w-full flex items-center justify-between gap-2 px-3 py-2 text-left"
                        >
                          <span className="text-xs text-amber">
                            <span className="font-semibold">✂️ Fin-Nipping Risk</span> — flagged
                            as a fin nipper, alongside long/flowing-finned tankmates
                          </span>
                          <span className="text-[11px] text-amber shrink-0">
                            {isAggressionListOpen ? 'Hide ▲' : `Show ${aggressionThreats.length} ▼`}
                          </span>
                        </button>
                        {isAggressionListOpen && (
                          <ul className="px-3 pb-3 space-y-1">
                            {aggressionThreats.map((t) => (
                              <li key={t.victimId} className="text-xs text-amber/90">
                                • {t.victimName}
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
                        {relevantParams.map((param) => {
                          const target = item.waterParamTargets?.[param];
                          const hasRangeError =
                            target?.min !== undefined && target?.max !== undefined && target.min > target.max;
                          return (
                            <div key={param}>
                              <label className="text-[11px] text-foam-dim block mb-1">
                                {waterParamLabel(param)}
                              </label>
                              <div className="flex gap-1">
                                <input
                                  type="number"
                                  step="any"
                                  placeholder="min"
                                  value={target?.min ?? ''}
                                  onChange={(e) => setWaterParamTarget(item, param, 'min', e.target.value)}
                                  className={`field text-xs px-2 py-1.5 ${hasRangeError ? 'border-coral' : ''}`}
                                />
                                <input
                                  type="number"
                                  step="any"
                                  placeholder="max"
                                  value={target?.max ?? ''}
                                  onChange={(e) => setWaterParamTarget(item, param, 'max', e.target.value)}
                                  className={`field text-xs px-2 py-1.5 ${hasRangeError ? 'border-coral' : ''}`}
                                />
                              </div>
                              {hasRangeError && (
                                <p className="text-[10px] text-coral mt-1">Min can't be greater than max</p>
                              )}
                            </div>
                          );
                        })}
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
                            <div key={trait.id} className="flex items-start gap-2">
                              <span className="text-xs text-foam-dim w-36 shrink-0 truncate pt-1.5">
                                {trait.label}
                              </span>
                              <TraitInput
                                trait={trait}
                                onChange={(v) => updateTraitValue(item, trait.id, v)}
                              />
                              <button
                                onClick={() => removeTrait(item, trait.id)}
                                className="btn-icon danger text-xs shrink-0 mt-1"
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
          {displayedItems.length === 0 && (
            <p className="text-foam-dim text-sm py-8 text-center">
              Nothing matches this filter.
            </p>
          )}
        </div>
      )}
    </div>
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
    <AutoResizeTextarea
      value={typeof trait.value === 'string' ? trait.value : ''}
      onChange={(v) => onChange(v === '' ? undefined : v)}
    />
  );
}

// Grows to fit its content instead of scrolling/clipping — used for free-text
// traits like Temperament that can run long. Only affects this expanded-card
// editor; the collapsed-card pill summary keeps its own separate ellipsis
// truncation regardless of how tall this gets.
function AutoResizeTextarea({
  value,
  onChange,
}: {
  value: string;
  onChange: (value: string) => void;
}) {
  const ref = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${el.scrollHeight}px`;
  }, [value]);

  return (
    <textarea
      ref={ref}
      rows={1}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="field text-xs px-2 py-1 flex-1 resize-none overflow-hidden leading-relaxed"
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