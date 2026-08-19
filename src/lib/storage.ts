import type {
  AppData,
  Tank,
  CustomFieldDef,
  RosterItem,
  ChecklistTask,
  LogEntry,
  Milestone,
  MilestoneType,
  ScheduleTask,
  RosterLink,
  WaterParams,
} from '../types';
import { seedData } from '../data/seed';
import {
  NAME_MAX_LENGTH,
  STYLE_MAX_LENGTH,
  STATUS_LABELS,
  STATUS_ORDER,
  CATEGORY_LABELS,
  MOOD_ORDER,
  LOG_PHASE_ORDER,
} from './constants';

const STORAGE_KEY = 'tank-tracker:data:v1';
const VALID_CATEGORIES = Object.keys(CATEGORY_LABELS) as RosterItem['category'][];
const WATER_PARAM_KEYS: (keyof WaterParams)[] = [
  'temperature', 'ph', 'gh', 'kh', 'tds', 'ammonia', 'nitrite', 'nitrate', 'salinity',
];
// 'custom' is the deliberate fallback here, not an arbitrary pick — it's
// the one MilestoneType that already means "hand-authored, no auto
// behavior attached" (see the type's own comment), so an unrecognized
// type collapses into the option that was always meant for exactly this
// case, rather than accidentally implying auto-detected provenance
// (phase-change/roster-addition) or a health-event severity it didn't
// actually have.
const VALID_MILESTONE_TYPES: MilestoneType[] = ['phase-change', 'roster-addition', 'health-event', 'custom'];

// --- Small shared validators, used across every entity type below ---
// Every one of these follows the same shape: check the constrained/
// UI-enforced part of a value, default or drop with a warning if it
// doesn't hold, and never touch genuinely free-form user content (a
// label/title/body the person typed themselves) — that's out of scope
// by design, not an oversight. See the per-entity functions for which
// fields fall on which side of that line.

// id is never user-authored content anywhere in this app — it's always
// either generated on creation or carried through unmodified. A missing
// or duplicate one isn't "customization," it's a broken reference
// (React keys, cross-entity lookups by id), so every entity type gets
// the same generate-if-missing-or-duplicate treatment.
function normalizeRequiredId(raw: any, seenIds: Set<string>, contextLabel: string): { id: string; warnings: string[] } {
  const warnings: string[] = [];
  let id = typeof raw === 'string' && raw.length > 0 ? raw : undefined;
  if (id === undefined || seenIds.has(id)) {
    warnings.push(`${contextLabel} had a ${id === undefined ? 'missing' : 'duplicate'} id in the import — a new one was generated.`);
    id = crypto.randomUUID();
  }
  seenIds.add(id);
  return { id, warnings };
}

// Every required `date`/`dueDate` field in this app is set through a
// date picker, never free-typed — so, like an enum, there's exactly one
// valid shape the UI ever produces. Only type-checked here (not
// deep-parsed for real calendar validity), matching how `startDate`
// already worked before this audit — going further would mean silently
// second-guessing a real but unusual date rather than catching an
// actually-malformed import.
function normalizeRequiredDate(raw: any, contextLabel: string): { date: string; warnings: string[] } {
  const warnings: string[] = [];
  if (typeof raw === 'string' && raw.length > 0) return { date: raw, warnings };
  const today = new Date().toISOString().slice(0, 10);
  warnings.push(`${contextLabel} was missing a valid date in the import — defaulted to today (${today}).`);
  return { date: today, warnings };
}

// Generic optional string[] validator — dependsOn, relatedRosterItemIds,
// completedScheduleTaskIds, and photoUrls are all "array of plain
// strings or nothing," and all four are structural (ids/URLs), not user
// content, so a wrong shape gets dropped rather than defaulted.
function normalizeStringArray(raw: any, contextLabel: string, fieldLabel: string): { arr: string[] | undefined; warnings: string[] } {
  const warnings: string[] = [];
  if (raw === undefined) return { arr: undefined, warnings };
  if (Array.isArray(raw) && raw.every((v) => typeof v === 'string')) return { arr: raw, warnings };
  warnings.push(`${contextLabel}'s ${fieldLabel} was an unexpected shape in the import — dropped.`);
  return { arr: undefined, warnings };
}

// LogEntry.params — actual water-test readings. Every field is entered
// through a number input, so (like an enum) there's only one valid JS
// type per key, and the key set itself is closed (WATER_PARAM_KEYS) —
// an AI hallucinating a field name here is exactly as possible as it was
// for RosterItem.category.
function normalizeWaterParams(raw: any, contextLabel: string): { params: WaterParams | undefined; warnings: string[] } {
  const warnings: string[] = [];
  if (raw === undefined) return { params: undefined, warnings };
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) {
    warnings.push(`${contextLabel}'s water parameters were an unexpected shape in the import — dropped.`);
    return { params: undefined, warnings };
  }
  const params: WaterParams = {};
  let droppedAny = false;
  for (const key of Object.keys(raw)) {
    if (!WATER_PARAM_KEYS.includes(key as keyof WaterParams)) { droppedAny = true; continue; }
    const value = raw[key];
    if (typeof value === 'number' && Number.isFinite(value)) {
      (params as any)[key] = value;
    } else {
      droppedAny = true;
    }
  }
  if (droppedAny) {
    warnings.push(`${contextLabel}'s water parameters included an unrecognized key or a non-numeric value in the import — those entries were dropped.`);
  }
  return { params: Object.keys(params).length ? params : undefined, warnings };
}

