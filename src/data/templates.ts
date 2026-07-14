import type {
  CustomFieldDef,
  ChecklistTask,
  Tank,
  Question,
  QuestionNode,
  QuestionResult,
  RecommendedRosterItem,
  RosterItem,
} from '../types';
import { PRESET_FIELDS } from './presetFields';

// =========================================================================
// DEFERRED — compatibility warning pills (shrimplet-unsafe / fin-nipper /
// adult-shrimp-risk / incompatible-water-parameters severity tiers) on the
// actual roster, not just questionnaire results. Good idea, not built.
//
// Investigated whether a public API could supply the underlying data
// instead of hand-curating it — it can't, not usefully:
// - FishBase (fishbase.ropensci.org, free, no auth, well-documented) is
//   the only credible free option, but it's a wild-population/fisheries
//   science database, not an aquarium-hobby one. No compatibility or
//   bioload data at all.
// - Water parameters (pH/hardness/temp) live in FishBase's STOCKS table,
//   not the main species table — and FishBase's own manual admits
//   coverage is sparse ("only few suitably standardized datasets"),
//   likely worse for small ornamental species than commercial food fish.
// - Mouth/gape size (the simple path to inferring shrimp-predation risk)
//   isn't a field FishBase exposes anywhere at consistent coverage —
//   checked the full species field list, nothing resembling it. The
//   morphometric tables that might have it are per-study contributed,
//   not systematic.
// - Fin-nipping is a behavioral trait with no data-derivable proxy at
//   all — always needed manual curation regardless of API availability.
//
// So there's no shortcut: every species covered by these questionnaires
// would need its compatibility traits (shrimp-predator, fin-nipper,
// realistic captive pH/temp/hardness range) hand-verified and entered,
// same category of effort as the questionnaire content itself, and it
// compounds with every new species added. This is exactly the research
// commercial stocking-calculator apps (Aqulator, FishHuddle, Fastaquatics,
// etc.) charge for — there isn't a free dataset to lean on instead.
// Picking this back up needs either domain expertise to author the trait
// data directly, or a research pass per species before any code gets
// written — the pill UI itself (4 severity tiers, pairwise roster checks)
// is the easy part.
// =========================================================================

export interface TankTemplate {
  id: string;
  name: string;
  description: string;
  waterType: 'freshwater' | 'saltwater';
  // The absolute floor for this template as a whole — below this, nothing
  // in the template makes sense regardless of which questionnaire branch
  // gets picked (e.g. no reef setup works under 10g). This is a hard
  // creation-time gate, checked before the tank is built at all. It is
  // deliberately the smallest viable case within the template (e.g. Solo
  // Fish allows 2.5g because a Betta fits there, even though Oscar — also
  // reachable from this same template — needs 55g). A specific species
  // falling short of its OWN larger minimum despite clearing this floor is
  // handled per-result via RecommendedRosterItem.warning instead, not by
  // rejecting the whole template.
  minGallons: number;
  customFields: Omit<CustomFieldDef, 'id'>[];
  checklist: Omit<ChecklistTask, 'id' | 'done'>[];
  questionnaire?: Question;
}

// Pulls a field straight from the shared preset library rather than
// redefining it here, so a template-created tank and a manually
// "added from preset" field are always the exact same field — same
// label, same emoji, same type. Throws at module load if a label typos
// out of sync with presetFields.ts, which is exactly when we want to know.
function preset(label: string): Omit<CustomFieldDef, 'id'> {
  const found = PRESET_FIELDS.find((f) => f.label === label);
  if (!found) throw new Error(`Template references unknown preset field: "${label}"`);
  return { label: found.label, type: found.type };
}

function clamp(n: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, Math.round(n)));
}

// =========================================================================
// SUBSTRATE — a real, generalized either/or, not a Walstad-only default.
// Every questionnaire below asks this first, before any livestock question,
// since it's the one structural choice that affects the whole build
// regardless of what ends up living in the tank. "Active" covers BOTH a
// capped, dirted (Walstad-style) setup AND a commercial aquasoil — the
// item's own detail explains that trade-off rather than assuming everyone
// wants a dirted tank specifically. Source-checked against current
// substrate-comparison guidance (inert+root-tabs is the commonly
// recommended beginner default; dirted/aquasoil are both real alternatives
// with their own trade-offs, not the only "correct" planted-tank approach).
// =========================================================================

export type SubstrateChoice = 'active' | 'inert';

function substrateItems(choice: SubstrateChoice): RecommendedRosterItem[] {
  if (choice === 'active') {
    return [
      {
        name: 'Nutrient-Rich Substrate (dirted or aquasoil)',
        category: 'substrate',
        detail:
          'Either capped organic potting soil (Walstad-style — cheaper, messier, more prone to ammonia spikes/cloudiness if disturbed) or a commercial aquasoil like Fluval Stratum or ADA Amazonia (pricier, cleaner, no capping needed, depletes over 1-2 years). Both feed root-growing plants directly without regular dosing.',
        cost: 18,
        status: 'wishlist',
        defaultSelected: true,
      },
    ];
  }
  return [
    {
      name: 'Inert Sand or Fine Gravel',
      category: 'substrate',
      detail:
        "Won't alter water chemistry and never needs replacing — generally the easiest substrate to manage, especially for a first tank.",
      cost: 15,
      status: 'wishlist',
      defaultSelected: true,
    },
    {
      name: 'Root Tabs',
      category: 'equipment',
      detail: 'Only needed under root-feeding plants (swords, crypts) — inert substrate has no nutrients of its own.',
      cost: 6,
      status: 'wishlist',
      defaultSelected: false,
    },
  ];
}

function substrateQuestion(buildNext: (choice: SubstrateChoice) => QuestionNode): Question {
  return {
    kind: 'question',
    id: 'q-substrate',
    prompt: 'How do you want to feed root-growing plants?',
    options: [
      {
        id: 'active',
        label: 'Nutrient-rich substrate (dirted soil or aquasoil) — feeds plants directly',
        emoji: '🌱',
        next: buildNext('active'),
      },
      {
        id: 'inert',
        label: 'Inert sand/gravel + root tabs as needed — simpler to manage',
        emoji: '🪨',
        next: buildNext('inert'),
      },
    ],
  };
}

// =========================================================================
// SIZE-AWARE STOCKING HELPERS
// Grounded in commonly-cited stocking guidance rather than a single fixed
// number regardless of tank size:
// - Neocaridina: conservative sources suggest starting around 1/gallon and
//   letting a colony grow into the widely-cited 5-10/gallon long-term
//   carrying capacity, rather than stocking at full density on day one.
// - Caridina (CRS, Blue Bolt, etc.): kept more conservatively — softer,
//   more particular water, slower to recover from a bad batch.
// =========================================================================

function neoStarterQty(sizeGallons: number): number {
  return clamp(sizeGallons * 1, 8, 40);
}

function caridinaStarterQty(sizeGallons: number): number {
  return clamp(sizeGallons * 0.6, 6, 25);
}

// --- Shared commitment-level question, used inside the shrimp tree ---
// Color is asked first purely as an easy warm-up question, not because it
// determines genus — Neocaridina vs Caridina is a hardiness/care-commitment
// distinction (Neocaridina more forgiving and tolerant of a wider range of
// tap water, Caridina more particular about soft/stable water), so a
// separate question asks about desired commitment level and THAT
// determines which genus gets suggested.
function commitmentQuestion(
  id: string,
  simpleResult: QuestionResult,
  attentiveResult: QuestionResult
): Question {
  return {
    kind: 'question',
    id,
    prompt: 'How much hands-on care do you want to commit to?',
    options: [
      {
        id: 'simple',
        label: 'Keep it simple — hardier and more forgiving of tap water',
        emoji: '🌱',
        next: simpleResult,
      },
      {
        id: 'attentive',
        label: "I don't mind extra attention for something more particular",
        emoji: '🎯',
        next: attentiveResult,
      },
    ],
  };
}

function shrimpHardscape(): RecommendedRosterItem[] {
  return [
    {
      name: 'Driftwood (Manzanita or similar)',
      category: 'hardscape',
      detail: 'Minimal impact on water chemistry — just needs weighting or a long soak, no boiling required',
      cost: 20,
      status: 'wishlist',
      defaultSelected: true,
    },
    {
      name: 'Cholla Wood',
      category: 'hardscape',
      detail: 'Hollow, biodegradable "shrimpwood" — builds a biofilm layer shrimp graze on',
      cost: 7,
      status: 'wishlist',
      defaultSelected: true,
    },
    {
      name: 'Indian Almond Leaves (Catappa)',
      category: 'hardscape',
      detail: 'Releases tannins, mild antibacterial properties — shrimp graze the biofilm that grows on them as they break down',
      cost: 6,
      status: 'wishlist',
      defaultSelected: true,
    },
    {
      name: 'Sponge Filter + Air Pump',
      category: 'equipment',
      cost: 16,
      status: 'wishlist',
      defaultSelected: true,
    },
  ];
}

function tannicHardscapeForCaridina(): RecommendedRosterItem[] {
  return [
    {
      name: 'Mopani Wood',
      category: 'hardscape',
      detail:
        "Releases more tannins than Manzanita, softening and acidifying the water — a better match for Caridina's soft/acidic preference. Needs an initial boil/soak",
      cost: 18,
      status: 'wishlist',
      defaultSelected: true,
    },
    {
      name: 'Cholla Wood',
      category: 'hardscape',
      detail: 'Hollow, biodegradable "shrimpwood" — builds a biofilm layer shrimp graze on',
      cost: 7,
      status: 'wishlist',
      defaultSelected: true,
    },
    {
      name: 'Indian Almond Leaves (Catappa)',
      category: 'hardscape',
      detail: 'Releases tannins, mild antibacterial properties — doubles down on the soft/acidic lean Caridina want',
      cost: 6,
      status: 'wishlist',
      defaultSelected: true,
    },
    {
      name: 'Sponge Filter + Air Pump',
      category: 'equipment',
      cost: 16,
      status: 'wishlist',
      defaultSelected: true,
    },
  ];
}

function shrimpPlants(): RecommendedRosterItem[] {
  return [
    { name: 'Java Moss', category: 'plant', status: 'wishlist', defaultSelected: true },
    { name: 'Anubias Nana', category: 'plant', status: 'wishlist', defaultSelected: false },
    { name: 'Hornwort', category: 'plant', status: 'wishlist', defaultSelected: false },
    {
      name: 'Floating Plants',
      category: 'plant',
      detail: 'Best added a few weeks in, once the tank has settled',
      status: 'wishlist',
      defaultSelected: false,
    },
  ];
}

