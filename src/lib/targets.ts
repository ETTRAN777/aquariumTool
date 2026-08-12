import type { RosterItem, WaterParams, Tank, CustomFieldValue } from '../types';
import { CATEGORY_LABELS } from './constants';

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

// GH and KH are both reported in "German degrees" by hobby test kits — the
// same unit, and the standard conversion to a shared ppm-as-CaCO3 basis is
// this constant. Used only by checkMineralLoadConsistency below, to put GH
// and KH on the same footing as a TDS reading (which is already a ppm
// figure) for a real apples-to-apples comparison.
const CACO3_PPM_PER_DEGREE = 17.848;

// Hobby TDS meters don't measure mass directly — they measure electrical
// conductivity and multiply by a calibration factor that varies by
// standard (NaCl, KCl, "442"/natural-water). Documented factors span
// roughly 0.47 to 0.85 — a real, large spread: the same physical water
// can read very differently on two different meters. That means
// converting GH/KH degrees to a CaCO3-equivalent mass figure and
// comparing it directly against a TDS *reading* isn't an apples-to-apples
// comparison; the two numbers live on different measurement bases. This
// check uses two points on that documented spread instead of pretending
// they're the same unit:
//   - LOW: close to the most TDS-minimizing documented factor. If the
//     mineral floor still exceeds the TDS ceiling even scaled this low,
//     no realistic meter/calibration combination explains it away — a
//     genuine mismatch, not a units ambiguity.
//   - TYPICAL: a common "natural water" factor. Used only for a soft,
//     non-blocking heads-up, not a claim of certainty — most real tanks
//     land inside this and shouldn't be flagged at all.
//   - HIGH: the highest documented factor (442/natural-water standard).
//     No real meter reads AT the raw unscaled mass — every documented
//     calibration reads below it. This is the realistic ceiling: the
//     highest a real TDS reading could plausibly go for a given mineral
//     load. Used for the informational "could run this high" note —
//     quoting the raw 1.0-factor mass there would describe a number no
//     real meter could ever actually produce.
const LOW_CALIBRATION_FACTOR = 0.5;
const TYPICAL_CALIBRATION_FACTOR = 0.7;
const HIGH_CALIBRATION_FACTOR = 0.85;

export interface MineralLoadCheck {
  ghMinPpm: number;
  ghMaxPpm: number;
  khMinPpm: number;
  khMaxPpm: number;
  minCombinedPpm: number; // GH min + KH min, mass basis (ppm as CaCO3) — the floor of what hitting both targets would actually put in the water
  maxCombinedPpm: number; // GH max + KH max, mass basis
  tdsMin?: number;
  tdsMax?: number;
  hardFloorPpm: number; // minCombinedPpm scaled by LOW_CALIBRATION_FACTOR — exceeding TDS here means no documented meter calibration reconciles the numbers
  typicalFloorPpm: number; // minCombinedPpm scaled by TYPICAL_CALIBRATION_FACTOR — a softer signal only
  realisticCeilingPpm: number; // maxCombinedPpm scaled by HIGH_CALIBRATION_FACTOR — the highest a real meter could plausibly read for this mineral load; the raw unscaled mass is never actually achievable as a meter reading
  // True once the stated TDS ceiling already covers the realistic
  // (calibration-scaled) ceiling on its own — meaning the person has
  // already set TDS high enough that no real meter reading could exceed
  // it. Compared against the ROUNDED ceiling (matching what's shown in
  // the UI/summary), not the raw float — otherwise typing in exactly the
  // number that's displayed could still fail the check by a fraction of
  // a ppm.
  rawRangeWithinTds: boolean;
  // 'unreachable': even under the most TDS-minimizing calibration, the
  // mineral floor exceeds the TDS ceiling — a genuine mismatch.
  // 'unlikely': not unreachable, but exceeds a typical calibration's
  // floor — worth a glance, not a real conflict.
  // 'ok': fits comfortably under even a typical calibration's floor.
  status: 'unreachable' | 'unlikely' | 'ok';
}

