import type { CustomFieldDef, ChecklistTask, Tank, Question, QuestionResult, RecommendedRosterItem, RosterItem } from '../types';
import { PRESET_FIELDS } from './presetFields';

export interface TankTemplate {
  id: string;
  name: string;
  description: string;
  suggestedStyle: string;
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

// DRAFT — pilot content for co-review, not final. The Red Cherry and Yellow
// Goldenback Neocaridina branches are grounded in the user's own real build
// plans from earlier (Shrimp Tank: Manzanita, Maui Moon sand, crushed coral
// in the filter media bag; Main Tank: Yellow Goldenback sourcing/pricing) —
// higher confidence. Everything marked "fabricated" below is a placeholder
// guess, not researched — expect to replace it.
//
// Design note: color is asked first purely as an easy warm-up question, not
// because it determines genus — Neocaridina vs Caridina is a hardiness/
// care-commitment distinction (Neocaridina more forgiving, Caridina more
// particular about water chemistry), so a separate question asks about
// desired commitment level and THAT determines which genus gets suggested.

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
        label: 'Keep it simple — hardier and more forgiving',
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

// --- Red ---
const redNeoResult: QuestionResult = {
  kind: 'result',
  id: 'r-red-neo',
  summary: 'Red Cherry Neocaridina Starter',
  items: [
    { name: 'Neocaridina davidi — Red Cherry (S/SS Grade)', category: 'livestock', quantity: 10, cost: 30, status: 'wishlist', defaultSelected: true },
    { name: 'Manzanita Wood', category: 'hardscape', detail: 'Minimal impact on water chemistry, no boiling needed — just a longer soak or temporary weighting', cost: 20, status: 'wishlist', defaultSelected: true },
    { name: 'Cholla Wood', category: 'hardscape', detail: 'A shrimp-keeping staple ("shrimpwood") — hollow, biodegradable, builds a biofilm layer shrimp graze on', cost: 7, status: 'wishlist', defaultSelected: true },
    { name: 'Indian Almond Leaves (Catappa)', category: 'hardscape', detail: 'Releases tannins, mild antibacterial properties, shrimp graze the biofilm that grows on them as they break down', cost: 6, status: 'wishlist', defaultSelected: true },
    { name: 'Sponge Filter + Air Pump', category: 'equipment', cost: 16, status: 'wishlist', defaultSelected: true },
    { name: 'Crushed Coral + Media Bag', category: 'hardscape', detail: 'Buffering — goes in the filter, not the substrate', cost: 12, status: 'wishlist', defaultSelected: true },
    { name: 'Organic Potting Soil', category: 'substrate', cost: 8, status: 'wishlist', defaultSelected: true },
    { name: 'Dark Fine-Grain Sand (e.g. Maui Moon)', category: 'substrate', detail: 'Dark substrate enhances Neocaridina pigmentation', cost: 15, status: 'wishlist', defaultSelected: true },
    { name: 'Java Moss', category: 'plant', status: 'wishlist', defaultSelected: true },
    { name: 'Java Fern', category: 'plant', status: 'wishlist', defaultSelected: false },
    { name: 'Anubias Nana', category: 'plant', status: 'wishlist', defaultSelected: false },
    { name: 'Hornwort', category: 'plant', status: 'wishlist', defaultSelected: false },
    { name: 'Floating Plants', category: 'plant', detail: 'Best added a few weeks in, once the tank has settled', status: 'wishlist', defaultSelected: false },
  ],
};

const redCaridinaResult: QuestionResult = {
  kind: 'result',
  id: 'r-red-caridina',
  summary: 'Crystal Red Shrimp (CRS) Starter',
  items: [
    { name: 'Caridina cantonensis — Crystal Red Shrimp', category: 'livestock', detail: 'Grade and exact sourcing still worth researching, but CRS itself is a well-established, widely available variety', quantity: 10, status: 'wishlist', defaultSelected: true },
    { name: 'Mopani Wood', category: 'hardscape', detail: 'Releases more tannins than Manzanita, softening and acidifying the water — a better match for Caridina\'s soft/acidic preference. Needs an initial boil/soak', cost: 18, status: 'wishlist', defaultSelected: true },
    { name: 'Cholla Wood', category: 'hardscape', detail: 'A shrimp-keeping staple ("shrimpwood") — hollow, biodegradable, builds a biofilm layer shrimp graze on', cost: 7, status: 'wishlist', defaultSelected: true },
    { name: 'Indian Almond Leaves (Catappa)', category: 'hardscape', detail: 'Releases tannins, mild antibacterial properties — doubles down on the soft/acidic lean Caridina want', cost: 6, status: 'wishlist', defaultSelected: true },
    { name: 'Sponge Filter + Air Pump', category: 'equipment', cost: 16, status: 'wishlist', defaultSelected: true },
    { name: 'Active Soil Substrate', category: 'substrate', detail: 'Buffers toward the soft/acidic water CRS want — no crushed coral here, that would push the opposite direction', status: 'wishlist', defaultSelected: true },
    { name: 'RO/RODI Water System', category: 'equipment', detail: 'CRS are typically far more sensitive to tap water parameters than Neocaridina', status: 'idea', defaultSelected: true },
    { name: 'Java Moss', category: 'plant', status: 'wishlist', defaultSelected: true },
    { name: 'Java Fern', category: 'plant', status: 'wishlist', defaultSelected: false },
    { name: 'Anubias Nana', category: 'plant', status: 'wishlist', defaultSelected: false },
    { name: 'Hornwort', category: 'plant', status: 'wishlist', defaultSelected: false },
  ],
};

// --- Yellow ---
const yellowNeoResult: QuestionResult = {
  kind: 'result',
  id: 'r-yellow-neo',
  summary: 'Yellow Goldenback Neocaridina Starter',
  items: [
    { name: 'Neocaridina davidi — Yellow Goldenback (S Grade)', category: 'livestock', quantity: 10, cost: 35, status: 'wishlist', defaultSelected: true },
    { name: 'Manzanita Wood', category: 'hardscape', cost: 20, status: 'wishlist', defaultSelected: true },
    { name: 'Cholla Wood', category: 'hardscape', detail: 'A shrimp-keeping staple ("shrimpwood") — hollow, biodegradable, builds a biofilm layer shrimp graze on', cost: 7, status: 'wishlist', defaultSelected: true },
    { name: 'Indian Almond Leaves (Catappa)', category: 'hardscape', detail: 'Releases tannins, mild antibacterial properties, shrimp graze the biofilm that grows on them as they break down', cost: 6, status: 'wishlist', defaultSelected: true },
    { name: 'Sponge Filter + Air Pump', category: 'equipment', cost: 16, status: 'wishlist', defaultSelected: true },
    { name: 'Crushed Coral + Media Bag', category: 'hardscape', detail: 'Buffering — goes in the filter, not the substrate', cost: 12, status: 'wishlist', defaultSelected: true },
    { name: 'Organic Potting Soil', category: 'substrate', cost: 8, status: 'wishlist', defaultSelected: true },
    { name: 'Dark Fine-Grain Sand (e.g. Maui Moon)', category: 'substrate', detail: 'Dark substrate enhances Neocaridina pigmentation', cost: 15, status: 'wishlist', defaultSelected: true },
    { name: 'Java Moss', category: 'plant', status: 'wishlist', defaultSelected: true },
    { name: 'Java Fern', category: 'plant', status: 'wishlist', defaultSelected: false },
    { name: 'Anubias Nana', category: 'plant', status: 'wishlist', defaultSelected: false },
    { name: 'Hornwort', category: 'plant', status: 'wishlist', defaultSelected: false },
  ],
};

const yellowCaridinaResult: QuestionResult = {
  kind: 'result',
  id: 'r-yellow-caridina',
  summary: 'Yellow Caridina Starter (species name still unconfirmed — please verify)',
  items: [
    { name: 'Caridina — yellow variety (species TBD)', category: 'livestock', detail: 'STILL UNCONFIRMED — not confident a well-established "yellow Caridina" variety name exists the way CRS/Blue Bolt do, verify before treating this as a real recommendation', quantity: 10, status: 'idea', defaultSelected: true },
    { name: 'Mopani Wood', category: 'hardscape', detail: 'Releases more tannins than Manzanita, softening and acidifying the water — a better match for Caridina\'s soft/acidic preference. Needs an initial boil/soak', cost: 18, status: 'wishlist', defaultSelected: true },
    { name: 'Cholla Wood', category: 'hardscape', detail: 'A shrimp-keeping staple ("shrimpwood")', cost: 7, status: 'wishlist', defaultSelected: true },
    { name: 'Indian Almond Leaves (Catappa)', category: 'hardscape', detail: 'Releases tannins, mild antibacterial properties', cost: 6, status: 'wishlist', defaultSelected: true },
    { name: 'Active Soil Substrate', category: 'substrate', detail: 'Buffers toward soft/acidic water', status: 'wishlist', defaultSelected: true },
    { name: 'RO/RODI Water System', category: 'equipment', status: 'idea', defaultSelected: true },
    { name: 'Sponge Filter + Air Pump', category: 'equipment', cost: 16, status: 'wishlist', defaultSelected: true },
    { name: 'Java Moss', category: 'plant', status: 'wishlist', defaultSelected: true },
  ],
};

// --- Blue ---
const blueNeoResult: QuestionResult = {
  kind: 'result',
  id: 'r-blue-neo',
  summary: 'Blue Dream Neocaridina Starter (draft — please verify)',
  items: [
    { name: 'Neocaridina davidi — Blue Dream', category: 'livestock', quantity: 10, cost: 35, status: 'wishlist', defaultSelected: true },
    { name: 'Manzanita Wood', category: 'hardscape', cost: 20, status: 'wishlist', defaultSelected: true },
    { name: 'Cholla Wood', category: 'hardscape', detail: 'A shrimp-keeping staple ("shrimpwood")', cost: 7, status: 'wishlist', defaultSelected: true },
    { name: 'Indian Almond Leaves (Catappa)', category: 'hardscape', detail: 'Releases tannins, mild antibacterial properties', cost: 6, status: 'wishlist', defaultSelected: true },
    { name: 'Sponge Filter + Air Pump', category: 'equipment', cost: 16, status: 'wishlist', defaultSelected: true },
    { name: 'Crushed Coral + Media Bag', category: 'hardscape', cost: 12, status: 'wishlist', defaultSelected: true },
    { name: 'Organic Potting Soil', category: 'substrate', cost: 8, status: 'wishlist', defaultSelected: true },
    { name: 'Dark Fine-Grain Sand (e.g. Maui Moon)', category: 'substrate', cost: 15, status: 'wishlist', defaultSelected: true },
    { name: 'Java Moss', category: 'plant', status: 'wishlist', defaultSelected: true },
  ],
};

const blueCaridinaResult: QuestionResult = {
  kind: 'result',
  id: 'r-blue-caridina',
  summary: 'Blue Bolt Shrimp Starter',
  items: [
    { name: 'Caridina cantonensis — Blue Bolt', category: 'livestock', detail: 'Grade and exact sourcing still worth researching, but Blue Bolt itself is a well-established, widely available variety', quantity: 10, status: 'wishlist', defaultSelected: true },
    { name: 'Mopani Wood', category: 'hardscape', detail: 'Releases more tannins than Manzanita, softening and acidifying the water — a better match for Caridina\'s soft/acidic preference. Needs an initial boil/soak', cost: 18, status: 'wishlist', defaultSelected: true },
    { name: 'Cholla Wood', category: 'hardscape', detail: 'A shrimp-keeping staple ("shrimpwood")', cost: 7, status: 'wishlist', defaultSelected: true },
    { name: 'Indian Almond Leaves (Catappa)', category: 'hardscape', detail: 'Releases tannins, mild antibacterial properties', cost: 6, status: 'wishlist', defaultSelected: true },
    { name: 'Active Soil Substrate', category: 'substrate', detail: 'Buffers toward soft/acidic water — no crushed coral here', status: 'wishlist', defaultSelected: true },
    { name: 'RO/RODI Water System', category: 'equipment', status: 'idea', defaultSelected: true },
    { name: 'Sponge Filter + Air Pump', category: 'equipment', cost: 16, status: 'wishlist', defaultSelected: true },
    { name: 'Java Moss', category: 'plant', status: 'wishlist', defaultSelected: true },
  ],
};

// --- Not sure ---
const notSureNeoResult: QuestionResult = {
  kind: 'result',
  id: 'r-notsure-neo',
  summary: 'Mixed-Grade Neocaridina Starter (draft — please verify)',
  items: [
    { name: 'Neocaridina davidi — mixed color pack', category: 'livestock', quantity: 10, cost: 25, status: 'wishlist', defaultSelected: true },
    { name: 'Manzanita Wood', category: 'hardscape', cost: 20, status: 'wishlist', defaultSelected: true },
    { name: 'Cholla Wood', category: 'hardscape', detail: 'A shrimp-keeping staple ("shrimpwood")', cost: 7, status: 'wishlist', defaultSelected: true },
    { name: 'Indian Almond Leaves (Catappa)', category: 'hardscape', detail: 'Releases tannins, mild antibacterial properties', cost: 6, status: 'wishlist', defaultSelected: true },
    { name: 'Sponge Filter + Air Pump', category: 'equipment', cost: 16, status: 'wishlist', defaultSelected: true },
    { name: 'Crushed Coral + Media Bag', category: 'hardscape', cost: 12, status: 'wishlist', defaultSelected: true },
    { name: 'Organic Potting Soil', category: 'substrate', cost: 8, status: 'wishlist', defaultSelected: true },
    { name: 'Dark Fine-Grain Sand (e.g. Maui Moon)', category: 'substrate', cost: 15, status: 'wishlist', defaultSelected: true },
    { name: 'Java Moss', category: 'plant', status: 'wishlist', defaultSelected: true },
  ],
};

const notSureCaridinaResult: QuestionResult = {
  kind: 'result',
  id: 'r-notsure-caridina',
  summary: 'Mixed Caridina Starter (draft — species pack still needs research)',
  items: [
    { name: 'Caridina — mixed variety pack (TBD)', category: 'livestock', detail: 'Which varieties to bundle here still needs research', quantity: 10, status: 'idea', defaultSelected: true },
    { name: 'Mopani Wood', category: 'hardscape', detail: 'Releases more tannins than Manzanita, softening and acidifying the water — a better match for Caridina\'s soft/acidic preference. Needs an initial boil/soak', cost: 18, status: 'wishlist', defaultSelected: true },
    { name: 'Cholla Wood', category: 'hardscape', detail: 'A shrimp-keeping staple ("shrimpwood")', cost: 7, status: 'wishlist', defaultSelected: true },
    { name: 'Indian Almond Leaves (Catappa)', category: 'hardscape', detail: 'Releases tannins, mild antibacterial properties', cost: 6, status: 'wishlist', defaultSelected: true },
    { name: 'Active Soil Substrate', category: 'substrate', detail: 'Buffers toward soft/acidic water', status: 'wishlist', defaultSelected: true },
    { name: 'RO/RODI Water System', category: 'equipment', status: 'idea', defaultSelected: true },
    { name: 'Sponge Filter + Air Pump', category: 'equipment', cost: 16, status: 'wishlist', defaultSelected: true },
  ],
};

const otherInvertResult: QuestionResult = {
  kind: 'result',
  id: 'r-other-invert',
  summary: 'Other Invert Starter (fabricated — needs species-specific detail)',
  items: [
    { name: 'Invert species (TBD)', category: 'livestock', status: 'idea', defaultSelected: true, detail: 'FABRICATED PLACEHOLDER — crayfish/snail-specific needs vary a lot by species' },
    { name: 'Sponge Filter + Air Pump', category: 'equipment', cost: 16, status: 'wishlist', defaultSelected: true },
    { name: 'Organic Potting Soil', category: 'substrate', cost: 8, status: 'wishlist', defaultSelected: true },
  ],
};

const shrimpQuestionnaire: Question = {
  kind: 'question',
  id: 'q-focus',
  prompt: "What's the main focus of this tank?",
  options: [
    {
      id: 'shrimp',
      label: 'Shrimp',
      emoji: '🦐',
      next: {
        kind: 'question',
        id: 'q-color',
        prompt: 'What look are you going for? (Just a starting point — this comes before genus, not the other way around)',
        options: [
          { id: 'red', label: 'Red', emoji: '🔴', next: commitmentQuestion('q-commit-red', redNeoResult, redCaridinaResult) },
          { id: 'yellow', label: 'Yellow', emoji: '🟡', next: commitmentQuestion('q-commit-yellow', yellowNeoResult, yellowCaridinaResult) },
          { id: 'blue', label: 'Blue', emoji: '🔵', next: commitmentQuestion('q-commit-blue', blueNeoResult, blueCaridinaResult) },
          { id: 'not-sure', label: "Not sure yet, show me common options", emoji: '🤔', next: commitmentQuestion('q-commit-notsure', notSureNeoResult, notSureCaridinaResult) },
        ],
      },
    },
    {
      id: 'other-invert',
      label: 'Other invert (crayfish, snails, etc.)',
      emoji: '🦞',
      next: otherInvertResult,
    },
  ],
};

// --- Livebearers & Fry (Guppy-focused — research-grounded) ---
const guppyMixedResult: QuestionResult = {
  kind: 'result',
  id: 'r-guppy-mixed',
  summary: 'Mixed-Gender Guppy Starter (breeding-friendly)',
  items: [
    { name: 'Guppies — mixed (6 female, 3 male)', category: 'livestock', detail: '2-3 females per male keeps breeding pressure spread across the group rather than harassing one female', quantity: 9, cost: 30, status: 'wishlist', defaultSelected: true },
    { name: 'Adjustable Heater', category: 'equipment', detail: 'Target 76-78°F', cost: 20, status: 'wishlist', defaultSelected: true },
    { name: 'Sponge Filter', category: 'equipment', detail: 'Preferred over HOB — gentle flow keeps fry from getting pulled in', cost: 16, status: 'wishlist', defaultSelected: true },
    { name: 'Coarse Sand or Fine Gravel', category: 'substrate', cost: 15, status: 'wishlist', defaultSelected: true },
    { name: 'Crushed Coral', category: 'hardscape', detail: 'Guppies want slightly hard water (pH 7.0-8.5) — only add this if your tap water is on the soft side', cost: 10, status: 'wishlist', defaultSelected: false },
    { name: 'Floating Plants', category: 'plant', detail: 'Essential for fry survival and shade — don\'t skip this if you\'re keeping mixed genders', status: 'wishlist', defaultSelected: true },
    { name: 'Guppy Grass', category: 'plant', status: 'wishlist', defaultSelected: true },
    { name: 'Java Moss', category: 'plant', status: 'wishlist', defaultSelected: true },
    { name: 'Java Fern', category: 'plant', status: 'wishlist', defaultSelected: false },
    { name: 'Anubias', category: 'plant', status: 'wishlist', defaultSelected: false },
    { name: 'Hornwort', category: 'plant', status: 'wishlist', defaultSelected: false },
  ],
};

const guppyAllMaleResult: QuestionResult = {
  kind: 'result',
  id: 'r-guppy-all-male',
  summary: 'All-Male Guppy Starter (no breeding)',
  items: [
    { name: 'Guppies — all male', category: 'livestock', detail: 'Prevents overbreeding entirely — no fry management needed', quantity: 6, cost: 25, status: 'wishlist', defaultSelected: true },
    { name: 'Adjustable Heater', category: 'equipment', detail: 'Target 76-78°F', cost: 20, status: 'wishlist', defaultSelected: true },
    { name: 'Sponge Filter', category: 'equipment', cost: 16, status: 'wishlist', defaultSelected: true },
    { name: 'Coarse Sand or Fine Gravel', category: 'substrate', cost: 15, status: 'wishlist', defaultSelected: true },
    { name: 'Crushed Coral', category: 'hardscape', detail: 'Guppies want slightly hard water (pH 7.0-8.5) — only add this if your tap water is on the soft side', cost: 10, status: 'wishlist', defaultSelected: false },
    { name: 'Guppy Grass', category: 'plant', status: 'wishlist', defaultSelected: true },
    { name: 'Java Moss', category: 'plant', status: 'wishlist', defaultSelected: true },
    { name: 'Java Fern', category: 'plant', status: 'wishlist', defaultSelected: false },
    { name: 'Anubias', category: 'plant', status: 'wishlist', defaultSelected: false },
    { name: 'Hornwort', category: 'plant', status: 'wishlist', defaultSelected: false },
    { name: 'Floating Plants', category: 'plant', detail: 'Not essential without fry, but still good for shade and cover', status: 'wishlist', defaultSelected: false },
  ],
};

const molliesResult: QuestionResult = {
  kind: 'result',
  id: 'r-mollies',
  summary: 'Molly Starter (fabricated — needs research)',
  items: [
    { name: 'Mollies (variety TBD)', category: 'livestock', detail: 'FABRICATED PLACEHOLDER — not researched yet, mollies generally want harder/more alkaline water than guppies and some strains tolerate brackish, verify before treating this as real', quantity: 6, status: 'idea', defaultSelected: true },
  ],
};

const platiesResult: QuestionResult = {
  kind: 'result',
  id: 'r-platies',
  summary: 'Platy Starter (fabricated — needs research)',
  items: [
    { name: 'Platies (variety TBD)', category: 'livestock', detail: 'FABRICATED PLACEHOLDER — not researched yet', quantity: 6, status: 'idea', defaultSelected: true },
  ],
};

const livebearersQuestionnaire: Question = {
  kind: 'question',
  id: 'q-livebearer-species',
  prompt: 'Which livebearer are you focusing on?',
  options: [
    {
      id: 'guppies',
      label: 'Guppies',
      emoji: '🐟',
      next: {
        kind: 'question',
        id: 'q-guppy-breeding',
        prompt: 'Do you want to breed guppies, or keep it low-maintenance?',
        options: [
          { id: 'mixed', label: "I don't mind fry — mixed gender", emoji: '🍼', next: guppyMixedResult },
          { id: 'all-male', label: 'Keep it simple — all-male, no breeding', emoji: '🚫', next: guppyAllMaleResult },
        ],
      },
    },
    { id: 'mollies', label: 'Mollies', emoji: '🐠', next: molliesResult },
    { id: 'platies', label: 'Platies', emoji: '🐠', next: platiesResult },
  ],
};

// --- Community Fish ---
// The shrimp-inclusive branch reuses the user's own real Main Tank build
// (Manzanita, Dragon stone, dark sand, crushed coral in the filter, Yellow
// Goldenback Neocaridina + Pygmy Corydoras + Chili Rasboras) — high
// confidence, already validated. The classic branch is grounded in fresh
// research (Honey Gourami centerpiece, Ember Tetra/Harlequin Rasbora
// school, Pygmy Corydoras cleanup crew).
const shrimpInclusiveCommunityResult: QuestionResult = {
  kind: 'result',
  id: 'r-community-shrimp',
  summary: 'Peaceful Community + Shrimp (aquascape-style)',
  items: [
    { name: 'Neocaridina davidi — Yellow Goldenback', category: 'livestock', quantity: 15, cost: 45, status: 'wishlist', defaultSelected: true },
    { name: 'Pygmy Corydoras', category: 'livestock', quantity: 7, cost: 42, status: 'wishlist', defaultSelected: true },
    { name: 'Chili Rasboras', category: 'livestock', detail: 'Confirm tank-bred, not wild-caught', quantity: 10, cost: 40, status: 'wishlist', defaultSelected: true },
    { name: 'Standard Nerite Snails', category: 'livestock', quantity: 5, cost: 20, status: 'wishlist', defaultSelected: true },
    { name: 'Ramshorn Snails', category: 'livestock', quantity: 2, cost: 4, status: 'wishlist', defaultSelected: false },
    { name: 'Manzanita Wood', category: 'hardscape', cost: 30, status: 'wishlist', defaultSelected: true },
    { name: 'Dragon Stone', category: 'hardscape', cost: 25, status: 'wishlist', defaultSelected: true },
    { name: 'Sponge Filter + Air Pump', category: 'equipment', cost: 20, status: 'wishlist', defaultSelected: true },
    { name: 'Crushed Coral + Media Bag', category: 'hardscape', detail: 'Buffering — goes in the filter, not the substrate', cost: 12, status: 'wishlist', defaultSelected: true },
    { name: 'Organic Potting Soil', category: 'substrate', cost: 15, status: 'wishlist', defaultSelected: true },
    { name: 'Dark Fine-Grain Sand (e.g. Maui Moon)', category: 'substrate', cost: 35, status: 'wishlist', defaultSelected: true },
    { name: 'Java Fern', category: 'plant', status: 'wishlist', defaultSelected: true },
    { name: 'Anubias Nana', category: 'plant', status: 'wishlist', defaultSelected: true },
    { name: 'Java Moss', category: 'plant', status: 'wishlist', defaultSelected: false },
    { name: 'Vallisneria', category: 'plant', status: 'wishlist', defaultSelected: false },
    { name: 'Floating Plants', category: 'plant', status: 'wishlist', defaultSelected: false },
  ],
};

function classicCommunityResult(schoolName: string, schoolDetail: string): QuestionResult {
  return {
    kind: 'result',
    id: `r-community-classic-${schoolName.toLowerCase().replace(/\s+/g, '-')}`,
    summary: `Classic Community: Honey Gourami + ${schoolName}`,
    items: [
      { name: 'Honey Gourami', category: 'livestock', detail: 'Centerpiece — peaceful, top-to-middle water column', quantity: 1, cost: 12, status: 'wishlist', defaultSelected: true },
      { name: schoolName, category: 'livestock', detail: schoolDetail, quantity: 9, cost: 35, status: 'wishlist', defaultSelected: true },
      { name: 'Pygmy Corydoras', category: 'livestock', detail: 'Bottom cleanup crew — Otocinclus is a reasonable swap if you want more algae focus and less social-grouping need', quantity: 7, cost: 42, status: 'wishlist', defaultSelected: true },
      { name: 'Hang-On-Back Filter (e.g. AquaClear 30/50)', category: 'equipment', detail: 'Dial the flow down — full HOB current can be too strong for small schooling fish', cost: 35, status: 'wishlist', defaultSelected: true },
      { name: 'Driftwood', category: 'hardscape', detail: 'Java Fern and Anubias attach to this rather than planting in substrate', cost: 20, status: 'wishlist', defaultSelected: true },
      { name: 'Java Fern', category: 'plant', status: 'wishlist', defaultSelected: true },
      { name: 'Anubias', category: 'plant', status: 'wishlist', defaultSelected: true },
      { name: 'Floating Plants', category: 'plant', detail: 'Shade and cover at the surface', status: 'wishlist', defaultSelected: false },
    ],
  };
}

const communityQuestionnaire: Question = {
  kind: 'question',
  id: 'q-community-style',
  prompt: "What kind of community feel are you going for?",
  options: [
    {
      id: 'shrimp-inclusive',
      label: 'Peaceful community mixed with shrimp/inverts',
      emoji: '🦐',
      next: shrimpInclusiveCommunityResult,
    },
    {
      id: 'classic',
      label: 'Classic centerpiece + school + cleanup crew',
      emoji: '🐠',
      next: {
        kind: 'question',
        id: 'q-community-school',
        prompt: 'Which schooling fish do you prefer?',
        options: [
          {
            id: 'ember-tetra',
            label: 'Ember Tetras (tiny, fiery red-orange)',
            emoji: '🔥',
            next: classicCommunityResult('Ember Tetras', 'Groups of 6+ significantly reduce stress'),
          },
          {
            id: 'harlequin-rasbora',
            label: 'Harlequin Rasboras (classic look, slightly larger)',
            emoji: '🔺',
            next: classicCommunityResult('Harlequin Rasboras', 'Groups of 6+ significantly reduce stress'),
          },
        ],
      },
    },
  ],
};

export const TANK_TEMPLATES: TankTemplate[] = [
  {
    id: 'shrimp',
    name: 'Shrimp / Invert Colony',
    description: 'Neocaridina, Caridina, crayfish, or other invert-focused breeder tanks.',
    suggestedStyle: 'Walstad-style shrimp colony',
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
    suggestedStyle: 'Community livebearer tank',
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
    suggestedStyle: 'Mixed community tank',
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
    suggestedStyle: 'Solo centerpiece fish tank',
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
    suggestedStyle: 'Low-tech planted tank',
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
    suggestedStyle: '',
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
    style: overrides.style || template.suggestedStyle || undefined,
    startDate: '',
    customFields: template.customFields.map((f) => ({ ...f, id: crypto.randomUUID() })),
    roster,
    checklist,
    logs: [],
  };
}