// --- Neocaridina results (hardy, tolerant of a wide pH range) ---
function redNeoResult(substrate: SubstrateChoice): QuestionResult {
  return {
    kind: 'result',
    id: `r-red-neo-${substrate}`,
    summary: 'Red Cherry Neocaridina Starter',
    items: (sizeGallons) => [
      {
        name: 'Neocaridina davidi — Red Cherry (S/SS Grade)',
        category: 'livestock',
        quantity: neoStarterQty(sizeGallons),
        cost: 30,
        status: 'wishlist',
        defaultSelected: true,
      },
      ...shrimpHardscape(),
      {
        name: 'Crushed Coral + Media Bag',
        category: 'hardscape',
        detail: 'Optional buffering, goes in the filter not the substrate — only worth adding if your tap water runs naturally soft',
        cost: 12,
        status: 'wishlist',
        defaultSelected: false,
      },
      ...substrateItems(substrate),
      ...shrimpPlants(),
    ],
  };
}

function redCaridinaResult(substrate: SubstrateChoice): QuestionResult {
  return {
    kind: 'result',
    id: `r-red-caridina-${substrate}`,
    summary: 'Crystal Red Shrimp (CRS) Starter',
    items: (sizeGallons) => [
      {
        name: 'Caridina cantonensis — Crystal Red Shrimp',
        category: 'livestock',
        detail: 'Grade and exact sourcing still worth researching, but CRS itself is a well-established, widely available variety',
        quantity: caridinaStarterQty(sizeGallons),
        cost: 3.5,
        status: 'wishlist',
        defaultSelected: true,
      },
      ...tannicHardscapeForCaridina(),
      ...substrateItems(substrate),
      {
        name: 'RO/RODI Water System',
        category: 'equipment',
        detail: "CRS are typically far more sensitive to tap water parameters than Neocaridina",
        status: 'idea',
        defaultSelected: true,
      },
      ...shrimpPlants(),
    ],
  };
}

// --- Yellow ---
function yellowNeoResult(substrate: SubstrateChoice): QuestionResult {
  return {
    kind: 'result',
    id: `r-yellow-neo-${substrate}`,
    summary: 'Yellow Goldenback Neocaridina Starter',
    items: (sizeGallons) => [
      {
        name: 'Neocaridina davidi — Yellow Goldenback (S Grade)',
        category: 'livestock',
        quantity: neoStarterQty(sizeGallons),
        cost: 35,
        status: 'wishlist',
        defaultSelected: true,
      },
      ...shrimpHardscape(),
      {
        name: 'Crushed Coral + Media Bag',
        category: 'hardscape',
        detail: 'Optional buffering, goes in the filter not the substrate — only worth adding if your tap water runs naturally soft',
        cost: 12,
        status: 'wishlist',
        defaultSelected: false,
      },
      ...substrateItems(substrate),
      ...shrimpPlants(),
    ],
  };
}

function yellowCaridinaResult(substrate: SubstrateChoice): QuestionResult {
  return {
    kind: 'result',
    id: `r-yellow-caridina-${substrate}`,
    summary: 'Yellow King Kong Shrimp Starter',
    items: (sizeGallons) => [
      {
        name: 'Caridina cantonensis — Yellow King Kong (Taiwan Bee lineage)',
        category: 'livestock',
        detail:
          'A real, established Caridina color line (same Taiwan Bee lineage as King Kong/Panda varieties) — pricier and more particular about water stability than CRS, worth confirming current availability with your seller',
        quantity: caridinaStarterQty(sizeGallons),
        cost: 6,
        status: 'wishlist',
        defaultSelected: true,
      },
      ...tannicHardscapeForCaridina(),
      ...substrateItems(substrate),
      {
        name: 'RO/RODI Water System',
        category: 'equipment',
        detail: 'Taiwan Bee lines are typically even more sensitive to tap water swings than CRS',
        status: 'idea',
        defaultSelected: true,
      },
      ...shrimpPlants(),
    ],
  };
}

// --- Blue ---
function blueNeoResult(substrate: SubstrateChoice): QuestionResult {
  return {
    kind: 'result',
    id: `r-blue-neo-${substrate}`,
    summary: 'Blue Dream Neocaridina Starter',
    items: (sizeGallons) => [
      {
        name: 'Neocaridina davidi — Blue Dream',
        category: 'livestock',
        quantity: neoStarterQty(sizeGallons),
        cost: 35,
        status: 'wishlist',
        defaultSelected: true,
      },
      ...shrimpHardscape(),
      {
        name: 'Crushed Coral + Media Bag',
        category: 'hardscape',
        detail: 'Optional buffering, goes in the filter not the substrate — only worth adding if your tap water runs naturally soft',
        cost: 12,
        status: 'wishlist',
        defaultSelected: false,
      },
      ...substrateItems(substrate),
      ...shrimpPlants(),
    ],
  };
}

function blueCaridinaResult(substrate: SubstrateChoice): QuestionResult {
  return {
    kind: 'result',
    id: `r-blue-caridina-${substrate}`,
    summary: 'Blue Bolt Shrimp Starter',
    items: (sizeGallons) => [
      {
        name: 'Caridina cantonensis — Blue Bolt',
        category: 'livestock',
        detail: 'Grade and exact sourcing still worth researching, but Blue Bolt itself is a well-established, widely available Taiwan Bee variety',
        quantity: caridinaStarterQty(sizeGallons),
        cost: 6,
        status: 'wishlist',
        defaultSelected: true,
      },
      ...tannicHardscapeForCaridina(),
      ...substrateItems(substrate),
      {
        name: 'RO/RODI Water System',
        category: 'equipment',
        status: 'idea',
        defaultSelected: true,
      },
      ...shrimpPlants(),
    ],
  };
}

// --- Not sure yet ---
function notSureNeoResult(substrate: SubstrateChoice): QuestionResult {
  return {
    kind: 'result',
    id: `r-notsure-neo-${substrate}`,
    summary: 'Mixed-Grade Neocaridina Starter',
    items: (sizeGallons) => [
      {
        name: 'Neocaridina davidi — mixed color pack',
        category: 'livestock',
        quantity: neoStarterQty(sizeGallons),
        cost: 25,
        status: 'wishlist',
        defaultSelected: true,
      },
      ...shrimpHardscape(),
      {
        name: 'Crushed Coral + Media Bag',
        category: 'hardscape',
        detail: 'Optional buffering, goes in the filter not the substrate — only worth adding if your tap water runs naturally soft',
        cost: 12,
        status: 'wishlist',
        defaultSelected: false,
      },
      ...substrateItems(substrate),
      ...shrimpPlants(),
    ],
  };
}

function notSureCaridinaResult(substrate: SubstrateChoice): QuestionResult {
  return {
    kind: 'result',
    id: `r-notsure-caridina-${substrate}`,
    summary: 'Mixed Caridina Starter',
    items: (sizeGallons) => [
      {
        name: 'Caridina — mixed color pack',
        category: 'livestock',
        detail: 'Ask your seller which soft-water color varieties they currently have in stock — availability shifts often at this end of the hobby',
        quantity: caridinaStarterQty(sizeGallons),
        cost: 5,
        status: 'wishlist',
        defaultSelected: true,
      },
      ...tannicHardscapeForCaridina(),
      ...substrateItems(substrate),
      {
        name: 'RO/RODI Water System',
        category: 'equipment',
        status: 'idea',
        defaultSelected: true,
      },
      { name: 'Java Moss', category: 'plant', status: 'wishlist', defaultSelected: true },
    ],
  };
}

function otherInvertResult(substrate: SubstrateChoice): QuestionResult {
  return {
    kind: 'result',
    id: `r-other-invert-${substrate}`,
    summary: 'Other Invert Starter',
    items: () => [
      {
        name: 'Invert species (crayfish, ghost shrimp, etc.)',
        category: 'livestock',
        status: 'idea',
        defaultSelected: true,
        detail:
          "Species-specific needs vary a lot — confirm adult size, temperament, and water needs with your retailer before finalizing. Many inverts (crayfish especially) are predatory and shouldn't be mixed with a shrimp breeding colony.",
      },
      { name: 'Sponge Filter + Air Pump', category: 'equipment', cost: 16, status: 'wishlist', defaultSelected: true },
      ...substrateItems(substrate),
    ],
  };
}

function buildShrimpColorTree(substrate: SubstrateChoice): Question {
  return {
    kind: 'question',
    id: `q-color-${substrate}`,
    prompt: "What look are you going for? (Just a starting point — this comes before genus, not the other way around)",
    options: [
      { id: 'red', label: 'Red', emoji: '🔴', next: commitmentQuestion(`q-commit-red-${substrate}`, redNeoResult(substrate), redCaridinaResult(substrate)) },
      { id: 'yellow', label: 'Yellow', emoji: '🟡', next: commitmentQuestion(`q-commit-yellow-${substrate}`, yellowNeoResult(substrate), yellowCaridinaResult(substrate)) },
      { id: 'blue', label: 'Blue', emoji: '🔵', next: commitmentQuestion(`q-commit-blue-${substrate}`, blueNeoResult(substrate), blueCaridinaResult(substrate)) },
      { id: 'not-sure', label: 'Not sure yet, show me common options', emoji: '🤔', next: commitmentQuestion(`q-commit-notsure-${substrate}`, notSureNeoResult(substrate), notSureCaridinaResult(substrate)) },
    ],
  };
}

const shrimpQuestionnaire: Question = substrateQuestion((substrate) => ({
  kind: 'question',
  id: `q-focus-${substrate}`,
  prompt: "What's the main focus of this tank?",
  options: [
    { id: 'shrimp', label: 'Shrimp', emoji: '🦐', next: buildShrimpColorTree(substrate) },
    { id: 'other-invert', label: 'Other invert (crayfish, snails, etc.)', emoji: '🦞', next: otherInvertResult(substrate) },
  ],
}));

// =========================================================================
// LIVEBEARERS & FRY
// Guppies keep the original breeding-vs-simple structure. Mollies and
// platies are now real, research-grounded content (they used to be
// "FABRICATED PLACEHOLDER" stubs) — sized and detailed from their actual
// care differences rather than treated as interchangeable.
// =========================================================================

