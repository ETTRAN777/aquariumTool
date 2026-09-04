import { useState } from 'react';
import { parseResearchResponse, type ParsedField, type ParsedAnswer } from '../lib/researchParse';
import type { RosterItem } from '../types';
import { waterParamLabel } from '../lib/targets';
import AutoResizeTextarea from './AutoResizeTextarea';

// Per-field accept state. A field defaults to "accept" EXCEPT when it's
// hedge-flagged (per the "worth double-checking, not a blanket disclaimer"
// rule — that has to mean something, so a hedged field rides along with
// nothing else by default) or ambiguous (nothing gets picked for the user).
type Decision = { accept: boolean; chosenAlternateIndex?: number };

function formatAnswer(f: ParsedAnswer, kind: ParsedField['kind']): string {
  if (f.notApplicable) return 'Not applicable';
  if (f.boolValue !== undefined) return f.boolValue ? 'Yes' : 'No';
  if (f.text !== undefined) return f.text;
  if (f.min !== undefined || f.max !== undefined) {
    return `${f.min ?? '—'}–${f.max ?? '—'}`;
  }
  if (f.single !== undefined) {
    return kind === 'mouthSize' ? `${f.single} mm` : kind === 'adultSize' ? `${f.single} in` : String(f.single);
  }
  return '—';
}

