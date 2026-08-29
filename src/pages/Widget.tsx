import { useEffect, useState } from 'react';
import { useData } from '../lib/DataContext';
import { tankLifetimeDuration } from '../lib/duration';
import { pickMostRelevantTask, formatDue, TONE_CLASSES } from '../lib/schedule';
import Waterline from '../components/Waterline';

// A minimal, chrome-less route meant to be embedded via <iframe> on an
// external page (a personal startpage, etc.) — deliberately outside
// <Layout/> in App.tsx and outside the !activeTank onboarding gate,
// the same placement /docs already established. That's not just
// convenient reuse of a pattern: since this widget can legitimately load
// with no data yet (before storage access is granted, see below), it
// must never be redirected into the onboarding flow the way a real page
// with genuinely no tank would be.
//
// Storage Access API: when this loads inside a third-party iframe (a
// different origin than Tidemark's own), browsers increasingly
// partition localStorage away from the frame by default — the same
// privacy protection that stops cross-site tracking also blocks this
// widget from reading real data the way the main app does when visited
// directly. This requests explicit access via
// document.requestStorageAccess({ localStorage: true }), the real,
// standards-based mechanism for exactly this case (see the Parking
// Lot's "Embeddable/shareable tank widget" entry for the full
// research). Chrome-only is the accepted bar for v1 — Safari either
// doesn't support the localStorage-specific extension yet, or requires
// a real user interaction on every single visit with no silent path at
// all, a known, accepted limitation, not a bug to chase here.
//
// Per MDN's own guidance, a successful grant needs a page reload to
// actually take effect: DataProvider (in App.tsx) reads localStorage
// synchronously on its very first render, before any async grant here
// could possibly resolve — so even a silently-granted return visit
// still needs one reload cycle for DataProvider's next initial read to
// pick up real data, not just the frame's storage access technically
// being active going forward.
export default function Widget() {
  const inIframe = typeof window !== 'undefined' && window.self !== window.top;
  const [status, setStatus] = useState<'checking' | 'need-tap' | 'granted' | 'unsupported' | 'denied'>(
    inIframe ? 'checking' : 'granted'
  );

  useEffect(() => {
    if (!inIframe) return;
    const hasApi = typeof (document as any).requestStorageAccess === 'function';
    if (!hasApi) {
      setStatus('unsupported');
      return;
    }
    // Try silently first — on browsers/visits where access was already
    // granted, this resolves without a prompt or a click at all. Safari
    // never resolves this without a real interaction, so it predictably
    // rejects here and falls through to the tap-to-unlock state below,
    // which is the expected, accepted path for it rather than a failure.
    (document as any)
      .requestStorageAccess({ localStorage: true })
      .then(reloadOnce, () => setStatus('need-tap'));
  }, [inIframe]);

  function handleTap() {
    (document as any)
      .requestStorageAccess({ localStorage: true })
      .then(reloadOnce, () => setStatus('denied'));
  }

  if (status === 'checking') return null;

  if (status === 'need-tap') {
    return (
      <button onClick={handleTap} className="widget-fallback">
        Tap to load tank widget
      </button>
    );
  }

  if (status === 'unsupported' || status === 'denied') {
    return (
      <a
        href="https://ettran777.github.io/aquariumTool/"
        target="_blank"
        rel="noreferrer"
        className="widget-fallback"
      >
        Open Tidemark to view
      </a>
    );
  }

  return <WidgetContent />;
}

// One reload per successful grant, guarded so a browser that somehow
// keeps re-resolving this on every render (shouldn't happen, but this
// is genuinely bleeding-edge platform behavior worth not trusting
// blindly) can't loop forever.
function reloadOnce() {
  if (sessionStorage.getItem('tidemark-widget-reloaded')) return;
  sessionStorage.setItem('tidemark-widget-reloaded', '1');
  window.location.reload();
}

function WidgetContent() {
  const { activeTank } = useData();

  if (!activeTank) {
    return <div className="widget-fallback">No tank yet</div>;
  }

  const lifetime = tankLifetimeDuration(activeTank);
  const task = pickMostRelevantTask(activeTank.schedule);
  const due = task ? formatDue(task.dueDate) : undefined;
  const lastLog = activeTank.logs.slice().sort((a, b) => b.date.localeCompare(a.date))[0];

  return (
    <div className="bg-deepwater rounded-xl px-5 py-[18px] w-[300px]">
      <div className="flex justify-between items-baseline mb-3.5">
        <span className="font-display text-[17px] font-medium text-foam">{activeTank.name}</span>
        {lifetime && <span className="font-mono text-xs text-amber">{Math.abs(lifetime.totalDays)} days</span>}
      </div>
      {task && due && (
        <div className={`rounded-lg px-3 py-2.5 mb-2.5 ${TONE_CLASSES[due.tone]}`}>
          <div className="text-[13px] font-medium text-foam">{task.label}</div>
          <div className="text-xs opacity-80">{due.label}</div>
        </div>
      )}
      {lastLog && (
        <div className="text-[11px] text-foam-dim opacity-70">
          Last logged {new Date(lastLog.date).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}
        </div>
      )}
      <div className="opacity-50 mt-3.5">
        <Waterline />
      </div>
    </div>
  );
}