function guppyMixedResult(substrate: SubstrateChoice, strainLabel: string): QuestionResult {
  return {
    kind: 'result',
    id: `r-guppy-mixed-${substrate}-${strainLabel}`,
    summary: `Mixed-Gender Guppy Starter — ${strainLabel} (breeding-friendly)`,
    items: (sizeGallons) => {
      const females = clamp(sizeGallons * 0.6, 6, 15);
      const males = Math.max(2, Math.round(females / 2.5));
      return [
        {
          name: `Guppies — ${strainLabel}, mixed (${females} female, ${males} male)`,
          category: 'livestock',
          detail: '2-3 females per male keeps breeding pressure spread across the group rather than harassing one female. Fry will likely mix strains over generations unless you selectively cull.',
          quantity: females + males,
          cost: (females + males) * 3.5,
          status: 'wishlist',
          defaultSelected: true,
        },
        { name: 'Adjustable Heater', category: 'equipment', detail: 'Target 76-78°F', cost: 20, status: 'wishlist', defaultSelected: true },
        { name: 'Sponge Filter', category: 'equipment', detail: 'Preferred over HOB — gentle flow keeps fry from getting pulled in', cost: 16, status: 'wishlist', defaultSelected: true },
        ...substrateItems(substrate),
        { name: 'Crushed Coral', category: 'hardscape', detail: 'Guppies want slightly hard water (pH 7.0-8.5) — only add this if your tap water is on the soft side', cost: 10, status: 'wishlist', defaultSelected: false },
        { name: 'Floating Plants', category: 'plant', detail: "Essential for fry survival and shade — don't skip this if you're keeping mixed genders", status: 'wishlist', defaultSelected: true },
        { name: 'Guppy Grass', category: 'plant', status: 'wishlist', defaultSelected: true },
        { name: 'Java Fern', category: 'plant', status: 'wishlist', defaultSelected: false },
      ];
    },
  };
}

function guppyAllMaleResult(substrate: SubstrateChoice, strainLabel: string): QuestionResult {
  return {
    kind: 'result',
    id: `r-guppy-all-male-${substrate}-${strainLabel}`,
    summary: `All-Male Guppy Starter — ${strainLabel} (no breeding)`,
    items: (sizeGallons) => [
      {
        name: `Guppies — ${strainLabel}, all male`,
        category: 'livestock',
        detail: 'No fry to manage, and males carry the strain\'s color/pattern at full intensity without a female\'s more muted tones diluting the look',
        quantity: clamp(sizeGallons * 0.8, 5, 12),
        cost: 4,
        status: 'wishlist',
        defaultSelected: true,
      },
      { name: 'Adjustable Heater', category: 'equipment', detail: 'Target 76-78°F', cost: 20, status: 'wishlist', defaultSelected: true },
      { name: 'Sponge Filter or HOB', category: 'equipment', cost: 18, status: 'wishlist', defaultSelected: true },
      ...substrateItems(substrate),
      { name: 'Java Fern', category: 'plant', status: 'wishlist', defaultSelected: false },
      { name: 'Anubias', category: 'plant', status: 'wishlist', defaultSelected: false },
      { name: 'Floating Plants', category: 'plant', detail: 'Not essential without fry, but still good for shade and cover', status: 'wishlist', defaultSelected: false },
    ],
  };
}

// Guppy strain/pattern is a real, visually-obvious choice (not something
// requiring prior species research) — these are the three broad pattern
// families most guppy stock is sold under, regardless of which specific
// named strain a given store carries.
function guppyBreedingQuestion(substrate: SubstrateChoice, strainLabel: string): Question {
  return {
    kind: 'question',
    id: `q-guppy-breeding-${substrate}-${strainLabel}`,
    prompt: 'Do you want to breed guppies, or keep it low-maintenance?',
    options: [
      { id: 'mixed', label: "I don't mind fry — mixed gender", emoji: '🍼', next: guppyMixedResult(substrate, strainLabel) },
      { id: 'all-male', label: 'Keep it simple — all-male, no breeding', emoji: '🚫', next: guppyAllMaleResult(substrate, strainLabel) },
    ],
  };
}

function guppyPatternQuestion(substrate: SubstrateChoice): Question {
  return {
    kind: 'question',
    id: `q-guppy-pattern-${substrate}`,
    prompt: 'What pattern catches your eye?',
    options: [
      { id: 'solid', label: 'Solid, vibrant single color', emoji: '🔴', next: guppyBreedingQuestion(substrate, 'Solid Color') },
      { id: 'tuxedo', label: 'Tuxedo — two-tone body with a contrasting tail', emoji: '🎩', next: guppyBreedingQuestion(substrate, 'Tuxedo') },
      { id: 'wild', label: 'Wild mixed patterns — koi, cobra, snakeskin', emoji: '🌀', next: guppyBreedingQuestion(substrate, 'Koi/Cobra/Mixed-Pattern') },
    ],
  };
}

function molliesResult(
  substrate: SubstrateChoice,
  lookLabel: string,
  lookDetail: string,
  minGallons: number = 10
): QuestionResult {
  return {
    kind: 'result',
    id: `r-mollies-${substrate}-${lookLabel}`,
    summary: `Molly Starter — ${lookLabel}`,
    items: (sizeGallons) => {
      const qty = clamp(sizeGallons / 4, 3, 8);
      return [
        {
          name: `Mollies — ${lookLabel} (Poecilia sphenops / P. latipinna)`,
          category: 'livestock',
          detail:
            `${lookDetail} Larger (3-4.5", sailfin varieties bigger still) and more water-sensitive than platies — prefer harder, more alkaline water (pH 7.5-8.5) and benefit from a light dose of aquarium salt. Roughly 1 male per 2-3 females avoids over-breeding pressure.`,
          quantity: qty,
          cost: qty * 6,
          status: 'wishlist',
          defaultSelected: true,
          warning: sizeGallons < minGallons ? `Needs ~${minGallons}gal, this tank is ${sizeGallons}gal` : undefined,
        },
        { name: 'Aquarium Salt (optional)', category: 'equipment', detail: 'Not required, but many mollies tolerate and benefit from a light dose, especially with naturally soft tap water', cost: 5, status: 'wishlist', defaultSelected: false },
        { name: 'Adjustable Heater', category: 'equipment', detail: 'Target 75-80°F', cost: 20, status: 'wishlist', defaultSelected: true },
        { name: 'Hang-On-Back or Sponge Filter', category: 'equipment', detail: 'Mollies produce more waste than platies — err toward stronger filtration', cost: 22, status: 'wishlist', defaultSelected: true },
        ...substrateItems(substrate),
        { name: 'Crushed Coral', category: 'hardscape', detail: 'Helps hold the harder, more alkaline water mollies prefer — worth adding if your tap water runs soft', cost: 10, status: 'wishlist', defaultSelected: false },
        { name: 'Java Fern', category: 'plant', status: 'wishlist', defaultSelected: true },
        { name: 'Floating Plants', category: 'plant', status: 'wishlist', defaultSelected: false },
      ];
    },
  };
}

// Three real, commonly-available molly looks — the sailfin variant's own
// detail calls out that it wants meaningfully more room than the other two,
// since a dramatic sail fin only reads well with enough swimming space to
// display it.
function mollyLookQuestion(substrate: SubstrateChoice): Question {
  return {
    kind: 'question',
    id: `q-molly-look-${substrate}`,
    prompt: 'Which molly look are you drawn to?',
    options: [
      {
        id: 'black',
        label: 'Solid glossy black — classic, understated',
        emoji: '⚫',
        next: molliesResult(substrate, 'Solid Black', 'Classic short-fin black molly — the most widely available and budget-friendly look.'),
      },
      {
        id: 'dalmatian',
        label: 'Dalmatian — white body, black spots',
        emoji: '🐆',
        next: molliesResult(substrate, 'Dalmatian', 'White-and-black spotted pattern, no two individuals look quite the same.'),
      },
      {
        id: 'sailfin',
        label: 'Gold/silver with a dramatic tall sail fin',
        emoji: '⛵',
        next: molliesResult(
          substrate,
          'Gold Dust Sailfin',
          "Sailfin varieties run larger than short-fin mollies and want real open swimming room to actually display that fin — lean toward the upper end of mollies' size range (20g+) rather than a small first tank.",
          20
        ),
      },
    ],
  };
}

function platiesResult(substrate: SubstrateChoice, colorLabel: string, colorDetail: string): QuestionResult {
  return {
    kind: 'result',
    id: `r-platies-${substrate}-${colorLabel}`,
    summary: `Platy Starter — ${colorLabel}`,
    items: (sizeGallons) => {
      const qty = clamp(sizeGallons / 2, 3, 12);
      const minGallons = 10;
      return [
        {
          name: `Platies — ${colorLabel} (Xiphophorus maculatus / X. variatus)`,
          category: 'livestock',
          detail:
            `${colorDetail} Hardier and more tolerant of imperfect water than mollies, and smaller (males ~1.5", females ~2.5"). Roughly 1 male per 2-3 females keeps breeding pressure manageable — one of the most forgiving livebearers for a first tank.`,
          quantity: qty,
          cost: qty * 5,
          status: 'wishlist',
          defaultSelected: true,
          warning: sizeGallons < minGallons ? `Needs ~${minGallons}gal, this tank is ${sizeGallons}gal` : undefined,
        },
        { name: 'Adjustable Heater', category: 'equipment', detail: 'Target 72-78°F', cost: 20, status: 'wishlist', defaultSelected: true },
        { name: 'Sponge Filter or HOB', category: 'equipment', cost: 18, status: 'wishlist', defaultSelected: true },
        ...substrateItems(substrate),
        { name: 'Java Fern', category: 'plant', status: 'wishlist', defaultSelected: true },
        { name: 'Floating Plants', category: 'plant', detail: "Good fry cover if you don't mind population growth", status: 'wishlist', defaultSelected: false },
      ];
    },
  };
}

