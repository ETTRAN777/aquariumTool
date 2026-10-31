// Custom, user-ordered roster groups. A tank keeps an ordered list of group
// names (Tank.rosterGroups); a roster item belongs to at most one group by
// name (RosterItem.group). The order of the list is the order groups show in
// the Roster's default view, and nothing here sorts alphabetically on
// purpose: the motivating case is "Fish" above "Corals", which neither
// alphabetical nor first-appearance order gives.
//
// Everything in this file is a pure function over plain tank/roster data, so
// the page, the import normalizer and the tests all share one definition of
// what a group name is and how it matches.

import type { RosterItem, Tank } from '../types';

export const MAX_GROUP_NAME_LENGTH = 40;

// Trim, collapse runs of spaces, and Capitalize Each Word. "  reef   safe "
// and "REEF SAFE" both become "Reef Safe", which is also how two names are
// judged to be the same group.
export function normalizeGroupName(raw: string): string {
  return raw
    .trim()
    .replace(/\s+/g, ' ')
    .split(' ')
    .map((w) => (w ? w.charAt(0).toUpperCase() + w.slice(1).toLowerCase() : w))
    .join(' ')
    .slice(0, MAX_GROUP_NAME_LENGTH)
    .trim();
}

function sameGroup(a: string, b: string): boolean {
  return normalizeGroupName(a) === normalizeGroupName(b);
}

// The listed group an item belongs to, or undefined (ungrouped).
export function itemGroup(item: RosterItem, groups: string[]): string | undefined {
  if (!item.group) return undefined;
  return groups.find((g) => sameGroup(g, item.group!));
}

// Primary key is the item's group position (ungrouped items last), falling
// back to `tiebreak` only within a group. Same shape as the category and
// status sorts: a real primary key first, so the comparator stays a valid
// total order.
export function sortByGroup(
  items: RosterItem[],
  groups: string[],
  tiebreak: (a: RosterItem, b: RosterItem) => number
): RosterItem[] {
  const position = (item: RosterItem) => {
    const g = itemGroup(item, groups);
    return g === undefined ? groups.length : groups.indexOf(g);
  };
  return [...items].sort((a, b) => {
    const diff = position(a) - position(b);
    return diff !== 0 ? diff : tiebreak(a, b);
  });
}

export interface GroupSection {
  // null = the ungrouped items at the bottom.
  name: string | null;
  items: RosterItem[];
}

// Splits already-sorted items into one section per group (in group order)
// plus a final ungrouped section. Groups with no items are kept so they can
// still be dropped into. Under a category filter a group shows if it was
// created under that filter, was created under "All" (no scope), or has
// items that match the filter; otherwise it's hidden for that filter.
export function sectionsByGroup(
  items: RosterItem[],
  groups: string[],
  scopes: Record<string, RosterItem['category']> | undefined,
  filter: RosterItem['category'] | 'all'
): GroupSection[] {
  const sections: GroupSection[] = groups.map((name) => ({ name, items: [] }));
  const ungrouped: RosterItem[] = [];
  for (const item of items) {
    const g = itemGroup(item, groups);
    if (g === undefined) ungrouped.push(item);
    else sections[groups.indexOf(g)].items.push(item);
  }
  const result =
    filter === 'all'
      ? sections
      : sections.filter((s) => {
          const scope = scopes?.[s.name!];
          return scope === undefined || scope === filter || s.items.length > 0;
        });
  return [...result, { name: null, items: ungrouped }];
}

export type GroupResult = { tank: Tank; error?: undefined } | { tank?: undefined; error: string };

function groupsOf(tank: Tank): string[] {
  return tank.rosterGroups ?? [];
}

// `scope` is the category filter the group is being created under (omit it
// under "All"), which decides which filters show the group while it's empty.
export function addGroup(tank: Tank, raw: string, scope?: RosterItem['category']): GroupResult {
  const name = normalizeGroupName(raw);
  if (!name) return { error: 'Enter a group name.' };
  if (groupsOf(tank).some((g) => sameGroup(g, name))) {
    return { error: `There's already a group called "${name}".` };
  }
  return {
    tank: {
      ...tank,
      rosterGroups: [...groupsOf(tank), name],
      ...(scope ? { rosterGroupScopes: { ...tank.rosterGroupScopes, [name]: scope } } : {}),
    },
  };
}

// Renames the group everywhere: the ordered list and every item in it.
export function renameGroup(tank: Tank, from: string, raw: string): GroupResult {
  const name = normalizeGroupName(raw);
  if (!name) return { error: 'Enter a group name.' };
  const groups = groupsOf(tank);
  const index = groups.findIndex((g) => sameGroup(g, from));
  if (index === -1) return { error: 'That group no longer exists.' };
  if (groups.some((g, i) => i !== index && sameGroup(g, name))) {
    return { error: `There's already a group called "${name}".` };
  }
  const oldName = groups[index];
  const scopes = renameKey(tank.rosterGroupScopes, oldName, name);
  return {
    tank: {
      ...tank,
      rosterGroups: groups.map((g, i) => (i === index ? name : g)),
      ...(scopes ? { rosterGroupScopes: scopes } : {}),
      roster: tank.roster.map((r) => (r.group && sameGroup(r.group, from) ? { ...r, group: name } : r)),
    },
  };
}

