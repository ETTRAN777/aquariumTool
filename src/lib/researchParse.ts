import type { CustomFieldType, RosterItem, WaterParams } from '../types';

// Parses a pasted AI research response (whatever shape it arrives in —
// the whole reply, just a table, just a paragraph) back into candidate
// values for the exact fields buildResearchPrompt() in targets.ts asked
// for. The one rule everything here follows: ONLY ever act on a value
// sitting immediately next to one of the known labels below. Never scan
// free prose for a stray number that merely looks plausible near a
// keyword — a response with several "X–Y unit" ranges in it (temp, pH,
// GH, KH, TDS, mouth size, adult size, group size all share that shape)
// makes a fuzzy "nearby number" match actively dangerous: it can produce
// a wrong-but-plausible value that reads as clean on review. A missed
// field is safe (nothing changes); a wrong field silently accepted isn't.
//
// The reason label-anchoring is actually reliable here, not just safe:
// every label below is lifted directly from buildResearchPrompt()'s own
// wording, not guessed at from how AI responses "tend" to look. Since
// any AI answering that prompt is responding to Tidemark's own phrasing,
// its answer's own labels tend to echo that phrasing closely — that's
// the real basis for matching, confirmed against a live response before
// this was written, not assumed.

export type ParsedFieldKind = 'waterParam' | 'mouthSize' | 'adultSize' | 'trait';

export interface ParsedAnswer {
  raw: string; // exact matched cell/line — what "view source" shows
  min?: number;
  max?: number;
  single?: number;
  text?: string; // for text-type traits (temperament, light needs)
  boolValue?: boolean; // for boolean-type traits
  notApplicable?: boolean; // e.g. "not a shoaling species", "no meaningful minimum"
  hedge?: boolean; // source itself flagged low confidence — bonus signal, not load-bearing
}

export interface ParsedField extends ParsedAnswer {
  key: string; // stable id: waterParam key, 'mouthSizeMm'/'adultSizeIn', or trait label
  kind: ParsedFieldKind;
  displayLabel: string;
  paramKey?: keyof WaterParams;
  traitLabel?: string;
  traitType?: CustomFieldType;
  // Populated only if a second, differing match was found for this same
  // key — per the "ambiguous matches don't get auto-picked" rule, the
  // caller should require an explicit manual choice rather than default
  // to whichever was found first.
  alternates?: ParsedAnswer[];
}

type FieldAlias =
  | { keys: string[]; kind: 'waterParam'; param: keyof WaterParams }
  | { keys: string[]; kind: 'mouthSize' }
  | { keys: string[]; kind: 'adultSize' }
  | { keys: string[]; kind: 'trait'; label: string; type: CustomFieldType };

const WATER_PARAM_ALIASES: FieldAlias[] = [
  { keys: ['ideal temperature', 'temperature'], kind: 'waterParam', param: 'temperature' },
  { keys: ['ideal ph', 'ph'], kind: 'waterParam', param: 'ph' },
  { keys: ['gh', 'general hardness'], kind: 'waterParam', param: 'gh' },
  { keys: ['kh', 'carbonate hardness'], kind: 'waterParam', param: 'kh' },
  { keys: ['typical tds', 'tds'], kind: 'waterParam', param: 'tds' },
  { keys: ['salinity', 'specific gravity'], kind: 'waterParam', param: 'salinity' },
];

// Livestock-only fields, exactly matching buildResearchPrompt's livestock
// branch and the trait labels TARGET_TRAIT_PRESETS actually creates —
// deliberately the same label strings, so a written trait is one
// getTraitValue() lookup away from feeding real computed logic
// (hasShoalingIssue, predation risk) rather than silently mismatching it.
const LIVESTOCK_ALIASES: FieldAlias[] = [
  { keys: ['typical adult mouth size', 'adult mouth size', 'mouth size'], kind: 'mouthSize' },
  { keys: ['typical adult size', 'adult size'], kind: 'adultSize' },
  {
    keys: [
      'minimum group size to thrive',
      'minimum group/shoal size',
      'minimum group size',
      'min group size',
      'minimum group size to thrive*',
    ],
    kind: 'trait',
    label: '👥 Min Group Size',
    type: 'number',
  },
  { keys: ['minimum tank length'], kind: 'trait', label: '📐 Min Tank Length (in)', type: 'number' },
  { keys: ['minimum tank width'], kind: 'trait', label: '📐 Min Tank Width (in)', type: 'number' },
  {
    keys: ['long, flowing fins / fin-nipping target', 'long, flowing fins', 'long/flowing fins'],
    kind: 'trait',
    label: '🎗️ Long/Flowing Fins',
    type: 'boolean',
  },
  {
    keys: ['reputation for fin-nipping', 'fin-nipping behavior', 'fin nipper'],
    kind: 'trait',
    label: '✂️ Fin Nipper',
    type: 'boolean',
  },
  {
    keys: ['eats/uproots live plants', 'eats or uproots live aquarium plants', 'eats/uproots plants'],
    kind: 'trait',
    label: '🌿 Eats/Uproots Plants',
    type: 'boolean',
  },
  { keys: ['temperament', 'general temperament'], kind: 'trait', label: '😊 Temperament', type: 'text' },
];

