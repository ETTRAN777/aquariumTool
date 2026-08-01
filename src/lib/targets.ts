import type { RosterItem, WaterParams, Tank, CustomFieldValue } from '../types';

export interface AggregatedTarget {
  min?: number;
  max?: number;
  minContributor?: string; // name of the item that set the tightest min
  maxContributor?: string; // name of the item that set the tightest max
  contributorCount: number;
  conflict: boolean; // true when min > max — two items have genuinely non-overlapping requirements
}

// Intersects every livestock/plant roster item's target for one water
// parameter — the tank-wide "safe for everyone" range is the tightest
// min and the tightest max across all of them. Returns null when nothing
// in the roster has a target set for this parameter at all (distinct from
// a real computed range — "no data" isn't the same as "anything goes").
export function aggregateWaterParamTarget(
  roster: RosterItem[],
  param: keyof WaterParams
): AggregatedTarget | null {
  const relevant = roster.filter(
    (r) => (r.category === 'livestock' || r.category === 'plant') && r.waterParamTargets?.[param]
  );
  if (relevant.length === 0) return null;

  let min: number | undefined;
  let max: number | undefined;
  let minContributor: string | undefined;
  let maxContributor: string | undefined;

  for (const item of relevant) {
    const t = item.waterParamTargets![param]!;
    if (t.min !== undefined && (min === undefined || t.min > min)) {
      min = t.min;
      minContributor = item.name;
    }
    if (t.max !== undefined && (max === undefined || t.max < max)) {
      max = t.max;
      maxContributor = item.name;
    }
  }

  return {
    min,
    max,
    minContributor,
    maxContributor,
    contributorCount: relevant.length,
    conflict: min !== undefined && max !== undefined && min > max,
  };
}

export type TargetStatus = 'no-target' | 'no-data' | 'conflict' | 'ok' | 'alert';

// Compares the tank's most recent logged value for a parameter against
// the computed aggregate range. "no-target" (nobody in the roster cares
// about this parameter) and "no-data" (nobody's logged it yet) are kept
// distinct from "ok"/"alert" on purpose — neither is actually a pass or a
// failure, and collapsing them into "ok" would be a false all-clear.
export function computeParamStatus(
  aggregated: AggregatedTarget | null,
  currentValue: number | undefined
): TargetStatus {
  if (!aggregated) return 'no-target';
  if (aggregated.conflict) return 'conflict';
  if (currentValue === undefined) return 'no-data';
  if (aggregated.min !== undefined && currentValue < aggregated.min) return 'alert';
  if (aggregated.max !== undefined && currentValue > aggregated.max) return 'alert';
  return 'ok';
}

// One inch in millimeters — the single conversion constant used to make
// mouthSizeMm and adultSizeIn comparable. Comparing them as raw numbers
// without converting would be a real, silent bug: a 5mm mouth vs a 0.4in
// (~10mm) shrimp reads as "0.4 < 5, at risk" if you don't convert, when
// the shrimp's actual body (10mm) is larger than the mouth (5mm) and it's
// almost certainly fine.
const MM_PER_INCH = 25.4;

export interface PredationThreat {
  preyId: string;
  preyName: string;
}

// Predator-centric, not prey-centric: for one livestock item acting as a
// potential predator, returns every OTHER livestock item in the roster
// whose adult size is smaller than THIS item's mouth size — the full
// list, not just "is there at least one." A full pairwise scan across the
// roster rather than reducing to a single "biggest mouth" comparison,
// deliberately — knowing exactly which items are at risk (so it can be
// shown as a clickable list) requires the full comparison; a single
// aggregate "at risk: yes/no" can't produce that. Roster sizes here are
// small (a handful to a few dozen livestock items for a hobby tank at
// most), so the full O(n²) comparison costs nothing that matters — this
// isn't a performance tradeoff, the old single-max approach was just
// insufficient for what this needs to show now.
export function computePredationThreats(roster: RosterItem[], predator: RosterItem): PredationThreat[] {
  if (
    predator.category !== 'livestock' ||
    predator.predatorRiskOverride ||
    predator.mouthSizeMm === undefined
  ) {
    return [];
  }

  const threats: PredationThreat[] = [];
  for (const other of roster) {
    if (other.id === predator.id || other.category !== 'livestock' || other.adultSizeIn === undefined) {
      continue;
    }
    const preyAdultSizeMm = other.adultSizeIn * MM_PER_INCH;
    if (preyAdultSizeMm < predator.mouthSizeMm) {
      threats.push({ preyId: other.id, preyName: other.name });
    }
  }
  return threats;
}

// Shared lookup — traits are matched by their exact preset label string,
// same as everywhere else traits get read (there's no separate stable id
// linking a RosterItemTrait back to its TargetTraitPreset).
function getTraitValue(item: RosterItem, label: string): CustomFieldValue | undefined {
  return item.traits?.find((t) => t.label === label)?.value;
}

// A shoaling species kept below its own minimum group size is a
// compatibility failure with itself, not with another roster item — same
// "only flag what's actually known" rule as everywhere else: silent
// unless both the trait and the roster quantity are actually set.
export function hasShoalingIssue(item: RosterItem): boolean {
  if (item.category !== 'livestock') return false;
  const minGroup = getTraitValue(item, '👥 Min Group Size');
  if (typeof minGroup !== 'number' || item.quantity === undefined) return false;
  return item.quantity < minGroup;
}

export interface AggressionThreat {
  victimId: string;
  victimName: string;
}

