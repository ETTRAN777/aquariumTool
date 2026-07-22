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

// Tank name renders large in the header ("125 Gal · ... / Test") and the
// short description renders as a single line right above it — both grow
// the whole header and push the nav around if left unbounded, rather than
// gracefully truncating. Shared between CreateTank and Settings so the
// two entry points can never drift out of sync with each other.
export const NAME_MAX_LENGTH = 22;
export const STYLE_MAX_LENGTH = 58;

// Standard US retail tank dimensions by gallon size, used to auto-fill
// Dimensions when the user leaves it blank. Sorted ascending so the
// closest-match search below can just scan linearly. "20 Gallon Long" is
// deliberately the entry at 20 gallons — the long/low footprint is the far
// more common 20-gallon shape for planted/nano builds than 20 High, and a
// single size can only map to one set of dimensions here.
export const STANDARD_TANK_DIMENSIONS: { gallons: number; dimensions: string }[] = [
  { gallons: 2.5, dimensions: '12" x 6" x 8"' },
  { gallons: 5, dimensions: '16" x 8" x 10"' },
  { gallons: 10, dimensions: '20" x 10" x 12"' },
  { gallons: 20, dimensions: '30" x 12" x 12"' }, // 20 Long
  { gallons: 30, dimensions: '30" x 12" x 18"' },
  { gallons: 40, dimensions: '36" x 18" x 16"' },
  { gallons: 55, dimensions: '48" x 13" x 21"' },
  { gallons: 75, dimensions: '48" x 18" x 21"' },
  { gallons: 90, dimensions: '48" x 18" x 24"' },
  { gallons: 125, dimensions: '72" x 18" x 22"' },
];

// For a non-standard size (e.g. 35 gallons), falls back to whichever
// standard entry is numerically closest — a tie rounds down to the
// smaller tank, on the theory that undersizing the guessed footprint is
// safer than suggesting more floor space than the person may actually
// have.
export function closestStandardDimensions(gallons: number): string {
  let closest = STANDARD_TANK_DIMENSIONS[0];
  let smallestDiff = Math.abs(gallons - closest.gallons);
  for (const entry of STANDARD_TANK_DIMENSIONS) {
    const diff = Math.abs(gallons - entry.gallons);
    if (diff < smallestDiff) {
      smallestDiff = diff;
      closest = entry;
    }
  }
  return closest.dimensions;
}