// GH and KH each measure a real, separate mineral contribution (calcium/
// magnesium salts for GH, carbonate/bicarbonate salts for KH — genuinely
// different ions in most shrimp-hobby remineralizers, not double-counting
// the same source), and their combined mass is a real physical floor on
// what's dissolved in the water. What's uncertain isn't whether they add
// up — they do, in mass terms — it's how that mass maps onto a specific
// meter's TDS *reading* (see the calibration-factor note above). This
// check stays conservative on both ends: only runs once GH, KH, and a TDS
// ceiling are ALL actually set (same "silent unless the relevant data is
// there" rule as every other check here — a partial GH or KH range, e.g.
// only a max with no min, can't be turned into a real floor to check),
// and only flags 'unreachable' when the most generous documented
// calibration still can't reconcile the numbers.
export function checkMineralLoadConsistency(roster: RosterItem[]): MineralLoadCheck | null {
  const gh = aggregateWaterParamTarget(roster, 'gh');
  const kh = aggregateWaterParamTarget(roster, 'kh');
  const tds = aggregateWaterParamTarget(roster, 'tds');

  if (!gh || gh.min === undefined || gh.max === undefined) return null;
  if (!kh || kh.min === undefined || kh.max === undefined) return null;
  if (!tds || tds.max === undefined) return null;

  const ghMinPpm = gh.min * CACO3_PPM_PER_DEGREE;
  const ghMaxPpm = gh.max * CACO3_PPM_PER_DEGREE;
  const khMinPpm = kh.min * CACO3_PPM_PER_DEGREE;
  const khMaxPpm = kh.max * CACO3_PPM_PER_DEGREE;
  const minCombinedPpm = ghMinPpm + khMinPpm;
  const maxCombinedPpm = ghMaxPpm + khMaxPpm;
  const hardFloorPpm = minCombinedPpm * LOW_CALIBRATION_FACTOR;
  const typicalFloorPpm = minCombinedPpm * TYPICAL_CALIBRATION_FACTOR;
  const realisticCeilingPpm = maxCombinedPpm * HIGH_CALIBRATION_FACTOR;
  const rawRangeWithinTds = tds.max >= Math.round(realisticCeilingPpm);

  let status: MineralLoadCheck['status'];
  if (hardFloorPpm > tds.max) {
    status = 'unreachable';
  } else if (typicalFloorPpm > tds.max) {
    status = 'unlikely';
  } else {
    status = 'ok';
  }

  return {
    ghMinPpm,
    ghMaxPpm,
    khMinPpm,
    khMaxPpm,
    minCombinedPpm,
    maxCombinedPpm,
    tdsMin: tds.min,
    tdsMax: tds.max,
    hardFloorPpm,
    typicalFloorPpm,
    realisticCeilingPpm,
    rawRangeWithinTds,
    status,
  };
}

// Every livestock/plant item that has set a target for this parameter —
// the full contributor list, not just whichever one item set the
// tightest min or max (that's all aggregateWaterParamTarget's
// min/maxContributor track). Needed here because a research prompt about
// *why* a tank-wide target is what it is has to name everything driving
// it, not just the single tightest item.
export function itemsWithWaterParamTarget(roster: RosterItem[], param: keyof WaterParams): RosterItem[] {
  return roster.filter(
    (r) => (r.category === 'livestock' || r.category === 'plant') && r.waterParamTargets?.[param]
  );
}

