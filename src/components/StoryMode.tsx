import { useEffect, useMemo, useState } from 'react';
import type { Tank, RosterItem } from '../types';
import { tankLifetimeDuration, formatTankAge } from '../lib/duration';
import { MOOD_LABELS, type Mood } from '../lib/constants';
import Waterline from './Waterline';
import {
  computeStoryInventory,
  computePhasePacingSuperlative,
  computeMilestoneReel,
  computeRosterStar,
  computeMoodVibe,
  computeHealthEventAcknowledgment,
  pickRosterHighlightPhoto,
} from '../lib/storyMode';

// Story Mode's slide-deck mechanic (2c) with 2d's real data wired in
// (2e). Tap-to-advance (Instagram/Snapchat pattern), zero new
// dependencies — see 2c's own comments in git history for the mechanic
// reasoning, unchanged here.
//
// Deferred deliberately, not forgotten: bubble particles, background-
// color mood, wave-motif transitions between slides, and per-slide
// custom interactivity (beyond whole-slide tap navigation) — all real
// TODO items, but "does this actually feel right" iteration that's
// better done once real content is visible and reviewable, per the
// Roadmap's own framing for this step, rather than guessed at blind in
// the same pass that wires the data up in the first place.

interface StoryModeProps {
  tank: Tank;
  onClose: () => void;
}

type Screen = 'inventory' | number; // number = slide index