// RosterItem.waterParamTargets — same key set as WaterParams above, but
// each value is a {min?, max?} range rather than a single reading.
function normalizeWaterParamTargets(
  raw: any,
  contextLabel: string
): { targets: RosterItem['waterParamTargets']; warnings: string[] } {
  const warnings: string[] = [];
  if (raw === undefined) return { targets: undefined, warnings };
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) {
    warnings.push(`${contextLabel}'s water parameter targets were an unexpected shape in the import — dropped.`);
    return { targets: undefined, warnings };
  }
  const targets: NonNullable<RosterItem['waterParamTargets']> = {};
  let droppedAny = false;
  for (const key of Object.keys(raw)) {
    if (!WATER_PARAM_KEYS.includes(key as keyof WaterParams)) { droppedAny = true; continue; }
    const value = raw[key];
    if (typeof value !== 'object' || value === null || Array.isArray(value)) { droppedAny = true; continue; }
    const min = typeof value.min === 'number' && Number.isFinite(value.min) ? value.min : undefined;
    const max = typeof value.max === 'number' && Number.isFinite(value.max) ? value.max : undefined;
    if (value.min !== undefined && min === undefined) droppedAny = true;
    if (value.max !== undefined && max === undefined) droppedAny = true;
    if (min !== undefined || max !== undefined) {
      (targets as any)[key] = { ...(min !== undefined ? { min } : {}), ...(max !== undefined ? { max } : {}) };
    } else {
      droppedAny = true;
    }
  }
  if (droppedAny) {
    warnings.push(`${contextLabel}'s water parameter targets included an unrecognized key or an invalid min/max in the import — those entries were dropped.`);
  }
  return { targets: Object.keys(targets).length ? targets : undefined, warnings };
}

// RosterLink ({rosterItemId, requiredStatus}) — reused as-is by both
// ChecklistTask.rosterLinks and LogEntry.additions. requiredStatus is
// the same closed SourcingStatus enum as RosterItem.status; rosterItemId
// is a structural reference, not content.
function normalizeRosterLinks(raw: any, contextLabel: string): { links: RosterLink[] | undefined; warnings: string[] } {
  const warnings: string[] = [];
  if (raw === undefined) return { links: undefined, warnings };
  if (!Array.isArray(raw)) {
    warnings.push(`${contextLabel}'s roster links were an unexpected shape in the import — dropped.`);
    return { links: undefined, warnings };
  }
  const links: RosterLink[] = [];
  let droppedAny = false;
  for (const entry of raw) {
    const rosterItemId = typeof entry?.rosterItemId === 'string' && entry.rosterItemId.length > 0 ? entry.rosterItemId : undefined;
    const requiredStatus = STATUS_ORDER.includes(entry?.requiredStatus) ? entry.requiredStatus : undefined;
    if (rosterItemId && requiredStatus) {
      links.push({ rosterItemId, requiredStatus });
    } else {
      droppedAny = true;
    }
  }
  if (droppedAny) {
    warnings.push(`${contextLabel} had one or more roster links with a missing id or an unrecognized status in the import — those entries were dropped.`);
  }
  return { links: links.length ? links : undefined, warnings };
}

// Roster items and checklist tasks are each real, independently-shaped
// records — same problem as the top-level Tank fields (a required field
// or a constrained enum only holds at compile time), but easy to miss
// since the array itself already gets an `Array.isArray` check above.
// That check only guarantees "it's an array," not that each element is a
// well-formed RosterItem — a hand-edited or AI-generated import can put
// anything in there: a `category` outside the real 5-value enum, a
// missing required `id`/`name`/`status`, or fields under a name the AI
// guessed at instead of the real one (e.g. `estimatedCost` instead of
// `cost`). None of these crash — CATEGORY_LABELS[badCategory] just
// renders an empty pill — but a wrong/missing category is invisible in
// the UI and silently breaks that item's status-pill filter click and
// "By category" sort position. Defaulted + warned here for the same
// reason as everything else in this file: fail visibly once, at the
// import boundary, not silently everywhere the field gets read.
function normalizeRosterItem(
  raw: any,
  index: number,
  seenIds: Set<string>,
  tankName: string
): { item: RosterItem; warnings: string[] } {
  const warnings: string[] = [];

  let id = typeof raw.id === 'string' && raw.id.length > 0 ? raw.id : undefined;
  if (id === undefined || seenIds.has(id)) {
    warnings.push(
      `A roster item on "${tankName}" (position ${index + 1}) had a ${
        id === undefined ? 'missing' : 'duplicate'
      } id — a new one was generated.`
    );
    id = crypto.randomUUID();
  }
  seenIds.add(id);

  let name = typeof raw.name === 'string' && raw.name.length > 0 ? raw.name : undefined;
  if (name === undefined) {
    warnings.push(`A roster item on "${tankName}" was missing a name — defaulted to "Unnamed item".`);
    name = 'Unnamed item';
  }

  let category: RosterItem['category'] = VALID_CATEGORIES.includes(raw.category) ? raw.category : undefined as any;
  if (category === undefined) {
    warnings.push(
      `"${name}" had an unrecognized category ("${raw.category ?? 'none'}") — defaulted to Equipment. Update it in Roster.`
    );
    category = 'equipment';
  }

  let status = STATUS_ORDER.includes(raw.status) ? raw.status : undefined;
  if (status === undefined) {
    warnings.push(`"${name}" had an unrecognized status ("${raw.status ?? 'none'}") — defaulted to Idea.`);
    status = 'idea';
  }

  let cost = typeof raw.cost === 'number' && Number.isFinite(raw.cost) ? raw.cost : undefined;
  if (raw.cost !== undefined && cost === undefined) {
    warnings.push(`"${name}"'s cost was an unexpected type in the import — dropped.`);
  }
  let quantity = typeof raw.quantity === 'number' && Number.isFinite(raw.quantity) ? raw.quantity : undefined;
  if (raw.quantity !== undefined && quantity === undefined) {
    warnings.push(`"${name}"'s quantity was an unexpected type in the import — dropped.`);
  }
  let starred = typeof raw.starred === 'boolean' ? raw.starred : undefined;
  if (raw.starred !== undefined && starred === undefined) {
    warnings.push(`"${name}"'s starred flag was an unexpected type in the import — dropped.`);
  }
  let detail = typeof raw.detail === 'string' ? raw.detail : undefined;
  let source = typeof raw.source === 'string' ? raw.source : undefined;
  let notes = typeof raw.notes === 'string' ? raw.notes : undefined;

  const { targets: waterParamTargets, warnings: targetWarnings } = normalizeWaterParamTargets(raw.waterParamTargets, `"${name}"`);
  warnings.push(...targetWarnings);

  let mouthSizeMm = typeof raw.mouthSizeMm === 'number' && Number.isFinite(raw.mouthSizeMm) ? raw.mouthSizeMm : undefined;
  if (raw.mouthSizeMm !== undefined && mouthSizeMm === undefined) {
    warnings.push(`"${name}"'s mouth size was an unexpected type in the import — dropped.`);
  }
  let adultSizeIn = typeof raw.adultSizeIn === 'number' && Number.isFinite(raw.adultSizeIn) ? raw.adultSizeIn : undefined;
  if (raw.adultSizeIn !== undefined && adultSizeIn === undefined) {
    warnings.push(`"${name}"'s adult size was an unexpected type in the import — dropped.`);
  }
  let predatorRiskOverride = typeof raw.predatorRiskOverride === 'boolean' ? raw.predatorRiskOverride : undefined;
  if (raw.predatorRiskOverride !== undefined && predatorRiskOverride === undefined) {
    warnings.push(`"${name}"'s predator-risk override was an unexpected type in the import — dropped.`);
  }

  // traits is deliberately left alone: each trait's `label` is
  // user-defined free text (the same "custom" reasoning as
  // Tank.customFields), so there's no fixed set of options to validate
  // against — nothing here for an import to get "wrong" in the way a
  // category or status can be.
  const item: RosterItem = {
    id,
    name,
    category,
    status,
    ...(detail !== undefined ? { detail } : {}),
    ...(source !== undefined ? { source } : {}),
    ...(notes !== undefined ? { notes } : {}),
    ...(cost !== undefined ? { cost } : {}),
    ...(quantity !== undefined ? { quantity } : {}),
    ...(starred !== undefined ? { starred } : {}),
    ...(waterParamTargets !== undefined ? { waterParamTargets } : {}),
    ...(mouthSizeMm !== undefined ? { mouthSizeMm } : {}),
    ...(adultSizeIn !== undefined ? { adultSizeIn } : {}),
    ...(predatorRiskOverride !== undefined ? { predatorRiskOverride } : {}),
    ...(raw.traits !== undefined ? { traits: raw.traits } : {}),
  };

  return { item, warnings };
}

