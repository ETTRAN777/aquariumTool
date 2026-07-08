# Tank Tracker

A planning-and-documentation platform for freshwater aquariums — half project
planner, half weekly journal. Works for any tank: shrimp colonies, livebearers,
community fish, planted-only builds, or anything else, since what each tank
tracks is fully customizable.

**[Live demo →](https://ETTRAN777.github.io/aquariumTool/)**

## What it does

- **Multi-tank** — track as many tanks as you want, switch between them from
  the header
- **Templates or blank** — start a new tank from a preset (Shrimp/Invert
  Colony, Livebearers & Fry, Community Fish, Planted-Only) that pre-fills
  sensible tracking fields, or start completely blank and define your own
- **Custom tracking fields** — each tank decides what it logs. A shrimp tank
  might track population and berried females; a guppy tank might track fry
  count and pregnant females; a planted tank might just track "new growth" as
  a yes/no. Manage these anytime in Settings
- **Roster** — every livestock/plant/hardscape item with a sourcing pipeline
  (wishlist → ordered → arrived → acclimating → established)
- **Build Checklist** — steps can depend on other steps *or* on a roster item
  reaching a given status (e.g. "install the filter" waits until the filter
  shows "Arrived" on the roster) — fully editable, reorderable, and custom
  steps can be locked behind whatever you choose
- **Weekly Log** — blog-style entries with water parameters, this tank's
  custom fields, mood tags, and photos
- **Parameters** — water chemistry and any numeric custom fields auto-charted
  over time, so you can *see* trends instead of just logging numbers into a
  void

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
button in the header regularly — it downloads a timestamped JSON snapshot of
every tank, roster item, checklist, log entry, and custom field definition.
**Import** restores from that same file. There's no cloud sync, so export
before clearing browser data or switching devices.

## Design notes

The palette and type system are pulled from the subject itself rather than a
generic template: deep blackwater teal, substrate tan, tank-light amber, with
a recurring "waterline" wave motif marking section boundaries — water column
above, substrate below. Water parameter numbers use a monospace face
throughout, since this is fundamentally a data-logging tool.
