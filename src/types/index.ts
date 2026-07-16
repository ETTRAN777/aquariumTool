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
