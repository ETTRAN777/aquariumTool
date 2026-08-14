import type { Tank, RosterItem, WaterParams, LogPhase } from '../types';
import { CATEGORY_LABELS, STATUS_LABELS, LOG_PHASE_LABELS } from './constants';
import { todayIso, toIsoDate } from './date';
import { calendarDurationBetween, formatTankAge, tankLifetimeDuration } from './duration';
import {
  aggregateWaterParamTarget,
  computeParamStatus,
  checkMineralLoadConsistency,
  computePredationThreats,
  computeAggressionThreats,
  hasShoalingIssue,
  hasPlantHerbivoryRisk,
  hasTankSizeIssue,
  hasTankWidthIssue,
  waterParamLabel,
} from './targets';

// Same "hand off to the user's own AI" pattern as conceptImage.ts, but for
// a different purpose: not a visual, a readable plan-review document —
// roster, checklist progress, and Compatibility's actual computed state
// (not raw traits re-dumped, the same aggregation/risk functions Targets.tsx
// itself calls, so this can never drift out of sync with what the app
// shows on-screen). Every section is built from real stored/computed data
// only; nothing here is invented, same rule as everywhere else in the app.

const FRESHWATER_PARAMS: (keyof WaterParams)[] = ['temperature', 'ph', 'gh', 'kh', 'tds'];
const SALTWATER_PARAMS: (keyof WaterParams)[] = ['temperature', 'ph', 'salinity'];

function latestValue(tank: Tank, param: keyof WaterParams): number | undefined {
  const entry = tank.logs.find((l) => l.params?.[param] !== undefined);
  return entry?.params?.[param];
}

function tankHeaderLines(tank: Tank): string[] {
  const waterType = tank.waterType === 'saltwater' ? 'Saltwater' : 'Freshwater';
  const dims = tank.dimensions ? `, ${tank.dimensions}` : '';
  const style = tank.style ? `\nStyle: ${tank.style}` : '';
  const startDate = tank.startDate ? `\nStart date: ${tank.startDate}` : '';
  return [
    `# ${tank.name}`,
    `${tank.sizeGallons}-gallon ${waterType.toLowerCase()} tank${dims}${style}${startDate}`,
  ];
}

function buildRosterSection(tank: Tank): string {
  const lines: string[] = ['## Roster'];
  const categories: RosterItem['category'][] = [
    'livestock',
    'plant',
    'hardscape',
    'substrate',
    'equipment',
  ];

  const anyItems = tank.roster.length > 0;
  if (!anyItems) {
    lines.push('(No roster items added yet.)');
    return lines.join('\n');
  }

  for (const category of categories) {
    const items = tank.roster.filter((r) => r.category === category);
    if (items.length === 0) continue;
    lines.push(`\n${CATEGORY_LABELS[category]}:`);
    for (const item of items) {
      const qty = item.quantity && item.quantity > 1 ? `${item.quantity}x ` : '';
      const status = STATUS_LABELS[item.status];
      const detail = item.detail ? ` — ${item.detail}` : '';
      lines.push(`- ${qty}${item.name} (${status})${detail}`);
    }
  }

  return lines.join('\n');
}

function buildChecklistSection(tank: Tank): string {
  const lines: string[] = ['## Build checklist'];
  if (tank.checklist.length === 0) {
    lines.push('(No checklist steps yet.)');
    return lines.join('\n');
  }

  const completed = tank.checklist.filter((c) => c.done);
  const remaining = tank.checklist.filter((c) => !c.done);
  const pct = Math.round((completed.length / tank.checklist.length) * 100);
  lines.push(`${completed.length} of ${tank.checklist.length} steps complete (${pct}%)`);

  if (completed.length > 0) {
    lines.push('\nCompleted steps:');
    for (const task of completed) {
      lines.push(`- ${task.label}`);
    }
  }

  if (remaining.length > 0) {
    lines.push('\nRemaining steps:');
    for (const task of remaining) {
      lines.push(`- ${task.label}`);
    }
  }

  return lines.join('\n');
}

