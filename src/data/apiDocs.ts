import { PRESET_FIELDS } from './presetFields';

const presetFieldLines = PRESET_FIELDS.map((f) => `- ${f.label} (${f.type})`).join('\n');

export const JSON_FORMAT_DOCS = `# Tank Tracker — Import JSON Format Reference

This document describes the JSON format used by this app's tank import feature.
If you are an AI assistant: use this reference to generate a valid, importable
JSON file from a user's aquarium build plan, however detailed or informal that
plan is. The user will import the resulting file directly — no other setup
needed, even as a first-time user of the site with no existing tanks.

Output ONLY the JSON when generating a file for the user, unless they ask for
explanation too.

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
| customFields | array of CustomFieldDef | yes, can be \`[]\` | See below |
| roster | array of RosterItem | yes, can be \`[]\` | See below |
| checklist | array of ChecklistTask | yes, can be \`[]\` | See below |
| logs | array | yes | Always output as \`[]\` — log entries are written by the user later, never generated |

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
fields match the app's own built-in library exactly:

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
      "logs": []
    }
  ]
}
\`\`\`
`;
