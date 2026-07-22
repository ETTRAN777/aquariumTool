import type { Tank, RosterItem } from '../types';

// Two variants, since a side-by-side comparison showed no consistent
// winner — which one produces the better image seems to depend more on
// the specific render than on prompt content, so both are offered rather
// than picking one as definitively correct.
//
// Simple: item names only, no RosterItem.detail. That field is where
// husbandry/procurement/sourcing notes live ("needs online sourcing",
// "held back until Week 4+", grading-criteria explanations) — genuinely
// useful on the Roster page, but visual noise here that can dilute an
// image model's attention or, worse, occasionally read as an instruction
// itself. Item names alone already tend to carry the visually relevant
// bit (wood type, plant species, size).
//
// Detailed: everything Simple has, plus each item's detail text appended
// inline, and quantity prefixes applied everywhere rather than just to
// livestock/plants. More verbose and occasionally noisier, but also
// occasionally pulls in a genuinely useful visual cue (e.g. a stated
// depth or color) that Simple omits.
//
// Both share the same "don't invent elements" closing instruction —
// that part isn't the variable being tested, so it stays constant.

function tankHeaderLines(tank: Tank): string[] {
  const waterType = tank.waterType === 'saltwater' ? 'saltwater' : 'freshwater';
  const dims = tank.dimensions ? ` (${tank.dimensions})` : '';
  const style = tank.style ? `, styled as: ${tank.style}` : '';
  return [
    `Generate a photorealistic concept image of a ${tank.sizeGallons}-gallon ${waterType} aquarium${dims}${style}.`,
  ];
}

const CLOSING_LINE =
  'Aquarium-photography style: eye-level front-on angle, clean glass, realistic water clarity and light refraction, soft natural-looking aquarium lighting, natural aquascape composition, no text or watermarks. Only include the elements listed above — don\'t invent additional hardscape, plants, or livestock beyond what\'s listed.';

export function buildConceptImagePromptSimple(tank: Tank): string {
  // Nx quantity prefix only makes sense for countable organisms (10x
  // shrimp, 3x snails). For hardscape/substrate, `quantity` usually means
  // purchase units (bags, pieces) rather than distinct visual instances —
  // "2x Dark Sand" reads as nonsense, since that's one continuous layer
  // in the tank regardless of how many bags it took to fill it.
  const describeItems = (items: RosterItem[], countable: boolean) =>
    items
      .map((i) => {
        const qty = countable && i.quantity && i.quantity > 1 ? `${i.quantity}x ` : '';
        return `${qty}${i.name}`;
      })
      .join(', ');

  const hardscape = tank.roster.filter((r) => r.category === 'hardscape');
  const substrate = tank.roster.filter((r) => r.category === 'substrate');
  const plants = tank.roster.filter((r) => r.category === 'plant');
  const livestock = tank.roster.filter((r) => r.category === 'livestock');

  const lines: string[] = tankHeaderLines(tank);

  if (hardscape.length) lines.push(`Hardscape: ${describeItems(hardscape, false)}.`);
  if (substrate.length) lines.push(`Substrate: ${describeItems(substrate, false)}.`);
  if (plants.length) lines.push(`Plants: ${describeItems(plants, true)}.`);
  if (livestock.length) {
    lines.push(
      `Livestock (for approximate color, scale, and movement — not exact placement): ${describeItems(livestock, true)}.`
    );
  }

  lines.push(CLOSING_LINE);
  return lines.join('\n\n');
}

export function buildConceptImagePromptDetailed(tank: Tank): string {
  const describeItems = (items: RosterItem[]) =>
    items
      .map((i) => {
        const qty = i.quantity && i.quantity > 1 ? `${i.quantity}x ` : '';
        const detail = i.detail ? ` (${i.detail})` : '';
        return `${qty}${i.name}${detail}`;
      })
      .join(', ');

  const hardscape = tank.roster.filter((r) => r.category === 'hardscape');
  const substrate = tank.roster.filter((r) => r.category === 'substrate');
  const plants = tank.roster.filter((r) => r.category === 'plant');
  const livestock = tank.roster.filter((r) => r.category === 'livestock');

  const lines: string[] = tankHeaderLines(tank);

  if (hardscape.length) lines.push(`Hardscape: ${describeItems(hardscape)}.`);
  if (substrate.length) lines.push(`Substrate: ${describeItems(substrate)}.`);
  if (plants.length) lines.push(`Plants: ${describeItems(plants)}.`);
  if (livestock.length) {
    lines.push(
      `Livestock (for approximate color, scale, and movement — not exact placement): ${describeItems(livestock)}.`
    );
  }

  lines.push(CLOSING_LINE);
  return lines.join('\n\n');
}