// Mirrors Targets.tsx's tank-wide summary exactly — same aggregation and
// status functions, same "no-target"/"no-data" distinction preserved
// rather than collapsed into a false all-clear.
function buildWaterTargetsSection(tank: Tank): string {
  const lines: string[] = ['## Water parameter targets (tank-wide)'];
  const relevantParams = tank.waterType === 'saltwater' ? SALTWATER_PARAMS : FRESHWATER_PARAMS;
  const targetableItems = tank.roster.filter(
    (r) => r.category === 'livestock' || r.category === 'plant'
  );

  if (targetableItems.length === 0) {
    lines.push('(No livestock or plants added yet, so no targets to aggregate.)');
    return lines.join('\n');
  }

  for (const param of relevantParams) {
    const aggregated = aggregateWaterParamTarget(tank.roster, param);
    const current = latestValue(tank, param);
    const status = computeParamStatus(aggregated, current);
    const label = waterParamLabel(param);

    if (!aggregated) {
      lines.push(`- ${label}: no targets set`);
      continue;
    }

    let line = `- ${label}: target ${aggregated.min ?? '—'} to ${aggregated.max ?? '—'}`;
    if (aggregated.conflict) {
      line += ` ⚠ CONFLICT — ${aggregated.minContributor} needs ≥${aggregated.min}, but ${aggregated.maxContributor} needs ≤${aggregated.max}`;
    }
    if (current !== undefined) {
      line += `, current ${current}`;
      if (status === 'alert') line += ' ⚠ OUT OF TARGET';
    } else {
      line += ', not logged yet';
    }
    lines.push(line);
  }

  const mineralLoadCheck = checkMineralLoadConsistency(tank.roster);
  if (mineralLoadCheck?.status === 'unreachable') {
    lines.push(
      `\n⚠ Conflicting targets: GH, KH, and TDS — this is a simple arithmetic check (not real aquarium chemistry): GH (${mineralLoadCheck.ghMinPpm.toFixed(0)}–${mineralLoadCheck.ghMaxPpm.toFixed(0)} ppm as CaCO₃) + KH (${mineralLoadCheck.khMinPpm.toFixed(0)}–${mineralLoadCheck.khMaxPpm.toFixed(0)} ppm) put a floor of ${mineralLoadCheck.hardFloorPpm.toFixed(0)} ppm under the water even at the most TDS-minimizing meter calibration on record — over the ${mineralLoadCheck.tdsMax} ppm TDS ceiling. No realistic meter reconciles these three numbers as set.`
    );
  } else if (mineralLoadCheck?.status === 'unlikely') {
    lines.push(
      `\nWorth double-checking: GH, KH, and TDS — just arithmetic, not real chemistry knowledge: under a typical meter calibration, GH + KH imply a mineral floor of ${mineralLoadCheck.typicalFloorPpm.toFixed(0)} ppm against a TDS ceiling of ${mineralLoadCheck.tdsMax} ppm. Not a hard conflict — depends on the specific meter — but worth a look once water is actually mixed to these targets.`
    );
  } else if (mineralLoadCheck?.status === 'ok' && !mineralLoadCheck.rawRangeWithinTds) {
    lines.push(
      `\n(FYI: GH + KH imply a mineral load that could realistically read up to ${mineralLoadCheck.realisticCeilingPpm.toFixed(0)} ppm on TDS (raw mass ${mineralLoadCheck.minCombinedPpm.toFixed(0)}–${mineralLoadCheck.maxCombinedPpm.toFixed(0)} ppm as CaCO₃, scaled by the highest documented meter calibration factor). Not a conflict with the ${mineralLoadCheck.tdsMax} ppm TDS target, just context.)`
    );
  }

  return lines.join('\n');
}

// Mirrors the per-item flag pills on Targets.tsx — same functions, so a
// flag can never appear here that wouldn't also appear on-screen, or vice
// versa.
function buildRisksSection(tank: Tank): string {
  const lines: string[] = ['## Compatibility flags'];
  const flagged: string[] = [];

  for (const item of tank.roster) {
    const itemFlags: string[] = [];

    const threats = computePredationThreats(tank.roster, item);
    if (threats.length > 0) {
      itemFlags.push(`Predation risk to: ${threats.map((t) => t.preyName).join(', ')}`);
    }

    const aggressionThreats = computeAggressionThreats(tank.roster, item);
    if (aggressionThreats.length > 0) {
      itemFlags.push(`Fin-nipping risk to: ${aggressionThreats.map((t) => t.victimName).join(', ')}`);
    }

    if (hasShoalingIssue(item)) {
      itemFlags.push('Below minimum group size');
    }

    if (hasPlantHerbivoryRisk(tank.roster, item)) {
      itemFlags.push('May eat/uproot plants in this tank');
    }

    if (hasTankSizeIssue(item, tank)) {
      itemFlags.push('Tank too small (length)');
    }

    if (hasTankWidthIssue(item, tank)) {
      itemFlags.push('Tank too small (width)');
    }

    if (itemFlags.length > 0) {
      flagged.push(`- ${item.name}: ${itemFlags.join('; ')}`);
    }
  }

  if (flagged.length === 0) {
    lines.push('No flags currently raised on any roster item.');
  } else {
    lines.push(...flagged);
  }

  return lines.join('\n');
}