export default function ResearchAutoFill({
  item,
  updateRosterItem,
}: {
  item: RosterItem;
  updateRosterItem: (item: RosterItem) => void;
}) {
  const [open, setOpen] = useState(false);
  const [pasted, setPasted] = useState('');
  const [fields, setFields] = useState<ParsedField[] | null>(null);
  const [decisions, setDecisions] = useState<Record<string, Decision>>({});
  const [appliedCount, setAppliedCount] = useState<number | null>(null);

  function handleParse() {
    const category = item.category === 'plant' ? 'plant' : 'livestock';
    const result = parseResearchResponse(pasted, category);
    const initialDecisions: Record<string, Decision> = {};
    for (const f of result) {
      // Ambiguous fields (conflicting matches found) start unaccepted with
      // nothing pre-chosen — the user has to actually look and pick, not
      // just click through a default. Hedged fields also start
      // unaccepted, for the same "worth double-checking" reason. Clean,
      // unambiguous, non-hedged matches default to accepted, same as a
      // normal diff-review screen.
      initialDecisions[f.key] = { accept: !f.hedge && !f.alternates?.length };
    }
    setDecisions(initialDecisions);
    setFields(result);
    setAppliedCount(null);
  }

  function toggleAccept(key: string) {
    setDecisions((d) => ({ ...d, [key]: { ...d[key], accept: !d[key]?.accept } }));
  }

  function chooseAlternate(key: string, index: number | 'primary') {
    setDecisions((d) => ({
      ...d,
      [key]: { accept: true, chosenAlternateIndex: index === 'primary' ? undefined : index },
    }));
  }

  function apply() {
    if (!fields) return;
    let waterParamTargets = { ...item.waterParamTargets };
    let mouthSizeMm = item.mouthSizeMm;
    let adultSizeIn = item.adultSizeIn;
    let traits = [...(item.traits ?? [])];
    let applied = 0;

    for (const f of fields) {
      const decision = decisions[f.key];
      if (!decision?.accept) continue;
      const answer: ParsedAnswer =
        decision.chosenAlternateIndex !== undefined ? f.alternates![decision.chosenAlternateIndex] : f;
      if (answer.notApplicable) continue; // nothing to write — leaving the field unset already means this

      if (f.kind === 'waterParam' && f.paramKey) {
        waterParamTargets = {
          ...waterParamTargets,
          [f.paramKey]: { min: answer.min ?? answer.single, max: answer.max ?? answer.single },
        };
        applied++;
      } else if (f.kind === 'mouthSize' && answer.single !== undefined) {
        mouthSizeMm = answer.single;
        applied++;
      } else if (f.kind === 'adultSize' && answer.single !== undefined) {
        adultSizeIn = answer.single;
        applied++;
      } else if (f.kind === 'trait' && f.traitLabel && f.traitType) {
        const value = answer.boolValue ?? answer.text ?? answer.single;
        if (value === undefined) continue;
        const existingIdx = traits.findIndex((t) => t.label === f.traitLabel);
        if (existingIdx >= 0) {
          traits = traits.map((t, i) => (i === existingIdx ? { ...t, value } : t));
        } else {
          traits = [...traits, { id: crypto.randomUUID(), label: f.traitLabel, type: f.traitType, value }];
        }
        applied++;
      }
    }

    updateRosterItem({ ...item, waterParamTargets, mouthSizeMm, adultSizeIn, traits });
    setAppliedCount(applied);
    setFields(null);
    setPasted('');
  }

  const acceptedCount = fields ? fields.filter((f) => decisions[f.key]?.accept).length : 0;

  return (
    <div>
      <button
        onClick={() => setOpen((o) => !o)}
        className="btn btn-secondary text-xs py-1.5 px-3"
      >
        {open ? 'Hide paste box' : '📥 Paste research response'}
      </button>

      {open && (
        <div className="mt-3 space-y-3">
          {!fields && (
            <>
              <AutoResizeTextarea
                value={pasted}
                onChange={setPasted}
                placeholder="Paste the AI's response here — the whole reply, just the table, whatever you have. Only fields matching this item's research prompt get recognized; everything else is ignored."
                className="field text-xs leading-relaxed"
              />
              <button
                onClick={handleParse}
                disabled={!pasted.trim()}
                className="btn btn-secondary text-xs py-1.5 px-3 disabled:opacity-40"
              >
                Parse
              </button>
            </>
          )}

          {fields && fields.length === 0 && (
            <p className="text-xs text-foam-dim">
              Nothing recognized in that paste — it may not be a response to this item's research
              prompt, or its fields may not have used labels close enough to it to match safely.
              <button
                onClick={() => setFields(null)}
                className="ml-2 text-amber hover:underline"
              >
                Try again
              </button>
            </p>
          )}

          {fields && fields.length > 0 && (
            <div className="space-y-2">
              {fields.map((f) => {
                const decision = decisions[f.key] ?? { accept: false };
                const isAmbiguous = !!f.alternates?.length;
                return (
                  <div
                    key={f.key}
                    className={`rounded-lg border p-2.5 ${
                      isAmbiguous
                        ? 'border-amber/40 bg-amber/5'
                        : f.hedge
                          ? 'border-amber/30 bg-amber/5'
                          : decision.accept
                            ? 'border-moss/30 bg-moss/5'
                            : 'border-moss/15 bg-deepwater-2'
                    }`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="text-xs font-semibold text-foam flex items-center gap-1.5 flex-wrap">
                          {f.kind === 'waterParam' ? waterParamLabel(f.paramKey!) : f.displayLabel}
                          {f.hedge && (
                            <span className="pill text-[10px] py-0.5 px-1.5 bg-amber/20 text-amber border border-amber/40">
                              ⚠ low confidence
                            </span>
                          )}
                          {f.notApplicable && (
                            <span className="pill text-[10px] py-0.5 px-1.5 bg-moss/15 text-foam-dim">
                              source says N/A
                            </span>
                          )}
                        </p>
                        <p className="text-[11px] text-foam-dim/70 mt-0.5 font-mono truncate" title={f.raw}>
                          {f.raw}
                        </p>
                      </div>
                      {!isAmbiguous && !f.notApplicable && (
                        <label className="flex items-center gap-1.5 text-[11px] text-foam-dim shrink-0 pt-0.5">
                          <input
                            type="checkbox"
                            checked={decision.accept}
                            onChange={() => toggleAccept(f.key)}
                          />
                          Accept
                        </label>
                      )}
                    </div>

                    {isAmbiguous ? (
                      <div className="mt-2 space-y-1">
                        <p className="text-[11px] text-amber">
                          Multiple different values found for this field — pick one:
                        </p>
                        <label className="flex items-center gap-2 text-xs">
                          <input
                            type="radio"
                            name={`alt-${f.key}`}
                            checked={decision.accept && decision.chosenAlternateIndex === undefined}
                            onChange={() => chooseAlternate(f.key, 'primary')}
                          />
                          {formatAnswer(f, f.kind)}
                          <span className="text-foam-dim/60 font-mono text-[10px] truncate">{f.raw}</span>
                        </label>
                        {f.alternates!.map((alt, i) => (
                          <label key={i} className="flex items-center gap-2 text-xs">
                            <input
                              type="radio"
                              name={`alt-${f.key}`}
                              checked={decision.accept && decision.chosenAlternateIndex === i}
                              onChange={() => chooseAlternate(f.key, i)}
                            />
                            {formatAnswer(alt, f.kind)}
                            <span className="text-foam-dim/60 font-mono text-[10px] truncate">{alt.raw}</span>
                          </label>
                        ))}
                        <label className="flex items-center gap-2 text-xs text-foam-dim">
                          <input
                            type="radio"
                            name={`alt-${f.key}`}
                            checked={!decision.accept}
                            onChange={() => setDecisions((d) => ({ ...d, [f.key]: { accept: false } }))}
                          />
                          Skip this field
                        </label>
                      </div>
                    ) : (
                      !f.notApplicable && (
                        <p className="text-xs text-foam mt-1">{formatAnswer(f, f.kind)}</p>
                      )
                    )}
                  </div>
                );
              })}

              <div className="flex items-center gap-2 pt-1">
                <button
                  onClick={apply}
                  disabled={acceptedCount === 0}
                  className="btn btn-primary text-xs py-1.5 px-3 disabled:opacity-40"
                >
                  Apply {acceptedCount > 0 ? `${acceptedCount} selected` : ''}
                </button>
                <button
                  onClick={() => setFields(null)}
                  className="btn btn-ghost text-xs py-1.5 px-3"
                >
                  Cancel
                </button>
              </div>
            </div>
          )}

          {appliedCount !== null && (
            <p className="text-xs text-moss-light">
              ✓ Applied {appliedCount} field{appliedCount === 1 ? '' : 's'} to {item.name}.
            </p>
          )}
        </div>
      )}
    </div>
  );
}