// Three genuinely common, visually-distinct platy color lines — again
// pickable on sight, no species-recognition knowledge required going in.
function platyColorQuestion(substrate: SubstrateChoice): Question {
  return {
    kind: 'question',
    id: `q-platy-color-${substrate}`,
    prompt: 'Which platy color line?',
    options: [
      {
        id: 'red-wag',
        label: 'Red Wag — solid red body, black fins',
        emoji: '🔴',
        next: platiesResult(substrate, 'Red Wag', 'Solid red body with contrasting black ("wag") fins — one of the most common, budget-friendly platy lines.'),
      },
      {
        id: 'mickey-mouse',
        label: 'Blue/Mickey Mouse — blue-grey body, tail-spot pattern',
        emoji: '🔵',
        next: platiesResult(substrate, 'Blue Mickey Mouse', 'Blue-grey body with a dark three-spot marking near the tail that resembles a mouse silhouette — a genuinely distinctive, easy-to-spot pattern.'),
      },
      {
        id: 'sunset',
        label: 'Sunset/Marigold — warm orange-yellow gradient',
        emoji: '🟠',
        next: platiesResult(substrate, 'Sunset/Marigold', 'Warm orange-to-yellow gradient down the body — reads as one of the warmest-toned platy lines.'),
      },
    ],
  };
}

const livebearersQuestionnaire: Question = substrateQuestion((substrate) => ({
  kind: 'question',
  id: `q-livebearer-species-${substrate}`,
  prompt: 'Which livebearer are you focusing on?',
  options: [
    { id: 'guppies', label: 'Guppies — classic, most color variety', emoji: '🐟', next: guppyPatternQuestion(substrate) },
    { id: 'mollies', label: 'Mollies — larger, glossier, more water-sensitive', emoji: '🐠', next: mollyLookQuestion(substrate) },
    { id: 'platies', label: 'Platies — smaller, hardier, very low-maintenance', emoji: '🐠', next: platyColorQuestion(substrate) },
  ],
}));

// =========================================================================
// COMMUNITY FISH
// Previously both branches here were either a direct copy of one specific
// real tank, or a species-name-recognition question ("ember tetras or
// harlequin rasboras?") that assumes the answerer already knows what those
// are. Replaced with trait-based questions (shrimp in/out, how lively, what
// color palette) and size-tiered species picks grounded in actual
// nano/community stocking guidance — a 6-gallon and a 25-gallon community
// tank now get genuinely different suggestions, not the same list with
// different quantities. The warm/cool axis mirrors the shrimp tree's color
// question — a "look" choice everyone can answer without already knowing
// species names, resolved to an actual, size-appropriate fish afterward.
//
// DEFERRED — not built now, explicitly not urgent: only two size
// breakpoints exist today (<10g, 10-20g, 20g+), so anything from 20g up
// through a 125g tank currently gets treated identically. The plan, when
// picked up, is to add tiers matching standard US "mass produced" tank
// denominations rather than arbitrary cutoffs: 2.5, 5, 10, 15, 20 long,
// 20 high, 29, 40 breeder, 55, 65, 75, 90, 120, 125 gallons. Each new
// bracket above the current 20g+ tier needs real research (bigger
// schooling fish, appropriate centerpiece options, bioload-appropriate
// stocking) rather than just extending the current nano-fish picks
// further up — this is a real content expansion, not a quick tweak.
// =========================================================================

type ColorLook = 'warm' | 'cool';

function communitySchool(
  activity: 'calm' | 'lively',
  look: ColorLook,
  sizeGallons: number
): RecommendedRosterItem[] {
  if (activity === 'calm') {
    if (sizeGallons < 10) {
      return look === 'warm'
        ? [
            {
              name: 'Chili Rasboras',
              category: 'livestock',
              detail: 'Warm red-orange tone, one of the smallest schooling fish in the hobby (under 1"). Workable from 5 gallons, but water quality shifts fast at this size — keep a close eye early on.',
              quantity: clamp(sizeGallons * 1.6, 8, 15),
              cost: 4,
              status: 'wishlist',
              defaultSelected: true,
            },
          ]
        : [
            {
              name: 'White Cloud Mountain Minnows',
              category: 'livestock',
              detail: 'Cool silvery-blue lateral stripe with red fin accents. Very tolerant — even handles cooler, unheated water — and a good calm cool-toned pick this small.',
              quantity: clamp(sizeGallons * 1.6, 8, 15),
              cost: 3,
              status: 'wishlist',
              defaultSelected: true,
            },
          ];
    }
    return [
      look === 'warm'
        ? {
            name: 'Celestial Pearl Danios (Galaxy Rasboras)',
            category: 'livestock',
            detail: 'Dark jeweled body with warm orange-red fin accents. Calm, shy schoolers that want a mature, stable tank rather than a freshly cycled one. Minimum 10 gallons.',
            quantity: clamp(sizeGallons * 1, 10, 20),
            cost: 5,
            status: 'wishlist',
            defaultSelected: true,
          }
        : {
            name: 'Green Neon Tetras',
            category: 'livestock',
            detail: 'A more petite, cooler-toned cousin of the standard neon tetra — bright blue-green stripe with barely a hint of red. Minimum 10 gallons, schools of 6-8+.',
            quantity: clamp(sizeGallons * 1, 8, 18),
            cost: 4,
            status: 'wishlist',
            defaultSelected: true,
          },
      {
        name: 'Pygmy Corydoras',
        category: 'livestock',
        detail: 'Small, social bottom-dweller that schools both along the substrate and in open water — unusual for a cory',
        quantity: clamp(sizeGallons * 0.6, 6, 12),
        cost: 6,
        status: 'wishlist',
        defaultSelected: true,
      },
    ];
  }

  // lively
  if (sizeGallons < 10) {
    return [
      {
        name: look === 'warm' ? "Endler's Livebearers — males only (orange/red/tiger strains)" : "Endler's Livebearers — males only (black/green/blue strains)",
        category: 'livestock',
        detail: "Hardy, constantly active, and one of the most beginner-forgiving nano fish this small — Endler's color strains genuinely span both warm and cool ends, so this is real strain-picking rather than a fixed species. Defaulting to males-only here on purpose: as livebearers, a mixed-gender group breeds fast enough to overstock a tank this size within weeks, and this Community template has no fry-tracking or breeding-management built in. If you actually want to breed them, the Livebearers & Fry template is built for that instead.",
        quantity: clamp(sizeGallons * 1.2, 5, 12),
        cost: 5,
        status: 'wishlist',
        defaultSelected: true,
      },
    ];
  }
  if (sizeGallons < 20) {
    return [
      look === 'warm'
        ? {
            name: 'Ember Tetras',
            category: 'livestock',
            detail: 'Warm orange-red glow, small and budget-friendly, and more tolerant of a wider pH range than most nano tetras. Minimum 10 gallons, 8+ for confident schooling.',
            quantity: clamp(sizeGallons * 1, 8, 15),
            cost: 4,
            status: 'wishlist',
            defaultSelected: true,
          }
        : {
            name: 'Zebra Danios',
            category: 'livestock',
            detail: 'Cool black-and-white striped pattern, constantly active. Best schooling behavior shows in a longer tank around 15g+ with a group of 6+ — the low end of this range is workable but a bit snug for their energy.',
            quantity: clamp(sizeGallons * 0.8, 6, 12),
            cost: 3,
            status: 'wishlist',
            defaultSelected: true,
          },
      {
        name: 'Pygmy Corydoras',
        category: 'livestock',
        detail: "Small bottom-cleanup crew that won't outcompete nano schooling fish for food",
        quantity: clamp(sizeGallons * 0.5, 6, 10),
        cost: 6,
        status: 'wishlist',
        defaultSelected: true,
      },
    ];
  }
  return [
    {
      name: 'Honey Gourami',
      category: 'livestock',
      detail: 'Peaceful centerpiece fish, calmer than most other gourami species — top-to-mid water column',
      quantity: 1,
      cost: 12,
      status: 'wishlist',
      defaultSelected: true,
    },
    look === 'warm'
      ? {
          name: 'Harlequin Rasboras',
          category: 'livestock',
          detail: 'Warm coppery-orange body with a bold black triangle marking — a bit bigger and bolder than chili/ember tetras, wants the extra open swimming room a 20+ gallon tank gives.',
          quantity: clamp(sizeGallons * 0.5, 9, 15),
          cost: 4,
          status: 'wishlist',
          defaultSelected: true,
        }
      : {
          name: 'Cardinal Tetras',
          category: 'livestock',
          detail: 'Cool electric-blue racing stripe over a red underline — larger and hardier than a standard neon, and shows off best with the extra swimming room a 20+ gallon tank gives.',
          quantity: clamp(sizeGallons * 0.5, 9, 15),
          cost: 5,
          status: 'wishlist',
          defaultSelected: true,
        },
    {
      name: 'Pygmy Corydoras',
      category: 'livestock',
      detail: 'Bottom cleanup crew — Otocinclus is a reasonable swap for more algae focus and less social-grouping need',
      quantity: clamp(sizeGallons * 0.4, 6, 10),
      cost: 6,
      status: 'wishlist',
      defaultSelected: true,
    },
  ];
}

function communityResult(
  substrate: SubstrateChoice,
  withShrimp: boolean,
  activity: 'calm' | 'lively',
  look: ColorLook
): QuestionResult {
  return {
    kind: 'result',
    id: `r-community-${substrate}-${withShrimp ? 'shrimp' : 'fishonly'}-${activity}-${look}`,
    summary: `${activity === 'calm' ? 'Calm, understated' : 'Lively, active'}, ${look === 'warm' ? 'warm-toned' : 'cool-toned'} community${withShrimp ? ' + shrimp' : ''}`,
    items: (sizeGallons) => {
      const items: RecommendedRosterItem[] = [...communitySchool(activity, look, sizeGallons)];

      if (withShrimp) {
        items.push({
          name: 'Neocaridina davidi (color of your choice)',
          category: 'livestock',
          detail: "Hardier and more forgiving than Caridina, and a good match for a mixed-fish tank since it doesn't need especially soft water",
          quantity: neoStarterQty(sizeGallons),
          cost: 3.5,
          status: 'wishlist',
          defaultSelected: true,
        });
        items.push({
          name: 'Nerite Snails',
          category: 'livestock',
          detail: "Won't breed in freshwater, so the population stays exactly where you set it",
          quantity: clamp(sizeGallons * 0.3, 2, 6),
          cost: 4,
          status: 'wishlist',
          defaultSelected: true,
        });
      } else {
        items.push({
          name: 'Nerite Snails (optional cleanup crew)',
          category: 'livestock',
          quantity: clamp(sizeGallons * 0.3, 2, 5),
          cost: 4,
          status: 'wishlist',
          defaultSelected: false,
        });
      }

      items.push({
        name: 'Driftwood',
        category: 'hardscape',
        detail: "Anchors epiphyte plants (Java Fern, Anubias) so they don't need to be planted in substrate",
        cost: 20,
        status: 'wishlist',
        defaultSelected: true,
      });
      items.push({
        name: 'Sponge Filter or Hang-On-Back Filter',
        category: 'equipment',
        detail: 'If using a HOB, dial the flow down — full current can be too strong for small schooling fish',
        cost: 25,
        status: 'wishlist',
        defaultSelected: true,
      });
      items.push(...substrateItems(substrate));
      items.push({ name: 'Java Fern', category: 'plant', status: 'wishlist', defaultSelected: true });
      items.push({ name: 'Anubias Nana', category: 'plant', status: 'wishlist', defaultSelected: true });
      items.push({
        name: 'Floating Plants',
        category: 'plant',
        detail: 'Shade and cover at the surface, especially valuable for shyer schoolers',
        status: 'wishlist',
        defaultSelected: false,
      });

      return items;
    },
  };
}

