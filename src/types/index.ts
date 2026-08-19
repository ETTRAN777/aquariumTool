export type SourcingStatus = 'idea' | 'wishlist' | 'ordered' | 'arrived' | 'acclimating' | 'established';

// A researched min/max for one water parameter, entered per livestock/plant
// roster item (not fetched — there's no reliable free source for this data;
// see the Targets page's "Copy research prompt" feature, which hands the
// actual research step off to whatever AI the user already has). The
// Targets page intersects these across every item that has one set, so the
// tank-wide target for a parameter is automatically the range that
// satisfies every species at once — and if two items' ranges don't
// overlap at all, that's a real, honestly-computed incompatibility
// warning, not a guess.
export interface ParamTarget {
  min?: number;
  max?: number;
}

// A researched fact about a specific livestock/plant item — adult size,
// temperament, whether it's shrimp-safe, light needs, whatever's relevant.
// Unlike water param targets, these aren't aggregated/intersected across
// the roster — they're just recorded per item for the user's own
// reference alongside the research prompt that helped find them.
export interface RosterItemTrait {
  id: string;
  label: string;
  type: CustomFieldType;
  value?: CustomFieldValue;
}

export interface RosterItem {
  id: string;
  name: string;
  category: 'livestock' | 'plant' | 'hardscape' | 'substrate' | 'equipment';
  detail?: string;
  source?: string;
  status: SourcingStatus;
  cost?: number;
  quantity?: number;
  notes?: string;
  // Floats this item to the top of its own category on the Roster page
  // (and only its category — a starred equipment item doesn't jump above
  // unstarred livestock). Purely a personal-priority marker; doesn't
  // drive any other logic in the app.
  starred?: boolean;
  // Targets page fields — only meaningful for livestock/plant items, but
  // not type-restricted to those categories since a category could
  // theoretically change after targets were already set.
  waterParamTargets?: Partial<Record<keyof WaterParams, ParamTarget>>;
  // Livestock-only. Kept as dedicated, strongly-typed fields rather than
  // generic traits because they drive a real computed value (shrimp
  // predation risk) rather than just being displayed — a generic
  // label-string-matched trait would be fragile to rename/duplicate/typo
  // in a way that silently breaks the computation. Deliberately stored in
  // each field's natural unit (mm for a small, precise mouth measurement;
  // inches for the size hobbyists actually think in) rather than forcing
  // one shared unit — the comparison itself converts, see lib/targets.ts.
  mouthSizeMm?: number;
  adultSizeIn?: number;
  // true = exclude this item's mouth size from the tank-wide predation-risk
  // calculation entirely, so it can't flag OTHER items as at risk. For
  // edge cases where mouth size alone overstates the threat — Otocinclus
  // is the standing example: a moderate mouth size that in practice is
  // not a shrimp predator.
  predatorRiskOverride?: boolean;
  // Free-form researched facts that aren't computed from anything —
  // temperament, fin-nipping reputation, light needs, growth rate, or a
  // fully custom one. Unlike mouth/adult size, these are just recorded
  // for the user's own reference.
  traits?: RosterItemTrait[];
}

export interface RosterLink {
  rosterItemId: string;
  requiredStatus: SourcingStatus;
}

// The objective build stage a log entry represents — deliberately a
// different vocabulary from LogEntry.mood's four words (thriving/stable/
// watching/concerned) so the two axes never get conflated: phase is
// "where is the build," mood is "how does it feel," and an entry can have
// either, both, or neither set independently. Order matters — see
// LOG_PHASE_ORDER in constants.ts, used for phase-regression detection
// (2.0's milestone auto-suggest) as a simple index comparison.
export type LogPhase =
  | 'planning'
  | 'hardscaping'
  | 'cycling'
  | 'stocking'
  | 'acclimating'
  | 'established';

// Plays the same structural role MilestoneType does relative to `title`
// that CustomFieldType plays relative to RosterItemTrait.label: `title` is
// free text with nothing branching on it, `type` is a small closed set
// because real behavior depends on it (which fallback description
// template applies when `description` is left blank, and whether `phase`
// is meaningful). Kept closed rather than open-ended-with-presets (unlike
// RosterItemTrait.label) specifically because of that branching — a typo
// in a free-text type would silently fall through to a default template
// instead of erroring.
export type MilestoneType = 'phase-change' | 'roster-addition' | 'health-event' | 'custom';

