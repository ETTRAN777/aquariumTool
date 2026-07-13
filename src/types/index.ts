export type SourcingStatus = 'idea' | 'wishlist' | 'ordered' | 'arrived' | 'acclimating' | 'established';

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
}

export interface AppData {
  tanks: Tank[];
  activeTankId: string;
}