// Same "hand the research question off to the user's own AI" pattern as
// buildResearchPrompt below, but for the mineral-load conflict itself
// rather than one species — every roster item that set a gh/kh/tds
// target is named, since any of them could be the one whose target
// should actually move, not just whichever one happens to set the
// tightest bound. Only ever surfaced for a genuine 'unreachable' result
// (see Targets.tsx) — the softer 'unlikely' tier doesn't get a research
// prompt, since asking an AI to resolve a maybe isn't worth the ceremony.
export function buildMineralLoadResearchPrompt(tank: Tank, check: MineralLoadCheck): string {
  const contributingIds = new Set<string>();
  for (const param of ['gh', 'kh', 'tds'] as const) {
    for (const item of itemsWithWaterParamTarget(tank.roster, param)) {
      contributingIds.add(item.id);
    }
  }
  const contributors = tank.roster.filter((r) => contributingIds.has(r.id));

  const itemLines = contributors
    .map((item) => {
      const t = item.waterParamTargets ?? {};
      const parts: string[] = [];
      if (t.gh) parts.push(`GH ${t.gh.min ?? '—'}–${t.gh.max ?? '—'}`);
      if (t.kh) parts.push(`KH ${t.kh.min ?? '—'}–${t.kh.max ?? '—'}`);
      if (t.tds) parts.push(`TDS ${t.tds.min ?? '—'}–${t.tds.max ?? '—'}`);
      return `- ${item.name} (${CATEGORY_LABELS[item.category]}): ${parts.join(', ')}`;
    })
    .join('\n');

  return `I'm planning a ${tank.sizeGallons}-gallon ${tank.waterType} aquarium and my own planning tool flagged a real inconsistency in my researched water parameter targets that I need help resolving.

Quick context on how this flag was generated, so you understand its limits: it's a simple arithmetic check, not real aquarium chemistry knowledge. It converts my GH and KH targets to a combined mineral mass (ppm as CaCO₃) and checks that even under the most TDS-minimizing meter calibration documented (a factor of ${LOW_CALIBRATION_FACTOR}, versus a typical natural-water factor closer to ${TYPICAL_CALIBRATION_FACTOR}), the mineral floor still exceeds my TDS ceiling. That's a fairly high bar — it only fires when no realistic meter/calibration combination could reconcile the numbers — so I trust it's a real mismatch, but it has no idea why these targets exist or which one actually matters most for my stock.

The tank-wide targets, each intersected from the individual species/plant targets below, are:
- GH: ${(check.ghMinPpm / CACO3_PPM_PER_DEGREE).toFixed(1)}–${(check.ghMaxPpm / CACO3_PPM_PER_DEGREE).toFixed(1)} dGH (${check.ghMinPpm.toFixed(0)}–${check.ghMaxPpm.toFixed(0)} ppm as CaCO₃)
- KH: ${(check.khMinPpm / CACO3_PPM_PER_DEGREE).toFixed(1)}–${(check.khMaxPpm / CACO3_PPM_PER_DEGREE).toFixed(1)} dKH (${check.khMinPpm.toFixed(0)}–${check.khMaxPpm.toFixed(0)} ppm as CaCO₃)
- TDS: ${check.tdsMin ?? '—'}–${check.tdsMax} ppm

Even at the most forgiving documented calibration, the implied mineral floor is ${check.hardFloorPpm.toFixed(0)} ppm — over the ${check.tdsMax} ppm TDS ceiling.

Here's every roster item whose researched target contributed to these tank-wide ranges:
${itemLines}

Please help me figure out which target is actually wrong given these specific species/plants — is the TDS ceiling too conservative for this stock (and should be raised), is the GH or KH range wider than these species actually need (and should be narrowed), or is there a genuine conflict between two items' real requirements? Please reference the actual species/plant needs above rather than just re-deriving the same math I already gave you.`;
}

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
function formatTraitValue(v: CustomFieldValue): string {
  return typeof v === 'boolean' ? (v ? 'Yes' : 'No') : String(v);
}

// A field that already has a real saved value shouldn't be re-asked from
// scratch — that risks the research contradicting something already
// entered with no reconciliation, and wastes the answering AI's effort
// on something that isn't actually missing. But blindly trusting a saved
// value forever isn't right either (it could be stale, guessed, or
// wrong) — so a saved value gets a VERIFY ask instead of an OMIT: state
// what's currently on record and ask for a check/correction, rather than
// silently skipping the field or silently trusting it.
function verifyOrResearch(savedDisplay: string | undefined, verifyLabel: string, researchBullet: string): string {
  return savedDisplay !== undefined
    ? `- ${verifyLabel}: currently saved as ${savedDisplay} — please verify this is accurate, and correct it if not`
    : `- ${researchBullet}`;
}