// Mirrors Schedule.tsx's own categorization (active vs finished, overdue vs
// upcoming by comparing dueDate to today) rather than inventing a new
// grouping — so this can't disagree with what the Schedule page shows.
function buildScheduleSection(tank: Tank): string {
  const lines: string[] = ['## Schedule'];
  if (tank.schedule.length === 0) {
    lines.push('(No schedule tasks yet.)');
    return lines.join('\n');
  }

  const today = todayIso();
  const active = tank.schedule.filter((t) => !t.done);
  const finished = tank.schedule.filter((t) => t.done);

  const overdue = active
    .filter((t) => t.dueDate < today)
    .sort((a, b) => a.dueDate.localeCompare(b.dueDate));
  const upcoming = active
    .filter((t) => t.dueDate >= today)
    .sort((a, b) => a.dueDate.localeCompare(b.dueDate));

  function describeTask(t: (typeof tank.schedule)[number]): string {
    const recurrence = t.recurrenceDays ? `, recurring every ${t.recurrenceDays}d` : '';
    const lastDone = t.lastCompletedDate ? `, last done ${t.lastCompletedDate}` : '';
    const detail = t.detail ? ` — ${t.detail}` : '';
    return `- ${t.label} (due ${t.dueDate}${recurrence}${lastDone})${detail}`;
  }

  if (overdue.length > 0) {
    lines.push('\nOverdue:');
    for (const t of overdue) lines.push(describeTask(t));
  }

  if (upcoming.length > 0) {
    lines.push('\nUpcoming:');
    for (const t of upcoming) lines.push(describeTask(t));
  }

  if (overdue.length === 0 && upcoming.length === 0) {
    lines.push('No active (undone) tasks.');
  }

  if (finished.length > 0) {
    lines.push(`\n${finished.length} one-off task${finished.length === 1 ? '' : 's'} marked done.`);
  }

  return lines.join('\n');
}

function buildLatestLogSection(tank: Tank): string {
  const lines: string[] = ['## Latest log entry'];
  const latest = tank.logs[0];
  if (!latest) {
    lines.push('(No log entries yet.)');
    return lines.join('\n');
  }
  lines.push(`${latest.weekLabel} — ${latest.date}`);
  lines.push(latest.title);
  if (latest.mood) lines.push(`Mood: ${latest.mood}`);
  if (latest.body) lines.push(latest.body);
  return lines.join('\n');
}

const CLOSING_LINE =
  "This is the tank's actual current plan and computed state, generated directly from stored data — nothing above is invented. Please review for anything that looks off, risky, or worth reconsidering, and flag it back.";

export function buildPlanSummary(tank: Tank): string {
  const sections = [
    tankHeaderLines(tank).join('\n'),
    buildRosterSection(tank),
    buildChecklistSection(tank),
    buildScheduleSection(tank),
    buildWaterTargetsSection(tank),
    buildRisksSection(tank),
    buildLatestLogSection(tank),
    CLOSING_LINE,
  ];
  return sections.join('\n\n');
}

