import type { CustomFieldType } from '../types';

export interface PresetField {
  label: string;
  type: CustomFieldType;
  // Which tank(s) this preset makes sense for — drives filtering in the
  // Settings "add from preset" picker so a freshwater tank never sees
  // Alkalinity/Salinity, and a saltwater tank never sees Shrimp Census.
  // 'all' is for things that are genuinely water-type-agnostic.
  waterType: 'freshwater' | 'saltwater' | 'all';
}

// Common tracking fields across hobbyist types, available to drop into any
// tank — not just the ones a template pre-fills at creation time. Emoji live
// in the label itself so they show up naturally everywhere the field's label
// is rendered (Log entries, Dashboard, Settings) without any special-casing.
export const PRESET_FIELDS: PresetField[] = [
  { label: '🦐 Shrimp Census', type: 'number', waterType: 'freshwater' },
  { label: '🥚 Berried / Gravid Count', type: 'number', waterType: 'freshwater' },
  { label: '🐟 Fry Count', type: 'number', waterType: 'freshwater' },
  { label: '🤰 Pregnant Females', type: 'number', waterType: 'freshwater' },
  { label: '🐠 Adult Count', type: 'number', waterType: 'all' },
  { label: '🐡 Total Fish Count', type: 'number', waterType: 'all' },
  { label: '🐌 Snail Count', type: 'number', waterType: 'all' },
  { label: '🤒 Signs Of Illness', type: 'boolean', waterType: 'all' },
  { label: '🪭 Fin Condition', type: 'text', waterType: 'all' },
  { label: '🌱 New Growth Observed', type: 'boolean', waterType: 'all' },
  { label: '✂️ Trim Needed', type: 'boolean', waterType: 'freshwater' },
  { label: '📝 Feeding Notes', type: 'text', waterType: 'all' },
  // Reef/saltwater-specific. Salinity itself is a first-class WaterParams
  // field (like pH) rather than a preset — everything else reef-related
  // stays in the flexible custom-field system, same as freshwater.
  { label: '🧪 Alkalinity (dKH)', type: 'number', waterType: 'saltwater' },
  { label: '🪸 Calcium (ppm)', type: 'number', waterType: 'saltwater' },
  { label: '🌊 Magnesium (ppm)', type: 'number', waterType: 'saltwater' },
  { label: '💡 PAR', type: 'number', waterType: 'saltwater' },
];