// A notable, dated moment in a tank's build — either auto-suggested (e.g.
// phase-regression detection comparing a new log entry's phase against
// the prior one) or created by hand, independent of any log entry at all.
// Schema-only for now (2.0 step 15a) — creation/edit UI, fallback-copy
// templating, and regression detection are 15c.
export interface Milestone {
  id: string;
  title: string;
  // Left blank for every auto-created milestone (phase-change and
  // roster-addition, both created without any hand-typed text) — 15c's
  // buildFallbackDescription generates display copy from `type`/`major`/
  // the linked entry's mood at READ time, not baked in at creation, so
  // editing a linked entry's mood later changes what's shown without
  // touching this record. Never a fabricated reason — computed facts
  // only.
  description?: string;
  date: string; // ISO date
  type: MilestoneType;
  phase?: LogPhase; // set when type === 'phase-change' — the phase being entered
  // Direct reference to the roster items this milestone is about,
  // independent of linkedLogEntryId below — a hand-created milestone
  // (e.g. "ordered the founding shrimp") may have no linked log entry to
  // reach roster context through at all. Plain ids, not RosterLink's
  // {rosterItemId, requiredStatus} shape — requiredStatus is a
  // forward-looking precondition (a checklist task gated on a future
  // status), which doesn't apply to a milestone recording something that
  // already happened.
  relatedRosterItemIds?: string[];
  // The log entry this milestone was detected from or attached to, if
  // any — set for auto-created phase-change/roster-addition milestones,
  // absent for ones created by hand.
  linkedLogEntryId?: string;
  // Whether this is one of the "spine" moments worth standing out from
  // the rest (vs. a real but quieter one) — always true for phase-change,
  // true for a livestock item's first appearance, true only for the
  // first-ever addition within each non-livestock category, unset/false
  // otherwise. See detectPhaseChangeMilestone/detectRosterAdditionMilestones
  // in lib/milestones.ts for the exact rules.
  major?: boolean;
}

export interface ChecklistTask {
  id: string;
  label: string;
  detail?: string;
  done: boolean;
  dependsOn?: string[]; // ids of tasks that must be done first
  rosterLinks?: RosterLink[]; // roster items that must reach a given status first
  dueDate?: string;
}

export interface WaterParams {
  temperature?: number; // F
  ph?: number;
  gh?: number;
  kh?: number;
  tds?: number;
  ammonia?: number;
  nitrite?: number;
  nitrate?: number;
  salinity?: number; // specific gravity (e.g. 1.025) — saltwater tanks only
}

export type CustomFieldType = 'number' | 'text' | 'boolean';

export interface CustomFieldDef {
  id: string;
  label: string;
  type: CustomFieldType;
  unit?: string; // optional short suffix, e.g. "count", "°F"
}

export type CustomFieldValue = number | string | boolean;

export interface LogEntry {
  id: string;
  weekLabel: string; // e.g. "Week 3"
  date: string; // ISO date
  title: string;
  body: string;
  params?: WaterParams;
  photoUrls?: string[]; // base64 or /photos/ relative paths
  customValues?: Record<string, CustomFieldValue>; // keyed by CustomFieldDef.id
  mood?: 'thriving' | 'stable' | 'watching' | 'concerned';
  // Objective build stage — see LogPhase's comment above RosterLink for
  // why this is a separate axis from mood. Optional; most entries won't
  // set it, only ones marking an actual stage transition are expected to.
  phase?: LogPhase;
  // Roster items that reached a new status as of this entry — same shape
  // as ChecklistTask.rosterLinks (reused deliberately, not a new type),
  // e.g. tagging the day founding shrimp actually arrived.
  additions?: RosterLink[];
  // Roster items flagged as narratively significant in this entry —
  // deliberately independent of `additions` above. A status change is an
  // objective fact (this item reached this status); a highlight is a
  // subjective one (this item mattered enough to remember), and the two
  // don't have to move together — an item can be highlighted with no
  // status change at all, or reach a status without being highlighted.
  // 2b's chip picker sets this via its own ✨ toggle, only auto-checked
  // as a suggested default when a real status is also picked. Feeds 2d's
  // roster-highlight aggregation for the Story Mode slide deck — nothing
  // downstream has real data to work with until entries start setting
  // this.
  highlightedRosterItemIds?: string[];
  // ScheduleTask ids completed on this same calendar day, auto-attached when
  // a matching log entry already exists — see completeScheduleTask in
  // DataContext. Never causes a log entry to be created; only annotates one
  // that's already there.
  completedScheduleTaskIds?: string[];
}