function communityLookQuestion(substrate: SubstrateChoice, withShrimp: boolean, activity: 'calm' | 'lively'): Question {
  return {
    kind: 'question',
    id: `q-community-look-${substrate}-${withShrimp}-${activity}`,
    prompt: 'What color palette do you want the school to bring?',
    options: [
      { id: 'warm', label: 'Warm — reds, oranges, gold', emoji: '🔥', next: communityResult(substrate, withShrimp, activity, 'warm') },
      { id: 'cool', label: 'Cool — blues, silvers, greens', emoji: '❄️', next: communityResult(substrate, withShrimp, activity, 'cool') },
    ],
  };
}

function communityActivityQuestion(substrate: SubstrateChoice, withShrimp: boolean): Question {
  return {
    kind: 'question',
    id: `q-community-activity-${substrate}-${withShrimp}`,
    prompt: 'How would you like the fish to feel in the tank?',
    options: [
      { id: 'calm', label: 'Calm & understated — small, shy schoolers', emoji: '🌊', next: communityLookQuestion(substrate, withShrimp, 'calm') },
      { id: 'lively', label: 'Lively & active — bigger schools, more constant motion', emoji: '⚡', next: communityLookQuestion(substrate, withShrimp, 'lively') },
    ],
  };
}

const communityQuestionnaire: Question = substrateQuestion((substrate) => ({
  kind: 'question',
  id: `q-community-shrimp-${substrate}`,
  prompt: 'Do you want shrimp or snails mixed into this community?',
  options: [
    { id: 'yes', label: 'Yes, include shrimp/inverts', emoji: '🦐', next: communityActivityQuestion(substrate, true) },
    { id: 'no', label: 'No, fish only', emoji: '🐠', next: communityActivityQuestion(substrate, false) },
  ],
}));

// =========================================================================
// REEF TANK
// Intentionally more compact than the freshwater trees (rock choice ->
// coral care tier -> fish inclusion -> result, vs. the 5-level freshwater
// trees) — a real coral/fish compatibility questionnaire with PAR/flow
// zone matching is a much bigger research lift than parameter tracking,
// and this is scoped as "basic" on purpose rather than attempting that
// depth now. Care tiers (soft -> LPS -> SPS) and their light/flow/
// stability requirements are grounded in current reef-keeping guidance,
// not fabricated — soft corals are consistently described as the
// beginner tier, SPS consistently as wanting a mature, stable tank
// (commonly a year+) before attempting it.
// =========================================================================

type ReefRockChoice = 'cured' | 'dry';
type CoralTier = 'soft' | 'lps' | 'sps';

function reefRockItems(choice: ReefRockChoice): RecommendedRosterItem[] {
  if (choice === 'cured') {
    return [
      {
        name: 'Cured Live Rock',
        category: 'hardscape',
        detail: 'Already seeded with beneficial bacteria and often some hitchhiking life — cycles faster, but costs more and carries a small risk of unwanted hitchhikers (pest algae, aiptasia).',
        cost: 8,
        status: 'wishlist',
        defaultSelected: true,
      },
    ];
  }
  return [
    {
      name: 'Dry Rock (uncured)',
      category: 'hardscape',
      detail: "Cheaper and pest-free, but starts completely lifeless — needs a full fishless cycle to seed bacteria before anything goes in, same idea as freshwater's nitrogen cycle just starting from zero.",
      cost: 4,
      status: 'wishlist',
      defaultSelected: true,
    },
  ];
}

function coralItems(tier: CoralTier): RecommendedRosterItem[] {
  if (tier === 'soft') {
    return [
      {
        name: 'Zoanthids / Palythoa',
        category: 'livestock',
        detail: 'One of the hardiest, most beginner-friendly corals in the hobby — tolerant of minor parameter swings, low-moderate light and flow.',
        cost: 25,
        status: 'wishlist',
        defaultSelected: true,
      },
      {
        name: 'Green Star Polyps (GSP)',
        category: 'livestock',
        detail: 'Fast-spreading mat coral, very forgiving — some keepers consider it borderline weedy once established, worth knowing before adding it near anything you want to keep contained.',
        cost: 15,
        status: 'wishlist',
        defaultSelected: true,
      },
      {
        name: 'Toadstool / Leather Coral',
        category: 'livestock',
        detail: 'Large, swaying, very hardy — adds movement and visual bulk to a young reef quickly.',
        cost: 30,
        status: 'wishlist',
        defaultSelected: false,
      },
    ];
  }
  if (tier === 'lps') {
    return [
      {
        name: 'Hammer or Frogspawn Coral (Euphyllia)',
        category: 'livestock',
        detail: "Large fleshy polyps, moderate light/flow — has long sweeper tentacles that sting neighboring corals, so give it real spacing.",
        cost: 45,
        status: 'wishlist',
        defaultSelected: true,
      },
      {
        name: 'Candy Cane Coral',
        category: 'livestock',
        detail: "One of the easiest, most peaceful LPS options — unlike most LPS it won't sting nearby corals, and tolerates a range of lighting.",
        cost: 35,
        status: 'wishlist',
        defaultSelected: true,
      },
      {
        name: 'Favia / Favites',
        category: 'livestock',
        detail: 'Hardy brain-textured coral, moderate care — still pulls calcium and alkalinity from the water as it grows, so parameter consistency matters more here than with soft corals.',
        cost: 30,
        status: 'wishlist',
        defaultSelected: false,
      },
    ];
  }
  return [
    {
      name: 'Montipora (plating or encrusting)',
      category: 'livestock',
      detail: 'One of the more forgiving SPS genera to start with — still needs stable, pristine water and strong light, but less demanding than Acropora.',
      cost: 40,
      status: 'wishlist',
      defaultSelected: true,
    },
    {
      name: 'Acropora',
      category: 'livestock',
      detail: 'The classic branching reef-builder, and the least forgiving coral on this list. Wants a mature, stable tank — many keepers wait a year or more of stable parameters before attempting it — plus strong turbulent flow and tight control of alkalinity, calcium, and magnesium.',
      cost: 50,
      status: 'wishlist',
      defaultSelected: false,
    },
  ];
}

function reefEquipment(tier: CoralTier): RecommendedRosterItem[] {
  const lightDetail =
    tier === 'sps'
      ? 'SPS wants strong light — commonly cited around PAR 300+ near the top of the tank.'
      : tier === 'lps'
      ? 'LPS does well in moderate light — commonly cited around PAR 100-300.'
      : 'Soft corals are the most forgiving of lower light — commonly cited under PAR 100-150.';
  const flowDetail =
    tier === 'sps'
      ? 'SPS wants strong, turbulent, randomized flow — consider two powerheads angled to collide rather than one straight jet.'
      : 'Moderate, indirect flow — a single powerhead angled off the rockwork is usually enough at this care level.';

  return [
    {
      name: 'Protein Skimmer',
      category: 'equipment',
      detail: "Removes dissolved organics before they break down — standard equipment on nearly every reef tank, not the optional extra it can be in freshwater.",
      cost: 90,
      status: 'wishlist',
      defaultSelected: true,
    },
    { name: 'Reef-Capable LED Light', category: 'equipment', detail: lightDetail, cost: 150, status: 'wishlist', defaultSelected: true },
    { name: 'Powerhead (water movement)', category: 'equipment', detail: flowDetail, cost: 40, status: 'wishlist', defaultSelected: true },
    {
      name: 'Refractometer',
      category: 'equipment',
      detail: 'For measuring salinity accurately — hydrometers are cheaper but noticeably less precise.',
      cost: 25,
      status: 'wishlist',
      defaultSelected: true,
    },
    { name: 'Heater', category: 'equipment', detail: 'Target 76-78°F, stable — temperature swings stress corals as much as chemistry swings do.', cost: 25, status: 'wishlist', defaultSelected: true },
  ];
}

function reefFishItems(sizeGallons: number): RecommendedRosterItem[] {
  return [
    {
      name: 'Ocellaris Clownfish (pair)',
      category: 'livestock',
      detail: 'The classic beginner reef fish — hardy, easy to feed, widely available captive-bred. Comfortable from roughly 20 gallons for a pair.',
      quantity: 2,
      cost: 20,
      status: 'wishlist',
      defaultSelected: true,
    },
    {
      name: 'Watchman or Clown Goby',
      category: 'livestock',
      detail: 'Small, hardy, reef-safe rock/sand dweller — genuinely easy relative to most other reef fish.',
      quantity: 1,
      cost: 25,
      status: 'wishlist',
      defaultSelected: sizeGallons >= 10,
    },
  ];
}

function reefCleanupCrew(sizeGallons: number): RecommendedRosterItem[] {
  return [
    {
      name: 'Nassarius Snails',
      category: 'livestock',
      detail: 'Sand-bed cleanup — eat leftover food and detritus, keep the sand bed turned over',
      quantity: clamp(sizeGallons * 0.5, 3, 10),
      cost: 3,
      status: 'wishlist',
      defaultSelected: true,
    },
    {
      name: 'Trochus or Turbo Snails',
      category: 'livestock',
      detail: 'Algae cleanup on glass and rockwork',
      quantity: clamp(sizeGallons * 0.4, 2, 8),
      cost: 4,
      status: 'wishlist',
      defaultSelected: true,
    },
    {
      name: 'Blue-Leg or Scarlet Hermit Crabs',
      category: 'livestock',
      detail: 'General scavengers — skipping emerald crabs as a default pick here, since they have a real reputation for turning on snails and even small fish once established, not a clean "reef safe" pick despite how they\'re often sold',
      quantity: clamp(sizeGallons * 0.3, 2, 6),
      cost: 3,
      status: 'wishlist',
      defaultSelected: false,
    },
  ];
}

