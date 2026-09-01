# Tank Tracker

A planning-and-tracking platform for freshwater and saltwater/reef aquariums
— half project planner, half weekly journal. Tracks a tank from the moment
it's still just an idea, not only after there's water in it. Works for any
tank: shrimp colonies, livebearers, community fish, a solo betta or cichlid,
planted-only builds, reef tanks, or anything else, since what each tank
tracks is fully customizable.

**[Use it →](https://ETTRAN777.github.io/aquariumTool/)**

## What it does

- **Multi-tank** — track as many tanks as you want, switch between them from
  the header
- **Templates or blank** — start a new tank from a preset (Shrimp/Invert
  Colony, Livebearers & Fry, Community Fish, Solo Fish/Centerpiece,
  Planted-Only, Reef Tank, or Blank), six of which include a guided
  stocking questionnaire that scales results to the tank's size
- **Custom tracking fields** — each tank decides what it logs. A shrimp tank
  might track population and berried females; a guppy tank might track fry
  count and pregnant females; a solo betta might track fin condition. Pick
  from a shared preset library or invent your own — manage these anytime in
  Settings
- **Roster** — every livestock/plant/hardscape item with a sourcing pipeline
  (idea → wishlist → ordered → arrived → acclimating → established). Items
  still at "idea" don't count toward either cost figure, so you can jot down
  something you're still deciding on without it skewing anything. Cost shows
  as two numbers derived from the same field rather than two separate
  entries — an Estimate (everything wishlist-or-later) and an Actual (the
  subset already ordered-or-later) — which collapse into one merged "Total
  cost" once every budgeted item has actually been ordered. Filterable and
  sortable by category or by how far along each item is
- **Compatibility** — researched water-parameter target ranges per
  livestock/plant item, automatically intersected into a tank-wide target
  and checked against your most recent logged reading. Mouth Size and Adult
  Size fields drive an automatic predation-risk flag across the whole
  roster, and four more checks run the same silent-unless-known way:
  fin-nipping risk (pairwise, like predation), below-minimum-group-size
  (a shoaling species checked against its own quantity), plant herbivory
  risk, and tank-too-small warnings against real per-species minimum
  length/width — deliberately not a blanket ratio like "1 inch of fish per
  gallon," since that breaks down badly for large-bodied species. Nothing
  is fetched or fabricated — a "Copy research prompt" button hands the
  actual research step to whatever AI you use, and explicitly asks for an
  averaged, clearly-marked estimate on any field a source is likely to
  report as a range instead of one number
- **Build Checklist** — steps can depend on other steps *or* on a roster item
  reaching a given status (e.g. "install the filter" waits until the filter
  shows "Arrived" on the roster) — fully editable, reorderable, and custom
  steps can be locked behind whatever you choose. Deletions on the roster and
  checklist are click-to-arm (click once, confirm with a second click within
  a few seconds) rather than instant, so a stray click can't wipe something
  out
- **Log** — blog-style entries with water parameters, this tank's
  custom fields, mood tags, and photos. Not actually weekly — despite the
  name it used to have, entries can be logged at whatever cadence
  actually fits (daily, sporadic, monthly), and the entry label itself
  (default "Entry N") is a plain editable text field, not tied to a real
  calendar week. Deleting an entry asks for confirmation first, since
  it's usually the thing with the most effort behind it
- **Schedule** — recurring or one-off maintenance reminders in a real
  calendar view, auto-linked to a Log entry if one already exists for
  that day
- **Parameters** — water chemistry and any numeric custom fields auto-charted
  over time, so you can *see* trends instead of just logging numbers into a
  void
- **Timeline** — a proportional, phase-tagged strip of the whole build
  (planning → hardscaping → cycling → stocking → acclimating →
  established), plus a chronological feed of every log entry and
  milestone together. Milestones are notable, dated moments — some
  auto-derived (a phase change, a roster item's first appearance), some
  hand-recorded, with an optional link back to a specific log entry
- **Story Mode** — a full-screen, tap-through recap of the tank's build,
  closer to Spotify Wrapped than a reading mode: phase pacing, milestone
  highlights, roster items you starred, an overall mood vibe, and a
  health-event acknowledgment if any exist — all built from real data
  already on the tank, gated behind an honest inventory screen for
  tanks that don't have much history yet
- **Embeddable widget** — a small, live status card (tank name, age,
  current phase, next task, last-logged date) you can drop into your
  own personal page or startpage via `<iframe>` — reads live from the
  same browser's Tidemark data, no separate setup
- **Smart import** — bringing in a tank from a backup file checks it against
  what you already have. A genuinely new tank imports normally; an exact
  duplicate is flagged instead of silently cloned; a same-named tank with
  different data (e.g. you logged more since the backup) offers a real
  choice — replace the existing one, or keep both — with a diff showing
  roughly what's changed, prioritized toward the changes that'd actually
  matter to lose (log entries, roster items) over cosmetic ones (name,
  style). If the file being imported has no log photos but your current
  version does, Replace keeps your existing photos rather than clearing
  them — this matters specifically for the export-without-images workflow
  below, so an AI-assisted edit can never accidentally wipe out real
  photos just because the file it worked from never had any.
- **Export, with an image-free option** — the header's Export button opens
  a picker: all tanks, just the active one, or a specific selection, each
  with an optional "exclude photos" toggle. **If you're handing a backup to
  an AI assistant to review or edit** (e.g. syncing a tank's plan against an
  updated build doc), use the image-free export — embedded log photos are
  usually the overwhelming majority of a backup's size and cost real, often
  substantial usage for zero analytical value, since the assistant doesn't
  need to see them to work with the structural data. The exported file is
  still fully valid and re-importable either way; nothing else about the
  data changes.
- **Optional Google Drive backup** — sign in with your own Google account to
  back up or restore your data in one click. Both directions are entirely
  manual — nothing uploads or syncs automatically, ever, so an edit on one
  device can never silently overwrite a backup from another before you've
  had a chance to reconcile them. Restoring runs through the exact same
  smart-import flow as a manual file, and the app can only ever see the
  single backup file it created itself, never anything else in your Drive.
- **AI concept image prompts** — a Dashboard button assembles the tank's
  real roster (hardscape, substrate, plants, livestock, style, dimensions)
  into a ready-to-paste prompt for whatever AI image tool you already use,
  so you can visualize a build before buying anything. Same handoff pattern
  as Compatibility's research prompt — the app never calls an image API
  itself, only assembles the prompt from real data
- **Docs** (`/docs` in the app) — two tabs: an AI Quickstart & Import
  Guide, written so it can be pasted straight into an AI assistant along
  with a build plan to generate an importable file from scratch, even
  for someone who's never used the site before; and a Features Guide,
  written for a person reading it directly, covering Story Mode, the
  Widget, and the AI-handoff prompts (concept image, compatibility
  research, progress check) with a link straight to each one

## Why it's built this way

This is a static site with **no backend** — everything lives in your
browser's `localStorage`, and there's no account or login. One-click JSON
export/import handles backups and moving data between your own devices.
This is the single hosted instance at the link above — it's not intended to
be self-hosted or run as separate deployments; if there's something you'd
want it to do differently, that's what feature requests are for (see
below), not a fork.

Two narrow, explicit exceptions to "nothing leaves the browser," worth
being upfront about rather than just claiming "no tracking":
- **Google Drive backup** — entirely optional, entirely user-triggered (see
  Data & backups below).
- **Page-view analytics** ([GoatCounter](https://www.goatcounter.com/)) —
  no cookies, no individual or cross-session tracking, no fingerprinting.
  It only counts how many views each page gets in aggregate, the same way
  a hit counter would, not who's viewing them.

## Feedback & feature requests

Have a feature idea, found a bug, or want to see how a build turns out?
Reach out on [Reddit](https://www.reddit.com/user/Ettran777/) or
[Instagram](https://www.instagram.com/ettran.7/).

Promotional videos and tank journey soon.

## Stack

- React 19 + TypeScript
- React Router (`HashRouter`, required for client-side routing on GH Pages)
- Recharts for parameter trend charts
- Tailwind CSS v4
- Vite
- [GoatCounter](https://www.goatcounter.com/) for privacy-respecting
  page-view analytics (see above)

## Data & backups

Everything is stored in your browser's `localStorage`. Use the **Export**
button in the header regularly — it opens a picker (all tanks, just the
active one, or a specific selection) and downloads a timestamped JSON
snapshot. **Import** (also in the header) takes you to the same smart
import flow used for adding a new tank — it never silently overwrites your
existing data, and never clears existing log photos just because an
imported file doesn't have any. There's no automatic cloud sync —
Export/Import, or the optional one-click Google Drive backup/restore
described above, are the only ways data moves anywhere, and none of them
happen without you clicking something. Export (or back up to Drive) before
clearing browser data or switching devices.

**Handing a backup to an AI assistant?** Use the "exclude photos" toggle in
the export picker first. Log photos are typically the large majority of a
backup file's size, and cost real usage for an assistant to read through
for no analytical benefit — a tank with even a handful of photographed
logs can turn a quick structural review into a file that eats a meaningful
chunk of a usage window before any actual work happens. The image-free
export is still a fully valid, re-importable backup on its own.

## Technical highlights

- **Static-hosting-aware routing** — uses `HashRouter` instead of
  `BrowserRouter` so client-side routes never hit GitHub Pages' server,
  sidestepping the classic SPA-on-static-hosting 404-on-refresh problem.
- **Custom global state, no external library** — a Context-based store with
  immutable update patterns (spread-based, no direct mutation) synced to
  `localStorage` on every change, including a backwards-compatible migration
  layer that upgrades old-schema backups on load without data loss.
- **Graph algorithms applied to real UI** — the build checklist supports
  arbitrary step dependencies, enforced with DFS-based cycle detection
  (rejecting a dependency that would create a circular wait) and a
  topological-ordering constraint validated on every reorder.
- **Custom Recharts wheel-zoom for the Parameters charts**, cursor-centered
  and shared across all charts at once.
- **Structural diffing for smart data import** — deduplicates imported tanks
  by comparing serialized content (excluding volatile IDs) against existing
  data, distinguishing an exact duplicate from a same-named-but-modified
  tank and offering the right action for each.
- **AI-crawlability solved properly, not just assumed** — a client-rendered
  SPA is invisible to a plain HTTP fetch, so the site ships a genuine
  `noscript` fallback, structured JSON-LD, and a static `/docs.txt`/
  `llms.txt` pair for assistants that read the page without executing JS.
- **Defensive import validation against malformed and AI-generated JSON** —
  every field the UI constrains to a fixed set of options (roster category,
  sourcing status, mood, milestone type, and others) is validated on import
  and defaulted with a specific, user-facing warning rather than silently
  accepted or left to crash somewhere downstream; structural references
  (ids, a milestone's link back to a log entry) are checked too, so a
  dangling reference degrades gracefully instead of corrupting later logic.
- **Cross-origin data access via the Storage Access API**, for an
  embeddable startpage widget that reads live `localStorage` from inside a
  third-party `<iframe>` — the same privacy protection that blocks
  cross-site tracking by default also blocks a first-party embed from
  reading its own data, so the widget requests access explicitly
  (`document.requestStorageAccess({ localStorage: true })`) rather than
  assuming it's available. Chrome-only was the accepted bar going in;
  Safari's lack of a silent grant path is a known platform limitation, not
  a bug to chase.

## Notable bug fixes

Debugging write-ups for a few bugs worth telling the story of, kept
separate from the highlights above since these are diagnoses more than
decisions.

- **CSS Cascade Layers spec issue** — tracked down a silent Tailwind v4
  style-override bug to unlayered custom CSS beating layered utility
  classes regardless of source order, and fixed it by adopting Tailwind's
  own `@layer components` convention.
- **Two separate charting library bugs**, found through systematic
  isolation testing rather than trial-and-error — one from passing a
  pre-instantiated React element instead of a component reference to
  Recharts' `Tooltip`, another from an axis keyed on a non-unique display
  string causing hover lookups to collide.
- **Off-center wheel-zoom on the Parameters charts** — a lesson in not
  trusting stale documentation. An initial fix was based on a search result
  that happened to hit Recharts' v2.x source, silently doing nothing
  against the v3.x actually installed. Reading the real shipped source
  directly found the actual cause — the grid background element it
  depended on is conditionally rendered behind a `fill` prop this app never
  sets — and pointed to the axis line as a reliable anchor instead,
  confirmed against the real DOM rather than assumed a second time.
- **Undocumented Google Drive API CORS gap** — the upload endpoint doesn't
  return a CORS preflight response allowing `PATCH` from a browser origin,
  confirmed against other developers hitting the identical error.
  Sidestepped it with delete-then-recreate instead of update-in-place —
  same end result, using only methods with reliable CORS support.
- **An AI-generated import missing `sizeGallons` entirely crashed the
  site** — traced to a `useState` initializer calling `.toString()` on a
  value that was `undefined` rather than merely absent, since TypeScript's
  `number` type only holds for code that actually goes through the type
  system. Led to the defensive import-validation pass noted above, rather
  than patching just that one call site.

## License

[PolyForm Noncommercial 1.0.0](LICENSE) — free to view, learn from, and use
for any noncommercial purpose. Commercial use requires permission from the
copyright holder.

## Design notes

The palette and type system are pulled from the subject itself rather than a
generic template: deep blackwater teal, substrate tan, tank-light amber, with
a recurring "waterline" wave motif marking section boundaries — water column
above, substrate below. Water parameter numbers use a monospace face
throughout, since this is fundamentally a data-logging tool.