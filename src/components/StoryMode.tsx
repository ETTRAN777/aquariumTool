import { useEffect, useState } from 'react';
import type { Tank, RosterItem } from '../types';
import { tankLifetimeDuration, formatTankAge } from '../lib/duration';
import { MOOD_LABELS, type Mood } from '../lib/constants';
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

  const inventory = computeStoryInventory(tank);
  const slides = buildSlides(tank, inventory);

  useEffect(() => {
    function handleKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
      else if (e.key === 'ArrowRight') advance();
      else if (e.key === 'ArrowLeft') retreat();
    }
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [screen]);

  function advance() {
    if (screen === 'inventory') setScreen(0);
    else if (typeof screen === 'number' && screen < slides.length - 1) setScreen(screen + 1);
    else onClose(); // past the last slide — the story's over
  }

  function retreat() {
    if (screen === 'inventory') return;
    if (screen === 0) setScreen('inventory');
    else setScreen((screen as number) - 1);
  }

  function handleTapZone(e: React.MouseEvent<HTMLDivElement>) {
    const rect = e.currentTarget.getBoundingClientRect();
    const tapX = e.clientX - rect.left;
    if (tapX > rect.width / 2) advance();
    else retreat();
  }

  return (
    <div
      className="fixed inset-0 z-50 bg-deepwater flex flex-col"
      role="dialog"
      aria-modal="true"
      aria-label="Story Mode"
    >
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
          <div className="flex-1 relative cursor-pointer select-none" onClick={handleTapZone}>
            <div className="absolute inset-0 flex flex-col items-center justify-center px-8 text-center">
              {/* key forces a fresh mount per slide, so useCountUp/FadeIn
                  actually retrigger on every navigation, not just once. */}
              {(() => {
                const Slide = slides[screen as number].render;
                return <Slide key={slides[screen as number].key} />;
              })()}
            </div>
          </div>
        </>
      )}
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
function buildSlides(tank: Tank, inventory: ReturnType<typeof computeStoryInventory>) {
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
      render: () => (
        <div className="max-h-full">
          <FadeIn>
            <SlideBadge>✨ Milestone Reel</SlideBadge>
          </FadeIn>
          <FadeIn delayMs={150}>
            <div className="space-y-3 max-h-[50vh] overflow-y-auto text-left px-2">
              {reel.map((m) => (
                <div key={m.id}>
                  <p className="font-mono text-[10px] text-sand uppercase tracking-wide">
                    {new Date(m.date).toLocaleDateString()}
                  </p>
                  <p className="text-foam font-display font-semibold">✨ {m.title}</p>
                </div>
              ))}
            </div>
          </FadeIn>
        </div>
      ),
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
                className="w-40 h-40 rounded-lg border border-moss/30 object-cover mx-auto"
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
                  className="w-28 h-28 rounded-lg border border-moss/30 object-cover"
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