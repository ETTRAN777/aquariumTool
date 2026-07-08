import type { SourcingStatus, RosterItem } from '../types';

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
