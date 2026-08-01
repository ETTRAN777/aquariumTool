import type { AppData, Tank, CustomFieldDef, RosterItem } from '../types';
import { seedData } from '../data/seed';
import { NAME_MAX_LENGTH, STYLE_MAX_LENGTH, STATUS_LABELS } from './constants';

const STORAGE_KEY = 'tank-tracker:data:v1';

// Backups/localStorage from before multi-tank + custom-field support won't
// have `customFields` on their tanks, and may carry the old hardcoded
// `shrimpCount`/`berriedCount` log fields instead of `customValues`. This
// patches old shapes up to the current one instead of crashing on load.
function normalizeTank(raw: any): { tank: Tank; warnings: string[] } {
  const warnings: string[] = [];
  let customFields: CustomFieldDef[] = Array.isArray(raw.customFields) ? raw.customFields : [];
  let logs = Array.isArray(raw.logs) ? raw.logs : [];

  const hasLegacyShrimpFields = logs.some(
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

    logs = logs.map((l: any) => {
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

  // maxLength on the CreateTank/Settings inputs only stops someone from
  // *typing* past NAME_MAX_LENGTH/STYLE_MAX_LENGTH — it does nothing for
  // a value arriving pre-formed from an imported JSON file. Clamped here
  // too so an import can't reintroduce the exact header/layout overflow
  // those limits exist to prevent (see the comment on the constants) —
  // with a warning surfaced back to the caller rather than a silent cut,
  // so an import doesn't quietly change something the user wrote.
  let name = raw.name;
  if (typeof raw.name === 'string' && raw.name.length > NAME_MAX_LENGTH) {
    name = raw.name.slice(0, NAME_MAX_LENGTH);
    warnings.push(
      `Name was ${raw.name.length} characters — shortened to the ${NAME_MAX_LENGTH}-character limit ("${name}…").`
    );
  }
  let style = raw.style;
  if (typeof raw.style === 'string' && raw.style.length > STYLE_MAX_LENGTH) {
    style = raw.style.slice(0, STYLE_MAX_LENGTH);
    warnings.push(
      `"${name}"'s description was ${raw.style.length} characters — shortened to the ${STYLE_MAX_LENGTH}-character limit.`
    );
  }

  const tank: Tank = {
    id: raw.id,
    name,
    sizeGallons: raw.sizeGallons,
    dimensions: raw.dimensions,
    style,
    startDate: raw.startDate,
    customFields,
    roster: Array.isArray(raw.roster) ? raw.roster : [],
    checklist: Array.isArray(raw.checklist) ? raw.checklist : [],
    logs,
    schedule: Array.isArray(raw.schedule) ? raw.schedule : [],
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