// A maintenance reminder: either recurring (water changes, dosing, feeding —
// `recurrenceDays` set) or one-off (`recurrenceDays` absent, `done` tracks
// completion). Recurring tasks never really finish — completing one just
// rolls `dueDate` forward by `recurrenceDays` from the completion date —
// unless `endDate` is set, in which case a completion that would roll past
// it retires the task (marks it done) instead of continuing indefinitely.
export interface ScheduleTask {
  id: string;
  label: string;
  detail?: string;
  dueDate: string; // ISO date — next occurrence for recurring, the one date for one-off
  recurrenceDays?: number; // e.g. 7 for weekly. Absent = one-off task.
  endDate?: string; // ISO date — optional. Recurring only; caps how far the series projects/repeats.
  done?: boolean; // one-off tasks only, or a recurring task that's passed its endDate
  lastCompletedDate?: string; // ISO date of most recent completion, if any
}

export interface Tank {
  id: string;
  name: string;
  sizeGallons: number;
  dimensions?: string;
  // Structured, separate from the free-text `dimensions` string above —
  // deliberately not parsed out of it. "20x10x12" is unambiguous to a
  // person but not safely machine-parseable (units, order, and format all
  // vary), and guessing wrong here would silently feed a fabricated
  // number into the minimum-tank-length compatibility check below. Only
  // ever set when a real number is actually known.
  lengthIn?: number;
  widthIn?: number;
  style?: string;
  startDate?: string;
  // Drives which preset custom fields are offered (Settings) and whether
  // salinity shows up on the Log/Charts pages — a freshwater tank has no
  // use for a salinity reading, and a saltwater tank has no use for the
  // freshwater-only presets (shrimp census, fry count, etc). Defaults to
  // 'freshwater' for any tank predating this field (see storage.ts) since
  // that's all this app supported until now.
  waterType: 'freshwater' | 'saltwater';
  customFields: CustomFieldDef[];
  roster: RosterItem[];
  checklist: ChecklistTask[];
  logs: LogEntry[];
  schedule: ScheduleTask[];
  milestones: Milestone[];
}

// --- Recommended-roster questionnaire ---
// A simple nested tree: every option on a Question either leads to another
// Question or terminates in a QuestionResult (a curated pool of roster item
// suggestions). No IDs/lookups needed since it's a strict tree, authored as
// plain nested object literals.

export interface QuestionOption {
  id: string;
  label: string;
  emoji?: string;
  next: QuestionNode;
}

export interface Question {
  kind: 'question';
  id: string;
  prompt: string;
  options: QuestionOption[];
}

export interface QuestionResult {
  kind: 'result';
  id: string;
  summary: string;
  // A result's items can depend on the tank's own size — e.g. a starter
  // shrimp colony or a schooling-fish count should scale with gallons
  // rather than suggesting the same fixed quantity for a 5-gallon nano and
  // a 30-gallon tank. Static arrays still work unchanged for results where
  // scaling doesn't apply (most equipment/hardscape items).
  items: RecommendedRosterItem[] | ((sizeGallons: number) => RecommendedRosterItem[]);
}

export type QuestionNode = Question | QuestionResult;

// A roster item suggestion — same shape as RosterItem minus `id` (assigned
// fresh when actually added), plus `defaultSelected` so a result screen can
// pre-check the items that are almost always right for that path while
// leaving edge-case add-ons unchecked by default.
export interface RecommendedRosterItem {
  name: string;
  category: RosterItem['category'];
  detail?: string;
  source?: string;
  status: SourcingStatus;
  cost?: number;
  quantity?: number;
  defaultSelected: boolean;
  // A short, prominent flag (e.g. "Tank is smaller than this fish's real
  // minimum") — rendered as a standalone pill in the questionnaire UI,
  // separate from `detail`'s muted explanatory paragraph. Reserved for
  // things the person should not be able to miss by skimming.
  warning?: string;
}

export interface AppData {
  tanks: Tank[];
  activeTankId: string;
}