// TDS gets its own line, separate from the GH/KH/pH/temp bullet — those
// measure real, identifiable things (Ca/Mg, carbonate alkalinity) a
// source can meaningfully say a species "needs." TDS is a conductivity-
// based aggregate of everything dissolved, including things with zero
// biological relevance — a care sheet's "TDS 150-200" isn't reporting a
// physiological requirement, it's a rough proxy. Framed that way in the
// research ask itself (not just left implicit), while still asking for
// it — the mineral-load cross-check (checkMineralLoadConsistency) needs
// SOME TDS baseline to compare against, and if it's not in this prompt
// at all, most people never fill it in and that whole check stays
// permanently dormant. null for saltwater, where mineral content is
// already tracked via salinity/specific gravity instead — same scoping
// GH/KH already use.
function buildTdsBullet(item: RosterItem, waterType: 'freshwater' | 'saltwater'): string | null {
  if (waterType === 'saltwater') return null;
  const t = item.waterParamTargets?.tds;
  const saved = t && (t.min !== undefined || t.max !== undefined) ? `${t.min ?? '—'}–${t.max ?? '—'} ppm` : undefined;
  return verifyOrResearch(
    saved,
    'Typical TDS range',
    'Typical TDS range some hobbyists report for this species (ppm)* — note this is a rough proxy for total mineral content, not a physiological requirement the way GH/KH are. If sources don\'t really report this specifically, or disagree widely, say so rather than forcing a number.'
  );
}

