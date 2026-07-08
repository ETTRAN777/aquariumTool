import type { AppData, Tank, CustomFieldDef } from '../types';
import { seedData } from '../data/seed';

const STORAGE_KEY = 'tank-tracker:data:v1';

// Backups/localStorage from before multi-tank + custom-field support won't
// have `customFields` on their tanks, and may carry the old hardcoded
// `shrimpCount`/`berriedCount` log fields instead of `customValues`. This
// patches old shapes up to the current one instead of crashing on load.
function normalizeTank(raw: any): Tank {
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

  return {
    id: raw.id,
    name: raw.name,
    sizeGallons: raw.sizeGallons,
    dimensions: raw.dimensions,
    style: raw.style,
    startDate: raw.startDate,
    customFields,
    roster: Array.isArray(raw.roster) ? raw.roster : [],
    checklist: Array.isArray(raw.checklist) ? raw.checklist : [],
    logs,
  };
}

function normalizeAppData(raw: any): AppData {
  if (!raw || !Array.isArray(raw.tanks)) return seedData;
  const tanks = raw.tanks.map(normalizeTank);
  return {
    activeTankId: raw.activeTankId ?? tanks[0]?.id ?? '',
    tanks,
  };
}

export function loadData(): AppData {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return seedData;
    return normalizeAppData(JSON.parse(raw));
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

export function exportData(data: AppData): void {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  const date = new Date().toISOString().split('T')[0];
  a.href = url;
  a.download = `tank-tracker-backup-${date}.json`;
  a.click();
  URL.revokeObjectURL(url);
}

export function importData(file: File): Promise<AppData> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const parsed = JSON.parse(reader.result as string);
        if (!parsed.tanks || !Array.isArray(parsed.tanks)) {
          throw new Error('File does not look like a tank tracker backup');
        }
        resolve(normalizeAppData(parsed));
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