function reefResult(rock: ReefRockChoice, tier: CoralTier, withFish: boolean): QuestionResult {
  const tierLabel = tier === 'soft' ? 'Soft Coral' : tier === 'lps' ? 'LPS' : 'SPS';
  return {
    kind: 'result',
    id: `r-reef-${rock}-${tier}-${withFish}`,
    summary: `${tierLabel} Reef Starter${withFish ? ' + Fish' : ' (Coral/Invert Only)'}`,
    items: (sizeGallons) => {
      const items: RecommendedRosterItem[] = [
        ...reefRockItems(rock),
        ...coralItems(tier),
        ...reefCleanupCrew(sizeGallons),
        ...reefEquipment(tier),
      ];
      if (withFish) items.push(...reefFishItems(sizeGallons));
      return items;
    },
  };
}

function reefFishQuestion(rock: ReefRockChoice, tier: CoralTier): Question {
  return {
    kind: 'question',
    id: `q-reef-fish-${rock}-${tier}`,
    prompt: 'Do you want fish alongside the corals, or coral/inverts only for now?',
    options: [
      { id: 'yes', label: 'Yes, add some reef-safe fish', emoji: '🐠', next: reefResult(rock, tier, true) },
      { id: 'no', label: 'Coral/inverts only for now', emoji: '🪸', next: reefResult(rock, tier, false) },
    ],
  };
}

function reefCoralTierQuestion(rock: ReefRockChoice): Question {
  return {
    kind: 'question',
    id: `q-reef-tier-${rock}`,
    prompt: 'How much parameter stability do you want to commit to?',
    options: [
      { id: 'soft', label: 'Just starting out — hardy, forgiving soft corals', emoji: '🌿', next: reefFishQuestion(rock, 'soft') },
      { id: 'lps', label: "I've got the basics down — moderate-care LPS", emoji: '🪸', next: reefFishQuestion(rock, 'lps') },
      { id: 'sps', label: "I'm ready for the most demanding corals — SPS", emoji: '🔺', next: reefFishQuestion(rock, 'sps') },
    ],
  };
}

const reefQuestionnaire: Question = {
  kind: 'question',
  id: 'q-reef-rock',
  prompt: 'Cured live rock or dry rock to start?',
  options: [
    { id: 'cured', label: 'Cured live rock — faster cycle, costs more', emoji: '🪨', next: reefCoralTierQuestion('cured') },
    { id: 'dry', label: 'Dry rock — cheaper, full cycle from scratch', emoji: '🧱', next: reefCoralTierQuestion('dry') },
  ],
};

// =========================================================================
// SOLO FISH / CENTERPIECE
// Same depth as the shrimp tree: a trait-based warm-up question (what
// personality are you drawn to, not "which species"), then a commitment
// question (mirrors shrimp's simple/hardier vs particular axis), landing
// on 4 x 2 = 8 results. Tank size matters enormously here — a Jack
// Dempsey or Oscar in a 20-gallon is genuinely bad advice — so results
// use the sizeGallons already known at result time to warn explicitly
// when the entered tank is under a species' real minimum, rather than
// silently producing an unsafe recommendation. Species/tank-size pairings
// below are checked against current care-guide consensus, not fabricated.
// =========================================================================

function soloResult(
  id: string,
  name: string,
  minGallons: number,
  detail: string,
  cost: number,
  substrate: SubstrateChoice,
  wantsPlants: boolean,
  eatsPlants: boolean
): QuestionResult {
  return {
    kind: 'result',
    id,
    summary: name,
    items: (sizeGallons) => {
      const plantWarning =
        wantsPlants && eatsPlants
          ? ' Note: this fish has a real reputation for eating or uprooting live plants regardless of preference — tough epiphytes wired to hardscape (Anubias, Java Fern) hold up far better than anything planted in substrate.'
          : '';
      const items: RecommendedRosterItem[] = [
        {
          name,
          category: 'livestock',
          detail: detail + plantWarning,
          quantity: 1,
          cost,
          status: 'wishlist',
          defaultSelected: true,
          warning:
            sizeGallons < minGallons
              ? `Needs ~${minGallons}gal long-term, this tank is ${sizeGallons}gal`
              : undefined,
        },
        {
          name: 'Adjustable Heater',
          category: 'equipment',
          detail: 'Target 76-80°F for most centerpiece fish — confirm the specific range for whichever you pick',
          cost: 22,
          status: 'wishlist',
          defaultSelected: true,
        },
        {
          name: 'Filter sized for this tank',
          category: 'equipment',
          detail: 'Solo centerpiece fish are often messier eaters than a community mix — size up rather than down',
          cost: 30,
          status: 'wishlist',
          defaultSelected: true,
        },
        { name: 'Hiding spot (cave, dense plant cover, or driftwood)', category: 'hardscape', status: 'wishlist', defaultSelected: true },
      ];
      if (wantsPlants) {
        items.push(...substrateItems(substrate));
        items.push(
          eatsPlants
            ? { name: 'Anubias / Java Fern wired to hardscape', category: 'plant', detail: 'Epiphytes tolerate this fish far better than substrate-rooted plants', status: 'wishlist', defaultSelected: true }
            : { name: 'Java Fern', category: 'plant', status: 'wishlist', defaultSelected: true }
        );
      }
      return items;
    },
  };
}

function soloCommitmentQuestion(
  id: string,
  simple: QuestionResult,
  attentive: QuestionResult
): Question {
  return {
    kind: 'question',
    id,
    prompt: 'How much long-term care and space are you willing to commit to?',
    options: [
      { id: 'simple', label: 'Keep it manageable — smaller footprint, easier upkeep', emoji: '🌱', next: simple },
      { id: 'attentive', label: "I'm ready for something bigger, messier, or more demanding", emoji: '🎯', next: attentive },
    ],
  };
}

function soloPersonalityQuestion(substrate: SubstrateChoice, wantsPlants: boolean): Question {
  return {
    kind: 'question',
    id: `q-solo-personality-${substrate}-${wantsPlants}`,
    prompt: 'What personality are you drawn to for a solo centerpiece fish?',
    options: [
      {
        id: 'showy',
        label: 'Calm & showy — flowing fins, jewel tones',
        emoji: '✨',
        next: soloCommitmentQuestion(
          `q-solo-commit-showy-${substrate}-${wantsPlants}`,
          soloResult(
            `r-solo-betta-${substrate}-${wantsPlants}`,
            'Betta',
            5,
            'The classic solo centerpiece — hardy, colorful, tolerates a small heavily-planted tank well. Fin-nippers and other bettas are the main things to avoid, not water chemistry.',
            15,
            substrate,
            wantsPlants,
            false
          ),
          soloResult(
            `r-solo-dwarf-gourami-${substrate}-${wantsPlants}`,
            'Dwarf Gourami',
            10,
            'Similarly showy and colorful, but genuinely more disease-prone than a Betta — Dwarf Gourami Iridovirus is a real, well-documented risk in the trade, so sourcing from a reputable, healthy-looking stock matters more here than usual.',
            10,
            substrate,
            wantsPlants,
            false
          )
        ),
      },
      {
        id: 'powerhouse',
        label: 'Territorial powerhouse — big personality, big presence',
        emoji: '👑',
        next: soloCommitmentQuestion(
          `q-solo-commit-powerhouse-${substrate}-${wantsPlants}`,
          soloResult(
            `r-solo-convict-${substrate}-${wantsPlants}`,
            'Convict Cichlid',
            20,
            "Genuinely hardy and beginner-tolerant despite the aggressive reputation — one of the most forgiving 'first cichlid' choices. Still territorial, still not a community fish.",
            8,
            substrate,
            wantsPlants,
            true
          ),
          soloResult(
            `r-solo-oscar-${substrate}-${wantsPlants}`,
            'Oscar',
            55,
            'Intelligent, interactive, and famously food-motivated — also a genuinely large, heavy-waste-producing fish that needs serious filtration and a real long-term size commitment, not a starter-tank fish.',
            15,
            substrate,
            wantsPlants,
            true
          )
        ),
      },
      {
        id: 'quirky',
        label: 'Quirky & unusual — not your typical fish',
        emoji: '🔮',
        next: soloCommitmentQuestion(
          `q-solo-commit-quirky-${substrate}-${wantsPlants}`,
          soloResult(
            `r-solo-pea-puffer-solo-${substrate}-${wantsPlants}`,
            'Pea Puffer (solo)',
            5,
            'The smallest pufferfish in the hobby, kept alone — inquisitive, active, and genuinely easy at this scale. Not reef-safe with shrimp or snails, and not really a community fish even with other peaceful species.',
            8,
            substrate,
            wantsPlants,
            false
          ),
          soloResult(
            `r-solo-pea-puffer-group-${substrate}-${wantsPlants}`,
            'Pea Puffer (small group)',
            10,
            'Same species, meaningfully harder mode — a group needs dense planting and broken sightlines to prevent the puffers from constantly squabbling over territory, and correctly sexing/balancing the group takes real attention.',
            8,
            substrate,
            wantsPlants,
            false
          )
        ),
      },
      {
        id: 'not-sure',
        label: 'Not sure yet, show me common options',
        emoji: '🤔',
        next: soloCommitmentQuestion(
          `q-solo-commit-notsure-${substrate}-${wantsPlants}`,
          soloResult(
            `r-solo-betta-notsure-${substrate}-${wantsPlants}`,
            'Betta',
            5,
            'The classic solo centerpiece — hardy, colorful, tolerates a small heavily-planted tank well. Fin-nippers and other bettas are the main things to avoid, not water chemistry.',
            15,
            substrate,
            wantsPlants,
            false
          ),
          soloResult(
            `r-solo-jack-dempsey-${substrate}-${wantsPlants}`,
            'Jack Dempsey',
            55,
            "A well-known 'graduate to this' cichlid — hardy and intelligent, but consistently cited at a genuine 55-gallon minimum for one adult, more for a mated pair.",
            10,
            substrate,
            wantsPlants,
            true
          )
        ),
      },
    ],
  };
}