// Same reasoning as normalizeRosterItem above. The concrete bug this
// closes: an AI-generated import that guesses field names instead of
// using the real schema (`task`/`dependencies` instead of
// `label`/`dependsOn`) doesn't crash — `task.label` is just `undefined`,
// which React renders as a blank checklist row. `done` being required-
// but-missing is more subtle: it's falsy either way, so a step silently
// defaults to "not done" rather than erroring, which is the right
// behavior but worth being explicit about rather than accidental.
function normalizeChecklistTask(
  raw: any,
  index: number,
  seenIds: Set<string>,
  tankName: string
): { task: ChecklistTask; warnings: string[] } {
  const warnings: string[] = [];

  let id = typeof raw.id === 'string' && raw.id.length > 0 ? raw.id : undefined;
  if (id === undefined || seenIds.has(id)) {
    warnings.push(
      `A checklist step on "${tankName}" (position ${index + 1}) had a ${
        id === undefined ? 'missing' : 'duplicate'
      } id — a new one was generated.`
    );
    id = crypto.randomUUID();
  }
  seenIds.add(id);

  let label = typeof raw.label === 'string' && raw.label.length > 0 ? raw.label : undefined;
  if (label === undefined) {
    warnings.push(
      `A checklist step on "${tankName}" (position ${index + 1}) was missing a label — defaulted to "Untitled step".`
    );
    label = 'Untitled step';
  }

  const done = typeof raw.done === 'boolean' ? raw.done : false;

  const { arr: dependsOn, warnings: depWarnings } = normalizeStringArray(raw.dependsOn, `"${label}"`, 'dependency list');
  warnings.push(...depWarnings);

  let detail = typeof raw.detail === 'string' ? raw.detail : undefined;
  let dueDate = typeof raw.dueDate === 'string' ? raw.dueDate : undefined;

  const { links: rosterLinks, warnings: linkWarnings } = normalizeRosterLinks(raw.rosterLinks, `"${label}"`);
  warnings.push(...linkWarnings);

  const task: ChecklistTask = {
    id,
    label,
    done,
    ...(dependsOn !== undefined ? { dependsOn } : {}),
    ...(detail !== undefined ? { detail } : {}),
    ...(dueDate !== undefined ? { dueDate } : {}),
    ...(rosterLinks !== undefined ? { rosterLinks } : {}),
  };

  return { task, warnings };
}

// weekLabel/title/body are free text the user (or an AI drafting on
// their behalf) writes — content, not a value the UI constrains to a
// fixed set of options. Left completely unvalidated here, same
// reasoning as RosterItem.traits: nothing about them is "wrong" the way
// an out-of-enum category or status can be. id/date are the opposite —
// structural, never user-authored — so those still get the same
// generate/default treatment as everywhere else.
function normalizeLogEntry(
  raw: any,
  index: number,
  seenIds: Set<string>,
  tankName: string
): { entry: LogEntry; warnings: string[] } {
  const warnings: string[] = [];
  const contextLabel = `A log entry on "${tankName}" (position ${index + 1})`;

  const { id, warnings: idWarnings } = normalizeRequiredId(raw.id, seenIds, contextLabel);
  warnings.push(...idWarnings);

  const { date, warnings: dateWarnings } = normalizeRequiredDate(raw.date, contextLabel);
  warnings.push(...dateWarnings);

  const weekLabel = raw.weekLabel;
  const title = raw.title;
  const body = raw.body;

  // mood/phase: pre-existing validation, unchanged — moved in here so
  // every log-entry check lives in one place instead of split between a
  // bulk array pass in normalizeTank and per-item checks everywhere
  // else.
  let mood = raw.mood;
  if (mood !== undefined && !MOOD_ORDER.includes(mood)) {
    warnings.push(`${contextLabel} had a mood value that isn't one of the app's four options — cleared.`);
    mood = undefined;
  }
  let phase = raw.phase;
  if (phase !== undefined && !LOG_PHASE_ORDER.includes(phase)) {
    warnings.push(`${contextLabel} had a phase value that isn't one of the app's six build stages — cleared.`);
    phase = undefined;
  }

  const { params, warnings: paramWarnings } = normalizeWaterParams(raw.params, contextLabel);
  warnings.push(...paramWarnings);

  const { links: additions, warnings: additionWarnings } = normalizeRosterLinks(raw.additions, contextLabel);
  warnings.push(...additionWarnings);

  const { arr: highlightedRosterItemIds, warnings: highlightWarnings } = normalizeStringArray(
    raw.highlightedRosterItemIds, contextLabel, 'highlighted-roster-item list'
  );
  warnings.push(...highlightWarnings);

  const { arr: completedScheduleTaskIds, warnings: taskIdWarnings } = normalizeStringArray(
    raw.completedScheduleTaskIds, contextLabel, 'completed-schedule-task list'
  );
  warnings.push(...taskIdWarnings);

  const { arr: photoUrls, warnings: photoWarnings } = normalizeStringArray(raw.photoUrls, contextLabel, 'photo list');
  warnings.push(...photoWarnings);

  // customValues is keyed by CustomFieldDef.id and holds whatever type
  // that custom field def declares — inherently open-ended/user-defined,
  // same "custom" reasoning as traits and customFields themselves. Left
  // as pass-through.
  const entry: LogEntry = {
    id,
    weekLabel,
    date,
    title,
    body,
    ...(mood !== undefined ? { mood } : {}),
    ...(phase !== undefined ? { phase } : {}),
    ...(params !== undefined ? { params } : {}),
    ...(photoUrls !== undefined ? { photoUrls } : {}),
    ...(raw.customValues !== undefined ? { customValues: raw.customValues } : {}),
    ...(additions !== undefined ? { additions } : {}),
    ...(highlightedRosterItemIds !== undefined ? { highlightedRosterItemIds } : {}),
    ...(completedScheduleTaskIds !== undefined ? { completedScheduleTaskIds } : {}),
  };

  return { entry, warnings };
}