// A distinct ask from buildPlanSummary above — that one hands off a
// general "here's my plan" summary; this one asks a specific judgment
// question (is the overall stocking plan sound?) with explicit
// guardrails on how confidently the answering AI should assert a
// problem exists. Reuses buildRosterSection/buildWaterTargetsSection/
// buildRisksSection rather than re-deriving the same data a second way —
// same reasoning as everywhere else in this file, so this can't
// contradict what the app itself already computed.
const STOCKING_LOAD_ASK = `Please evaluate whether this overall stocking plan — tank size, hardscape/substrate, equipment, and livestock/plants together — is sound, keeping a few things in mind:

- Only tell me something is a hard no if it's genuinely extreme or unsafe on its face (the kind of thing that's obviously wrong regardless of nuance, like a carp in a 2-gallon bowl) — don't hedge on something that's actually fine just to sound cautious.
- For subtler or longer-horizon concerns — bioload building up faster than filtration or plants can realistically handle over time, eventual overcrowding, an equipment mismatch that only shows up months in, that kind of thing — give me your own honest take on it first, then point me toward what specifically I should research further to resolve the concern myself (concepts, comparisons, or search terms worth looking into), rather than just flagging it vaguely and leaving it there.
- I'd rather hear about a real risk with something concrete to go look into than get a blanket reassurance either way.`;

export function buildStockingLoadResearchPrompt(tank: Tank): string {
  const sections = [
    "I'd like a second opinion on my aquarium stocking plan before I commit to it.",
    tankHeaderLines(tank).join('\n'),
    buildRosterSection(tank),
    "## What the app itself has already computed (for context, so you're not re-deriving it)",
    buildWaterTargetsSection(tank),
    buildRisksSection(tank),
    STOCKING_LOAD_ASK,
  ];
  return sections.join('\n\n');
}

// A genuinely different question from the two prompts above — those are
// forward-looking (here's my plan, here's what I'm about to do). This is
// backward-looking: here's what actually happened, and how it unfolded
// in practice, not the plan. Needs different data than a roster/targets
// snapshot: real per-phase pacing and the major-milestone sequence in
// order, both pulled straight from what the app already tracks — never
// re-derived or guessed.
function buildPhaseSegments(tank: Tank): { phase: LogPhase; startDate: string; days: number }[] {
  const transitions = [...tank.milestones]
    .filter((m): m is typeof m & { phase: LogPhase } => m.type === 'phase-change' && m.phase !== undefined)
    .sort((a, b) => a.date.localeCompare(b.date));

  return transitions.map((t, i) => {
    const startIso = toIsoDate(new Date(t.date));
    const endIso = i + 1 < transitions.length ? toIsoDate(new Date(transitions[i + 1].date)) : todayIso();
    const duration = calendarDurationBetween(startIso, endIso);
    return { phase: t.phase, startDate: startIso, days: duration.totalDays };
  });
}

export function buildProgressCheckPrompt(tank: Tank): string {
  const lifetime = tankLifetimeDuration(tank);
  const ageLine = lifetime
    ? `This tank is ${formatTankAge(lifetime)} old.`
    : "This tank doesn't have a start date set, so I can't give an overall age.";

  const segments = buildPhaseSegments(tank);
  const phaseLines =
    segments.length > 0
      ? segments
          .map((s, i) => {
            const isCurrent = i === segments.length - 1;
            const dayLabel = `${s.days} day${s.days === 1 ? '' : 's'}`;
            return `- ${LOG_PHASE_LABELS[s.phase]}: ${dayLabel}${isCurrent ? ' (current phase, still ongoing)' : ''}`;
          })
          .join('\n')
      : '(No phase has been tagged on a log entry yet — no pacing data to show.)';

  const majorMilestones = [...tank.milestones]
    .filter((m) => m.major)
    .sort((a, b) => a.date.localeCompare(b.date));
  const milestoneLines =
    majorMilestones.length > 0
      ? majorMilestones.map((m) => `- ${new Date(m.date).toLocaleDateString()}: ${m.title}`).join('\n')
      : '(No major milestones recorded yet.)';

  return `I'd like an honest progress check on how this aquarium build has actually unfolded so far — the real timeline of what happened, not the original plan.

${ageLine}

Time spent in each phase reached so far:
${phaseLines}

Major milestones in order:
${milestoneLines}

Please give an honest take on the pacing — was any phase suspiciously fast or slow for what it actually was? Is there a pattern in the sequence itself, now that it's visible in hindsight, worth knowing about? A couple things to keep in mind:

- Most of this has already happened and can't be undone. If something looks like it was handled imperfectly, the useful response is a concrete next step to take now, not a critique of a decision that's already in the past.
- If nothing here actually looks concerning, say so plainly rather than manufacturing something to seem thorough.`;
}