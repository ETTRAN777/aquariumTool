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

export interface TankTemplate {
  id: string;
  name: string;
  description: string;
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

function guppyMixedResult(substrate: SubstrateChoice): QuestionResult {
  return {
    kind: 'result',
    id: `r-guppy-mixed-${substrate}`,
    summary: 'Mixed-Gender Guppy Starter (breeding-friendly)',
    items: (sizeGallons) => {
      const females = clamp(sizeGallons * 0.6, 6, 15);
      const males = Math.max(2, Math.round(females / 2.5));
      return [
        {
          name: `Guppies — mixed (${females} female, ${males} male)`,
          category: 'livestock',
          detail: '2-3 females per male keeps breeding pressure spread across the group rather than harassing one female',
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

function guppyAllMaleResult(substrate: SubstrateChoice): QuestionResult {
  return {
    kind: 'result',
    id: `r-guppy-all-male-${substrate}`,
    summary: 'All-Male Guppy Starter (no breeding)',
    items: (sizeGallons) => [
      {
        name: 'Guppies — all male',
        category: 'livestock',
        detail: 'No fry to manage — just pick colors you like',
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

function molliesResult(substrate: SubstrateChoice): QuestionResult {
  return {
    kind: 'result',
    id: `r-mollies-${substrate}`,
    summary: 'Molly Starter',
    items: (sizeGallons) => {
      const qty = clamp(sizeGallons / 4, 3, 8);
      return [
        {
          name: 'Mollies (Poecilia sphenops / P. latipinna)',
          category: 'livestock',
          detail:
            `Larger (3-4.5", sailfin varieties bigger still) and more water-sensitive than platies — prefer harder, more alkaline water (pH 7.5-8.5) and benefit from a light dose of aquarium salt. Roughly 1 male per 2-3 females avoids over-breeding pressure. Comfortable from 10 gallons for a small group; sailfin varieties want 20g+.`,
          quantity: qty,
          cost: qty * 6,
          status: 'wishlist',
          defaultSelected: true,
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

function platiesResult(substrate: SubstrateChoice): QuestionResult {
  return {
    kind: 'result',
    id: `r-platies-${substrate}`,
    summary: 'Platy Starter',
    items: (sizeGallons) => {
      const qty = clamp(sizeGallons / 2, 3, 12);
      return [
        {
          name: 'Platies (Xiphophorus maculatus / X. variatus)',
          category: 'livestock',
          detail:
            'Hardier and more tolerant of imperfect water than mollies, and smaller (males ~1.5", females ~2.5"). Roughly 1 male per 2-3 females keeps breeding pressure manageable. Comfortable from 10 gallons up — one of the most forgiving livebearers for a first tank.',
          quantity: qty,
          cost: qty * 5,
          status: 'wishlist',
          defaultSelected: true,
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

const livebearersQuestionnaire: Question = substrateQuestion((substrate) => ({
  kind: 'question',
  id: `q-livebearer-species-${substrate}`,
  prompt: 'Which livebearer are you focusing on?',
  options: [
    {
      id: 'guppies',
      label: 'Guppies — classic, most color variety',
      emoji: '🐟',
      next: {
        kind: 'question',
        id: `q-guppy-breeding-${substrate}`,
        prompt: 'Do you want to breed guppies, or keep it low-maintenance?',
        options: [
          { id: 'mixed', label: "I don't mind fry — mixed gender", emoji: '🍼', next: guppyMixedResult(substrate) },
          { id: 'all-male', label: 'Keep it simple — all-male, no breeding', emoji: '🚫', next: guppyAllMaleResult(substrate) },
        ],
      },
    },
    { id: 'mollies', label: 'Mollies — larger, glossier, more water-sensitive', emoji: '🐠', next: molliesResult(substrate) },
    { id: 'platies', label: 'Platies — smaller, hardier, very low-maintenance', emoji: '🐠', next: platiesResult(substrate) },
  ],
}));

// =========================================================================
// COMMUNITY FISH
// Previously both branches here were either a direct copy of one specific
// real tank, or a species-name-recognition question ("ember tetras or
// harlequin rasboras?") that assumes the answerer already knows what those
// are. Replaced with trait-based questions (include shrimp? how lively?)
// and size-tiered species picks grounded in actual nano/community stocking
// guidance — a 6-gallon and a 25-gallon community tank now get genuinely
// different suggestions, not the same list with different quantities.
// =========================================================================

function communityResult(
  substrate: SubstrateChoice,
  withShrimp: boolean,
  activity: 'calm' | 'lively'
): QuestionResult {
  return {
    kind: 'result',
    id: `r-community-${substrate}-${withShrimp ? 'shrimp' : 'fishonly'}-${activity}`,
    summary: `${activity === 'calm' ? 'Calm, understated' : 'Lively, active'} community${withShrimp ? ' + shrimp' : ''}`,
    items: (sizeGallons) => {
      const items: RecommendedRosterItem[] = [];

      if (activity === 'calm') {
        if (sizeGallons < 10) {
          items.push({
            name: 'Chili Rasboras',
            category: 'livestock',
            detail: 'One of the smallest schooling fish in the hobby (under 1"). Workable from 5 gallons, but water quality shifts fast at this size — keep a close eye early on.',
            quantity: clamp(sizeGallons * 1.6, 8, 15),
            cost: 4,
            status: 'wishlist',
            defaultSelected: true,
          });
        } else {
          items.push({
            name: 'Celestial Pearl Danios (Galaxy Rasboras)',
            category: 'livestock',
            detail: 'Calm, shy schoolers that want a mature, stable tank rather than a freshly cycled one. Minimum 10 gallons.',
            quantity: clamp(sizeGallons * 1, 10, 20),
            cost: 5,
            status: 'wishlist',
            defaultSelected: true,
          });
          items.push({
            name: 'Pygmy Corydoras',
            category: 'livestock',
            detail: 'Small, social bottom-dweller that schools both along the substrate and in open water — unusual for a cory',
            quantity: clamp(sizeGallons * 0.6, 6, 12),
            cost: 6,
            status: 'wishlist',
            defaultSelected: true,
          });
        }
      } else {
        if (sizeGallons < 10) {
          items.push({
            name: "Endler's Livebearers",
            category: 'livestock',
            detail: "Hardy, constantly active, and one of the most beginner-forgiving nano fish. Workable from 5 gallons. Keep males-only if you don't want a population boom.",
            quantity: clamp(sizeGallons * 1.2, 5, 12),
            cost: 5,
            status: 'wishlist',
            defaultSelected: true,
          });
        } else if (sizeGallons < 20) {
          items.push({
            name: 'Ember Tetras',
            category: 'livestock',
            detail: 'Small, budget-friendly, and more tolerant of a wider pH range than most nano tetras — a genuinely easy schooling fish. Minimum 10 gallons, 8+ for confident schooling.',
            quantity: clamp(sizeGallons * 1, 8, 15),
            cost: 4,
            status: 'wishlist',
            defaultSelected: true,
          });
          items.push({
            name: 'Pygmy Corydoras',
            category: 'livestock',
            detail: "Small bottom-cleanup crew that won't outcompete nano schooling fish for food",
            quantity: clamp(sizeGallons * 0.5, 6, 10),
            cost: 6,
            status: 'wishlist',
            defaultSelected: true,
          });
        } else {
          items.push({
            name: 'Honey Gourami',
            category: 'livestock',
            detail: 'Peaceful centerpiece fish, calmer than most other gourami species — top-to-mid water column',
            quantity: 1,
            cost: 12,
            status: 'wishlist',
            defaultSelected: true,
          });
          items.push({
            name: 'Harlequin Rasboras',
            category: 'livestock',
            detail: 'A bit bigger and bolder than chili/ember tetras — wants more open swimming room, which is why this shows up once the tank is 20+ gallons',
            quantity: clamp(sizeGallons * 0.5, 9, 15),
            cost: 4,
            status: 'wishlist',
            defaultSelected: true,
          });
          items.push({
            name: 'Pygmy Corydoras',
            category: 'livestock',
            detail: 'Bottom cleanup crew — Otocinclus is a reasonable swap for more algae focus and less social-grouping need',
            quantity: clamp(sizeGallons * 0.4, 6, 10),
            cost: 6,
            status: 'wishlist',
            defaultSelected: true,
          });
        }
      }

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

function communityActivityQuestion(substrate: SubstrateChoice, withShrimp: boolean): Question {
  return {
    kind: 'question',
    id: `q-community-activity-${substrate}-${withShrimp}`,
    prompt: 'How would you like the fish to feel in the tank?',
    options: [
      { id: 'calm', label: 'Calm & understated — small, shy schoolers', emoji: '🌊', next: communityResult(substrate, withShrimp, 'calm') },
      { id: 'lively', label: 'Lively & active — bigger schools, more constant motion', emoji: '⚡', next: communityResult(substrate, withShrimp, 'lively') },
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

export const TANK_TEMPLATES: TankTemplate[] = [
  {
    id: 'shrimp',
    name: 'Shrimp / Invert Colony',
    description: 'Neocaridina, Caridina, crayfish, or other invert-focused breeder tanks.',
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
    customFields: [preset('🤒 Signs Of Illness'), preset('🪭 Fin Condition'), preset('📝 Feeding Notes')],
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
    customFields: [preset('🌱 New Growth Observed'), preset('✂️ Trim Needed')],
    checklist: [
      { label: 'Source substrate and hardscape' },
      { label: 'Layer substrate and place hardscape' },
      { label: 'Fill, install filtration, and plant' },
      { label: 'Dial in light schedule and CO2/ferts if using them' },
    ],
  },
  {
    id: 'blank',
    name: 'Blank',
    description: 'Start with nothing pre-filled — add your own fields and steps as you go.',
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
    customFields: template.customFields.map((f) => ({ ...f, id: crypto.randomUUID() })),
    roster,
    checklist,
    logs: [],
    schedule: [],
  };
}