// title/description are free text (title is user-typed even for
// auto-created milestones — 15c's buildFallbackDescription only fills in
// `description`, never `title`), left unvalidated for the same reason as
// LogEntry's title/body. Everything else here — id, date, type, phase,
// major, the two reference-id fields — is either a closed enum, a
// boolean toggle, or a structural reference, so all of it is gated.
function normalizeMilestone(
  raw: any,
  index: number,
  seenIds: Set<string>,
  tankName: string
): { milestone: Milestone; warnings: string[] } {
  const warnings: string[] = [];
  const contextLabel = `A milestone on "${tankName}" (position ${index + 1})`;

  const { id, warnings: idWarnings } = normalizeRequiredId(raw.id, seenIds, contextLabel);
  warnings.push(...idWarnings);

  const { date, warnings: dateWarnings } = normalizeRequiredDate(raw.date, contextLabel);
  warnings.push(...dateWarnings);

  const title = raw.title;
  const description = typeof raw.description === 'string' ? raw.description : undefined;

  let type: MilestoneType = VALID_MILESTONE_TYPES.includes(raw.type) ? raw.type : undefined as any;
  if (type === undefined) {
    warnings.push(`${contextLabel} had an unrecognized type ("${raw.type ?? 'none'}") — defaulted to a plain custom milestone.`);
    type = 'custom';
  }

  let phase = raw.phase;
  if (phase !== undefined && !LOG_PHASE_ORDER.includes(phase)) {
    warnings.push(`${contextLabel} had a phase value that isn't one of the app's six build stages — cleared.`);
    phase = undefined;
  }

  let major = typeof raw.major === 'boolean' ? raw.major : undefined;
  if (raw.major !== undefined && major === undefined) {
    warnings.push(`${contextLabel}'s major flag was an unexpected type in the import — dropped.`);
  }

  const { arr: relatedRosterItemIds, warnings: relatedWarnings } = normalizeStringArray(
    raw.relatedRosterItemIds, contextLabel, 'related-roster-item list'
  );
  warnings.push(...relatedWarnings);

  let linkedLogEntryId = typeof raw.linkedLogEntryId === 'string' && raw.linkedLogEntryId.length > 0 ? raw.linkedLogEntryId : undefined;
  if (raw.linkedLogEntryId !== undefined && linkedLogEntryId === undefined) {
    warnings.push(`${contextLabel}'s linked log entry reference was an unexpected type in the import — dropped.`);
  }
  // Cross-reference check happens back in normalizeTank once the real
  // log id set is known (this function only sees one milestone at a
  // time) — see the comment there for why a dangling reference needs to
  // become a true `undefined` rather than staying a broken-but-truthy
  // string.

  const milestone: Milestone = {
    id,
    title,
    date,
    type,
    ...(description !== undefined ? { description } : {}),
    ...(phase !== undefined ? { phase } : {}),
    ...(major !== undefined ? { major } : {}),
    ...(relatedRosterItemIds !== undefined ? { relatedRosterItemIds } : {}),
    ...(linkedLogEntryId !== undefined ? { linkedLogEntryId } : {}),
  };

  return { milestone, warnings };
}

// label/detail are free text, same reasoning as everywhere else — left
// unvalidated. dueDate follows the same required-date-picker-field
// treatment as Tank.startDate/LogEntry.date; recurrenceDays/endDate/
// done/lastCompletedDate are all UI-constrained (number input / date
// picker / checkbox) so all get type-checked.
function normalizeScheduleTask(
  raw: any,
  index: number,
  seenIds: Set<string>,
  tankName: string
): { task: ScheduleTask; warnings: string[] } {
  const warnings: string[] = [];
  const contextLabel = `A schedule task on "${tankName}" (position ${index + 1})`;

  const { id, warnings: idWarnings } = normalizeRequiredId(raw.id, seenIds, contextLabel);
  warnings.push(...idWarnings);

  const { date: dueDate, warnings: dueDateWarnings } = normalizeRequiredDate(raw.dueDate, contextLabel);
  warnings.push(...dueDateWarnings);

  const label = raw.label;
  const detail = typeof raw.detail === 'string' ? raw.detail : undefined;

  let recurrenceDays = typeof raw.recurrenceDays === 'number' && Number.isFinite(raw.recurrenceDays) && raw.recurrenceDays > 0
    ? raw.recurrenceDays
    : undefined;
  if (raw.recurrenceDays !== undefined && recurrenceDays === undefined) {
    warnings.push(`${contextLabel}'s recurrence interval was an unexpected type in the import — dropped.`);
  }
  let endDate = typeof raw.endDate === 'string' ? raw.endDate : undefined;
  if (raw.endDate !== undefined && endDate === undefined) {
    warnings.push(`${contextLabel}'s end date was an unexpected type in the import — dropped.`);
  }
  let done = typeof raw.done === 'boolean' ? raw.done : undefined;
  if (raw.done !== undefined && done === undefined) {
    warnings.push(`${contextLabel}'s done flag was an unexpected type in the import — dropped.`);
  }
  let lastCompletedDate = typeof raw.lastCompletedDate === 'string' ? raw.lastCompletedDate : undefined;
  if (raw.lastCompletedDate !== undefined && lastCompletedDate === undefined) {
    warnings.push(`${contextLabel}'s last-completed date was an unexpected type in the import — dropped.`);
  }

  const task: ScheduleTask = {
    id,
    label,
    dueDate,
    ...(detail !== undefined ? { detail } : {}),
    ...(recurrenceDays !== undefined ? { recurrenceDays } : {}),
    ...(endDate !== undefined ? { endDate } : {}),
    ...(done !== undefined ? { done } : {}),
    ...(lastCompletedDate !== undefined ? { lastCompletedDate } : {}),
  };

  return { task, warnings };
}