const PLANT_ALIASES: FieldAlias[] = [
  {
    keys: ['mature size', 'mature size (height/spread)', 'mature size (inches, height/spread)'],
    kind: 'trait',
    label: '📏 Mature Size (in)',
    type: 'number',
  },
  {
    keys: ['light requirements', 'light needs', 'light requirements (low/medium/high)'],
    kind: 'trait',
    label: '💡 Light Needs',
    type: 'text',
  },
  {
    keys: ['co2 injection required', 'co2 required', 'whether co2 injection is required'],
    kind: 'trait',
    label: '🌫️ CO2 Required',
    type: 'boolean',
  },
  { keys: ['typical growth rate', 'growth rate'], kind: 'trait', label: '🌱 Growth Rate', type: 'text' },
];

const NOT_APPLICABLE_RE =
  /\bno meaningful\b|\bnot a (true )?shoaling species\b|\bnot applicable\b|\bn\/a\b|\bnone required\b|\bdoesn'?t apply\b/i;

// Bonus signal only — see the file header note above. A source that
// states a wrong number with total confidence produces none of these
// phrases and sails through undetected; per-field manual confirmation in
// the review UI is the real backstop, not this.
//
// Deliberately NOT one "low confidence"-style adjacency regex — real
// responses phrase this as "Low–moderate confidence" or "Very low
// confidence; source-dependent," where "low" and "confidence" aren't
// adjacent words. Checking the two independently, both-present, catches
// that real phrasing; an adjacency regex silently missed it in testing
// against a real response (TDS's exact "Low–moderate confidence" note).
function detectHedge(text: string): boolean {
  const t = text.toLowerCase();
  if (/\blow\b/.test(t) && /\bconfidence\b/.test(t)) return true;
  return /\bcould not find\b|\brough (anatomical )?estimate\b|\bdon'?t (use|chase) this\b|\bnot a (measured|reliable)\b|\baveraged (hobbyist )?estimate\b/.test(
    t
  );
}

function cleanCell(s: string): string {
  return s
    .trim()
    .replace(/\*\*/g, '')
    .replace(/^\*+|\*+$/g, '')
    .replace(/\[\d+\]/g, '') // strip footnote markers like [1]
    .trim();
}