const soloFishQuestionnaire: Question = substrateQuestion((substrate) => ({
  kind: 'question',
  id: `q-solo-plants-${substrate}`,
  prompt: 'Do you want live plants alongside your centerpiece fish?',
  options: [
    { id: 'yes', label: 'Yes, I want a planted look', emoji: '🌿', next: soloPersonalityQuestion(substrate, true) },
    { id: 'no', label: 'No, keep it minimal — hardscape only', emoji: '🪨', next: soloPersonalityQuestion(substrate, false) },
  ],
}));

// =========================================================================
// PLANTED-ONLY
// Same depth as shrimp: an aesthetic warm-up question (style, not species),
// then a light/CO2 commitment question (mirrors shrimp's simple/hardier vs
// particular axis directly — low-tech vs high-tech is the real fork in the
// road for planted tanks), landing on 4 x 2 = 8 results. Plant
// difficulty-tier groupings here (low-tech-tolerant vs CO2-dependent) are
// standard, stable planted-tank knowledge, not fabricated.
// =========================================================================

function plantedResult(
  id: string,
  summary: string,
  plants: RecommendedRosterItem[],
  wantsCleanupCrew: boolean
): QuestionResult {
  return {
    kind: 'result',
    id,
    summary,
    items: () =>
      wantsCleanupCrew
        ? [
            ...plants,
            {
              name: 'Amano Shrimp',
              category: 'livestock',
              detail: "One of the most effective algae-eating shrimp in the hobby, and large enough to not disappear into an aquascape the way Neocaridina can — a genuinely common pairing even in tanks that aren't otherwise livestock-focused",
              quantity: 4,
              cost: 4,
              status: 'wishlist',
              defaultSelected: true,
            },
            {
              name: 'Nerite Snails',
              category: 'livestock',
              detail: "Won't breed in freshwater and won't touch healthy plant leaves, only algae — about as low-risk as cleanup crew gets",
              quantity: 3,
              cost: 4,
              status: 'wishlist',
              defaultSelected: true,
            },
          ]
        : plants,
  };
}

function plantedTechQuestion(
  id: string,
  lowTech: QuestionResult,
  highTech: QuestionResult
): Question {
  return {
    kind: 'question',
    id,
    prompt: 'How much light and CO2 are you willing to manage?',
    options: [
      {
        id: 'low-tech',
        label: 'Low-tech — low light, no CO2, easy and forgiving',
        emoji: '🌱',
        next: lowTech,
      },
      {
        id: 'high-tech',
        label: "High-tech — bright light + CO2, faster growth, more demanding",
        emoji: '⚡',
        next: highTech,
      },
    ],
  };
}

function plantedStyleQuestion(substrate: SubstrateChoice, wantsCleanupCrew: boolean): Question {
  return {
    kind: 'question',
    id: `q-planted-style-${substrate}-${wantsCleanupCrew}`,
    prompt: 'What aquascape style are you drawn to?',
    options: [
      {
        id: 'jungle',
        label: 'Lush jungle — full, layered, lots of green',
        emoji: '🌿',
        next: plantedTechQuestion(
          `q-planted-tech-jungle-${substrate}-${wantsCleanupCrew}`,
          plantedResult(
            `r-planted-jungle-low-${substrate}-${wantsCleanupCrew}`,
            'Low-Tech Jungle Planted Tank',
            [
              { name: 'Amazon Sword', category: 'plant', detail: 'Large, easy root-feeder — a classic low-tech centerpiece plant', status: 'wishlist', defaultSelected: true },
              { name: 'Water Wisteria', category: 'plant', detail: 'Fast, forgiving stem plant — good for beginners still learning trimming', status: 'wishlist', defaultSelected: true },
              { name: 'Java Fern', category: 'plant', detail: 'Epiphyte — attach to hardscape, not the substrate', status: 'wishlist', defaultSelected: true },
              { name: 'Anubias Nana', category: 'plant', detail: 'Epiphyte — attach to hardscape, not the substrate', status: 'wishlist', defaultSelected: true },
              ...substrateItems(substrate),
              { name: 'Driftwood', category: 'hardscape', detail: 'Anchor point for the epiphyte plants above', cost: 20, status: 'wishlist', defaultSelected: true },
              { name: 'Standard Full-Spectrum Light', category: 'equipment', cost: 40, status: 'wishlist', defaultSelected: true },
            ],
            wantsCleanupCrew
          ),
          plantedResult(
            `r-planted-jungle-high-${substrate}-${wantsCleanupCrew}`,
            'High-Tech Jungle Planted Tank',
            [
              { name: 'Rotala rotundifolia', category: 'plant', detail: 'Colors up (pink/red) under strong light — stays green and leggy without it', status: 'wishlist', defaultSelected: true },
              { name: 'Ludwigia repens', category: 'plant', detail: 'Red-toned stem plant, wants strong light + CO2 to hold color and stay compact', status: 'wishlist', defaultSelected: true },
              { name: 'Alternanthera reineckii', category: 'plant', detail: 'Deep red/purple stem plant — one of the more demanding color plants in the hobby', status: 'wishlist', defaultSelected: false },
              ...substrateItems(substrate),
              { name: 'CO2 Injection System', category: 'equipment', detail: 'What actually separates "high-tech" from "low-tech" — enables fast, compact, colorful growth but adds real complexity (drop checker, diffuser, timing with the light schedule)', cost: 120, status: 'wishlist', defaultSelected: true },
              { name: 'High-Output Planted Light', category: 'equipment', cost: 90, status: 'wishlist', defaultSelected: true },
              { name: 'Liquid Fertilizer (macro + micro)', category: 'equipment', status: 'wishlist', defaultSelected: true },
            ],
            wantsCleanupCrew
          )
        ),
      },
      {
        id: 'iwagumi',
        label: 'Minimalist iwagumi — rock-focused, open, sparse',
        emoji: '🪨',
        next: plantedTechQuestion(
          `q-planted-tech-iwagumi-${substrate}-${wantsCleanupCrew}`,
          plantedResult(
            `r-planted-iwagumi-low-${substrate}-${wantsCleanupCrew}`,
            'Low-Tech Rock-Focused Planted Tank',
            [
              { name: 'Bucephalandra', category: 'plant', detail: 'Slow-growing epiphyte, unusually tolerant of low light for how striking it looks — attach to rock', status: 'wishlist', defaultSelected: true },
              { name: 'Java Fern (narrow-leaf variety)', category: 'plant', detail: 'Epiphyte — attach to rock rather than substrate', status: 'wishlist', defaultSelected: true },
              { name: 'Marimo Moss Ball', category: 'plant', detail: 'Genuinely low-maintenance, doubles as a mobile accent piece', status: 'wishlist', defaultSelected: false },
              { name: 'Dragon Stone or Seiryu Stone', category: 'hardscape', detail: 'The actual focus of an iwagumi layout — the plants are secondary to the rock arrangement', cost: 35, status: 'wishlist', defaultSelected: true },
              ...substrateItems(substrate),
              { name: 'Standard Full-Spectrum Light', category: 'equipment', cost: 40, status: 'wishlist', defaultSelected: true },
            ],
            wantsCleanupCrew
          ),
          plantedResult(
            `r-planted-iwagumi-high-${substrate}-${wantsCleanupCrew}`,
            'High-Tech Rock-Focused Planted Tank',
            [
              { name: 'Dwarf Hairgrass', category: 'plant', detail: 'The classic iwagumi carpet — wants strong light and CO2 to stay short and dense rather than growing tall and thin', status: 'wishlist', defaultSelected: true },
              { name: 'Monte Carlo', category: 'plant', detail: 'Rounder-leafed carpet alternative, slightly more forgiving than Dwarf Hairgrass but still CO2-dependent for a true low carpet', status: 'wishlist', defaultSelected: false },
              { name: 'Dragon Stone or Seiryu Stone', category: 'hardscape', detail: 'The actual focus of an iwagumi layout — odd numbers of stones (3 or 5) in a triangular arrangement is the traditional approach', cost: 35, status: 'wishlist', defaultSelected: true },
              ...substrateItems(substrate),
              { name: 'CO2 Injection System', category: 'equipment', detail: 'Close to mandatory for a true dense carpet — without it, carpeting plants tend to grow upward and thin instead of spreading', cost: 120, status: 'wishlist', defaultSelected: true },
              { name: 'High-Output Planted Light', category: 'equipment', cost: 90, status: 'wishlist', defaultSelected: true },
            ],
            wantsCleanupCrew
          )
        ),
      },
      {
        id: 'carpet',
        label: 'Carpet-forward — a dense green foreground lawn',
        emoji: '🟩',
        next: plantedTechQuestion(
          `q-planted-tech-carpet-${substrate}-${wantsCleanupCrew}`,
          plantedResult(
            `r-planted-carpet-low-${substrate}-${wantsCleanupCrew}`,
            'Low-Tech Carpet Planted Tank',
            [
              { name: 'Dwarf Sagittaria', category: 'plant', detail: 'One of the few true carpeting plants that genuinely tolerates low-tech conditions, though it spreads slower than CO2-fed carpets', status: 'wishlist', defaultSelected: true },
              { name: 'Micro Sword', category: 'plant', detail: 'Moderate light tolerance, slow but steady spread without CO2', status: 'wishlist', defaultSelected: false },
              ...substrateItems(substrate),
              { name: 'Standard Full-Spectrum Light', category: 'equipment', cost: 40, status: 'wishlist', defaultSelected: true },
            ],
            wantsCleanupCrew
          ),
          plantedResult(
            `r-planted-carpet-high-${substrate}-${wantsCleanupCrew}`,
            'High-Tech Carpet Planted Tank',
            [
              { name: 'Monte Carlo', category: 'plant', detail: 'Round-leafed, relatively forgiving as true carpets go, but still wants strong light and CO2 to fill in densely', status: 'wishlist', defaultSelected: true },
              { name: 'Dwarf Baby Tears (HC Cuba)', category: 'plant', detail: "The famously demanding, famously beautiful ultra-fine carpet — needs strong light, CO2, and patience; melts easily if any of those slip", status: 'wishlist', defaultSelected: false },
              ...substrateItems(substrate),
              { name: 'CO2 Injection System', category: 'equipment', detail: 'A true dense carpet at this level is not realistic without it', cost: 120, status: 'wishlist', defaultSelected: true },
              { name: 'High-Output Planted Light', category: 'equipment', cost: 90, status: 'wishlist', defaultSelected: true },
              { name: 'Liquid Fertilizer (macro + micro)', category: 'equipment', status: 'wishlist', defaultSelected: true },
            ],
            wantsCleanupCrew
          )
        ),
      },
      {
        id: 'not-sure',
        label: 'Not sure yet, show me common options',
        emoji: '🤔',
        next: plantedTechQuestion(
          `q-planted-tech-notsure-${substrate}-${wantsCleanupCrew}`,
          plantedResult(
            `r-planted-notsure-low-${substrate}-${wantsCleanupCrew}`,
            'Low-Tech Beginner Planted Tank',
            [
              { name: 'Java Fern', category: 'plant', detail: 'Epiphyte — attach to hardscape, not the substrate', status: 'wishlist', defaultSelected: true },
              { name: 'Anubias Nana', category: 'plant', detail: 'Epiphyte — attach to hardscape, not the substrate', status: 'wishlist', defaultSelected: true },
              { name: 'Java Moss', category: 'plant', status: 'wishlist', defaultSelected: true },
              { name: 'Amazon Sword', category: 'plant', detail: 'Large, easy root-feeder', status: 'wishlist', defaultSelected: false },
              ...substrateItems(substrate),
              { name: 'Driftwood', category: 'hardscape', cost: 20, status: 'wishlist', defaultSelected: true },
              { name: 'Standard Full-Spectrum Light', category: 'equipment', cost: 40, status: 'wishlist', defaultSelected: true },
            ],
            wantsCleanupCrew
          ),
          plantedResult(
            `r-planted-notsure-high-${substrate}-${wantsCleanupCrew}`,
            'High-Tech Beginner Planted Tank',
            [
              { name: 'Rotala rotundifolia', category: 'plant', detail: 'Colors up under strong light — a good first "high-tech" stem plant', status: 'wishlist', defaultSelected: true },
              { name: 'Monte Carlo', category: 'plant', detail: 'Relatively forgiving foreground carpet as CO2-dependent plants go', status: 'wishlist', defaultSelected: true },
              { name: 'Ludwigia repens', category: 'plant', status: 'wishlist', defaultSelected: false },
              ...substrateItems(substrate),
              { name: 'CO2 Injection System', category: 'equipment', cost: 120, status: 'wishlist', defaultSelected: true },
              { name: 'High-Output Planted Light', category: 'equipment', cost: 90, status: 'wishlist', defaultSelected: true },
            ],
            wantsCleanupCrew
          )
        ),
      },
    ],
  };
}