// Backups/localStorage from before multi-tank + custom-field support won't
// have `customFields` on their tanks, and may carry the old hardcoded
// `shrimpCount`/`berriedCount` log fields instead of `customValues`. This
// patches old shapes up to the current one instead of crashing on load.
function normalizeTank(raw: any): { tank: Tank; warnings: string[] } {
  const warnings: string[] = [];

  // id/name computed first, before anything else — every per-item
  // normalizer below (logs, roster, checklist, milestones, schedule)
  // labels its own warnings with the tank's name, so it has to exist
  // before any of those run.

  // id is a required `string` used as the lookup/routing key everywhere
  // (activeTankId, URL state, React keys) — a missing or non-string id
  // wouldn't crash immediately here, but would break tank selection and
  // routing downstream in ways that are much harder to trace back to
  // "the import was malformed." Generate a fresh one rather than let a
  // bad value propagate.
  let id = raw.id;
  if (typeof id !== 'string' || id.length === 0) {
    warnings.push(`A tank was missing a valid id in the import — a new one was generated.`);
    id = crypto.randomUUID();
  }

  // name is a required `string`, but (like sizeGallons) that's only a
  // compile-time promise. The length-clamp only fires once name is
  // already confirmed to be a string — a missing or non-string name falls
  // through untouched and stays `undefined`/wrong-typed otherwise.
  let name = typeof raw.name === 'string' ? raw.name : undefined;
  if (typeof raw.name === 'string' && raw.name.length > NAME_MAX_LENGTH) {
    name = raw.name.slice(0, NAME_MAX_LENGTH);
    warnings.push(
      `Name was ${raw.name.length} characters — shortened to the ${NAME_MAX_LENGTH}-character limit ("${name}…").`
    );
  } else if (name === undefined) {
    warnings.push(`A tank was missing a name in the import — defaulted to "Untitled Tank".`);
    name = 'Untitled Tank';
  }

  let style = typeof raw.style === 'string' ? raw.style : undefined;
  if (raw.style !== undefined && typeof raw.style !== 'string') {
    warnings.push(`"${name}"'s description was an unexpected type in the import — dropped.`);
  }
  if (typeof style === 'string' && style.length > STYLE_MAX_LENGTH) {
    style = style.slice(0, STYLE_MAX_LENGTH);
    warnings.push(
      `"${name}"'s description was ${raw.style.length} characters — shortened to the ${STYLE_MAX_LENGTH}-character limit.`
    );
  }

  // dimensions/startDate are both optional strings with no further
  // validation elsewhere (dimensions is free text; startDate is checked
  // for parseability wherever it's consumed) — but a wrong *type* here
  // (e.g. a number or object from a malformed import) would still slip
  // through unnoticed and surface as a rendering bug far from its cause.
  // Type-check and drop rather than pass through blind, same as style.
  let dimensions = typeof raw.dimensions === 'string' ? raw.dimensions : undefined;
  if (raw.dimensions !== undefined && typeof raw.dimensions !== 'string') {
    warnings.push(`"${name}"'s dimensions were an unexpected type in the import — dropped.`);
  }
  let startDate = typeof raw.startDate === 'string' ? raw.startDate : undefined;
  if (raw.startDate !== undefined && typeof raw.startDate !== 'string') {
    warnings.push(`"${name}"'s start date was an unexpected type in the import — dropped.`);
  }

  // sizeGallons is a required `number` in the Tank type, but that promise
  // only holds for code that goes through the type system — a hand-edited
  // or AI-generated import can omit it, or supply a non-numeric value,
  // and TypeScript does nothing to stop that at runtime. Left unguarded,
  // `undefined`/NaN silently makes it into the stored Tank and crashes
  // later at whatever read site happens to call a method on it (e.g.
  // `.toString()`), rather than surfacing here where the actual gap is.
  // Same reasoning as the name/style clamping and mood/phase validation
  // above: default rather than crash, and tell the user rather than stay
  // silent about it.
  let sizeGallons = raw.sizeGallons;
  if (typeof sizeGallons !== 'number' || !Number.isFinite(sizeGallons) || sizeGallons <= 0) {
    warnings.push(
      `"${name}"'s size (gallons) was missing or invalid in the import — defaulted to 10 gallons. Update it in Settings.`
    );
    sizeGallons = 10;
  }

  // lengthIn/widthIn are optional numbers used by the minimum-tank-length
  // compatibility check — genuinely absent on most tanks (only set when a
  // real measurement is known), so no default is appropriate. But they
  // were missing from the constructed Tank object below entirely, meaning
  // any tank that DID have them set lost them silently on every
  // import/re-save round-trip, whether or not the source value was valid.
  // Carried through here with the same type-check-and-drop pattern as the
  // other optional fields, rather than defaulted, since a fabricated
  // length/width would be worse than none (see the comment on the type
  // itself) and 0 is not a meaningful drop-in default the way it would be
  // false-positive-safe for something like a count.
  let lengthIn = typeof raw.lengthIn === 'number' && Number.isFinite(raw.lengthIn) ? raw.lengthIn : undefined;
  if (raw.lengthIn !== undefined && lengthIn === undefined) {
    warnings.push(`"${name}"'s length (in) was an unexpected type in the import — dropped.`);
  }
  let widthIn = typeof raw.widthIn === 'number' && Number.isFinite(raw.widthIn) ? raw.widthIn : undefined;
  if (raw.widthIn !== undefined && widthIn === undefined) {
    warnings.push(`"${name}"'s width (in) was an unexpected type in the import — dropped.`);
  }

  // --- Logs ---
  // customFields/legacy-shrimp migration runs first, on the raw array,
  // same as before this audit — it's a shape migration (old field names
  // → new ones), not validation, so it has to happen before
  // normalizeLogEntry ever sees each entry.
  let customFields: CustomFieldDef[] = Array.isArray(raw.customFields) ? raw.customFields : [];
  let logsRaw = Array.isArray(raw.logs) ? raw.logs : [];

  const hasLegacyShrimpFields = logsRaw.some(
    (l: any) => l.shrimpCount !== undefined || l.berriedCount !== undefined
  );
  if (hasLegacyShrimpFields) {
    const popField: CustomFieldDef =
      customFields.find((f) => f.label === 'Population count') ??
      { id: crypto.randomUUID(), label: 'Population count', type: 'number' };
    const berriedField: CustomFieldDef =
      customFields.find((f) => f.label === 'Berried / gravid count') ??
      { id: crypto.randomUUID(), label: 'Berried / gravid count', type: 'number' };

    if (!customFields.includes(popField)) customFields = [...customFields, popField];
    if (!customFields.includes(berriedField)) customFields = [...customFields, berriedField];

    logsRaw = logsRaw.map((l: any) => {
      const customValues = { ...(l.customValues ?? {}) };
      if (l.shrimpCount !== undefined) customValues[popField.id] = l.shrimpCount;
      if (l.berriedCount !== undefined) customValues[berriedField.id] = l.berriedCount;
      const { shrimpCount, berriedCount, ...rest } = l;
      return {
        ...rest,
        customValues: Object.keys(customValues).length ? customValues : undefined,
      };
    });
  }

  const logSeenIds = new Set<string>();
  const logs: LogEntry[] = logsRaw.map((l: any, i: number) => {
    const { entry, warnings: entryWarnings } = normalizeLogEntry(l, i, logSeenIds, name);
    warnings.push(...entryWarnings);
    return entry;
  });
  const logIds = new Set(logs.map((l) => l.id));

  // --- Roster / Checklist ---
  const rosterSeenIds = new Set<string>();
  const rosterRaw = Array.isArray(raw.roster) ? raw.roster : [];
  const roster: RosterItem[] = rosterRaw.map((r: any, i: number) => {
    const { item, warnings: itemWarnings } = normalizeRosterItem(r, i, rosterSeenIds, name);
    warnings.push(...itemWarnings);
    return item;
  });

  const checklistSeenIds = new Set<string>();
  const checklistRaw = Array.isArray(raw.checklist) ? raw.checklist : [];
  const checklist: ChecklistTask[] = checklistRaw.map((c: any, i: number) => {
    const { task, warnings: taskWarnings } = normalizeChecklistTask(c, i, checklistSeenIds, name);
    warnings.push(...taskWarnings);
    return task;
  });

  // --- Milestones ---
  const milestoneSeenIds = new Set<string>();
  const milestonesRaw = Array.isArray(raw.milestones) ? raw.milestones : [];
  const milestones: Milestone[] = milestonesRaw.map((m: any, i: number) => {
    const { milestone, warnings: mWarnings } = normalizeMilestone(m, i, milestoneSeenIds, name);
    // A linkedLogEntryId that doesn't match any real log entry's id
    // (post-normalization, so this also catches one that only existed
    // because of an id that just got regenerated above) is worse than no
    // link at all — lib/milestones.ts's "is this milestone manual"
    // check is `!linkedLogEntryId`, so a dangling-but-truthy id would
    // make an otherwise-orphaned milestone silently skip the protection
    // real manual milestones get, without ever being reachable through
    // the auto-recompute logic that's supposed to own linked ones either.
    // Clearing it converts a broken link into a true manual milestone —
    // safe, and exactly what it functionally already was.
    if (milestone.linkedLogEntryId !== undefined && !logIds.has(milestone.linkedLogEntryId)) {
      warnings.push(
        `A milestone on "${name}" ("${milestone.title ?? 'untitled'}") referenced a log entry that doesn't exist in this import — the link was dropped, and it now stands as a standalone milestone.`
      );
      delete milestone.linkedLogEntryId;
    }
    warnings.push(...mWarnings);
    return milestone;
  });

  // --- Schedule ---
  const scheduleSeenIds = new Set<string>();
  const scheduleRaw = Array.isArray(raw.schedule) ? raw.schedule : [];
  const schedule: ScheduleTask[] = scheduleRaw.map((s: any, i: number) => {
    const { task, warnings: sWarnings } = normalizeScheduleTask(s, i, scheduleSeenIds, name);
    warnings.push(...sWarnings);
    return task;
  });

  const tank: Tank = {
    id,
    name,
    sizeGallons,
    dimensions,
    lengthIn,
    widthIn,
    style,
    startDate,
    customFields,
    roster,
    checklist,
    logs,
    schedule,
    milestones,
    waterType: raw.waterType === 'saltwater' ? 'saltwater' : 'freshwater',
  };

  return { tank, warnings };
}

