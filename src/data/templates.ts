import type { CustomFieldDef, ChecklistTask, Tank } from '../types';

export interface TankTemplate {
  id: string;
  name: string;
  description: string;
  suggestedStyle: string;
  customFields: Omit<CustomFieldDef, 'id'>[];
  checklist: Omit<ChecklistTask, 'id' | 'done'>[];
}

export const TANK_TEMPLATES: TankTemplate[] = [
  {
    id: 'shrimp',
    name: 'Shrimp / Invert Colony',
    description: 'Neocaridina, Caridina, crayfish, or other invert-focused breeder tanks.',
    suggestedStyle: 'Walstad-style shrimp colony',
    customFields: [
      { label: 'Population count', type: 'number' },
      { label: 'Berried / gravid count', type: 'number' },
    ],
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
    customFields: [
      { label: 'Adult count', type: 'number' },
      { label: 'Fry count', type: 'number' },
      { label: 'Visibly pregnant females', type: 'number' },
    ],
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
    customFields: [
      { label: 'Total fish count', type: 'number' },
      { label: 'Signs of illness observed', type: 'boolean' },
    ],
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
    customFields: [
      { label: 'New growth observed', type: 'boolean' },
      { label: 'Trim needed', type: 'boolean' },
    ],
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