const plantedQuestionnaire: Question = substrateQuestion((substrate) => ({
  kind: 'question',
  id: `q-planted-cleanup-${substrate}`,
  prompt: 'Even though this is plant-focused, want a light algae cleanup crew?',
  options: [
    {
      id: 'yes',
      label: 'Yes, a few algae-eaters',
      emoji: '🦐',
      next: plantedStyleQuestion(substrate, true),
    },
    {
      id: 'no',
      label: 'No, plants only',
      emoji: '🌿',
      next: plantedStyleQuestion(substrate, false),
    },
  ],
}));

export const TANK_TEMPLATES: TankTemplate[] = [
  {
    id: 'shrimp',
    name: 'Shrimp / Invert Colony',
    description: 'Neocaridina, Caridina, crayfish, or other invert-focused breeder tanks.',
    waterType: 'freshwater',
    minGallons: 2, // a small dedicated shrimp colony genuinely works this small
    customFields: [preset('🦐 Shrimp Census'), preset('🥚 Berried / Gravid Count')],
    questionnaire: shrimpQuestionnaire,
    checklist: [
      { label: 'Source tank, hardscape, and substrate' },
      { label: 'Layer substrate and place hardscape' },
      { label: 'Fill, install filtration, and plant' },
      { label: 'Begin fishless cycle and daily testing' },
      { label: 'Confirm ammonia = 0, nitrite = 0, nitrate present — retest before trusting it' },
      { label: 'Drip-acclimate and add founding livestock' },
    ],
  },
  {
    id: 'livebearers',
    name: 'Livebearers & Fry',
    description: 'Guppies, mollies, platies — tanks where fry counts matter.',
    waterType: 'freshwater',
    minGallons: 5, // guppies are workable this small; mollies/platies want more and warn individually
    customFields: [preset('🐠 Adult Count'), preset('🐟 Fry Count'), preset('🤰 Pregnant Females')],
    questionnaire: livebearersQuestionnaire,
    checklist: [
      { label: 'Source tank, substrate, and hardscape' },
      { label: 'Fill, install filtration, and plant' },
      { label: 'Begin fishless cycle and daily testing' },
      { label: 'Confirm ammonia = 0, nitrite = 0, nitrate present' },
      { label: 'Acclimate and add livestock' },
      { label: 'Add a breeder box or dense floating cover for fry survival' },
    ],
  },
  {
    id: 'community',
    name: 'Community Fish',
    description: 'Mixed peaceful community fish tanks.',
    waterType: 'freshwater',
    minGallons: 5, // Chili Rasboras/White Cloud Minnows are the smallest fish this template offers
    customFields: [preset('🐡 Total Fish Count'), preset('🤒 Signs Of Illness')],
    questionnaire: communityQuestionnaire,
    checklist: [
      { label: 'Source tank, substrate, and hardscape' },
      { label: 'Fill, install filtration, and plant' },
      { label: 'Begin fishless cycle and daily testing' },
      { label: 'Confirm ammonia = 0, nitrite = 0, nitrate present' },
      { label: 'Research stocking order and add fish gradually' },
    ],
  },
  {
    id: 'solo-fish',
    name: 'Solo Fish / Centerpiece',
    description: 'Betta, oscar, or cichlid kept alone — one dominant fish, no tankmates.',
    waterType: 'freshwater',
    minGallons: 2.5, // a Betta fits here even though other paths in this template (Oscar, Jack Dempsey) need far more
    customFields: [preset('🤒 Signs Of Illness'), preset('🪭 Fin Condition'), preset('📝 Feeding Notes')],
    questionnaire: soloFishQuestionnaire,
    checklist: [
      { label: 'Source tank, substrate, and hardscape' },
      { label: 'Fill, install filtration, and plant' },
      { label: 'Begin fishless cycle and daily testing' },
      { label: 'Confirm ammonia = 0, nitrite = 0, nitrate present' },
      { label: 'Quarantine the fish before introducing to the display tank' },
      { label: 'Acclimate and add the single centerpiece fish — no tankmates' },
      { label: 'Monitor fin condition and behavior closely for the first two weeks' },
    ],
  },
  {
    id: 'planted',
    name: 'Planted-Only',
    description: 'No livestock focus — tracking growth, trims, and layout.',
    waterType: 'freshwater',
    minGallons: 1, // no livestock-driven floor — even a tiny planted nano works
    customFields: [preset('🌱 New Growth Observed'), preset('✂️ Trim Needed')],
    questionnaire: plantedQuestionnaire,
    checklist: [
      { label: 'Source substrate and hardscape' },
      { label: 'Layer substrate and place hardscape' },
      { label: 'Fill, install filtration, and plant' },
      { label: 'Dial in light schedule and CO2/ferts if using them' },
    ],
  },
  {
    id: 'reef',
    name: 'Reef Tank',
    description: 'Saltwater — live rock, corals, and reef-safe fish.',
    waterType: 'saltwater',
    minGallons: 10, // protein skimmer + stable reef chemistry realistically needs at least this much water volume
    customFields: [
      preset('🧪 Alkalinity (dKH)'),
      preset('🪸 Calcium (ppm)'),
      preset('🌊 Magnesium (ppm)'),
      preset('💡 PAR'),
    ],
    questionnaire: reefQuestionnaire,
    checklist: [
      { label: 'Source tank, sump/equipment, and live/dry rock' },
      { label: 'Aquascape rockwork and add sand bed' },
      { label: 'Fill with mixed saltwater and confirm salinity before adding rock' },
      { label: 'Begin cycle (rock-seeded or fishless) and daily testing' },
      { label: 'Confirm ammonia = 0, nitrite = 0, nitrate present, alkalinity/calcium/magnesium stable' },
      { label: 'Add clean-up crew, then corals, then fish — slowest stocking order in the hobby for a reason' },
    ],
  },
  {
    id: 'blank',
    name: 'Blank',
    description: 'Start with nothing pre-filled — add your own fields and steps as you go.',
    waterType: 'freshwater',
    minGallons: 0.5, // genuinely no assumptions — a blank tank could be anything
    customFields: [],
    checklist: [],
  },
];

// One "Source X" step per roster item, each gated on that specific item
// reaching "Arrived" — same rosterLinks mechanism the hand-authored plans
// (Shrimp Tank, Main Tank) already used, just generated instead of typed
// out by hand.
function sourcingStepsFor(rosterItems: RosterItem[]): Omit<ChecklistTask, 'id' | 'done'>[] {
  return rosterItems.map((item) => ({
    label: `Source ${item.name}`,
    rosterLinks: [{ rosterItemId: item.id, requiredStatus: 'arrived' }],
  }));
}

export function buildTankFromTemplate(
  template: TankTemplate,
  overrides: { name: string; sizeGallons: number; dimensions?: string; style?: string },
  recommendedItems: RecommendedRosterItem[] = []
): Tank {
  const roster: RosterItem[] = recommendedItems.map(({ defaultSelected, ...item }) => ({
    ...item,
    id: crypto.randomUUID(),
  }));

  let checklist = template.checklist.map((c) => ({ ...c, id: crypto.randomUUID(), done: false }));
  if (roster.length > 0) {
    // The template's own first checklist step is always a generic
    // "source everything" catch-all — once the questionnaire has produced
    // real, specific items, granular per-item steps are strictly more
    // useful than that one vague step, so it gets replaced rather than
    // just appended alongside.
    const sourcingSteps = sourcingStepsFor(roster).map((s) => ({
      ...s,
      id: crypto.randomUUID(),
      done: false,
    }));
    checklist = [...sourcingSteps, ...checklist.slice(1)];
  }

  return {
    id: crypto.randomUUID(),
    name: overrides.name,
    sizeGallons: overrides.sizeGallons,
    dimensions: overrides.dimensions || undefined,
    style: overrides.style || undefined,
    startDate: '',
    waterType: template.waterType,
    customFields: template.customFields.map((f) => ({ ...f, id: crypto.randomUUID() })),
    roster,
    checklist,
    logs: [],
    schedule: [],
  };
}
