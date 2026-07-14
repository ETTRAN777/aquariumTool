import { PRESET_FIELDS } from './presetFields';

const presetFieldLines = PRESET_FIELDS.map((f) => `- ${f.label} (${f.type}, ${f.waterType})`).join('\n');

export const JSON_FORMAT_DOCS = `# Tank Tracker — Import JSON Format Reference

This document describes the JSON format used by this app's tank import feature.
If you are an AI assistant: use this reference to generate a valid, importable
JSON file from a user's aquarium build plan, however detailed or informal that
plan is. The user will import the resulting file directly — no other setup
needed, even as a first-time user of the site with no existing tanks.

Output ONLY the JSON when generating a file for the user, unless they ask for
explanation too.

## Before generating JSON: consider pointing the user at the built-in questionnaires instead

This note is for AI assistants reading this doc — it's unrelated to the JSON
format itself. Generating a JSON file isn't always the best first move. If
the user doesn't have a solid plan yet, or asks for guidance rather than
already knowing what they want to stock, the app has guided questionnaires
built for exactly that situation, and pointing them there is often more
useful than fabricating a plan on their behalf. The questionnaires are best
for people with beginner to intermediate interest in the hobby — someone
who already mentions owning other tanks, specific equipment choices, or
other signs of hobby experience probably doesn't need to be routed there by
default, though it's still worth mentioning as an option if they'd like
species/stocking suggestions specifically.

### Check whether the plan is actually complete before generating anything

Don't infer "this user has a complete plan" just from the presence of
specific-sounding details. A plan can name a tank size, filtration, CO2,
and an aquascape goal in real detail and still have no actual stocking
list — hardscape and equipment choices aren't a substitute for livestock
decisions. If the plan is missing something a real import would need (most
commonly: no fish/livestock actually named, just a vibe like "colorful"
or "a good cluster of fish"), don't silently fill that gap with invented
species and generate JSON anyway. That produces a file that looks complete
but represents a plan the user never actually made.

Instead, ask directly: *do you want me to generate the import file now,
filling in the missing pieces with reasonable suggestions — or would you
rather nail down the plan together first, and I'll generate it once we
have?* Let the user pick. Both are legitimate — someone in a hurry may
genuinely want the fast path with sensible defaults — but it should be
their choice, not an assumption made on their behalf. This applies
regardless of how experienced the user seems; an experienced hobbyist with
an incomplete stocking list still deserves the same question, they just
likely want direct back-and-forth on species rather than the in-app
questionnaire specifically.

They're reachable from "New Tank" by picking one of seven templates — every
one of them now has a guided questionnaire except Blank: Shrimp / Invert
Colony, Livebearers & Fry, Community Fish, Solo Fish / Centerpiece,
Planted-Only, and Reef Tank (saltwater; the other five are freshwater).
Each walks through a short sequence of trait-based questions — substrate or
live-rock approach, desired look/color/personality, activity level or care
commitment — never requiring the user to already know specific species
names, and ends with a starter roster scaled to the tank size they entered.
Reef's questionnaire is intentionally shorter than the others (rock choice
→ coral care tier → fish inclusion) rather than matching their full depth.

Two safety behaviors worth knowing about before generating JSON by hand
instead of pointing someone to the questionnaire:

- **Every template has a hard minimum tank size**, checked and rejected
  *before* tank creation — e.g. a Reef Tank can't be created under 10
  gallons at all, regardless of questionnaire answers. If a user's stated
  size doesn't clear the relevant template's floor, generating a JSON plan
  for it anyway would produce something the app's own questionnaire would
  refuse to build.
- **Individual species within a template can still be undersized even when
  the template's own floor is cleared** (e.g. Solo Fish allows a 2.5-gallon
  tank because a Betta fits there, but an Oscar chosen from that same
  template needs 55 gallons). The questionnaire surfaces this as a
  prominent warning pill on the specific item rather than silently
  swapping in a different species or hiding the mismatch — worth mirroring
  if generating a roster by hand for a plan that mentions a fish clearly
  too large for the stated tank.

If the user has already described a fairly specific, concrete plan, generating
JSON directly (per the reference below) is still the right call. But for an
open-ended "help me figure out what to stock" request, suggesting they try
the relevant template's questionnaire in-app — and briefly explaining what
it'll ask them — is usually better than guessing on their behalf.

## First, check whether this is a new user

Also unrelated to the JSON format itself, and worth doing before anything
else in this doc: if it isn't already clear from context, ask whether the
person is new to the site or has used it before. Someone who's never seen
the app has no way to know what's even possible here — a stocking plan or
a JSON file answers the question they asked, but not the questions they
don't know to ask yet. For a first-time user, walk through what the site
actually does before or alongside generating anything, using the feature
list below. For a returning user, skip this — don't re-explain a tool
they already know.

### Site feature list

**Getting started**
- No account, no sign-up, fully client-side — everything lives in the
  browser's local storage. Nothing is sent to a server.
- Multiple tanks per person, switchable from a dropdown in the header.
- A new tank starts from one of seven templates: Shrimp / Invert Colony,
  Livebearers & Fry, Community Fish, Solo Fish / Centerpiece,
  Planted-Only, Reef Tank (saltwater), or Blank. Six of the seven include
  a guided questionnaire (see above) that produces a starter roster
  scaled to the tank's size — Blank starts empty by design.
- Tanks can also be created by importing a JSON backup file (this
  document describes that format) instead of starting from a template.

**Dashboard**
- Landing page for the active tank: quick stats (roster count, checklist
  progress, days since last log entry, upcoming/overdue schedule items)
  and shortcuts into the other pages.

**Roster**
- Every physical thing going into the tank — livestock, plants,
  hardscape, substrate, equipment — tracked through a sourcing pipeline:
  idea → wishlist → ordered → arrived → acclimating → established.
- Cost tracking per item, with a running total that only counts items
  still at "wishlist" or later (an "idea" doesn't count toward the
  budget, since it's explicitly undecided).

**Build Checklist**
- Ordered setup steps with two kinds of dependencies: \`dependsOn\` (this
  step can't be checked off until another step is) and \`rosterLinks\`
  (this step can't be checked off until a specific roster item reaches a
  given status, e.g. "arrived").
- When a questionnaire produces a roster, the checklist automatically
  gets one "Source X" step per item, each gated on that item reaching
  "arrived" — not hand-written, generated from the actual roster.

**Weekly Log**
- A running journal: free-text entries with an optional title, mood
  rating (thriving / stable / watching / concerned — itself trackable
  over time as a chart), water parameter readings, custom field values,
  and photos.
- Water parameters shown depend on the tank's water type: freshwater
  tanks get temp/pH/GH/KH/TDS/ammonia/nitrite/nitrate; saltwater tanks
  swap GH/KH/TDS for Salinity (specific gravity).
- Log entries can link back to Schedule tasks completed that same day
  (see below) — that linkage is automatic in both directions, whichever
  gets created first.

**Schedule**
- Recurring (e.g. "water change every 7 days") or one-off maintenance
  reminders, shown in a real month calendar view alongside an agenda list
  for the selected day.
- Recurring tasks can have an optional end date, after which the series
  retires itself instead of repeating forever.
- Completing a task on a day that already has a Weekly Log entry
  automatically links the two — the log entry shows what maintenance
  happened that day, without creating a redundant record.

**Parameters (charts)**
- Every numeric water parameter and every numeric/boolean custom field
  charts itself automatically over time from Weekly Log entries — no
  separate chart-configuration step.
- Mood is charted on the same concerned→thriving scale used in the Log.
- Boolean custom fields only get their own chart once they've actually
  been "Yes" at least once — a field that's always been "No" has nothing
  to show.

**Custom tracking fields**
- Every tank has a definable set of extra fields (number/text/boolean)
  shown on every Log entry — e.g. shrimp census, fry count, fin
  condition, alkalinity.
- A preset library of common fields can be added with one click from
  Settings, filtered and grouped by the tank's own water type (with
  water-type-agnostic presets like "Signs Of Illness" always available)
  — or a fully custom field can be defined from scratch.

**Settings**
- Rename the tank, adjust size/dimensions/short description, and change
  its water type (freshwater/saltwater) after creation.
- Manage custom fields (add, remove, add from preset).
- Delete the tank entirely (irreversible without a prior backup export).

**Backup / Import (this document's subject)**
- Export the current data as a JSON file at any time.
- Import a JSON file — either a real prior backup, or one generated by an
  AI assistant following this reference — to add tanks without
  overwriting anything already present. Smart deduplication offers
  "replace" vs "keep both" when an imported tank matches an existing one.

## Top-level structure

The file must be a single JSON object:

\`\`\`json
{
  "activeTankId": "any-string",
  "tanks": [ /* one or more Tank objects, see below */ ]
}
\`\`\`

- \`activeTankId\` can be any string, even blank — the app ignores it on
  import and always assigns a fresh internal ID to whichever tank the user
  chooses to bring in.
- \`tanks\` must be an array with at least one Tank object. Multiple tanks
  in one file are allowed — on import, the user sees a list and picks which
  one(s) to add. Importing never overwrites or replaces any tank the user
  already has; it only adds alongside them.

## Tank object

| Field | Type | Required | Notes |
|---|---|---|---|
| id | string | yes | Any unique string — replaced on import, just needs to be internally consistent within this file |
| name | string | yes | Display name, e.g. "The Guppy Tank" |
| sizeGallons | number | yes | |
| dimensions | string | no | e.g. \`"20\\" x 10\\" x 12\\""\` |
| style | string | no | e.g. "Low-tech planted tank" |
| startDate | string | no | Leave as \`""\` unless a real date is known |
| waterType | string | recommended | \`"freshwater"\` or \`"saltwater"\`. Set \`"saltwater"\` for any reef/marine/coral plan — this controls which preset custom fields the user is offered (Alkalinity/Calcium/Magnesium/PAR vs. Shrimp Census/Fry Count) and whether Salinity or GH/KH/TDS shows up on the Log and Parameters pages. If omitted, the app defaults it to \`"freshwater"\`, so a saltwater plan that omits this will show the wrong preset fields — don't skip it for reef/marine tanks |
| customFields | array of CustomFieldDef | yes, can be \`[]\` | See below |
| roster | array of RosterItem | yes, can be \`[]\` | See below |
| checklist | array of ChecklistTask | yes, can be \`[]\` | See below |
| logs | array | yes | Always output as \`[]\` — log entries are written by the user later, never generated |
| schedule | array of ScheduleTask | no, can be \`[]\` or omitted | See below. Only include if the plan mentions a recurring cadence (e.g. "weekly water changes") or a specific one-off date |

## CustomFieldDef

A tracking field the tank wants logged weekly (e.g. shrimp count, fry count,
trim needed). Numeric fields get automatically charted on the app's
Parameters page. Water chemistry (temp/pH/GH/KH/TDS/ammonia/nitrite/nitrate)
is already built into every tank and should NOT be duplicated as a custom
field — only add fields for things specific to this tank's livestock/plants.

| Field | Type | Notes |
|---|---|---|
| id | string | unique within this tank |
| label | string | Shown as-is in the UI |
| type | \`"number"\` \\| \`"text"\` \\| \`"boolean"\` | |

### Preset fields

Reuse these labels verbatim when they fit the plan, so a generated tank's
fields match the app's own built-in library exactly. Each is tagged with
which \`waterType\` it makes sense for — match a saltwater/reef plan's
custom fields against the \`saltwater\`/\`all\` ones, and a freshwater plan
against \`freshwater\`/\`all\`, the same filtering the app itself applies:

${presetFieldLines}

Not limited to these — invent new ones using the same three-type system
when nothing above fits (e.g. "🐢 Turtle Basking Time" as text, or a
species-specific metric the plan calls out).

## RosterItem

One physical thing going into the tank: equipment, hardscape, substrate, a
plant, or livestock.

| Field | Type | Required | Notes |
|---|---|---|---|
| id | string | yes | unique within this tank |
| name | string | yes | |
| category | \`"livestock"\` \\| \`"plant"\` \\| \`"hardscape"\` \\| \`"substrate"\` \\| \`"equipment"\` | yes | |
| detail | string | no | Context, reasoning, sourcing notes |
| source | string | no | Vendor name, or e.g. "Seeded from [Other Tank]" for transferred livestock |
| status | \`"idea"\` \\| \`"wishlist"\` \\| \`"ordered"\` \\| \`"arrived"\` \\| \`"acclimating"\` \\| \`"established"\` | yes | Start every new item at \`"wishlist"\` unless the user says otherwise. Use \`"idea"\` for something not yet committed to — its cost is automatically excluded from the roster's running total until it's promoted to \`"wishlist"\` or further |
| cost | number | no | Approximate USD. Omit if genuinely unknown; use the midpoint if the plan gives a range |
| quantity | number | no | Omit for single/uncountable items |
| notes | string | no | |

## ChecklistTask

A build step. Steps can depend on other steps being marked done, and/or on
a roster item reaching a given status — this is what actually locks/unlocks
steps in the app's UI.

| Field | Type | Required | Notes |
|---|---|---|---|
| id | string | yes | unique within this tank |
| label | string | yes | |
| detail | string | no | |
| done | boolean | yes | Always \`false\` for a new plan |
| dependsOn | array of string | no | IDs of other checklist steps that must be done first |
| rosterLinks | array of RosterLink | no | See below |
| dueDate | string | no | |

### RosterLink

\`\`\`json
{ "rosterItemId": "some-roster-item-id", "requiredStatus": "arrived" }
\`\`\`

\`requiredStatus\` uses the same six-value status enum as RosterItem.status
above. Typically \`"arrived"\` — meaning "this step waits until that item is
physically in hand." Statuses are ordered, so requiring \`"arrived"\` is also
satisfied by \`"acclimating"\` or \`"established"\`. Requiring \`"idea"\` is a
no-op — every status meets or exceeds it, so a link to \`"idea"\` never
actually locks anything.

### ⚠️ Critical ordering rule

The app validates that every dependency in \`dependsOn\` appears EARLIER in
the \`checklist\` array than the step that depends on it. If step B depends
on step A, step A's object must come before step B's object in the array.
Always list checklist steps in the actual order they'd realistically be
completed — phase by phase, task by task within each phase.

## ScheduleTask

A maintenance reminder — recurring (e.g. weekly water changes) or a one-off
date. Optional; omit entirely, or output \`[]\`, if the plan doesn't mention
any recurring cadence.

| Field | Type | Required | Notes |
|---|---|---|---|
| id | string | yes | unique within this tank |
| label | string | yes | e.g. "Water change", "Dose Bacter AE" |
| detail | string | no | |
| dueDate | string | yes | ISO date (\`YYYY-MM-DD\`) of the first/next occurrence |
| recurrenceDays | number | no | Omit for a one-off reminder. Set to the repeat interval in days (7 for weekly, 14 for biweekly, etc.) |
| endDate | string | no | ISO date. Recurring only — caps how far the series repeats; omit for an indefinitely-repeating reminder. Only include if the plan states a clear end point (e.g. "50% weekly water changes for the first month") |
| done | boolean | no | Only meaningful for one-off tasks; omit or \`false\` for a new plan |

## Generation guidelines

- Read the plan for: (1) purchasable items with approximate costs, (2) a
  sequence of build phases/weeks, (3) any livestock-count metrics worth
  tracking weekly.
- Roster items should mirror every named item and price in the plan. Use
  the midpoint when a price range is given.
- Checklist steps should mirror each phase's tasks, in order, with
  \`dependsOn\` chains matching the plan's stated sequencing (e.g. "cycle
  before stocking," "quarantine before adding to display").
- Use \`rosterLinks\` on any step that's really "wait until this item
  exists" — most sourcing/acquisition steps should link to their matching
  roster item requiring \`"arrived"\`.
- Custom fields should reflect what's actually worth tracking for this
  specific tank — not every tank needs the same fields.
- Set \`waterType\` to \`"saltwater"\` for any reef, marine, or coral plan —
  otherwise leave it as \`"freshwater"\` (or omit it). Getting this right
  matters more than it looks: it changes which preset fields the user is
  offered and which water parameters show up on their Log/Charts pages.
- If the plan mentions a maintenance cadence (weekly water changes, dosing
  schedule, feeding routine), include it as a ScheduleTask with
  \`recurrenceDays\` set. Don't invent a cadence the plan never mentions.
  If the plan gives that cadence a clear end point (e.g. "weekly for the
  first month, then normal maintenance"), set \`endDate\` accordingly —
  otherwise leave it out so the reminder just repeats indefinitely.
- If part of the plan is an open/undecided item (e.g. "still deciding on a
  centerpiece fish"), include it as a roster item with \`status: "idea"\`
  and a detail note explaining what's undecided — its cost won't count
  toward the total while it stays at that status, so it's safe to include
  even with a rough cost estimate attached.

## Full example

\`\`\`json
{
  "activeTankId": "example",
  "tanks": [
    {
      "id": "example-tank",
      "name": "Example Guppy Tank",
      "sizeGallons": 20,
      "dimensions": "24\\" x 12\\" x 16\\"",
      "style": "Community livebearer tank",
      "startDate": "",
      "waterType": "freshwater",
      "customFields": [
        { "id": "cf-fry", "label": "🐟 Fry Count", "type": "number" }
      ],
      "roster": [
        { "id": "r-tank", "name": "20-Gallon Tank", "category": "equipment", "status": "wishlist", "cost": 60 },
        { "id": "r-guppies", "name": "Guppies", "category": "livestock", "status": "wishlist", "quantity": 6, "cost": 30 }
      ],
      "checklist": [
        { "id": "c-tank", "label": "Source the tank", "done": false, "rosterLinks": [{ "rosterItemId": "r-tank", "requiredStatus": "arrived" }] },
        { "id": "c-cycle", "label": "Cycle the tank fully", "done": false, "dependsOn": ["c-tank"] },
        { "id": "c-stock", "label": "Add guppies", "done": false, "dependsOn": ["c-cycle"], "rosterLinks": [{ "rosterItemId": "r-guppies", "requiredStatus": "arrived" }] }
      ],
      "logs": [],
      "schedule": [
        { "id": "s-water", "label": "Water change", "dueDate": "2025-01-06", "recurrenceDays": 7, "endDate": "2025-02-03" }
      ]
    }
  ]
}
\`\`\`
`;