function normalizeAppData(raw: any): { data: AppData; warnings: string[] } {
  if (!raw || !Array.isArray(raw.tanks)) return { data: seedData, warnings: [] };
  const normalized = raw.tanks.map(normalizeTank);
  const tanks = normalized.map((n: { tank: Tank; warnings: string[] }) => n.tank);
  const warnings = normalized.flatMap((n: { tank: Tank; warnings: string[] }) => n.warnings);
  return {
    data: {
      activeTankId: raw.activeTankId ?? tanks[0]?.id ?? '',
      tanks,
    },
    warnings,
  };
}

// Compares two tanks by content only, ignoring the top-level `id` field
// (which always differs between an imported copy and its original, since
// import always assigns a fresh id). Nested roster/checklist/log ids are
// NOT stripped — those stay stable across export/import round-trips for
// the same tank, so an unmodified re-import produces an identical key here.
export function tankContentKey(tank: Tank): string {
  const { id, ...rest } = tank;
  return JSON.stringify(rest);
}

// Strips log photos from a copy of the given tanks — for the "no images"
// export option. Photos are almost always the overwhelming majority of a
// backup file's size, and are pure dead weight for anyone pasting a backup
// into an AI assistant to sync a build plan against — a task that only
// needs the structural data, but otherwise pays for every embedded photo's
// base64 bytes in tokens. Still a fully valid, re-importable backup on its
// own — photoUrls has always been an optional field.
export function stripPhotos(tanks: Tank[]): Tank[] {
  return tanks.map((t) => ({
    ...t,
    logs: t.logs.map((l) => {
      const { photoUrls, ...rest } = l;
      return rest;
    }),
  }));
}

