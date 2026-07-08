import type { CustomFieldDef, ChecklistTask, Tank } from '../types';
import { PRESET_FIELDS } from './presetFields';

export interface TankTemplate {
  id: string;
  name: string;
  description: string;
  suggestedStyle: string;
  customFields: Omit<CustomFieldDef, 'id'>[];
  checklist: Omit<ChecklistTask, 'id' | 'done'>[];
}

// Pulls a field straight from the shared preset library rather than
// redefining it here, so a template-created tank and a manually
// "added from preset" field are always the exact same field — same
// label, same emoji, same type. Throws at module load if a label typos
// out of sync with presetFields.ts, which is exactly when we want to know.
function preset(label: string): Omit<CustomFieldDef, 'id'> {
  const found = PRESET_FIELDS.find((f) => f.label === label);
  if (!found) throw new Error(`Template references unknown preset field: "${label}"`);
  return { label: found.label, type: found.type };
}

export const TANK_TEMPLATES: TankTemplate[] = [
  {
    id: 'shrimp',
    name: 'Shrimp / Invert Colony',
    description: 'Neocaridina, Caridina, crayfish, or other invert-focused breeder tanks.',
    suggestedStyle: 'Walstad-style shrimp colony',
    customFields: [preset('🦐 Shrimp Census'), preset('🥚 Berried / Gravid Count')],
    checklist: [
      { label: 'Source tank, hardscape, and substrate' },
      { label: 'Layer substrate and place hardscape' },
      { label: 'Fill, install filtration, and plant' },
      { label: 'Begin fishless cycle and daily testing' },
      { label: 'Confirm ammonia = 0, nitrite = 0, nitrate present — retest before trusting it' },
      { label: 'Drip-acclimate and add founding livestock' },
    ],
  },
  {
    id: 'livebearers',
    name: 'Livebearers & Fry',
    description: 'Guppies, mollies, platies — tanks where fry counts matter.',
    suggestedStyle: 'Community livebearer tank',
    customFields: [preset('🐠 Adult Count'), preset('🐟 Fry Count'), preset('🤰 Pregnant Females')],
    checklist: [
      { label: 'Source tank, substrate, and hardscape' },
      { label: 'Fill, install filtration, and plant' },
      { label: 'Begin fishless cycle and daily testing' },
      { label: 'Confirm ammonia = 0, nitrite = 0, nitrate present' },
      { label: 'Acclimate and add livestock' },
      { label: 'Add a breeder box or dense floating cover for fry survival' },
    ],
  },
  {
    id: 'community',
    name: 'Community Fish',
    description: 'Mixed peaceful community fish tanks.',
    suggestedStyle: 'Mixed community tank',
    customFields: [preset('🐡 Total Fish Count'), preset('🤒 Signs Of Illness')],
    checklist: [
      { label: 'Source tank, substrate, and hardscape' },
      { label: 'Fill, install filtration, and plant' },
      { label: 'Begin fishless cycle and daily testing' },
      { label: 'Confirm ammonia = 0, nitrite = 0, nitrate present' },
      { label: 'Research stocking order and add fish gradually' },
    ],
  },
  {
    id: 'planted',
    name: 'Planted-Only',
    description: 'No livestock focus — tracking growth, trims, and layout.',
    suggestedStyle: 'Low-tech planted tank',
    customFields: [preset('🌱 New Growth Observed'), preset('✂️ Trim Needed')],
    checklist: [
      { label: 'Source substrate and hardscape' },
      { label: 'Layer substrate and place hardscape' },
      { label: 'Fill, install filtration, and plant' },
      { label: 'Dial in light schedule and CO2/ferts if using them' },
    ],
  },
  {
    id: 'blank',
    name: 'Blank',
    description: 'Start with nothing pre-filled — add your own fields and steps as you go.',
    suggestedStyle: '',
    customFields: [],
    checklist: [],
  },
];

export function buildTankFromTemplate(
  template: TankTemplate,
  overrides: { name: string; sizeGallons: number; dimensions?: string; style?: string }
): Tank {
  return {
    id: crypto.randomUUID(),
    name: overrides.name,
    sizeGallons: overrides.sizeGallons,
    dimensions: overrides.dimensions || undefined,
    style: overrides.style || template.suggestedStyle || undefined,
    startDate: '',
    customFields: template.customFields.map((f) => ({ ...f, id: crypto.randomUUID() })),
    roster: [],
    checklist: template.checklist.map((c) => ({ ...c, id: crypto.randomUUID(), done: false })),
    logs: [],
  };
}