// Deleting a group never deletes items; they just become ungrouped.
export function deleteGroup(tank: Tank, name: string): Tank {
  const next: Tank = {
    ...tank,
    rosterGroups: groupsOf(tank).filter((g) => !sameGroup(g, name)),
    roster: tank.roster.map((r) => {
      if (!r.group || !sameGroup(r.group, name)) return r;
      const rest = { ...r };
      delete rest.group;
      return rest;
    }),
  };
  const scopes = renameKey(tank.rosterGroupScopes, groupsOf(tank).find((g) => sameGroup(g, name)) ?? name, undefined);
  if (scopes) next.rosterGroupScopes = scopes;
  else delete next.rosterGroupScopes;
  return next;
}

// Moves a group one step up or down relative to the groups currently
// visible (`visible`, in list order; omit for all of them): it jumps past the
// next visible neighbor, and hidden groups in between keep their places.
export function moveGroup(tank: Tank, name: string, direction: -1 | 1, visible?: string[]): Tank {
  const groups = [...groupsOf(tank)];
  const from = groups.findIndex((g) => sameGroup(g, name));
  if (from === -1) return tank;
  let to = from + direction;
  while (visible && to >= 0 && to < groups.length && !visible.some((v) => sameGroup(v, groups[to]))) {
    to += direction;
  }
  if (to < 0 || to >= groups.length) return tank;
  const [moved] = groups.splice(from, 1);
  groups.splice(to, 0, moved);
  return { ...tank, rosterGroups: groups };
}

// Puts one item in a group (or takes it out, with undefined). An unknown
// group name is ignored rather than creating a group by accident.
export function assignItemToGroup(tank: Tank, itemId: string, group: string | undefined): Tank {
  const target = group === undefined ? undefined : groupsOf(tank).find((g) => sameGroup(g, group));
  if (group !== undefined && target === undefined) return tank;
  return {
    ...tank,
    roster: tank.roster.map((r) => {
      if (r.id !== itemId) return r;
      const next = { ...r };
      if (target === undefined) delete next.group;
      else next.group = target;
      return next;
    }),
  };
}

// Moves a scope entry to a new group name (or drops it when `to` is
// undefined). Returns undefined when no scopes remain.
function renameKey(
  scopes: Record<string, RosterItem['category']> | undefined,
  from: string,
  to: string | undefined
): Record<string, RosterItem['category']> | undefined {
  if (!scopes) return undefined;
  const next: Record<string, RosterItem['category']> = {};
  for (const [key, value] of Object.entries(scopes)) {
    if (sameGroup(key, from)) {
      if (to !== undefined) next[to] = value;
    } else next[key] = value;
  }
  return Object.keys(next).length > 0 ? next : undefined;
}

// For loading and importing: cleans a raw ordered list and makes sure every
// group an item names is also in the list (appended in first-seen order), so
// a backup that has item groups but no list, or a hand-edited one, still
// loads into a consistent state. Item group names are rewritten to the
// listed spelling.
export function reconcileGroups(
  roster: RosterItem[],
  rawList: unknown,
  rawScopes?: unknown
): {
  roster: RosterItem[];
  rosterGroups: string[];
  rosterGroupScopes: Record<string, RosterItem['category']>;
} {
  const list: string[] = [];
  const add = (raw: unknown) => {
    if (typeof raw !== 'string') return undefined;
    const name = normalizeGroupName(raw);
    if (!name) return undefined;
    if (!list.some((g) => g === name)) list.push(name);
    return name;
  };
  if (Array.isArray(rawList)) rawList.forEach(add);
  const fixed = roster.map((r) => {
    if (!r.group) return r;
    const name = add(r.group);
    if (name === undefined) {
      const rest = { ...r };
      delete rest.group;
      return rest;
    }
    return name === r.group ? r : { ...r, group: name };
  });
  // Keep only scopes for listed groups with a real category.
  const categories = ['livestock', 'plant', 'hardscape', 'substrate', 'equipment'];
  const scopes: Record<string, RosterItem['category']> = {};
  if (rawScopes && typeof rawScopes === 'object' && !Array.isArray(rawScopes)) {
    for (const [key, value] of Object.entries(rawScopes)) {
      const name = normalizeGroupName(key);
      if (list.includes(name) && typeof value === 'string' && categories.includes(value)) {
        scopes[name] = value as RosterItem['category'];
      }
    }
  }
  return { roster: fixed, rosterGroups: list, rosterGroupScopes: scopes };
}