function normalizeLabel(s: string): string {
  return cleanCell(s)
    .toLowerCase()
    .replace(/[*_]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

// Markdown table row: "| Label | Value | Confidence/notes |". Rejects
// separator rows ("|---|---|") and anything with fewer than 2 real cells.
function splitTableRow(line: string): string[] | null {
  const trimmed = line.trim();
  if (!trimmed.includes('|')) return null;
  if (/^\|?[\s:|-]+\|?$/.test(trimmed)) return null;
  const cells = trimmed
    .split('|')
    .map(cleanCell)
    .filter((c, i, arr) => !(c === '' && (i === 0 || i === arr.length - 1)));
  return cells.length >= 2 ? cells : null;
}

// Bullet/prose line: "- **Label:** value", "* Label — value", "Label: value".
function splitLabeledLine(line: string): [string, string] | null {
  const m = line.trim().match(/^[-*•]?\s*\**([A-Za-z][A-Za-z0-9 /()%\-]{1,40}?)\**\s*[:—-]\s*(.+)$/);
  if (!m) return null;
  return [cleanCell(m[1]), cleanCell(m[2])];
}

function findAlias(label: string, aliases: FieldAlias[]): FieldAlias | undefined {
  const norm = normalizeLabel(label);
  return aliases.find((a) => a.keys.some((k) => norm === k || norm.startsWith(k + ' ') || norm === k + '*'));
}

// value/notesText are matched separately: a table row's third cell
// (confidence/notes) can carry hedge language even when the value cell
// itself reads as a clean, confident number.
function extractAnswer(raw: string, valueText: string, notesText: string, alias: FieldAlias): ParsedAnswer {
  const hedge = detectHedge(valueText) || detectHedge(notesText);

  if (alias.kind === 'trait' && alias.type === 'boolean') {
    const m = valueText.match(/\b(yes|no)\b/i);
    if (!m) return { raw, hedge };
    return { raw, boolValue: m[1].toLowerCase() === 'yes', hedge };
  }

  if (alias.kind === 'trait' && alias.type === 'text') {
    // Take the value up to the first sentence break — long prose after a
    // labeled line is almost always explanation, not the answer itself.
    const text = valueText.split(/[.;]/)[0].trim();
    return { raw, text: text || undefined, hedge };
  }

  // Everything else expects a number or a range — but "not applicable"
  // is itself a fully valid answer here (the prompt explicitly invites
  // it, e.g. "or 'not a shoaling species' if that's genuinely not a
  // thing for it"), and must never get coerced into a false 0.
  if (NOT_APPLICABLE_RE.test(valueText)) {
    return { raw, notApplicable: true, hedge };
  }

  const rangeMatch = valueText.match(/(-?\d+(?:\.\d+)?)\s*[–\-—]\s*(-?\d+(?:\.\d+)?)/);
  if (rangeMatch) {
    return { raw, min: Number(rangeMatch[1]), max: Number(rangeMatch[2]), hedge };
  }
  const singleMatch = valueText.match(/(-?\d+(?:\.\d+)?)/);
  if (singleMatch) {
    return { raw, single: Number(singleMatch[1]), hedge };
  }
  // Label matched but no usable value — genuinely nothing to offer, not
  // an error. Caller filters these out.
  return { raw, hedge };
}

function hasContent(a: ParsedAnswer): boolean {
  return (
    a.notApplicable === true ||
    a.min !== undefined ||
    a.max !== undefined ||
    a.single !== undefined ||
    a.text !== undefined ||
    a.boolValue !== undefined
  );
}

// True only when two answers genuinely disagree — not just differently
// worded. Per the "don't auto-pick between conflicting matches" rule,
// this is what decides whether a second hit becomes an alternate
// (forcing a manual choice) or gets silently ignored as a redundant echo
// of the same value (common — many responses restate the table's numbers
// again in a "recommended target" summary further down).
function answersConflict(a: ParsedAnswer, b: ParsedAnswer): boolean {
  if (a.notApplicable || b.notApplicable) return a.notApplicable !== b.notApplicable;
  if (a.boolValue !== undefined || b.boolValue !== undefined) return a.boolValue !== b.boolValue;
  if (a.text !== undefined || b.text !== undefined) return a.text !== b.text;
  if (a.min !== undefined || a.max !== undefined || b.min !== undefined || b.max !== undefined) {
    return a.min !== b.min || a.max !== b.max;
  }
  return a.single !== b.single;
}

export function parseResearchResponse(text: string, category: RosterItem['category']): ParsedField[] {
  const aliases: FieldAlias[] = [
    ...WATER_PARAM_ALIASES,
    ...(category === 'plant' ? PLANT_ALIASES : LIVESTOCK_ALIASES),
  ];
  const byKey = new Map<string, ParsedField>();

  for (const line of text.split('\n')) {
    const tableCells = splitTableRow(line);
    const labeled = tableCells ?? splitLabeledLine(line);
    if (!labeled) continue;

    const [label, ...rest] = labeled;
    const alias = findAlias(label, aliases);
    if (!alias) continue;

    const valueText = rest[0] ?? '';
    const notesText = rest.slice(1).join(' | ');
    const answer = extractAnswer(cleanCell(label) + ': ' + rest.join(' | '), valueText, notesText, alias);
    if (!hasContent(answer)) continue;

    const key =
      alias.kind === 'waterParam' ? `water:${alias.param}` : alias.kind === 'trait' ? `trait:${alias.label}` : alias.kind;
    const displayLabel =
      alias.kind === 'waterParam'
        ? label
        : alias.kind === 'trait'
          ? // Strip the leading emoji token wholesale rather than matching
            // \p{Emoji} directly — multi-codepoint emoji (variation
            // selectors, ZWJ sequences) aren't fully covered by a single
            // Unicode-property match and can leave stray invisible
            // characters behind. Every known trait label here is
            // "<emoji><space><words>", so removing the first
            // whitespace-delimited token is simpler and reliably correct
            // for this specific, closed label set.
            alias.label.replace(/^\S+\s+/, '')
          : label;

    const existing = byKey.get(key);
    if (!existing) {
      byKey.set(key, {
        ...answer,
        key,
        kind: alias.kind,
        displayLabel,
        paramKey: alias.kind === 'waterParam' ? alias.param : undefined,
        traitLabel: alias.kind === 'trait' ? alias.label : undefined,
        traitType: alias.kind === 'trait' ? alias.type : undefined,
      });
    } else if (answersConflict(existing, answer)) {
      existing.alternates = [...(existing.alternates ?? []), answer];
    }
    // else: same value restated elsewhere in the paste — ignored, not an alternate.
  }

  return Array.from(byKey.values());
}