// Restores log photos onto an incoming (imported) tank from the existing
// stored version, for any log entry present in both (matched by id) where
// the incoming version has none. Exists specifically because of
// stripPhotos()/the "no images" export — a plan sync built from that
// export has no photos on any log by construction, and a naive replace
// would silently wipe out real photos already sitting on the current
// version of those same entries. Only fills in gaps; never overwrites
// photos the incoming version actually specifies itself.
export function restoreMissingPhotos(incoming: Tank, existing: Tank): Tank {
  const existingLogById = new Map(existing.logs.map((l) => [l.id, l]));
  return {
    ...incoming,
    logs: incoming.logs.map((l) => {
      if (l.photoUrls && l.photoUrls.length > 0) return l;
      const match = existingLogById.get(l.id);
      if (match?.photoUrls && match.photoUrls.length > 0) {
        return { ...l, photoUrls: match.photoUrls };
      }
      return l;
    }),
  };
}

// Whether restoreMissingPhotos would actually change anything — used to
// show an honest note before the user commits to Replace, rather than
// having photos reappear silently with no explanation.
export function wouldRestorePhotos(incoming: Tank, existing: Tank): boolean {
  const existingLogById = new Map(existing.logs.map((l) => [l.id, l]));
  return incoming.logs.some((l) => {
    if (l.photoUrls && l.photoUrls.length > 0) return false;
    const match = existingLogById.get(l.id);
    return !!(match?.photoUrls && match.photoUrls.length > 0);
  });
}

export type ImportDiffTier = 'high' | 'medium' | 'low';
export interface ImportDiffEntry {
  tier: ImportDiffTier;
  label: string;
  // Set for "same count, different content" cases — the first item pair
  // that actually differs, shown as a rough before/after. Deliberately
  // doesn't try to pinpoint *which* field changed on that item (that's a
  // much bigger diffing problem) — just proves something in this category
  // changed and gives one concrete example, using whichever field a
  // person would recognize the item by.
  detail?: { old: string; new: string };
}

// Finds the first index where two same-length arrays actually differ, and
// returns a human-readable snapshot of that one item using `getLabel`.
// Comparing by index rather than matching items up "properly" is a
// deliberate simplification — good enough for "here's roughly what
// changed," not meant to be a precise diff.
function firstItemSnapshot<T>(
  existingArr: T[],
  incomingArr: T[],
  getLabel: (item: T) => string
): { old: string; new: string } | undefined {
  const len = Math.min(existingArr.length, incomingArr.length);
  for (let i = 0; i < len; i++) {
    if (JSON.stringify(existingArr[i]) !== JSON.stringify(incomingArr[i])) {
      return { old: getLabel(existingArr[i]), new: getLabel(incomingArr[i]) };
    }
  }
  return undefined;
}

// Roster-specific version of the above — name is still the first choice
// (most recognizable), but falls back to status or cost when the name is
// identical on both sides, since those are the fields most likely to be
// the real, currently-invisible change: an item progressing through its
// sourcing pipeline, or an estimate becoming a real price. Doesn't try to
// be exhaustive about every possible field (quantity, detail, targets,
// traits) — just the two most common real-world cases, same "first diff
// of the category, doesn't need to get it right" scoping as everywhere
// else in this file.
function firstRosterSnapshot(
  existingArr: RosterItem[],
  incomingArr: RosterItem[]
): { old: string; new: string } | undefined {
  const len = Math.min(existingArr.length, incomingArr.length);
  const fmtCost = (c?: number) => (c !== undefined ? `$${c.toFixed(2)}` : 'no cost set');

  for (let i = 0; i < len; i++) {
    const a = existingArr[i];
    const b = incomingArr[i];
    if (JSON.stringify(a) === JSON.stringify(b)) continue;

    if (a.name !== b.name) {
      return { old: a.name, new: b.name };
    }
    if (a.status !== b.status) {
      return {
        old: `${a.name} — status: ${STATUS_LABELS[a.status]}`,
        new: `${b.name} — status: ${STATUS_LABELS[b.status]}`,
      };
    }
    if (a.cost !== b.cost) {
      return {
        old: `${a.name} — cost: ${fmtCost(a.cost)}`,
        new: `${b.name} — cost: ${fmtCost(b.cost)}`,
      };
    }
    // Something else differs with no dedicated fallback yet — still show
    // the name pair so it's clear which item to look at, even though it
    // reads as unchanged.
    return { old: a.name, new: b.name };
  }
  return undefined;
}

