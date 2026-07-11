import type { SourcingStatus, RosterItem, LogEntry } from '../types';

export const STATUS_ORDER: SourcingStatus[] = [
  'idea',
  'wishlist',
  'ordered',
  'arrived',
  'acclimating',
  'established',
];

export const STATUS_LABELS: Record<SourcingStatus, string> = {
  idea: 'Idea',
  wishlist: 'Wishlist',
  ordered: 'Ordered',
  arrived: 'Arrived',
  acclimating: 'Acclimating',
  established: 'Established',
};

export const CATEGORY_LABELS: Record<RosterItem['category'], string> = {
  livestock: 'Livestock',
  plant: 'Plant',
  hardscape: 'Hardscape',
  substrate: 'Substrate',
  equipment: 'Equipment',
};

export function statusMeetsRequirement(current: SourcingStatus, required: SourcingStatus): boolean {
  return STATUS_ORDER.indexOf(current) >= STATUS_ORDER.indexOf(required);
}

// Mood is a small ordered scale (worst → best) so it can be charted the same
// way a numeric parameter would be — "watch it climb from concerned to
// thriving" only works if the order is fixed somewhere shared, rather than
// re-derived separately by the Log form and the Charts page.
export type Mood = NonNullable<LogEntry['mood']>;

export const MOOD_ORDER: Mood[] = ['concerned', 'watching', 'stable', 'thriving'];

export const MOOD_LABELS: Record<Mood, string> = {
  thriving: '🌿 Thriving',
  stable: '💧 Stable',
  watching: '👀 Watching',
  concerned: '⚠️ Concerned',
};

export function moodToScore(mood: Mood | undefined): number | undefined {
  if (!mood) return undefined;
  const idx = MOOD_ORDER.indexOf(mood);
  return idx === -1 ? undefined : idx + 1; // 1 (concerned) .. 4 (thriving)
}
