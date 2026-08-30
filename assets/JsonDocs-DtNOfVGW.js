import{h as e,n as t,p as n,r,s as i,t as a,v as o}from"./index-CkiJzXrh.js";var s=o(e(),1),c=`# Tank Tracker — AI Quickstart & Import Guide

This document is written for AI assistants helping someone plan or manage an
aquarium using this app. It has two jobs: give you real, current context on
everything the site can do (so you can talk about it accurately instead of
guessing), and define the JSON format used by the app's import feature, so
you can generate a valid, importable file from a user's build plan, however
detailed or informal that plan is. The user will import the resulting file
directly — no other setup needed, even as a first-time user of the site with
no existing tanks.

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
- Tracks a tank from the moment it's still just an idea — before purchase,
  before setup, before a single water test — not only after the tank is
  already running, which is where most tank-logging tools start. Worth
  leading with when explaining the site to a first-time user (see below):
  it's the thing most distinguishes this from a typical parameter logger.
- No account, no sign-up, fully client-side by default — everything lives
  in the browser's local storage. Two narrow, explicit exceptions to
  "nothing leaves the browser": an optional one-click Google Drive
  backup/restore that only ever runs when the user clicks it (see
  Backup / Import below), and lightweight page-view analytics
  (GoatCounter) — no cookies, no individual or cross-session tracking, no
  fingerprinting, nothing tied to a person; it only counts how many views
  each page gets in aggregate. If asked whether the site "tracks" users,
  this is the honest, complete answer — not "no tracking at all."
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
- "Copy concept image prompt" (two variants — simple and detailed):
  assembles the tank's real roster data (hardscape, substrate, plants,
  livestock, style, dimensions) into a ready-to-paste prompt for whatever
  AI image tool the user already has, so they can visualize a build
  before buying anything. Same handoff pattern as the Compatibility
  page's research prompt below — the app never calls an image API
  itself, it only assembles the prompt from real data. The simple
  variant deliberately omits each item's free-text \`detail\` field
  (husbandry/procurement notes, not visual information) to avoid noisy
  or contradictory prompts; the detailed variant includes it for anyone
  who wants that extra context anyway.

**Roster**
- Every physical thing going into the tank — livestock, plants,
  hardscape, substrate, equipment — tracked through a sourcing pipeline:
  idea → wishlist → ordered → arrived → acclimating → established.
- Cost tracking per item, shown as two numbers derived from the same
  \`cost\` field rather than two separately-entered values: Estimate (every
  wishlist-or-later item, "idea" excluded since it's undecided) and
  Actual (the subset of those already at ordered-or-later). Once every
  budgeted item has reached ordered-or-later, the two numbers are
  identical and the display collapses to one merged "Total cost" —
  recomputed fresh each time, so adding a new wishlist item later
  automatically splits it back into two numbers.
- Filterable by category and sortable (default add-order, by category,
  or by sourcing status) — display-only controls, no effect on the
  underlying data or the import/export format below.

**Compatibility** *(internally still called Targets in the codebase/URL — \`/targets\` — only the user-facing label changed)*
- Per livestock/plant roster item: optional researched water-parameter
  target ranges, plus dedicated Mouth Size (mm) and Adult Size (in)
  fields for livestock, plus free-form traits (temperament, fin-nipper,
  long/flowing fins, min group size, min tank length/width, eats/uproots
  plants, light needs, growth rate, etc. — presets offered, or fully
  custom).
- The tank-wide target for each water parameter is computed automatically
  as the intersection of every item's own range — the tightest min and
  the tightest max across everything in the roster. If two items'
  requirements don't overlap at all, that's surfaced as a genuine,
  honestly-computed conflict, not a guess.
- Compares that computed range against the tank's most recent logged
  reading and flags it in/out of range — distinct "no targets set" vs.
  "no data logged yet" vs. "in range" vs. "out of range" vs. "conflict"
  states, since collapsing any of those into a false all-clear would be
  worse than showing nothing.
- Predation risk is computed automatically and predator-centric, not
  species-tagged: there's no "is this a shrimp" field anywhere, so every
  livestock item's Mouth Size is compared against every other livestock
  item's Adult Size across the whole roster. An item whose mouth is big
  enough to threaten something smaller gets flagged ⚠ Predation Risk,
  expandable to the specific list of what it endangers. A per-item
  override excludes a false positive (e.g. Otocinclus) from the check
  entirely.
- Four more checks run the same way — silent unless the relevant trait(s)
  are actually set, never inferred or defaulted:
  - **Fin-nipping risk** — pairwise, same shape as predation: any item
    with Fin Nipper = true flagged alongside any item with Long/Flowing
    Fins = true, expandable to the specific list.
  - **Below minimum group size** — an item's own \`quantity\` compared
    against its Min Group Size trait. Self-referential, not pairwise — a
    shoaling species kept alone is a compatibility problem with itself.
  - **Plant herbivory risk** — any item with Eats/Uproots Plants = true,
    flagged if the roster has any plant-category item at all (not
    pairwise against a specific plant — there's no "vulnerable to being
    eaten" trait on plants to compare against).
  - **Tank too small (length/width)** — an item's Min Tank Length/Width
    trait compared against the tank's own \`lengthIn\`/\`widthIn\` (see Tank
    object below). Deliberately not derived from tank volume or a
    blanket ratio like "1 inch of fish per gallon" — those break down
    badly for large-bodied species (an oscar or common pleco needs far
    more room than their size alone would suggest under that kind of
    rule), so this stays a real per-species researched number instead.
- No species database, no fetching, nothing fabricated — a "Copy research
  prompt" button per item generates a ready-to-paste research question
  (tuned to the tank's freshwater/saltwater type) for whatever AI the
  user already has; the actual research step is intentionally handed off
  rather than guessed at. Several fields on that prompt ask for a single
  number (mouth size, adult size, min group size, min tank length/width),
  but real sources often report those as a range — the prompt explicitly
  instructs the AI answering it to compute the midpoint and mark it with
  an asterisk, so what comes back reads as an honestly-labeled estimate
  rather than something that looks like one directly-reported fact. If
  you're generating a tank plan and a source you're working from gives a
  range for one of these single-number fields, apply the same rule
  yourself: average it, and say so.
- Filterable to livestock-only or plant-only, and sortable by category
  (toggle which of the two comes first) — same display-only caveat as
  Roster's filters above.

**Build Checklist**
- Ordered setup steps with two kinds of dependencies: \`dependsOn\` (this
  step can't be checked off until another step is) and \`rosterLinks\`
  (this step can't be checked off until a specific roster item reaches a
  given status, e.g. "arrived").
- When a questionnaire produces a roster, the checklist automatically
  gets one "Source X" step per item, each gated on that item reaching
  "arrived" — not hand-written, generated from the actual roster.

**Log**
- A running journal: free-text entries with an optional title, mood
  rating (thriving / stable / watching / concerned — itself trackable
  over time as a chart), water parameter readings, custom field values,
  and photos.
- Not actually weekly, despite the internal field name (\`weekLabel\`,
  unchanged for backward compatibility) — entries can be logged at any
  cadence the user actually wants: daily, sporadic, monthly, whatever.
  The label itself (default \`"Entry N"\`, e.g. "Entry 12") is a plain
  editable text field, not derived from or tied to a real calendar week.
  If generating log-adjacent content (e.g. a schedule referencing "check
  weekly"), that's describing the maintenance cadence, not implying
  anything about how often this tank's owner actually writes log entries.
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
- Completing a task on a day that already has a Log entry
  automatically links the two — the log entry shows what maintenance
  happened that day, without creating a redundant record.

**Parameters (charts)**
- Every numeric water parameter and every numeric/boolean custom field
  charts itself automatically over time from Log entries — no
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
- Export the current data as a JSON file at any time, via a picker: all
  tanks, just the active one, or a specific selection — each with an
  optional toggle to exclude log photos from the file.
- **If you (the AI reading this) are given a full JSON export to analyze
  or edit** — for example, syncing a tank's plan/checklist against an
  updated build document — check whether it contains embedded log photos
  (\`LogEntry.photoUrls\`, base64 data URIs). These are typically the large
  majority of a file's size and cost real, often substantial usage to
  read through, for zero analytical value in a structural review. If the
  file has them and the task doesn't genuinely need to see the photos
  themselves, tell the user to re-export using the "exclude photos"
  toggle instead and share that file — it's still a fully valid,
  re-importable backup, just far smaller.
- Import a JSON file — either a real prior backup, or one generated by an
  AI assistant following this reference — to add tanks without
  overwriting anything already present. Smart deduplication offers
  "replace" vs "keep both" when an imported tank matches an existing one,
  with a diff summarizing roughly what changed. If the imported file has
  no log photos but the existing tank being replaced does, Replace keeps
  the existing photos rather than clearing them — specifically so an
  image-free file (see above) can never accidentally wipe out real
  photos it was never given in the first place.
- Optional Google Drive backup/restore: sign in to back up or restore
  in one click. Both directions are entirely user-triggered — no
  background sync, no auto-upload — specifically so an edit on one
  device can't silently overwrite an unsynced backup from another.
  Restoring runs through the exact same smart-import flow as a manual
  file. Scoped to a single file the app created itself — it can't see
  anything else in the user's Drive.

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
| lengthIn | number | no | Separate from \`dimensions\` above on purpose — that's free text and can't be safely parsed for a number. Only set this if a real length is actually known; leave it out rather than guess from \`dimensions\`. Powers the Compatibility page's minimum-tank-length check |
| widthIn | number | no | Same caveat as \`lengthIn\` — real number only, never inferred |
| style | string | no | e.g. "Low-tech planted tank" |
| startDate | string | no | Leave as \`""\` unless a real date is known |
| waterType | string | recommended | \`"freshwater"\` or \`"saltwater"\`. Set \`"saltwater"\` for any reef/marine/coral plan — this controls which preset custom fields the user is offered (Alkalinity/Calcium/Magnesium/PAR vs. Shrimp Census/Fry Count) and whether Salinity or GH/KH/TDS shows up on the Log and Parameters pages. If omitted, the app defaults it to \`"freshwater"\`, so a saltwater plan that omits this will show the wrong preset fields — don't skip it for reef/marine tanks |
| customFields | array of CustomFieldDef | yes, can be \`[]\` | See below |
| roster | array of RosterItem | yes, can be \`[]\` | See below |
| checklist | array of ChecklistTask | yes, can be \`[]\` | See below |
| logs | array | yes | For a **new** tank plan generated from scratch: always output as \`[]\` — log entries are written by the user later, never generated. If instead you're editing or syncing an **existing** tank that already has real log entries (e.g. updating its plan to match a revised build doc), don't invent new entries and don't touch existing ones unless specifically asked to — but if you do add or edit an entry's \`mood\`, it must be exactly one of \`"thriving"\`, \`"stable"\`, \`"watching"\`, \`"concerned"\` (lowercase, exact match, nothing else) — any other value gets silently stripped on import rather than shown, so an invalid guess is worse than just leaving the field out. Omitting \`mood\` entirely is always valid; it's genuinely optional. Same rule for the optional \`phase\` field — one of \`"planning"\`, \`"hardscaping"\`, \`"cycling"\`, \`"stocking"\`, \`"acclimating"\`, \`"established"\` if set at all, otherwise omit it; don't guess a phase for an entry the user didn't tag themselves. \`additions\` (array of \`{rosterItemId, requiredStatus}\`, same shape as a ChecklistTask's \`rosterLinks\`) is likewise only for entries the user is actually editing, never invented for a from-scratch plan. \`highlightedRosterItemIds\` (array of \`RosterItem.id\` strings) is deliberately independent of \`additions\` — it marks an item as narratively significant to that entry, not that its status changed, and the two don't have to move together. Never infer this from an entry's text; only include it if the user is explicitly flagging which roster items mattered in that entry |
| schedule | array of ScheduleTask | no, can be \`[]\` or omitted | See below — including when/how to handle a requested schedule with no stated cadence |
| milestones | array of Milestone | no, can be \`[]\` or omitted | For a **new** tank plan generated from scratch: always output as \`[]\` — like \`logs\`, these are user-authored moments, never generated. See below |

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

${a.map(e=>`- ${e.label} (${e.type}, ${e.waterType})`).join(`
`)}

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
| waterParamTargets | object, keyed by water param | no | Compatibility page fields — see ParamTarget below. Only meaningful for \`livestock\`/\`plant\` items. **Only include real, researched values** — see the warning under "Generation guidelines" below |
| mouthSizeMm | number | no | Livestock only. Drives the automatic Predation Risk computation — see below |
| adultSizeIn | number | no | Livestock only. Drives the automatic Predation Risk computation — see below |
| predatorRiskOverride | boolean | no | Livestock only. \`true\` excludes this item's mouth size from flagging other, smaller items as at risk (the in-app example is Otocinclus — a moderate mouth size that isn't actually a shrimp predator) |
| traits | array of RosterItemTrait | no | Compatibility page's free-form researched facts (temperament, fin-nipper, light needs, etc.) — see RosterItemTrait below |

### ParamTarget

A researched min/max range for one water parameter, only meaningful on a
\`livestock\`/\`plant\` roster item. Keyed by the same parameter names as
WaterParams (\`temperature\`, \`ph\`, \`gh\`, \`kh\`, \`tds\`, \`salinity\`, etc.):

\`\`\`json
"waterParamTargets": {
  "ph": { "min": 6.5, "max": 7.5 },
  "gh": { "min": 4, "max": 8 }
}
\`\`\`

Either \`min\` or \`max\` alone is valid (e.g. "tolerates up to 78°F" as just
\`{ "max": 78 }\`). The app intersects these across every item that has one
set to compute the tank-wide target per parameter — the tightest min and
tightest max across the whole roster — so a range entered here should be
the actual researched tolerance for that specific species/plant, not a
guess at what the whole tank should be.

### RosterItemTrait

A single free-form researched fact, recorded per item and not aggregated
or computed from — just displayed back to the user for reference:

\`\`\`json
{ "id": "unique-trait-id", "label": "😊 Temperament", "type": "text", "value": "Peaceful, semi-aggressive toward same-species males" }
\`\`\`

| Field | Type | Notes |
|---|---|---|
| id | string | unique within this item |
| label | string | Shown as-is in the UI |
| type | \`"number"\` \\| \`"text"\` \\| \`"boolean"\` | |
| value | number \\| string \\| boolean | Omit if not yet researched — an empty trait is valid and just shows up as unset in the UI |

Reuse these preset labels verbatim when they fit, the same way preset
custom fields work above:

${r.map(e=>`- ${e.label} (${e.type}, ${e.appliesTo} only)`).join(`
`)}

Not limited to these — invent new ones using the same three-type system
when nothing above fits.

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

**Not the same thing as the checklist, even though both support a due
date.** Checklist is one-time build-phase steps (source equipment, build
hardscape, cycle, stock) — that sequence belongs in \`checklist\`, using its
own \`dueDate\` field if specific dates are known, never duplicated into
\`schedule\` as one-off entries. Schedule is for what happens *after* the
build: ongoing maintenance that recurs, or a genuine one-off future
reminder unrelated to setup (e.g. "revisit stocking decision in 3
months"). If every \`schedule\` entry you're about to write is really just
a restated build step with a date attached, that content belongs in
\`checklist\` instead — an empty \`schedule: []\` is correct and expected
for a plan that never mentions any maintenance cadence.

If the user has asked for a schedule but the plan doesn't state a
maintenance cadence, don't resolve that by inventing one *or* by
repurposing checklist steps as schedule entries — ask, the same way you'd
ask about an incomplete stocking list. A reasonable version: *"I can add a
maintenance schedule, but you haven't mentioned how often — want a
standard cadence (weekly water change, etc.) as a starting point, or do
you have specific intervals in mind?"*

| Field | Type | Required | Notes |
|---|---|---|---|
| id | string | yes | unique within this tank |
| label | string | yes | e.g. "Water change", "Dose Bacter AE" |
| detail | string | no | |
| dueDate | string | yes | ISO date (\`YYYY-MM-DD\`) of the first/next occurrence |
| recurrenceDays | number | no | Omit for a one-off reminder. Set to the repeat interval in days (7 for weekly, 14 for biweekly, etc.) |
| endDate | string | no | ISO date. Recurring only — caps how far the series repeats; omit for an indefinitely-repeating reminder. Only include if the plan states a clear end point (e.g. "50% weekly water changes for the first month") |
| done | boolean | no | Only meaningful for one-off tasks; omit or \`false\` for a new plan |

## Milestone

A notable, dated moment in the tank's build (e.g. "Cycling complete," "Founding shrimp added"). **Always output \`[]\` for a new tank plan generated from scratch** — like \`logs\`, these are user-authored moments recording something that actually happened, never generated speculatively for a plan that doesn't exist yet. If editing an existing tank and the user explicitly describes a real event to record, that's the only case where adding one is appropriate.

| Field | Type | Required | Notes |
|---|---|---|---|
| id | string | yes | unique within this tank |
| title | string | yes | e.g. "Cycling complete" |
| description | string | no | Leave out to let the app generate its own fallback text — don't invent a reason for something the user didn't state |
| date | string | yes | ISO date (\`YYYY-MM-DD\`) |
| type | string | yes | One of \`"phase-change"\`, \`"roster-addition"\`, \`"health-event"\`, \`"custom"\` (lowercase, exact match) |
| phase | string | no | Only set when \`type\` is \`"phase-change"\` — same six values as \`LogEntry.phase\` above |
| relatedRosterItemIds | array of string | no | \`RosterItem.id\` values this milestone is about |
| linkedLogEntryId | string | no | A \`LogEntry.id\`, if this milestone is tied to a specific log entry |
| major | boolean | no | Whether this is one of the standout "spine" moments (vs. a real but quieter one) — shown bigger, and in Timeline's horizontal "major milestones" strip. This is a judgment call the app derives automatically from real rules (first livestock item, first-ever item in a non-livestock category, any phase change) for milestones it creates itself — don't guess it for a hand-authored one; leave it omitted/false unless the user explicitly calls something out as a standout moment |

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
  \`recurrenceDays\` set. Don't invent a cadence the plan never mentions —
  and don't fill an empty schedule by repurposing checklist build steps as
  one-off entries instead; see the note under ScheduleTask above. If the
  plan gives that cadence a clear end point (e.g. "weekly for the first
  month, then normal maintenance"), set \`endDate\` accordingly — otherwise
  leave it out so the reminder just repeats indefinitely.

- If part of the plan is an open/undecided item (e.g. "still deciding on a
  centerpiece fish"), include it as a roster item with \`status: "idea"\`
  and a detail note explaining what's undecided — its cost won't count
  toward the total while it stays at that status, so it's safe to include
  even with a rough cost estimate attached.

- **Don't fabricate \`waterParamTargets\`, \`mouthSizeMm\`, \`adultSizeIn\`, or
  \`traits\` values.** These are meant to be genuinely researched facts about
  a specific species or plant, not estimates. If the user's plan already
  states one directly (e.g. "guppies, pH 7-8"), include it. Otherwise leave
  these fields unset on the roster item — that's the expected, common case
  for a fresh import — rather than inventing a plausible-looking range. The
  in-app "Copy research prompt" button on the Compatibility page exists
  specifically to hand that research step to an AI properly, with the
  result reviewed and entered by the user afterward. The one exception:
  if the user explicitly asks you to research and fill these in now, do
  so, and say plainly that the values are from general knowledge and
  should be double-checked, the same way you'd caveat any other factual
  claim.

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
      ],
      "milestones": []
    }
  ]
}
\`\`\`
`,l=i(),u={html:d,json:f};function d(e){let t=/(<\/?[a-zA-Z][\w-]*)|([a-zA-Z-]+)(?==)|("(?:[^"\\]|\\.)*")|(\/?>)/g,n=[],r=0,i;for(;i=t.exec(e);)i.index>r&&n.push({text:e.slice(r,i.index),type:`punct`}),i[1]||i[4]?n.push({text:i[1]??i[4],type:`tag`}):i[2]?n.push({text:i[2],type:`attr`}):i[3]&&n.push({text:i[3],type:`string`}),r=t.lastIndex;return r<e.length&&n.push({text:e.slice(r),type:`punct`}),n}function f(e){let t=/("(?:[^"\\]|\\.)*")(?=\s*:)|("(?:[^"\\]|\\.)*")|(-?\d+\.?\d*)|(\btrue\b|\bfalse\b|\bnull\b)|([{}[\],:])/g,n=[],r=0,i;for(;i=t.exec(e);)i.index>r&&n.push({text:e.slice(r,i.index),type:`punct`}),i[1]?n.push({text:i[1],type:`key`}):i[2]?n.push({text:i[2],type:`string`}):i[3]?n.push({text:i[3],type:`number`}):i[4]?n.push({text:i[4],type:`keyword`}):i[5]&&n.push({text:i[5],type:`punct`}),r=t.lastIndex;return r<e.length&&n.push({text:e.slice(r),type:`punct`}),n}var p={tag:`text-amber`,attr:`text-sand`,key:`text-sand`,string:`text-moss-light`,number:`text-amber`,keyword:`text-amber`,punct:`text-foam-dim`};function m({code:e,language:t=`code`}){let[n,r]=(0,s.useState)(!1),i=u[t];function a(){navigator.clipboard.writeText(e).then(()=>{r(!0),setTimeout(()=>r(!1),2e3)}).catch(()=>{})}return(0,l.jsxs)(`div`,{className:`rounded-lg border border-moss/30 overflow-hidden`,children:[(0,l.jsxs)(`div`,{className:`flex items-center justify-between px-3 py-1.5 bg-deepwater-2 border-b border-moss/20`,children:[(0,l.jsx)(`span`,{className:`font-mono text-[10px] uppercase tracking-wide text-foam-dim`,children:t}),(0,l.jsx)(`button`,{onClick:a,className:`font-mono text-[10px] uppercase tracking-wide text-sand hover:text-amber transition-colors`,children:n?`✓ Copied`:`Copy`})]}),(0,l.jsx)(`pre`,{className:`px-3 py-2.5 bg-deepwater m-0 whitespace-pre-wrap break-words`,children:(0,l.jsx)(`code`,{className:`font-mono text-xs leading-relaxed`,children:e.split(`
`).map((e,t)=>(0,l.jsx)(`div`,{className:`pl-[1.5em] indent-[-1.5em]`,children:e===``?`\xA0`:i?i(e).map((e,t)=>(0,l.jsx)(`span`,{className:p[e.type],children:e.text},t)):(0,l.jsx)(`span`,{className:`text-foam-dim`,children:e})},t))})})]})}function h(e){let t=[],n=/```(\w+)\n([\s\S]*?)```/g,r=0,i;for(;i=n.exec(e);)i.index>r&&t.push({type:`prose`,content:e.slice(r,i.index)}),t.push({type:`code`,language:i[1],content:i[2].replace(/\n$/,``)}),r=n.lastIndex;return r<e.length&&t.push({type:`prose`,content:e.slice(r)}),t}function g(e){let t=e.split(`
`),n=[],r=[],i=0,a=e=>/^\s*\|.*\|\s*$/.test(e),o=e=>/^\s*\|[\s:|-]+\|\s*$/.test(e)&&e.includes(`-`),s=e=>e.trim().replace(/^\|/,``).replace(/\|$/,``).split(/(?<!\\)\|/).map(e=>e.trim().replace(/\\\|/g,`|`));function c(){r.length>0&&(n.push({type:`text`,content:r.join(`
`)}),r=[])}for(;i<t.length;)if(a(t[i])&&i+1<t.length&&o(t[i+1])){c();let e=s(t[i]);i+=2;let r=[];for(;i<t.length&&a(t[i]);)r.push(s(t[i])),i++;n.push({type:`table`,headers:e,rows:r})}else r.push(t[i]),i++;return c(),n}var _=h(c);function v(){let[e,r]=(0,s.useState)(`ai`),[i,a]=(0,s.useState)(!1),[o,u]=(0,s.useState)(null);async function d(){try{await navigator.clipboard.writeText(c),a(!0),setTimeout(()=>a(!1),2e3)}catch{u(`Could not copy automatically — select the text below and copy manually.`)}}return(0,l.jsxs)(`div`,{className:`min-h-screen bg-deepwater text-foam font-body`,children:[(0,l.jsxs)(`header`,{className:`border-b border-moss/30 px-6 md:px-10 py-5 flex flex-col md:flex-row md:items-center md:justify-between gap-4`,children:[(0,l.jsxs)(`div`,{children:[(0,l.jsx)(n,{to:`/`,className:`text-xs text-foam-dim hover:text-amber font-mono`,children:`← Back`}),(0,l.jsx)(`h1`,{className:`font-display text-3xl md:text-4xl font-semibold mt-1`,children:e===`ai`?`AI Quickstart & Import Guide`:`Features Guide`})]}),e===`ai`&&(0,l.jsx)(`button`,{onClick:d,className:`btn btn-primary self-start`,children:i?`✓ Copied`:`Copy full documentation`})]}),(0,l.jsxs)(`div`,{className:`px-6 md:px-10 pt-6 flex gap-2`,children:[(0,l.jsx)(x,{active:e===`ai`,onClick:()=>r(`ai`),label:`AI Quickstart`}),(0,l.jsx)(x,{active:e===`features`,onClick:()=>r(`features`),label:`Features Guide`})]}),(0,l.jsx)(`main`,{className:`px-6 md:px-10 py-8 max-w-4xl mx-auto space-y-6`,children:e===`ai`?(0,l.jsxs)(l.Fragment,{children:[(0,l.jsx)(`div`,{className:`card p-5`,children:(0,l.jsxs)(`p`,{className:`text-sm text-foam-dim leading-relaxed`,children:[`This page is written for an AI assistant, and gives it real context on this whole site — not just how to generate an import file. Copy the whole thing above and paste it into a chat with an AI, along with your own aquarium build plan (in whatever level of detail you have). It can talk through what the app actually does, help you think through a plan, and — once you're ready — generate a file you bring in from the`,` `,(0,l.jsx)(`span`,{className:`text-foam`,children:`New Tank`}),` screen's`,` `,(0,l.jsx)(`span`,{className:`text-foam`,children:`"Import a tank from a backup file"`}),` section — works even as a brand-new user with no existing tanks.`]})}),(0,l.jsx)(`div`,{className:`card p-5 space-y-4`,children:_.map((e,t)=>e.type===`code`?(0,l.jsx)(m,{language:e.language,code:e.content},t):(0,l.jsx)(y,{content:e.content},t))})]}):(0,l.jsx)(S,{})}),(0,l.jsx)(t,{message:o,onDismiss:()=>u(null)})]})}function y({content:e}){return(0,l.jsx)(l.Fragment,{children:g(e).map((e,t)=>e.type===`table`?(0,l.jsx)(b,{segment:e},t):e.content.trim()&&(0,l.jsx)(`pre`,{className:`whitespace-pre-wrap font-mono text-xs leading-relaxed text-foam-dim overflow-x-auto`,children:e.content},t))})}function b({segment:e}){return(0,l.jsx)(`div`,{className:`overflow-x-auto`,children:(0,l.jsxs)(`table`,{className:`w-full text-xs border-collapse`,children:[(0,l.jsx)(`thead`,{children:(0,l.jsx)(`tr`,{className:`border-b border-moss/30`,children:e.headers.map((e,t)=>(0,l.jsx)(`th`,{className:`text-left font-mono uppercase tracking-wide text-sand px-2 py-1.5 whitespace-nowrap`,children:e},t))})}),(0,l.jsx)(`tbody`,{children:e.rows.map((e,t)=>(0,l.jsx)(`tr`,{className:`border-b border-moss/10`,children:e.map((e,t)=>(0,l.jsx)(`td`,{className:`align-top px-2 py-1.5 text-foam-dim`,children:e},t))},t))})]})})}function x({active:e,onClick:t,label:n}){return(0,l.jsx)(`button`,{onClick:t,className:`pill py-1.5 px-3 text-xs shrink-0 whitespace-nowrap ${e?`bg-moss text-foam`:`bg-deepwater text-foam-dim hover:text-foam border border-moss/30`}`,children:n})}function S(){return(0,l.jsxs)(`div`,{className:`space-y-4`,children:[(0,l.jsx)(`p`,{className:`text-sm text-foam-dim leading-relaxed`,children:`A few real features live on specific pages and are easy to miss unless you happen to land there. Collected here in one place.`}),(0,l.jsx)(w,{icon:`🖼`,title:`Concept image prompt`,location:`Dashboard`,to:`/`,children:`Assembles this tank's real roster (hardscape, substrate, plants, livestock), style, and dimensions into a ready-to-paste prompt for whatever AI image tool you already use — a way to visualize a build before buying anything. The app never calls an image API itself, only assembles the prompt from real data.`}),(0,l.jsx)(w,{icon:`📋`,title:`Research prompt`,location:`Compatibility`,to:`/targets`,children:`Hands the actual research step to whatever AI you use, for the tank overall or for a single roster item — asks explicitly for real, sourced water-parameter ranges rather than a fabricated single number, and for an averaged, clearly-marked estimate wherever a source is likely to report a range instead of one figure.`}),(0,l.jsx)(w,{icon:`📈`,title:`Progress check prompt`,location:`Timeline`,to:`/timeline`,children:`Assembles this tank's real logged history — phase durations, the major-milestone list, and actual entry content grounded to whatever produced a milestone — into a prompt for an honest progress check from an AI, not just a recap of the original plan.`}),(0,l.jsxs)(w,{icon:`📋`,title:`Tidemark Widget`,children:[(0,l.jsx)(`p`,{className:`mb-3`,children:`Embeds this tank's name, age, most relevant schedule task, and last log entry on another page you control, live and refreshed on load. Chrome is the browser this is expected to work in reliably; Safari has real, accepted limitations around the storage access this needs.`}),(0,l.jsx)(m,{language:`html`,code:C})]})]})}var C=`<iframe src="https://ettran777.github.io/aquariumTool/#/widget" style="border:0;width:300px;height:220px;overflow:hidden" loading="lazy"></iframe>`;function w({icon:e,title:t,location:r,to:i,children:a}){return(0,l.jsxs)(`div`,{className:`card p-5`,children:[(0,l.jsxs)(`div`,{className:`flex items-center justify-between gap-3 mb-2`,children:[(0,l.jsxs)(`p`,{className:`font-display text-lg font-semibold`,children:[e,` `,t]}),r&&i&&(0,l.jsxs)(n,{to:i,className:`text-xs font-mono text-sand hover:text-amber whitespace-nowrap`,children:[r,` →`]})]}),(0,l.jsx)(`div`,{className:`text-sm text-foam-dim leading-relaxed`,children:a})]})}export{v as default};