export function buildResearchPrompt(item: RosterItem, tank: Tank): string {
  const waterParamsList =
    tank.waterType === 'saltwater'
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
    // Same combined-bullet approach as livestock's water parameters —
    // split into "already saved, please verify" vs. "still missing,
    // please research" rather than treating the whole group as one unit
    // once any single one of them has a value.
    const relevantParams: (keyof WaterParams)[] =
      tank.waterType === 'saltwater' ? ['temperature', 'ph', 'salinity'] : ['temperature', 'ph', 'gh', 'kh'];
    const savedParams: string[] = [];
    const missingParams: string[] = [];
    for (const p of relevantParams) {
      const t = item.waterParamTargets?.[p];
      if (t && (t.min !== undefined || t.max !== undefined)) {
        savedParams.push(`${waterParamLabel(p)} ${t.min ?? '—'}–${t.max ?? '—'}`);
      } else {
        missingParams.push(waterParamLabel(p));
      }
    }
    let waterParamsLine: string;
    if (savedParams.length > 0 && missingParams.length === 0) {
      waterParamsLine = `- Ideal water parameters: currently saved as ${savedParams.join(', ')} — please verify these are accurate, and correct any that aren't`;
    } else if (savedParams.length > 0) {
      waterParamsLine = `- Ideal water parameters: already have ${savedParams.join(', ')} (please verify/correct); still need — ${missingParams.join(', ')}`;
    } else {
      waterParamsLine = `- Ideal water parameters: ${waterParamsList}`;
    }
    const tdsBullet = buildTdsBullet(item, tank.waterType);
    const tdsSaved =
      item.waterParamTargets?.tds?.min !== undefined || item.waterParamTargets?.tds?.max !== undefined;

    const matureSizeTrait = getTraitValue(item, '📏 Mature Size (in)');
    const lightNeedsTrait = getTraitValue(item, '💡 Light Needs');
    const co2Trait = getTraitValue(item, '🌫️ CO2 Required');
    const growthRateTrait = getTraitValue(item, '🌱 Growth Rate');

    const anySaved =
      savedParams.length > 0 ||
      tdsSaved ||
      matureSizeTrait !== undefined ||
      lightNeedsTrait !== undefined ||
      co2Trait !== undefined ||
      growthRateTrait !== undefined;
    const verifyInstruction = anySaved
      ? ' Some fields below already have a value saved — please verify those are accurate rather than skipping them, and correct anything that looks wrong.'
      : '';

    const bullets = [
      waterParamsLine,
      ...(tdsBullet ? [tdsBullet] : []),
      verifyOrResearch(
        matureSizeTrait !== undefined ? `${formatTraitValue(matureSizeTrait)} in` : undefined,
        'Mature size (height/spread)',
        'Mature size (inches, height/spread)*'
      ),
      verifyOrResearch(
        lightNeedsTrait !== undefined ? formatTraitValue(lightNeedsTrait) : undefined,
        'Light requirements',
        'Light requirements (low/medium/high)'
      ),
      verifyOrResearch(
        co2Trait !== undefined ? formatTraitValue(co2Trait) : undefined,
        'CO2 injection required (vs. just beneficial)',
        'Whether CO2 injection is required or just beneficial'
      ),
      verifyOrResearch(
        growthRateTrait !== undefined ? formatTraitValue(growthRateTrait) : undefined,
        'Typical growth rate',
        'Typical growth rate (slow/medium/fast)'
      ),
    ];

    return `Research ${item.name} for a planted aquarium. Please give specific numeric ranges where possible, and note your confidence on anything that varies a lot by source.${verifyInstruction} ${averagingNote}

${bullets.join('\n')}`;
  }

  if (item.category === 'livestock') {
    const quantity = item.quantity ?? 1;
    const qtyPhrase = quantity > 1 ? `${quantity} of them` : 'one';
    let tankSizeDetail = `${tank.sizeGallons}-gallon tank`;
    if (tank.lengthIn && tank.widthIn) {
      tankSizeDetail += ` (${tank.lengthIn}" × ${tank.widthIn}")`;
    } else if (tank.dimensions) {
      tankSizeDetail += ` (${tank.dimensions})`;
    }

    // Water parameters as one combined bullet, since they move together
    // in practice — but still split into "already saved, please verify"
    // vs. "still missing, please research" rather than treating the
    // whole group as one unit once ANY of them has a value.
    const relevantParams: (keyof WaterParams)[] =
      tank.waterType === 'saltwater' ? ['temperature', 'ph', 'salinity'] : ['temperature', 'ph', 'gh', 'kh'];
    const savedParams: string[] = [];
    const missingParams: string[] = [];
    for (const p of relevantParams) {
      const t = item.waterParamTargets?.[p];
      if (t && (t.min !== undefined || t.max !== undefined)) {
        savedParams.push(`${waterParamLabel(p)} ${t.min ?? '—'}–${t.max ?? '—'}`);
      } else {
        missingParams.push(waterParamLabel(p));
      }
    }
    let waterParamsLine: string;
    if (savedParams.length > 0 && missingParams.length === 0) {
      waterParamsLine = `- Ideal water parameters: currently saved as ${savedParams.join(', ')} — please verify these are accurate, and correct any that aren't`;
    } else if (savedParams.length > 0) {
      waterParamsLine = `- Ideal water parameters: already have ${savedParams.join(', ')} (please verify/correct); still need — ${missingParams.join(', ')}`;
    } else {
      waterParamsLine = `- Ideal water parameters: ${waterParamsList}`;
    }
    const tdsBullet = buildTdsBullet(item, tank.waterType);
    const tdsSaved =
      item.waterParamTargets?.tds?.min !== undefined || item.waterParamTargets?.tds?.max !== undefined;

    const finNipperTrait = getTraitValue(item, '✂️ Fin Nipper');
    const longFinsTrait = getTraitValue(item, '🎗️ Long/Flowing Fins');
    const eatsPlantsTrait = getTraitValue(item, '🌿 Eats/Uproots Plants');
    const temperamentTrait = getTraitValue(item, '😊 Temperament');
    const minGroupTrait = getTraitValue(item, '👥 Min Group Size');
    const minLengthTrait = getTraitValue(item, '📐 Min Tank Length (in)');
    const minWidthTrait = getTraitValue(item, '📐 Min Tank Width (in)');

    const bullets = [
      waterParamsLine,
      ...(tdsBullet ? [tdsBullet] : []),
      verifyOrResearch(
        item.mouthSizeMm !== undefined ? `${item.mouthSizeMm} mm` : undefined,
        'Typical adult mouth size',
        'Typical adult mouth size (mm)* — relevant for assessing predation risk to shrimp/small inverts'
      ),
      verifyOrResearch(
        item.adultSizeIn !== undefined ? `${item.adultSizeIn} in` : undefined,
        'Typical adult size',
        'Typical adult size (inches)*'
      ),
      verifyOrResearch(
        minGroupTrait !== undefined ? formatTraitValue(minGroupTrait) : undefined,
        'Minimum group/shoal size',
        'Minimum group/shoal size this species actually needs to thrive*, or "not a shoaling species" if that\'s genuinely not a thing for it'
      ),
      verifyOrResearch(
        minLengthTrait !== undefined ? `${formatTraitValue(minLengthTrait)} in` : undefined,
        'Minimum tank length this species needs',
        'Minimum tank length (inches) this species needs*, if it\'s more than just "fits in any tank big enough for its own body size" — otherwise say so'
      ),
      verifyOrResearch(
        minWidthTrait !== undefined ? `${formatTraitValue(minWidthTrait)} in` : undefined,
        'Minimum tank width this species needs',
        'Minimum tank width (inches) this species needs*, same caveat'
      ),
      '- Given the tank size and quantity above, any fit or stocking-density concerns worth flagging',
      verifyOrResearch(
        longFinsTrait !== undefined ? formatTraitValue(longFinsTrait) : undefined,
        'Has long, flowing fins that make it a fin-nipping target',
        'Whether it has long, flowing fins that make it a fin-nipping target (yes/no)'
      ),
      verifyOrResearch(
        finNipperTrait !== undefined ? formatTraitValue(finNipperTrait) : undefined,
        'Reputation for fin-nipping behavior',
        'Reputation for fin-nipping behavior (yes/no, with reasoning)'
      ),
      verifyOrResearch(
        eatsPlantsTrait !== undefined ? formatTraitValue(eatsPlantsTrait) : undefined,
        'Eats or uproots live aquarium plants',
        'Whether it eats or uproots live aquarium plants (yes/no)'
      ),
      // No stored field to check against — shrimp-safety is DERIVED from
      // mouth/adult size elsewhere in the app (see targetTraitPresets.ts),
      // never entered directly, so there's nothing to verify here.
      "- Whether it's considered safe to keep with shrimp/inverts (yes/no, with reasoning)",
      verifyOrResearch(
        temperamentTrait !== undefined ? formatTraitValue(temperamentTrait) : undefined,
        'General temperament',
        'General temperament (e.g. peaceful, semi-aggressive, aggressive, predatory)'
      ),
    ];

    const anySaved =
      savedParams.length > 0 ||
      tdsSaved ||
      item.mouthSizeMm !== undefined ||
      item.adultSizeIn !== undefined ||
      minGroupTrait !== undefined ||
      minLengthTrait !== undefined ||
      minWidthTrait !== undefined ||
      finNipperTrait !== undefined ||
      longFinsTrait !== undefined ||
      eatsPlantsTrait !== undefined ||
      temperamentTrait !== undefined;
    const verifyInstruction = anySaved
      ? ' Some fields below already have a value saved — please verify those are accurate rather than skipping them, and correct anything that looks wrong.'
      : '';

    return `Research ${item.name} for a home aquarium. I'm planning to keep ${qtyPhrase} in a ${tankSizeDetail}. Please give specific numeric ranges where possible, and note your confidence on anything that varies a lot by source.${verifyInstruction} ${averagingNote}

${bullets.join('\n')}`;
  }

  // hardscape/substrate/equipment items don't currently get a tailored
  // prompt — falls through to the same general-purpose one plants and
  // livestock used before this split, kept as a reasonable default
  // rather than leaving these categories with no prompt at all.
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