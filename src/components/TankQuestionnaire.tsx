import { useState } from 'react';
import type { Question, QuestionNode, QuestionOption, RecommendedRosterItem } from '../types';

export default function TankQuestionnaire({
  root,
  sizeGallons,
  onComplete,
  onSkip,
}: {
  root: Question;
  sizeGallons: number;
  onComplete: (items: RecommendedRosterItem[]) => void;
  onSkip: () => void;
}) {
  // History stack, not just "current node" — lets Back actually rewind
  // instead of just resetting to the start.
  const [history, setHistory] = useState<QuestionNode[]>([root]);
  const current = history[history.length - 1];

  function selectOption(opt: QuestionOption) {
    setHistory((h) => [...h, opt.next]);
  }

  function goBack() {
    setHistory((h) => (h.length > 1 ? h.slice(0, -1) : h));
  }

  return (
    <div className="card p-5 space-y-4">
      <div className="flex items-center justify-between">
        {history.length > 1 ? (
          <button type="button" onClick={goBack} className="btn-icon">
            ← Back
          </button>
        ) : (
          <span />
        )}
        <button type="button" onClick={onSkip} className="text-xs text-amber hover:underline">
          I know what I'm doing — skip this
        </button>
      </div>

      {current.kind === 'question' ? (
        <div>
          <p className="font-display text-xl font-semibold mb-4">{current.prompt}</p>
          <div className="grid sm:grid-cols-2 gap-2">
            {current.options.map((opt) => (
              <button
                key={opt.id}
                type="button"
                onClick={() => selectOption(opt)}
                className="text-left p-3 rounded-lg border border-moss/30 bg-deepwater-2 hover:border-amber/50 hover:bg-amber/5 transition-colors"
              >
                {opt.emoji && <span className="mr-2">{opt.emoji}</span>}
                <span className="text-sm font-medium">{opt.label}</span>
              </button>
            ))}
          </div>
        </div>
      ) : (
        <ResultPicker result={current} sizeGallons={sizeGallons} onComplete={onComplete} />
      )}
    </div>
  );
}

function ResultPicker({
  result,
  sizeGallons,
  onComplete,
}: {
  result: Extract<QuestionNode, { kind: 'result' }>;
  sizeGallons: number;
  onComplete: (items: RecommendedRosterItem[]) => void;
}) {
  const items = typeof result.items === 'function' ? result.items(sizeGallons) : result.items;
  const [checked, setChecked] = useState<boolean[]>(items.map((i) => i.defaultSelected));

  function toggle(i: number) {
    setChecked((c) => c.map((v, idx) => (idx === i ? !v : v)));
  }

  const selectedCount = checked.filter(Boolean).length;

  return (
    <div>
      <p className="font-mono text-xs text-sand uppercase tracking-wide mb-1">Recommended for</p>
      <p className="font-display text-xl font-semibold mb-4">{result.summary}</p>
      <div className="space-y-2 mb-4">
        {items.map((item, i) => (
          <label
            key={item.name}
            className="flex items-start gap-3 p-3 rounded-lg border border-moss/20 bg-deepwater-2 cursor-pointer"
          >
            <input
              type="checkbox"
              checked={checked[i]}
              onChange={() => toggle(i)}
              className="mt-0.5"
            />
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-sm font-medium text-foam">{item.name}</span>
                {item.quantity ? (
                  <span className="text-xs text-foam-dim">×{item.quantity}</span>
                ) : null}
                {item.cost !== undefined && (
                  <span className="font-mono text-xs text-sand">${item.cost.toFixed(2)}</span>
                )}
              </div>
              {item.detail && (
                <p className="text-xs text-foam-dim mt-1 leading-relaxed">{item.detail}</p>
              )}
            </div>
          </label>
        ))}
      </div>
      <button
        type="button"
        onClick={() => onComplete(items.filter((_, i) => checked[i]))}
        className="btn btn-primary w-full"
      >
        Add {selectedCount} item{selectedCount === 1 ? '' : 's'} to roster
      </button>
    </div>
  );
}