// Compares an existing tank against an incoming (imported/Drive-downloaded)
// tank with the same name, and describes what actually differs — not just
// "these don't match." Tiered by how much a user would actually mind
// losing it: real logged content (especially photos, which can't be
// reconstructed) ranks highest; cosmetic fields like name/style rank
// lowest, since those are the most likely to just be truncation noise
// (see NAME_MAX_LENGTH/STYLE_MAX_LENGTH clamping in normalizeTank) rather
// than a meaningful difference.
export function computeImportDiff(existing: Tank, incoming: Tank): ImportDiffEntry[] {
  const diffs: ImportDiffEntry[] = [];
  const versus = (existingN: number, incomingN: number, word: string) => {
    const delta = incomingN - existingN;
    return delta > 0
      ? `Incoming has ${Math.abs(delta)} more ${word}${Math.abs(delta) === 1 ? '' : 's'}`
      : `Your version has ${Math.abs(delta)} more ${word}${Math.abs(delta) === 1 ? '' : 's'}`;
  };

  // --- High: logged content, especially photos ---
  const photoCount = (t: Tank) => t.logs.reduce((n, l) => n + (l.photoUrls?.length ?? 0), 0);
  const existingPhotos = photoCount(existing);
  const incomingPhotos = photoCount(incoming);
  if (existingPhotos !== incomingPhotos) {
    diffs.push({ tier: 'high', label: `${versus(existingPhotos, incomingPhotos, 'log photo')}` });
  }
  if (existing.logs.length !== incoming.logs.length) {
    diffs.push({ tier: 'high', label: versus(existing.logs.length, incoming.logs.length, 'log entry') });
  } else if (JSON.stringify(existing.logs) !== JSON.stringify(incoming.logs)) {
    diffs.push({
      tier: 'high',
      label: 'Log entries have different content (same count)',
      detail: firstItemSnapshot(existing.logs, incoming.logs, (l) => l.title || l.weekLabel || 'entry'),
    });
  }

  if (existing.roster.length !== incoming.roster.length) {
    diffs.push({ tier: 'high', label: versus(existing.roster.length, incoming.roster.length, 'roster item') });
  } else if (JSON.stringify(existing.roster) !== JSON.stringify(incoming.roster)) {
    diffs.push({
      tier: 'high',
      label: 'Roster items have different content (same count)',
      detail: firstRosterSnapshot(existing.roster, incoming.roster),
    });
  }

  const doneCount = (t: Tank) => t.checklist.filter((c) => c.done).length;
  if (existing.checklist.length !== incoming.checklist.length) {
    diffs.push({ tier: 'high', label: versus(existing.checklist.length, incoming.checklist.length, 'checklist step') });
  } else if (doneCount(existing) !== doneCount(incoming)) {
    diffs.push({
      tier: 'high',
      label: `Checklist progress differs (${doneCount(existing)} vs ${doneCount(incoming)} steps done)`,
    });
  }

  // --- Medium: structural, but not irreplaceable content ---
  if (existing.schedule.length !== incoming.schedule.length) {
    diffs.push({ tier: 'medium', label: versus(existing.schedule.length, incoming.schedule.length, 'schedule item') });
  }
  if (JSON.stringify(existing.customFields) !== JSON.stringify(incoming.customFields)) {
    diffs.push({ tier: 'medium', label: 'Custom tracking fields differ' });
  }
  if (existing.waterType !== incoming.waterType) {
    diffs.push({ tier: 'medium', label: `Water type differs (${existing.waterType} vs ${incoming.waterType})` });
  }

  // --- Low: cosmetic — includes the common case of a name/style diff
  // that's really just NAME_MAX_LENGTH/STYLE_MAX_LENGTH truncation from
  // an older, pre-clamping backup. Still shown if it's the only real
  // difference, just never crowds out something more important.
  if (existing.name !== incoming.name) {
    diffs.push({ tier: 'low', label: `Name differs ("${existing.name}" vs "${incoming.name}")` });
  }
  if (existing.style !== incoming.style) {
    diffs.push({ tier: 'low', label: 'Style/description differs' });
  }
  if (existing.dimensions !== incoming.dimensions) {
    diffs.push({ tier: 'low', label: 'Dimensions differ' });
  }
  if (existing.sizeGallons !== incoming.sizeGallons) {
    diffs.push({
      tier: 'low',
      label: `Tank size differs (${existing.sizeGallons} vs ${incoming.sizeGallons} gal)`,
    });
  }

  return diffs;
}

const DIFF_TIER_ORDER: Record<ImportDiffTier, number> = { high: 0, medium: 1, low: 2 };

// Picks the top `max` diffs by tier (ties keep their original order) and
// reports the real overflow count — the full list is always computed
// first, so this is never a guess dressed up as "and more…".
export function topImportDiffs(
  diffs: ImportDiffEntry[],
  max = 3
): { shown: ImportDiffEntry[]; overflow: number } {
  const sorted = [...diffs].sort((a, b) => DIFF_TIER_ORDER[a.tier] - DIFF_TIER_ORDER[b.tier]);
  return { shown: sorted.slice(0, max), overflow: Math.max(0, sorted.length - max) };
}

export function loadData(): AppData {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return seedData;
    const { data, warnings } = normalizeAppData(JSON.parse(raw));
    if (warnings.length) console.warn('Tank Tracker: data normalized on load —', warnings);
    return data;
  } catch {
    return seedData;
  }
}

export function saveData(data: AppData): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  } catch (err) {
    console.error('Failed to save — storage may be full', err);
  }
}

function slugify(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

// Shared by exportData() (file download) and Google Drive upload — same
// formatting regardless of destination.
export function serializeBackup(data: AppData): string {
  return JSON.stringify(data, null, 2);
}

export function exportData(data: AppData, activeTankName?: string, noImages?: boolean): void {
  const blob = new Blob([serializeBackup(data)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  const date = new Date().toISOString().split('T')[0];
  // Named after whichever tank is active at export time, purely so
  // exporting multiple tanks on the same day doesn't produce identically-
  // named files — the export itself still always contains every tank.
  const prefix = activeTankName ? `${slugify(activeTankName)}-` : '';
  const suffix = noImages ? '-no-images' : '';
  a.href = url;
  a.download = `${prefix}tank-tracker-backup${suffix}-${date}.json`;
  a.click();
  URL.revokeObjectURL(url);
}

// Shared by importData() (file picker) and Google Drive download — same
// validation and normalization regardless of how the JSON text arrived, so
// the two entry points can never quietly drift apart from each other.
export function parseBackupJson(jsonText: string): { data: AppData; warnings: string[] } {
  const parsed = JSON.parse(jsonText);
  if (!parsed.tanks || !Array.isArray(parsed.tanks)) {
    throw new Error('File does not look like a tank tracker backup');
  }
  return normalizeAppData(parsed);
}

export function importData(file: File): Promise<{ data: AppData; warnings: string[] }> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      try {
        resolve(parseBackupJson(reader.result as string));
      } catch (err) {
        reject(err);
      }
    };
    reader.onerror = () => reject(new Error('Could not read file'));
    reader.readAsText(file);
  });
}

export function resizeImageToBase64(file: File, maxDim = 1200, quality = 0.82): Promise<string> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const reader = new FileReader();
    reader.onload = () => {
      img.onload = () => {
        let { width, height } = img;
        if (width > maxDim || height > maxDim) {
          const scale = maxDim / Math.max(width, height);
          width *= scale;
          height *= scale;
        }
        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        if (!ctx) return reject(new Error('Canvas not supported'));
        ctx.drawImage(img, 0, 0, width, height);
        resolve(canvas.toDataURL('image/jpeg', quality));
      };
      img.onerror = () => reject(new Error('Could not load image'));
      img.src = reader.result as string;
    };
    reader.onerror = () => reject(new Error('Could not read file'));
    reader.readAsDataURL(file);
  });
}