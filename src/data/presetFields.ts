import type { CustomFieldType } from '../types';

export interface PresetField {
  label: string;
  type: CustomFieldType;
}

// Common tracking fields across hobbyist types, available to drop into any
// tank — not just the ones a template pre-fills at creation time. Emoji live
// in the label itself so they show up naturally everywhere the field's label
// is rendered (Log entries, Dashboard, Settings) without any special-casing.
export const PRESET_FIELDS: PresetField[] = [
  { label: '🦐 Shrimp Census', type: 'number' },
  { label: '🥚 Berried / Gravid Count', type: 'number' },
  { label: '🐟 Fry Count', type: 'number' },
  { label: '🤰 Pregnant Females', type: 'number' },
  { label: '🐠 Adult Count', type: 'number' },
  { label: '🐡 Total Fish Count', type: 'number' },
  { label: '🐌 Snail Count', type: 'number' },
  { label: '🤒 Signs Of Illness', type: 'boolean' },
  { label: '🌱 New Growth Observed', type: 'boolean' },
  { label: '✂️ Trim Needed', type: 'boolean' },
  { label: '📝 Feeding Notes', type: 'text' },
];