// Fin-nipping specifically targets long, flowing fins — not every
// tankmate equally — so this needs both traits present to mean anything,
// same two-sided requirement as predation needing both a mouth size and
// an adult size.
export function computeAggressionThreats(roster: RosterItem[], aggressor: RosterItem): AggressionThreat[] {
  if (aggressor.category !== 'livestock' || getTraitValue(aggressor, '✂️ Fin Nipper') !== true) {
    return [];
  }
  const threats: AggressionThreat[] = [];
  for (const other of roster) {
    if (other.id === aggressor.id || other.category !== 'livestock') continue;
    if (getTraitValue(other, '🎗️ Long/Flowing Fins') === true) {
      threats.push({ victimId: other.id, victimName: other.name });
    }
  }
  return threats;
}

// Whether this livestock item is flagged as eating/uprooting plants AND
// the tank actually has any plants for that to matter against — not
// pairwise against a specific plant, just presence, since there's no
// "vulnerable to being eaten" trait on plants to compare against (every
// plant is fair game to a herbivore in practice).
export function hasPlantHerbivoryRisk(roster: RosterItem[], item: RosterItem): boolean {
  if (item.category !== 'livestock' || getTraitValue(item, '🌿 Eats/Uproots Plants') !== true) {
    return false;
  }
  return roster.some((r) => r.category === 'plant');
}

// Minimum tank length is a real, per-species researched fact (some
// species need more swimming length than their own body size alone would
// suggest) — deliberately not derived from tank volume or a blanket
// ratio, for the same reason Tank.lengthIn isn't parsed out of the
// free-text dimensions string: a computed approximation here would be
// exactly the kind of fake-precision this app avoids everywhere else.
export function hasTankSizeIssue(item: RosterItem, tank: Tank): boolean {
  if (item.category !== 'livestock') return false;
  const minLength = getTraitValue(item, '📐 Min Tank Length (in)');
  if (typeof minLength !== 'number' || tank.lengthIn === undefined) return false;
  return tank.lengthIn < minLength;
}

export function hasTankWidthIssue(item: RosterItem, tank: Tank): boolean {
  if (item.category !== 'livestock') return false;
  const minWidth = getTraitValue(item, '📐 Min Tank Width (in)');
  if (typeof minWidth !== 'number' || tank.widthIn === undefined) return false;
  return tank.widthIn < minWidth;
}

const WATER_PARAM_LABELS: Record<keyof WaterParams, string> = {
  temperature: 'Temp °F',
  ph: 'pH',
  gh: 'GH',
  kh: 'KH',
  tds: 'TDS',
  ammonia: 'NH₃',
  nitrite: 'NO₂',
  nitrate: 'NO₃',
  salinity: 'Salinity (SG)',
};

export function waterParamLabel(param: keyof WaterParams): string {
  return WATER_PARAM_LABELS[param];
}

// Generates a copy-pasteable research prompt for whatever AI the user
// already has — this is the actual data-sourcing step for everything on
// this page. There's no free, reliable API for this kind of per-species
// compatibility/care data (checked; see the templates.ts roadmap note on
// FishBase), so rather than fabricate anything, the app hands the
// research question itself off to the user's own AI of choice, in a
// format tuned to come back with the specific fields this page actually
// uses.
export function buildResearchPrompt(
  item: RosterItem,
  waterType: 'freshwater' | 'saltwater'
): string {
  const waterParamsList =
    waterType === 'saltwater'
      ? 'temperature (°F), pH, and salinity (specific gravity)'
      : 'temperature (°F), pH, GH (general hardness), and KH (carbonate hardness)';

  // Any field below marked * asks for one number, but real sources often
  // report a range instead. Rather than leave the AI answering this to
  // improvise, the instruction is explicit: compute the midpoint and mark
  // it, so what comes back is an honestly-labeled estimate rather than
  // something that reads as a single directly-reported fact. Doesn't
  // apply to the water-parameter targets — those are genuinely supposed
  // to be entered as real ranges (min/max), not averaged away.
  const averagingNote =
    'For any field marked with an asterisk (*), give one number. If your sources report a range instead of one figure, compute the midpoint yourself and keep the asterisk on your answer so it stays clear that\'s an averaged estimate, not a single number a source actually stated. Everything else (especially water parameters) should stay as real ranges where sources give them.';

  if (item.category === 'plant') {
    return `Research ${item.name} for a planted aquarium. Please give specific numeric ranges where possible, and note your confidence on anything that varies a lot by source. ${averagingNote}

- Ideal water parameters: ${waterParamsList}
- Mature size (inches, height/spread)*
- Light requirements (low/medium/high)
- Whether CO2 injection is required or just beneficial
- Typical growth rate (slow/medium/fast)`;
  }

  return `Research ${item.name} for a home aquarium. Please give specific numeric ranges where possible, and note your confidence on anything that varies a lot by source. ${averagingNote}

- Ideal water parameters: ${waterParamsList}
- Typical adult mouth size (mm)* — relevant for assessing predation risk to shrimp/small inverts
- Typical adult size (inches)*
- Minimum group/shoal size this species actually needs to thrive*, or "not a shoaling species" if that's genuinely not a thing for it
- Minimum tank length (inches) this species needs*, if it's more than just "fits in any tank big enough for its own body size" — otherwise say so
- Minimum tank width (inches) this species needs*, same caveat
- Whether it has long, flowing fins that make it a fin-nipping target (yes/no)
- Reputation for fin-nipping behavior (yes/no, with reasoning)
- Whether it eats or uproots live aquarium plants (yes/no)
- Whether it's considered safe to keep with shrimp/inverts (yes/no, with reasoning)
- General temperament (e.g. peaceful, semi-aggressive, aggressive, predatory)`;
}
