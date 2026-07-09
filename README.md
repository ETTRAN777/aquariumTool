# Tank Tracker

A planning-and-documentation platform for freshwater aquariums — half project
planner, half weekly journal. Works for any tank: shrimp colonies, livebearers,
community fish, a solo betta or cichlid, planted-only builds, or anything
else, since what each tank tracks is fully customizable.

**[Live demo →](https://ETTRAN777.github.io/aquariumTool/)**

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
- **Diagnosed a CSS Cascade Layers spec issue** — tracked down a silent
  Tailwind v4 style-override bug to unlayered custom CSS beating layered
  utility classes regardless of source order, and fixed it by adopting
  Tailwind's own `@layer components` convention.
- **Root-caused two separate charting library bugs** through systematic
  isolation testing rather than trial-and-error — one from passing a
  pre-instantiated React element instead of a component reference to
  Recharts' `Tooltip`, another from an axis keyed on a non-unique display
  string causing hover lookups to collide.
- **Structural diffing for smart data import** — deduplicates imported tanks
  by comparing serialized content (excluding volatile IDs) against existing
  data, distinguishing an exact duplicate from a same-named-but-modified
  tank and offering the right action for each.

## What it does

- **Multi-tank** — track as many tanks as you want, switch between them from
  the header
- **Templates or blank** — start a new tank from a preset (Shrimp/Invert
  Colony, Livebearers & Fry, Community Fish, Solo Fish/Centerpiece,
  Planted-Only) that pre-fills sensible tracking fields, or start completely
  blank and define your own
- **Custom tracking fields** — each tank decides what it logs. A shrimp tank
  might track population and berried females; a guppy tank might track fry
  count and pregnant females; a solo betta might track fin condition. Pick
  from a shared preset library or invent your own — manage these anytime in
  Settings
- **Roster** — every livestock/plant/hardscape item with a sourcing pipeline
  (idea → wishlist → ordered → arrived → acclimating → established). Items
  still at "idea" don't count toward the running cost estimate, so you can
  jot down something you're still deciding on without it skewing your
  budget. Sortable by category or by how far along each item is
- **Build Checklist** — steps can depend on other steps *or* on a roster item
  reaching a given status (e.g. "install the filter" waits until the filter
  shows "Arrived" on the roster) — fully editable, reorderable, and custom
  steps can be locked behind whatever you choose. Deletions on the roster and
  checklist are click-to-arm (click once, confirm with a second click within
  a few seconds) rather than instant, so a stray click can't wipe something
  out
- **Weekly Log** — blog-style entries with water parameters, this tank's
  custom fields, mood tags, and photos. Deleting an entry asks for
  confirmation first, since it's usually the thing with the most effort
  behind it
- **Parameters** — water chemistry and any numeric custom fields auto-charted
  over time, so you can *see* trends instead of just logging numbers into a
  void
- **Smart import** — bringing in a tank from a backup file checks it against
  what you already have. A genuinely new tank imports normally; an exact
  duplicate is flagged instead of silently cloned; a same-named tank with
  different data (e.g. you logged more since the backup) offers a real
  choice — replace the existing one, or keep both
- **JSON format docs** (`/docs` in the app) — the full import schema, written
  so it can be pasted straight into an AI assistant along with a build plan
  to generate an importable file from scratch, even for someone who's never
  used the site before

## Why it's built this way

This is a static site with **no backend** — it's meant to be cloned/forked and
deployed by each person to their own GitHub Pages, with data living in that
browser's `localStorage`. One-click JSON export/import handles backups and
moving data between devices. There's no login system and no shared data
between users — each deployment is its own private instance.

## Stack

- React 19 + TypeScript
- React Router (`HashRouter`, required for client-side routing on GH Pages)
- Recharts for parameter trend charts
- Tailwind CSS v4
- Vite

## Local development

```bash
npm install
npm run dev
```

## Deploying to GitHub Pages

1. Update `base` in `vite.config.ts` if your repo name differs from
   `aquariumTool`.
2. Push this repo to GitHub.
3. Run:

   ```bash
   npm run deploy
   ```

   This builds the site and pushes `dist/` to a `gh-pages` branch via the
   `gh-pages` package.
4. In your repo settings → Pages, set the source to the `gh-pages` branch.

## Data & backups

Everything is stored in `localStorage` under one key. Use the **Export**
button in the header regularly — it downloads a timestamped, tank-named JSON
snapshot of every tank, roster item, checklist, log entry, and custom field
definition. **Import** (also in the header) takes you to the same smart
import flow used for adding a new tank — it never silently overwrites your
existing data. There's no cloud sync, so export before clearing browser data
or switching devices.

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