// requestAnimationFrame count-up — used by any slide showing a number
// worth making feel earned rather than just appearing. Triggers on
// mount, which is why slides are real components below (each gets a
// fresh `key` on navigation, forcing a real remount rather than reusing
// a cached element) — a plain pre-built ReactNode array, like 2c used
// for placeholder content, would only ever animate once on the deck's
// first render, not every time you navigate back to a slide. Default
// duration bumped to 1100ms after first testing — the original 800ms
// read as too quick to actually feel like it was counting up.
function useCountUp(target: number, durationMs = 1100): number {
  const [value, setValue] = useState(0);
  useEffect(() => {
    let raf: number;
    const start = performance.now();
    function tick(now: number) {
      const progress = Math.min((now - start) / durationMs, 1);
      setValue(Math.round(progress * target));
      if (progress < 1) raf = requestAnimationFrame(tick);
    }
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [target, durationMs]);
  return value;
}

// Headline/subtext stagger via inline animationDelay at the call site —
// one CSS class (index.css), two delay values, rather than a second
// class for "the delayed version."
function FadeIn({ delayMs = 0, children }: { delayMs?: number; children: React.ReactNode }) {
  return (
    <div className="story-fade-in" style={{ animationDelay: `${delayMs}ms` }}>
      {children}
    </div>
  );
}

export default function StoryMode({ tank, onClose }: StoryModeProps) {
  const [screen, setScreen] = useState<Screen>('inventory');
  // Position within the milestone reel specifically — a second dimension
  // of navigation state, separate from `screen`, since the reel is one
  // segment in the outer deck that contains its own tap-through sequence
  // rather than being flattened into more top-level slides. Reset to 0
  // whenever advancing forward INTO the reel; set to its last index when
  // stepping backward INTO it from the slide after it — same asymmetry
  // Instagram-style stories use, so re-entering a completed section from
  // behind resumes near its end, not jarringly back at its start.
  const [reelIndex, setReelIndex] = useState(0);

  // Memoized deliberately, not a style preference — buildSlides creates
  // a fresh inline closure for every slide's `.render` on every call.
  // Without memoization, ANY re-render of this component (for any
  // reason at all, not just real navigation) would produce a NEW
  // function reference for the currently-displayed slide's content,
  // and since <Slide key={key} /> below uses that function itself as
  // the element type, React treats a changed reference as a genuinely
  // different component — even with an unchanged key — and force-
  // remounts it. That replays FadeIn's entrance animation and resets
  // any in-progress StatNumber count-up mid-flight, which is exactly
  // what looked like the whole overlay flashing shut and reopening.
  // Keyed on the actual things that should cause new slide content:
  // the tank data itself, and reelIndex (since the milestone reel's
  // slide closure reads its current position directly).
  const inventory = useMemo(() => computeStoryInventory(tank), [tank]);
  const slides = useMemo(() => buildSlides(tank, inventory, reelIndex), [tank, inventory, reelIndex]);

  const currentSlide = typeof screen === 'number' ? slides[screen] : undefined;
  const onReel = currentSlide?.key === 'milestone-reel';
  const reel = useMemo(() => computeMilestoneReel(tank), [tank]);
  const reelLength = onReel ? reel.length : 0;

  // Background tint only applies to the two slides where a color is
  // actually justified by real data — see the CSS comment on
  // .story-bg-* for why this isn't a blanket per-slide treatment.
  const vibe = useMemo(() => computeMoodVibe(tank), [tank]);
  const backgroundClass =
    currentSlide?.key === 'mood-vibe' && vibe
      ? `story-bg-${vibe.dominantMood}`
      : currentSlide?.key === 'health-events'
        ? 'story-bg-subdued'
        : 'story-bg-default';

  // A fresh random duration each time a major slide is entered, so no
  // two tide-wipes feel mechanically identical — real water doesn't
  // move at exactly the same pace every time either. Regenerated only
  // when `screen` changes (matching the wipe's own remount cadence via
  // its key below), not on every render.
  // screen isn't referenced in the callback — it's deliberately listed
  // as a dependency anyway, purely to trigger recomputation on each
  // major-slide change (a fresh random value every time), not because
  // the calculation itself needs its value.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const tideWipeDuration = useMemo(() => 800 + Math.random() * 350, [screen]);
  // Deterministic per slide (not per-transition-random like duration
  // above) — a given slide has a recognizable wave character every time
  // you reach it, rather than the character itself being unpredictable
  // on top of the timing already being unpredictable.
  const TIDE_VARIANTS = ['story-wave-variant-swell', 'story-wave-variant-chop', 'story-wave-variant-surge'];
  const tideVariant = TIDE_VARIANTS[typeof screen === 'number' ? screen % TIDE_VARIANTS.length : 0];

  useEffect(() => {
    function handleKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
      else if (e.key === 'ArrowRight') advance();
      else if (e.key === 'ArrowLeft') retreat();
    }
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [screen, reelIndex]);

  // Moves to a top-level slide, resetting/seeding reelIndex if that slide
  // happens to be the milestone reel — centralized here so advance() and
  // retreat() don't each need their own copy of "is the destination the
  // reel, and which end should it open on."
  function goToScreen(next: Screen, enterFromEnd = false) {
    setScreen(next);
    if (typeof next === 'number' && slides[next]?.key === 'milestone-reel') {
      setReelIndex(enterFromEnd ? Math.max(reel.length - 1, 0) : 0);
    }
  }

  function advance() {
    if (onReel && reelIndex < reelLength - 1) {
      setReelIndex(reelIndex + 1);
      return;
    }
    if (screen === 'inventory') {
      goToScreen(0);
      return;
    }
    if (typeof screen === 'number' && screen < slides.length - 1) {
      goToScreen(screen + 1);
      return;
    }
    onClose(); // past the last slide — the story's over
  }

  function retreat() {
    if (onReel && reelIndex > 0) {
      setReelIndex(reelIndex - 1);
      return;
    }
    if (screen === 'inventory') return;
    if (screen === 0) {
      setScreen('inventory');
      return;
    }
    goToScreen((screen as number) - 1, true);
  }

  function handleTapZone(e: React.MouseEvent<HTMLDivElement>) {
    const rect = e.currentTarget.getBoundingClientRect();
    const tapX = e.clientX - rect.left;
    if (tapX > rect.width / 2) advance();
    else retreat();
  }

  return (
    <div
      className={`fixed inset-0 z-50 story-bg-transition flex flex-col ${backgroundClass}`}
      role="dialog"
      aria-modal="true"
      aria-label="Story Mode"
    >
      <AmbientBubbles />
      <button
        onClick={onClose}
        aria-label="Close Story Mode"
        className="absolute top-3 right-3 z-10 text-foam-dim/70 hover:text-foam text-2xl leading-none p-2"
      >
        ✕
      </button>

      {screen === 'inventory' ? (
        <InventoryScreen tank={tank} inventory={inventory} onContinue={() => setScreen(0)} onClose={onClose} />
      ) : (
        <>
          <div className="flex gap-1 px-3 pt-3">
            {slides.map((_, i) => (
              <div key={i} className="flex-1 h-1 rounded-full bg-foam/15 overflow-hidden">
                <div className={`h-full bg-amber transition-all ${i <= (screen as number) ? 'w-full' : 'w-0'}`} />
              </div>
            ))}
          </div>
          {/* Tap zones cover the whole slide area; the close button above
              sits at a higher z-index so it stays clickable without
              triggering navigation underneath it. */}
          <div className="flex-1 relative cursor-pointer select-none overflow-hidden" onClick={handleTapZone}>
            {/* Keyed on `screen` alone, deliberately not reelIndex —
                this transition is for major slide changes, not nested
                navigation within a slide (the reel today, any future
                per-slide interactivity later). Stepping through the
                reel shouldn't replay a full tide-wipe on every tap. */}
            <div key={screen} className="story-tide-wipe">
              <div
                className={`story-tide-black ${tideVariant}`}
                style={{ animationDuration: `${tideWipeDuration}ms` }}
              >
                <Waterline preserveAspectRatio="xMidYMid slice" className="story-tide-waterline-back" />
                <Waterline preserveAspectRatio="xMidYMid slice" className="story-tide-waterline" />
              </div>
            </div>
            <div className="absolute inset-0 flex flex-col items-center justify-center px-8 text-center">
              {/* key forces a fresh mount per slide (and per inner
                  milestone, when on the reel), so useCountUp/FadeIn
                  actually retrigger on every navigation, not just once. */}
              {(() => {
                const current = slides[screen as number];
                const key = current.key === 'milestone-reel' ? `milestone-reel-${reelIndex}` : current.key;
                const Slide = current.render;
                return <Slide key={key} />;
              })()}
            </div>
          </div>
        </>
      )}
    </div>
  );
}

// Ambient rising bubbles behind the whole deck — on-theme for an
// aquarium app rather than generic confetti, per the TODO's own
// reasoning. Fixed, hand-picked positions/timings rather than randomized
// per-render, so the ambiance stays stable across re-renders instead of
// bubbles jumping to new positions every time React re-evaluates this
// component.
const AMBIENT_BUBBLES = [
  { left: '8%', size: 10, duration: 14, delay: -2 },
  { left: '20%', size: 6, duration: 11, delay: -6 },
  { left: '35%', size: 14, duration: 18, delay: -10 },
  { left: '52%', size: 8, duration: 13, delay: -4 },
  { left: '68%', size: 12, duration: 16, delay: -8 },
  { left: '82%', size: 7, duration: 12, delay: -1 },
  { left: '92%', size: 10, duration: 15, delay: -12 },
];

function AmbientBubbles() {
  return (
    <div className="absolute inset-0 overflow-hidden pointer-events-none">
      {AMBIENT_BUBBLES.map((b, i) => (
        <span
          key={i}
          className="story-bubble"
          style={{
            left: b.left,
            width: b.size,
            height: b.size,
            animationDuration: `${b.duration}s`,
            animationDelay: `${b.delay}s`,
          }}
        />
      ))}
    </div>
  );
}

function InventoryScreen({
  tank,
  inventory,
  onContinue,
  onClose,
}: {
  tank: Tank;
  inventory: ReturnType<typeof computeStoryInventory>;
  onContinue: () => void;
  onClose: () => void;
}) {
  return (
    <div className="flex-1 flex flex-col items-center justify-center px-6 text-center max-w-md mx-auto">
      <p className="font-mono text-[11px] text-sand uppercase tracking-wide mb-2">Before we start</p>
      <h2 className="font-display text-2xl font-semibold mb-6">What "{tank.name}" has to work with</h2>
      <div className="w-full space-y-2 mb-6 text-left">
        {inventory.items.map((item) => (
          <div
            key={item.key}
            className={`flex items-start justify-between gap-3 rounded-lg px-3 py-2 border ${
              item.shallow ? 'border-coral/25 bg-coral/5' : 'border-moss/25 bg-deepwater-2'
            }`}
          >
            <div>
              <p className="text-sm text-foam">{item.label}</p>
              {item.shallowNote && <p className="text-xs text-foam-dim/70 mt-0.5">{item.shallowNote}</p>}
            </div>
            <span className={`font-mono text-sm ${item.shallow ? 'text-coral' : 'text-amber'}`}>
              {item.count}
            </span>
          </div>
        ))}
      </div>
      {inventory.hasAnyShallow && (
        <p className="text-xs text-foam-dim/70 mb-4">
          A few slides above will be thin or skipped — that's fine, the recap just reflects what's real so far.
        </p>
      )}
      <div className="flex gap-2 w-full">
        <button onClick={onClose} className="btn btn-ghost flex-1">
          Not yet — add more first
        </button>
        <button onClick={onContinue} className="btn btn-primary flex-1">
          Continue anyway
        </button>
      </div>
    </div>
  );
}

// Small shared badge, matching the 🚧-placeholder badge's visual weight
// from 2c but without the "placeholder" framing now that content is
// real.
function SlideBadge({ children }: { children: React.ReactNode }) {
  return (
    <span className="inline-block font-mono text-[10px] uppercase tracking-wide text-deepwater bg-amber/80 rounded px-2 py-1 mb-4">
      {children}
    </span>
  );
}

function StatNumber({ value, durationMs, className = 'font-mono' }: { value: number; durationMs?: number; className?: string }) {
  const shown = useCountUp(value, durationMs);
  return <span className={className}>{shown}</span>;
}

// One flavor sentence per roster category, for the roster-spotlight
// slide's single-winner case (a genuine tie spans possibly-mixed
// categories, so it keeps the plainer framing below instead of trying
// to force one template across several different kinds of items).
const ROSTER_STAR_FLAVOR: Record<RosterItem['category'], (name: string) => string> = {
  livestock: (name) => `Your tank was all about ${name}.`,
  plant: (name) => `${name} made this tank feel alive.`,
  equipment: (name) => `You really valued ${name}.`,
  hardscape: (name) => `${name} gave this tank its shape.`,
  substrate: (name) => `${name} was the foundation of it all.`,
};

// One narrative sentence per dominant mood — purely descriptive of the
// overall pattern, never referencing a specific event or moment (that
// would risk implying causation, exactly what 2d's computeMoodVibe
// deliberately never computes in the first place). Kept to a fixed,
// hand-written sentence per mood rather than generated text, for the
// same reason the rest of this app doesn't fabricate copy — these are
// the only four moods that exist, so four sentences fully covers it.
const MOOD_VIBE_NARRATIVE: Record<Mood, string> = {
  thriving: "More than anything, this has been a thriving stretch — steady growth and a rhythm that's working.",
  stable: 'This has mostly been a steady, dependable stretch — no major swings, just calm and consistent.',
  watching: 'A watching kind of stretch — calm on the surface, but worth keeping an eye on.',
  concerned: 'This stretch has carried some real concern — the kind of moments that make you pay closer attention.',
};

// Keeps a linked log entry's real body text to a genuine "snippet," not
// a second full entry crammed into a slide that's meant to be glanced at
// mid-story.
function truncateSnippet(text: string, maxLen = 160): string {
  if (text.length <= maxLen) return text;
  return text.slice(0, maxLen).trimEnd() + '…';
}

// Small, unscoped random sample across every log entry's photos — not
// the deeper "which photo belongs to which slide" design question still
// queued for a real brainstorming pass (see the TODO). Just a handful of
// real photos as visual texture on the closing slide specifically.
function getRandomLogPhotos(tank: Tank, count: number): string[] {
  const all = tank.logs.flatMap((l) => l.photoUrls ?? []);
  if (all.length === 0) return [];
  const shuffled = [...all];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return shuffled.slice(0, count);
}

// Builds the real slide list, skipping any slide whose underlying 2d
// function returned nothing — same gating logic the inventory screen
// already promises, just applied to what actually renders. Order
// matches the proposed slide list: opening → phase pacing → milestone
// reel → mood vibe → roster star → health events (conditional) →
// closing.
function buildSlides(tank: Tank, inventory: ReturnType<typeof computeStoryInventory>, reelIndex: number) {
  const slides: { key: string; render: () => React.ReactNode }[] = [];
  const lifetime = tankLifetimeDuration(tank);

  slides.push({
    key: 'opening',
    render: () => (
      <div>
        <FadeIn>
          <p className="font-mono text-xs text-sand uppercase tracking-wide mb-1">{tank.name}</p>
        </FadeIn>
        {lifetime ? (
          <FadeIn delayMs={200}>
            <p className="font-display text-7xl font-bold text-amber leading-none">
              <StatNumber value={Math.abs(lifetime.totalDays)} durationMs={1400} />
            </p>
            <p className="text-foam-dim text-sm mt-2">
              {lifetime.totalDays < 0 ? 'days until launch' : 'days in the making'}
            </p>
            <p className="text-foam-dim/60 text-xs mt-4">{formatTankAge(lifetime)}</p>
          </FadeIn>
        ) : (
          <FadeIn delayMs={200}>
            <h1 className="font-display text-4xl font-semibold">Just getting started</h1>
          </FadeIn>
        )}
      </div>
    ),
  });

  const pacing = computePhasePacingSuperlative(tank);
  if (pacing) {
    slides.push({
      key: 'phase-pacing',
      render: () => (
        <div>
          <FadeIn>
            <SlideBadge>🧭 Phase Pacing</SlideBadge>
          </FadeIn>
          <FadeIn delayMs={150}>
            <div className="space-y-4">
              <div>
                <p className="text-foam-dim text-sm mb-1">Longest stretch</p>
                <p className="text-foam text-2xl font-display font-semibold">
                  {pacing.longest.phase} — <StatNumber value={pacing.longest.days} /> days
                  {pacing.longest.isCurrent && (
                    <span className="text-sm text-foam-dim/70 font-sans"> (still going)</span>
                  )}
                </p>
              </div>
              <div>
                <p className="text-foam-dim text-sm mb-1">Shortest stretch</p>
                <p className="text-foam text-2xl font-display font-semibold">
                  {pacing.shortest.phase} — <StatNumber value={pacing.shortest.days} /> days
                  {pacing.shortest.isCurrent && (
                    <span className="text-sm text-foam-dim/70 font-sans"> (still going)</span>
                  )}
                </p>
              </div>
            </div>
          </FadeIn>
        </div>
      ),
    });
  }

  const reel = computeMilestoneReel(tank);
  if (reel.length > 0) {
    slides.push({
      key: 'milestone-reel',
      render: () => {
        // Clamped defensively — reelIndex is owned by the parent and
        // should always be in range by construction, but a stale value
        // during a render caused by an unrelated state change shouldn't
        // ever crash a slide.
        const idx = Math.min(reelIndex, reel.length - 1);
        const stop = reel[idx];

        // Normalize to a plain array once — a 'group' with exactly one
        // milestone (a roster item that happened to be the only addition
        // in its entry) is just as singular as a true 'single' stop, and
        // should render identically rather than picking up the
        // multi-item list styling purely because of which internal
        // classification it took. Found this while building a test
        // fixture with a deliberately lone addition (a heater added on
        // its own) — the group/single split only ever meant "does this
        // share an entry with something else," not "how many things are
        // there," and the rendering shouldn't conflate the two.
        const milestones = stop.kind === 'single' ? [stop.milestone] : stop.milestones;
        const linkedId = stop.kind === 'single' ? stop.milestone.linkedLogEntryId : stop.linkedLogEntryId;

        // The linked entry's body/photo are real supporting content
        // either way. Its TITLE is deliberately never used as the
        // headline — that was the actual bug this replaced: several
        // distinct milestones sharing one entry all displayed that
        // entry's single title, which read as the same slide repeating.
        // The milestone's own title(s) are what's real and distinct per
        // stop; the entry only ever supplies the story underneath.
        const entry = linkedId ? tank.logs.find((l) => l.id === linkedId) : undefined;
        // Deterministic (first photo, not random) — unlike the closing
        // slide's one-time sample, this slide gets re-mounted every time
        // you step between milestones, and is likely to be revisited by
        // stepping back and forth; a randomized pick would make the same
        // stop show a different photo each time you returned to it,
        // which reads as a bug, not variety.
        const photo = entry?.photoUrls?.[0];
        const snippet = entry?.body ? truncateSnippet(entry.body) : undefined;

        return (
          <div>
            <FadeIn>
              <SlideBadge>✨ Milestone Reel</SlideBadge>
            </FadeIn>
            <FadeIn delayMs={150}>
              {reel.length > 1 && (
                <div className="flex justify-center gap-1.5 mb-4">
                  {reel.map((_, i) => (
                    <span
                      key={i}
                      className={`w-1.5 h-1.5 rounded-full transition-colors ${
                        i === idx ? 'bg-amber' : 'bg-foam/20'
                      }`}
                    />
                  ))}
                </div>
              )}
              <p className="font-mono text-[10px] text-sand uppercase tracking-wide">
                {new Date(stop.date).toLocaleDateString()}
              </p>
              {milestones.length === 1 ? (
                <p className="text-foam font-display text-2xl font-semibold mt-1 max-w-sm mx-auto">
                  {milestones[0].title}
                </p>
              ) : (
                <div className="mt-1 space-y-1">
                  {milestones.map((m) => (
                    <p key={m.id} className="text-foam font-display text-xl font-semibold max-w-sm mx-auto">
                      ✨ {m.title}
                    </p>
                  ))}
                </div>
              )}
              {(snippet || photo) && (
                <div className="max-w-[180px] mx-auto my-4 opacity-60 overflow-hidden">
                  <Waterline preserveAspectRatio="xMidYMid slice" className="story-divider-waterline" />
                </div>
              )}
              {snippet && <p className="text-foam-dim text-sm max-w-sm mx-auto mb-4">{snippet}</p>}
              {photo && (
                <img
                  src={photo}
                  alt=""
                  className="w-48 h-48 rounded-lg border border-moss/30 object-cover mx-auto"
                />
              )}
            </FadeIn>
          </div>
        );
      },
    });
  }

  const vibe = computeMoodVibe(tank);
  if (vibe) {
    slides.push({
      key: 'mood-vibe',
      render: () => (
        <div>
          <FadeIn>
            <SlideBadge>Mood Vibe</SlideBadge>
          </FadeIn>
          <FadeIn delayMs={150}>
            <p className="text-foam text-2xl font-display font-semibold leading-snug mb-2 max-w-sm">
              {MOOD_VIBE_NARRATIVE[vibe.dominantMood]}
            </p>
            <p className="text-foam-dim/70 text-xs mb-6">
              Mostly {MOOD_LABELS[vibe.dominantMood].toLowerCase()}, across every mood-tagged entry so far.
            </p>
            <div className="flex gap-3 justify-center text-xs text-foam-dim">
              {(Object.keys(vibe.distribution) as (keyof typeof vibe.distribution)[])
                .filter((m) => vibe.distribution[m] > 0)
                .map((m) => (
                  <span key={m}>
                    {MOOD_LABELS[m]} × {vibe.distribution[m]}
                  </span>
                ))}
            </div>
          </FadeIn>
        </div>
      ),
    });
  }

  const star = computeRosterStar(tank);
  if (star) {
    const isTie = star.itemIds.length > 1;
    const winnerItem = !isTie ? tank.roster.find((r) => r.id === star.itemIds[0]) : undefined;
    const flavor = winnerItem ? ROSTER_STAR_FLAVOR[winnerItem.category](winnerItem.name) : undefined;
    // Only meaningful for a clear single winner — see the function's own
    // comment for why a tie doesn't try to pick a photo at all.
    const photo = winnerItem ? pickRosterHighlightPhoto(tank, winnerItem.id) : undefined;
    slides.push({
      key: 'roster-star',
      render: () => (
        <div>
          <FadeIn>
            <SlideBadge>✨ Roster Highlight</SlideBadge>
          </FadeIn>
          <FadeIn delayMs={150}>
            {isTie ? (
              <>
                <p className="text-foam-dim text-sm mb-2">Tied for the spotlight</p>
                <p className="text-foam text-3xl font-display font-semibold mb-2">{star.itemNames.join(' & ')}</p>
              </>
            ) : (
              <p className="text-foam text-2xl font-display font-semibold leading-snug mb-2 max-w-sm">{flavor}</p>
            )}
            <p className="text-foam-dim text-sm mb-4">
              highlighted <StatNumber value={star.count} /> time{star.count === 1 ? '' : 's'}
            </p>
            {photo && (
              <img
                src={photo}
                alt=""
                className="w-48 h-48 rounded-lg border border-moss/30 object-cover mx-auto"
              />
            )}
          </FadeIn>
        </div>
      ),
    });
  }

  const healthEvents = computeHealthEventAcknowledgment(tank);
  if (healthEvents.length > 0) {
    slides.push({
      key: 'health-events',
      render: () => (
        <div>
          <FadeIn>
            <SlideBadge>⚠️ Health Events</SlideBadge>
          </FadeIn>
          <FadeIn delayMs={150}>
            <div className="space-y-3 text-left px-2 max-h-[50vh] overflow-y-auto">
              {healthEvents.map((m) => (
                <div key={m.id}>
                  <p className="font-mono text-[10px] text-sand uppercase tracking-wide">
                    {new Date(m.date).toLocaleDateString()}
                  </p>
                  <p className="text-foam font-display font-semibold">{m.title}</p>
                </div>
              ))}
            </div>
          </FadeIn>
        </div>
      ),
    });
  }

  const closingPhotos = getRandomLogPhotos(tank, 3);
  slides.push({
    key: 'closing',
    render: () => (
      <div>
        <FadeIn>
          <p className="font-mono text-xs text-sand uppercase tracking-wide mb-3">So far</p>
        </FadeIn>
        <FadeIn delayMs={150}>
          <h2 className="font-display text-2xl font-semibold mb-4">That's the story of {tank.name}</h2>
          <div className="flex flex-wrap gap-3 justify-center text-sm text-foam-dim mb-2">
            {inventory.items
              .filter((i) => i.count > 0)
              .map((i) => (
                <span key={i.key}>
                  <StatNumber value={i.count} /> {i.label.toLowerCase()}
                </span>
              ))}
          </div>
          <p className="text-foam-dim text-sm mb-6">— for now. Come back once there's more to tell.</p>
          {closingPhotos.length > 0 && (
            <div className="flex gap-3 justify-center flex-wrap">
              {closingPhotos.map((url, i) => (
                <img
                  key={i}
                  src={url}
                  alt=""
                  className="w-32 h-32 rounded-lg border border-moss/30 object-cover"
                />
              ))}
            </div>
          )}
        </FadeIn>
      </div>
    ),
  });

  return slides;
}