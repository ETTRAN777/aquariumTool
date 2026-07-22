import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useData } from '../lib/DataContext';
import { todayIso } from '../lib/date';
import { MOOD_LABELS } from '../lib/constants';
import { buildConceptImagePromptSimple, buildConceptImagePromptDetailed } from '../lib/conceptImage';
import type { CustomFieldValue } from '../types';

export default function Dashboard() {
  const { activeTank } = useData();
  const [copiedPrompt, setCopiedPrompt] = useState<'simple' | 'detailed' | null>(null);
  if (!activeTank) return null;
  const { roster, checklist, logs, customFields, schedule } = activeTank;

  function handleCopyImagePrompt(variant: 'simple' | 'detailed') {
    if (!activeTank) return;
    const prompt =
      variant === 'simple'
        ? buildConceptImagePromptSimple(activeTank)
        : buildConceptImagePromptDetailed(activeTank);
    navigator.clipboard
      .writeText(prompt)
      .then(() => {
        setCopiedPrompt(variant);
        setTimeout(() => setCopiedPrompt(null), 2000);
      })
      .catch(() => {});
  }

  const tasksDone = checklist.filter((c) => c.done).length;
  const progressPct = checklist.length
    ? Math.round((tasksDone / checklist.length) * 100)
    : 0;

  const nextTask = checklist.find((c) => {
    if (c.done) return false;
    if (!c.dependsOn) return true;
    return c.dependsOn.every((depId) => checklist.find((d) => d.id === depId)?.done);
  });

  const statusCounts = roster.reduce<Record<string, number>>((acc, r) => {
    acc[r.status] = (acc[r.status] ?? 0) + 1;
    return acc;
  }, {});

  const latestLog = logs[0];

  const today = todayIso();
  const dueCount = schedule.filter((t) => !t.done && t.dueDate <= today).length;

  // Mood leads the tracked-fields row regardless of field type or order —
  // it's the one thing tracked on every tank by design, so it gets a fixed
  // top slot rather than competing with custom fields for placement.
  const latestMoodEntry = logs.find((l) => l.mood !== undefined);
  const moodCard = latestMoodEntry?.mood
    ? { key: 'mood', label: 'Mood', value: MOOD_LABELS[latestMoodEntry.mood] }
    : null;

  // Numbers first — a number reads as an actual stat at a glance, while a
  // boolean/text value needs the label to make sense of it, so they're
  // pushed to the back rather than crowding out the more useful numeric
  // fields once there are more than a handful being tracked. Capped so the
  // row (mood + custom fields) never exceeds 8 cards total.
  const typeRank: Record<string, number> = { number: 0, boolean: 1, text: 2 };
  const sortedCustomFields = [...customFields].sort((a, b) => typeRank[a.type] - typeRank[b.type]);
  const remainingSlots = moodCard ? 7 : 8;
  const customFieldCards = sortedCustomFields.slice(0, remainingSlots).map((f) => {
    const entryWithValue = logs.find((l) => l.customValues?.[f.id] !== undefined);
    const raw: CustomFieldValue | undefined = entryWithValue?.customValues?.[f.id];
    let value: string;
    if (raw === undefined) value = '—';
    else if (f.type === 'boolean') value = raw ? 'Yes' : 'No';
    else {
      const str = String(raw);
      value = str.length > 20 ? str.slice(0, 20) + '…' : str;
    }
    return { key: f.id, label: f.label, value };
  });

  const trackedFieldCards = moodCard ? [moodCard, ...customFieldCards] : customFieldCards;

  return (
    <div className="max-w-5xl mx-auto space-y-10">
      {/* Hero: build progress */}
      <section>
        <p className="font-mono text-xs tracking-widest text-amber uppercase mb-2">
          Build progress
        </p>
        <div className="flex items-end gap-4 mb-3">
          <span className="font-display text-6xl font-semibold">{progressPct}%</span>
          <span className="font-body text-foam-dim mb-2">
            {tasksDone} of {checklist.length} steps complete
          </span>
        </div>
        <div className="h-3 rounded-full bg-deepwater overflow-hidden border border-moss/30">
          <div
            className="h-full bg-gradient-to-r from-moss to-moss-light transition-all duration-700"
            style={{ width: `${progressPct}%` }}
          />
        </div>
        {nextTask ? (
          <p className="mt-3 text-sm text-foam-dim">
            Next up: <span className="text-foam font-medium">{nextTask.label}</span>{' '}
            <Link to="/checklist" className="text-amber hover:underline">
              → checklist
            </Link>
          </p>
        ) : (
          <p className="mt-3 text-sm text-foam-dim">
            Every build step is checked off. Time to log the launch.
          </p>
        )}
        <div className="mt-2 flex items-center gap-3">
          <button
            onClick={() => handleCopyImagePrompt('simple')}
            className="font-mono text-xs text-foam-dim/70 hover:text-amber transition-colors"
          >
            {copiedPrompt === 'simple' ? '✓ Copied to clipboard' : '🖼 Copy concept image prompt'}
          </button>
          <span className="text-foam-dim/30 text-xs">·</span>
          <button
            onClick={() => handleCopyImagePrompt('detailed')}
            className="font-mono text-xs text-foam-dim/70 hover:text-amber transition-colors"
          >
            {copiedPrompt === 'detailed' ? '✓ Copied to clipboard' : 'detailed version'}
          </button>
        </div>
      </section>

      {/* Stats row */}
      <section className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <StatCard label="Roster items" value={roster.length} link="/roster" />
        <StatCard
          label="Arrived / acclimating"
          value={(statusCounts.arrived ?? 0) + (statusCounts.acclimating ?? 0)}
          link="/roster"
        />
        <StatCard label="Log entries" value={logs.length} link="/log" />
        <StatCard label="Due / overdue" value={dueCount} link="/schedule" />
      </section>

      {/* Tracked fields — mood first, then custom fields (numbers prioritized) */}
      {trackedFieldCards.length > 0 && (
        <section>
          <p className="font-mono text-xs tracking-widest text-amber uppercase mb-3">
            Tracked fields
          </p>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {trackedFieldCards.map((f) => (
              <StatCard key={f.key} label={f.label} value={f.value} link="/log" />
            ))}
          </div>
        </section>
      )}

      {/* Latest log preview */}
      <section>
        <div className="flex items-center justify-between mb-3">
          <h2 className="font-display text-2xl font-semibold">Latest entry</h2>
          <Link to="/log" className="text-sm text-amber hover:underline">
            View all →
          </Link>
        </div>
        {latestLog ? (
          <div className="card p-5">
            <p className="font-mono text-xs text-sand uppercase tracking-wide">
              {latestLog.weekLabel} · {new Date(latestLog.date).toLocaleDateString()}
            </p>
            <h3 className="font-display text-xl font-semibold mt-1">{latestLog.title}</h3>
            <p className="text-foam-dim mt-2 line-clamp-2">{latestLog.body}</p>
          </div>
        ) : (
          <div className="card border-dashed p-8 text-center">
            <p className="text-foam-dim">
              No entries yet — once the tank is running, your weekly log starts here.
            </p>
            <Link to="/log" className="btn btn-secondary inline-flex mt-4">
              Write the first entry
            </Link>
          </div>
        )}
      </section>
    </div>
  );
}

function StatCard({
  label,
  value,
  link,
}: {
  label: string;
  value: number | string;
  link: string;
}) {
  return (
    <Link
      to={link}
      className="card block p-4 hover:border-amber/50 transition-colors"
    >
      <p className="font-mono text-3xl font-semibold text-foam">{value}</p>
      <p className="text-xs text-foam-dim mt-1">{label}</p>
    </Link>
  );
}
