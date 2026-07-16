import type { CustomFieldType } from '../types';

export interface TargetTraitPreset {
  label: string;
  type: CustomFieldType;
  appliesTo: 'livestock' | 'plant';
}

// Separate preset list from data/presetFields.ts (the Log page's presets) —
// these describe static per-species/per-plant research facts, not things
// re-measured on a weekly log entry, and not things the app computes on
// its own (Mouth Size, Adult Size, and Shrimp Safety live as dedicated
// fields on RosterItem instead — see lib/targets.ts — since the app
// derives shrimp-predation risk automatically from the first two rather
// than asking the user to judge and enter the third by hand). Picking a
// preset here just adds a blank trait to that roster item; the actual
// value still has to come from research (see the "Copy research prompt"
// button).
export const TARGET_TRAIT_PRESETS: TargetTraitPreset[] = [
  { label: '✂️ Fin Nipper', type: 'boolean', appliesTo: 'livestock' },
  { label: '😊 Temperament', type: 'text', appliesTo: 'livestock' },
  { label: '📏 Mature Size (in)', type: 'number', appliesTo: 'plant' },
  { label: '💡 Light Needs', type: 'text', appliesTo: 'plant' },
  { label: '🌫️ CO2 Required', type: 'boolean', appliesTo: 'plant' },
  { label: '🌱 Growth Rate', type: 'text', appliesTo: 'plant' },
];
