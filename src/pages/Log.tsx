import { useEffect, useRef, useState } from 'react';
import { useData } from '../lib/DataContext';
import type { LogEntry, WaterParams, CustomFieldDef, CustomFieldValue, RosterItem, RosterLink, Milestone } from '../types';
import { resizeImageToBlob } from '../lib/storage';
import { putPhoto, deletePhotos, isStoredPhotoRef, photoRefId, makePhotoRef } from '../lib/photoStore';
import { todayIso, toIsoDate, parseIsoDate } from '../lib/date';
import { MOOD_LABELS, LOG_PHASE_ORDER, LOG_PHASE_LABELS, STATUS_LABELS } from '../lib/constants';
import { builtMilestone } from '../lib/milestones';
import ConfirmModal from '../components/ConfirmModal';
import Toast from '../components/Toast';
import RosterHighlightPicker from '../components/RosterHighlightPicker';
import TankPhoto from '../components/TankPhoto';

export default function Log() {
  const { activeTank, addLogEntry, updateLogEntry, deleteLogEntry, addMilestone, deleteMilestone } = useData();
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<LogEntry | null>(null);

  if (!activeTank) return null;
  const customFields = activeTank.customFields;
  // The id of whichever entry currently owns the Built milestone, if
  // any — threaded to both EntryForm invocations below so each one can
  // tell "I already own this," "someone else owns this," or "nobody
  // does yet" apart, rather than just a flat yes/no.
  const builtByEntryId = builtMilestone(activeTank)?.linkedLogEntryId;

  // Shared by both EntryForm invocations below — the actual Milestone
  // creation lives here, not inside EntryForm, which has no reason to
  // know what a Milestone even is beyond reporting the intent back up.
  function markTankBuilt(entry: LogEntry) {
    const milestone: Milestone = {
      id: crypto.randomUUID(),
      title: 'Built',
      date: entry.date,
      type: 'phase-change',
      major: true,
      tankBuilt: true,
      linkedLogEntryId: entry.id,
    };
    addMilestone(milestone);
  }

  // The reverse — called when Built gets unchecked on the entry that
  // actually owns it. Looks the milestone up fresh rather than trusting
  // a stale id from closure, same defensiveness as every other delete
  // path in this app.
  function unmarkTankBuilt() {
    const bm = builtMilestone(activeTank!);
    if (bm) deleteMilestone(bm.id);
  }

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="font-display text-2xl font-semibold">Log</h2>
          <p className="text-sm text-foam-dim mt-1">The build log and journal, one entry at a time.</p>
        </div>
        <button
          onClick={() => {
            setEditingId(null);
            setShowForm((s) => !s);
          }}
          className="btn btn-primary"
        >
          {showForm ? 'Cancel' : '+ New entry'}
        </button>
      </div>

      {showForm && (
        <EntryForm
          weekNumber={activeTank.logs.length + 1}
          customFields={customFields}
          waterType={activeTank.waterType}
          roster={activeTank.roster}
          builtByEntryId={builtByEntryId}
          onSubmit={(entry) => {
            addLogEntry(entry);
            setShowForm(false);
          }}
          onMarkBuilt={markTankBuilt}
          onUnmarkBuilt={unmarkTankBuilt}
          onCancel={() => setShowForm(false)}
          submitLabel="Publish entry"
        />
      )}

      <div className="space-y-3">
        {activeTank.logs.map((entry) =>
          editingId === entry.id ? (
            <EntryForm
              key={entry.id}
              initial={entry}
              customFields={customFields}
              waterType={activeTank.waterType}
              roster={activeTank.roster}
              builtByEntryId={builtByEntryId}
              onSubmit={(updated) => {
                // No `date: entry.date` override here anymore — that used to
                // force every edit back to its original timestamp no matter
                // what. The form itself now owns resolving the real date
                // (see resolveEntryDate below), including the "left
                // unchanged" case that already preserves the original
                // precise timestamp, so an edit that never touches the date
                // field behaves exactly as before.
                updateLogEntry({ ...updated, id: entry.id, weekLabel: entry.weekLabel });
                setEditingId(null);
              }}
              onMarkBuilt={markTankBuilt}
              onUnmarkBuilt={unmarkTankBuilt}
              onCancel={() => setEditingId(null)}
              submitLabel="Save changes"
              editing
            />
          ) : (
            <article
              key={entry.id}
              className={`card overflow-hidden hover:border-amber/30 transition-colors ${
                entry.id === builtByEntryId ? 'border-amber/50 bg-amber/[0.03]' : ''
              }`}
            >
              <button
                onClick={() => setExpanded(expanded === entry.id ? null : entry.id)}
                className="w-full text-left p-5"
              >
                <div className="flex items-center justify-between gap-3 flex-wrap">
                  <p className="font-mono text-xs text-sand uppercase tracking-wide">
                    {entry.weekLabel} · {new Date(entry.date).toLocaleDateString()}
                    {entry.mood && <span className="ml-2">{MOOD_LABELS[entry.mood]}</span>}
                    {entry.id === builtByEntryId && (
                      <span className="ml-2 text-amber font-semibold">🌊 Built</span>
                    )}
                    {entry.phase && (
                      <span className="ml-2 text-amber">🧭 {LOG_PHASE_LABELS[entry.phase]}</span>
                    )}
                    {entry.highlightedRosterItemIds && entry.highlightedRosterItemIds.length > 0 && (
                      <span className="ml-2 text-amber">
                        ✨ {entry.highlightedRosterItemIds.length}
                      </span>
                    )}
                    {entry.completedScheduleTaskIds && entry.completedScheduleTaskIds.length > 0 && (
                      <span className="ml-2 text-moss-light">
                        🔗 {entry.completedScheduleTaskIds.length} done
                      </span>
                    )}
                  </p>
                  {customFields.length > 0 && entry.customValues && (
                    <span className="text-xs font-mono text-foam-dim">
                      {customFields
                        .filter((f) => entry.customValues?.[f.id] !== undefined)
                        .slice(0, 2)
                        .map((f) => `${f.label}: ${formatValue(entry.customValues![f.id])}`)
                        .join(' · ')}
                    </span>
                  )}
                </div>
                <h3 className="font-display text-xl font-semibold mt-1">{entry.title}</h3>
                <p className={`text-foam-dim mt-2 ${expanded === entry.id ? '' : 'line-clamp-2'}`}>
                  {entry.body}
                </p>
              </button>

              {expanded === entry.id && (
                <div className="px-5 pb-5 space-y-4">
                  {entry.params && Object.keys(entry.params).length > 0 && (
                    <div className="flex flex-wrap gap-2">
                      {Object.entries(entry.params).map(([key, val]) =>
                        val !== undefined ? (
                          <span
                            key={key}
                            className="pill py-1 px-2 font-mono text-xs bg-deepwater-2 border border-moss/30"
                          >
                            {paramLabel(key)}: <strong className="text-amber ml-1">{val}</strong>
                          </span>
                        ) : null
                      )}
                    </div>
                  )}
                  {customFields.length > 0 && entry.customValues && (
                    <div className="flex flex-wrap gap-2">
                      {customFields.map((f) => {
                        const val = entry.customValues?.[f.id];
                        if (val === undefined) return null;
                        return (
                          <span
                            key={f.id}
                            className="pill py-1 px-2 font-mono text-xs bg-sand/10 border border-sand/20 text-sand"
                          >
                            {f.label}: <strong className="ml-1">{formatValue(val)}</strong>
                          </span>
                        );
                      })}
                    </div>
                  )}
                  {entry.highlightedRosterItemIds && entry.highlightedRosterItemIds.length > 0 && (
                    <div>
                      <p className="field-label mb-1.5">Highlighted this entry</p>
                      <div className="flex flex-wrap gap-2">
                        {entry.highlightedRosterItemIds.map((itemId) => {
                          const item = activeTank.roster.find((r) => r.id === itemId);
                          return (
                            <span
                              key={itemId}
                              className="pill py-1 px-2 font-mono text-xs bg-amber/15 border border-amber/25 text-amber"
                            >
                              ✨ {item?.name ?? '(removed item)'}
                            </span>
                          );
                        })}
                      </div>
                    </div>
                  )}
                  {entry.additions && entry.additions.length > 0 && (
                    <div>
                      <p className="field-label mb-1.5">Roster items added this entry</p>
                      <div className="flex flex-wrap gap-2">
                        {entry.additions.map((link) => {
                          const item = activeTank.roster.find((r) => r.id === link.rosterItemId);
                          return (
                            <span
                              key={link.rosterItemId}
                              className="pill py-1 px-2 font-mono text-xs bg-sand/15 border border-sand/20 text-sand"
                            >
                              📦 {item?.name ?? '(removed item)'} → {STATUS_LABELS[link.requiredStatus]}
                            </span>
                          );
                        })}
                      </div>
                    </div>
                  )}
                  {entry.completedScheduleTaskIds && entry.completedScheduleTaskIds.length > 0 && (
                    <div>
                      <p className="field-label mb-1.5">Maintenance done this day</p>
                      <div className="flex flex-wrap gap-2">
                        {entry.completedScheduleTaskIds.map((taskId) => {
                          const task = activeTank.schedule.find((t) => t.id === taskId);
                          return (
                            <span
                              key={taskId}
                              className="pill py-1 px-2 font-mono text-xs bg-moss/15 border border-moss/30 text-foam-dim"
                            >
                              ✓ {task?.label ?? '(removed reminder)'}
                            </span>
                          );
                        })}
                      </div>
                    </div>
                  )}
                  {entry.photoUrls && entry.photoUrls.length > 0 && (
                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                      {entry.photoUrls.map((url, i) => (
                        <TankPhoto
                          key={i}
                          src={url}
                          alt={`${entry.title} photo ${i + 1}`}
                          className="rounded-md border border-moss/30 aspect-square object-cover"
                        />
                      ))}
                    </div>
                  )}
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => {
                        setShowForm(false);
                        setEditingId(entry.id);
                      }}
                      className="btn-icon"
                    >
                      Edit
                    </button>
                    <button
                      onClick={() => setDeleteTarget(entry)}
                      className="btn-icon danger"
                    >
                      Delete entry
                    </button>
                  </div>
                </div>
              )}
            </article>
          )
        )}
        {activeTank.logs.length === 0 && (
          <p className="text-foam-dim text-sm py-8 text-center">
            No entries yet. Start documenting once the build begins.
          </p>
        )}
      </div>

      <ConfirmModal
        open={deleteTarget !== null}
        title="Delete this entry?"
        message={
          deleteTarget
            ? `Delete "${deleteTarget.title}" (${deleteTarget.weekLabel})? This can't be undone.`
            : ''
        }
        confirmLabel="Delete entry"
        danger
        onConfirm={() => {
          if (deleteTarget) {
            deleteLogEntry(deleteTarget.id);
            // Fire-and-forget: the entry (and its photoUrls) is already gone
            // from the app's own data the moment deleteLogEntry returns; this
            // just reclaims the now-orphaned Blobs sitting in IndexedDB.
            const refs = (deleteTarget.photoUrls ?? []).filter(isStoredPhotoRef);
            if (refs.length > 0) void deletePhotos(refs.map(photoRefId));
          }
          setDeleteTarget(null);
        }}
        onCancel={() => setDeleteTarget(null)}
      />
    </div>
  );
}

function formatValue(val: CustomFieldValue): string {
  if (typeof val === 'boolean') return val ? 'Yes' : 'No';
  return String(val);
}

function paramLabel(key: string) {
  const labels: Record<string, string> = {
    temperature: 'Temp °F',
    ph: 'pH',
    gh: 'GH',
    kh: 'KH',
    tds: 'TDS',
    ammonia: 'NH₃',
    nitrite: 'NO₂',
    nitrate: 'NO₃',
    salinity: 'Salinity (SG)',
  };
  return labels[key] ?? key;
}

function EntryForm({
  initial,
  weekNumber,
  customFields,
  waterType,
  roster,
  builtByEntryId,
  onSubmit,
  onMarkBuilt,
  onUnmarkBuilt,
  onCancel,
  submitLabel,
  editing = false,
}: {
  initial?: LogEntry;
  weekNumber?: number;
  customFields: CustomFieldDef[];
  waterType: 'freshwater' | 'saltwater';
  roster: RosterItem[];
  // The id of whichever log entry currently owns the tank's "Built"
  // milestone, if one exists — undefined if nothing's been marked yet.
  // Computed by the parent (builtMilestone(activeTank)?.linkedLogEntryId),
  // not re-derived here. Comparing against initial?.id below is what
  // lets the entry that actually owns it stay editable/uncheckable,
  // while every other entry sees it as already-taken.
  builtByEntryId: string | undefined;
  onSubmit: (entry: LogEntry) => void;
  // Called with the just-submitted entry, in addition to onSubmit, only
  // when Built was newly checked (wasn't the owner before, is now) — the
  // parent is what actually knows how to create a Milestone; this
  // component just reports the intent.
  onMarkBuilt?: (entry: LogEntry) => void;
  // Called instead, with nothing, when Built was newly UNchecked on the
  // entry that actually owned it — the parent deletes the milestone.
  onUnmarkBuilt?: () => void;
  onCancel: () => void;
  submitLabel: string;
  editing?: boolean;
}) {
  const [title, setTitle] = useState(initial?.title ?? '');
  const [entryLabel, setEntryLabel] = useState(initial?.weekLabel ?? `Entry ${weekNumber}`);
  // Local-calendar-day string (YYYY-MM-DD) driving the date <input>.
  // Defaults to today for a new entry, or the entry's own day for an
  // edit — using toIsoDate (local components), not initial.date sliced
  // raw, so this agrees with every other "what day is this" read in the
  // app (see lib/date.ts's own comment on the UTC-day rollover bug this
  // sidesteps).
  const [entryDate, setEntryDate] = useState(() =>
    initial?.date ? toIsoDate(new Date(initial.date)) : todayIso()
  );
  // Starts collapsed to a plain "Today" link for the common case (a new
  // entry, or an edit of an entry that's already dated today) so the
  // form's overall shape doesn't change for anyone who never needs this.
  // Starts already expanded, though, if the entry being edited is NOT
  // today — never hide a real backdated date behind a "Today" label that
  // would be a lie.
  const [dateExpanded, setDateExpanded] = useState(() => entryDate !== todayIso());
  const [body, setBody] = useState(initial?.body ?? '');
  const [mood, setMood] = useState<LogEntry['mood']>(initial?.mood);
  const [phase, setPhase] = useState<LogEntry['phase']>(initial?.phase);
  // Is THIS entry the one that already owns the tank's Built milestone —
  // stays true through edits of the owning entry (checkbox starts
  // checked, and stays interactive so it can be unchecked to remove the
  // record), false for a brand-new entry (can't already own something
  // that doesn't exist yet).
  const isBuiltOwner = initial?.id !== undefined && initial.id === builtByEntryId;
  // Built exists, but on a different entry — this one can't touch it at
  // all until it's removed from wherever it actually lives.
  const builtElsewhere = builtByEntryId !== undefined && !isBuiltOwner;
  const [markBuilt, setMarkBuilt] = useState(isBuiltOwner);
  const [additions, setAdditions] = useState<RosterLink[]>(initial?.additions ?? []);
  const [highlightedRosterItemIds, setHighlightedRosterItemIds] = useState<string[]>(
    initial?.highlightedRosterItemIds ?? []
  );
  const [params, setParams] = useState<WaterParams>(initial?.params ?? {});
  const [customValues, setCustomValues] = useState<Record<string, CustomFieldValue>>(
    initial?.customValues ?? {}
  );
  const [photos, setPhotos] = useState<string[]>(initial?.photoUrls ?? []);
  const [uploading, setUploading] = useState(false);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  // A photo uploaded during THIS editing session gets its Blob committed to
  // IndexedDB right away (immediately, not deferred to submit) so it can be
  // previewed the same way a saved one is — through TankPhoto, which only
  // knows how to resolve a real reference, not an in-memory Blob nobody's
  // stored yet. That means it needs its own cleanup path if the session
  // ends without ever actually saving it: submittedRef distinguishes
  // "unmounted because the form was submitted" (keep them — see submit()
  // below) from "unmounted for any other reason" (Cancel, navigating away —
  // delete them, nothing references them). A photo that was already part
  // of `initial` before this session started is never touched here; see
  // submit()'s own separate cleanup for that case.
  const newPhotoIds = useRef<Set<string>>(new Set());
  const submittedRef = useRef(false);

  useEffect(() => {
    return () => {
      // Reading .current at cleanup time is the actual point here, not a
      // bug this lint rule's usual DOM-ref case is guarding against: these
      // two refs are intentionally mutated throughout the form's lifetime
      // (by handlePhotos/removePhoto/submit), and cleanup needs whatever
      // they'd accumulated BY unmount time — copying them into a variable
      // back at mount time would capture nothing, since neither has been
      // written to yet when this effect first runs.
      // eslint-disable-next-line react-hooks/exhaustive-deps
      if (!submittedRef.current && newPhotoIds.current.size > 0) {
        void deletePhotos([...newPhotoIds.current]);
      }
    };
    // Deliberately empty deps — this is a mount/unmount effect, not one
    // that should re-run when photos or newPhotoIds' contents change.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function handlePhotos(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? []);
    if (files.length === 0) return;
    setUploading(true);
    try {
      const refs = await Promise.all(
        files.map(async (f) => {
          const blob = await resizeImageToBlob(f);
          const id = crypto.randomUUID();
          await putPhoto(id, blob);
          newPhotoIds.current.add(id);
          return makePhotoRef(id);
        })
      );
      setPhotos((prev) => [...prev, ...refs]);
    } catch {
      setToastMessage('Could not process one of those images.');
    }
    setUploading(false);
    e.target.value = '';
  }

  function removePhoto(index: number) {
    setPhotos((prev) => {
      const removed = prev[index];
      // Only a photo uploaded THIS session gets deleted immediately —
      // nothing outside this form's own local state could possibly
      // reference it yet. A pre-existing photo (from `initial`) might still
      // be what's saved elsewhere (another log entry never shares an id,
      // but the user could still Cancel this whole edit) — that one's
      // removal is only made real at submit time, in the diff below, so
      // canceling an edit never destroys a photo that was never actually
      // removed.
      if (isStoredPhotoRef(removed) && newPhotoIds.current.has(photoRefId(removed))) {
        newPhotoIds.current.delete(photoRefId(removed));
        void deletePhotos([photoRefId(removed)]);
      }
      return prev.filter((_, i) => i !== index);
    });
  }

  function setCustomValue(fieldId: string, value: CustomFieldValue | undefined) {
    setCustomValues((prev) => {
      const next = { ...prev };
      if (value === undefined || value === '') {
        delete next[fieldId];
      } else {
        next[fieldId] = value;
      }
      return next;
    });
  }

  // Resolves the <input type="date"> day string back into the real
  // stored timestamp. Two cases:
  // - The day wasn't actually changed from the entry's own original day
  //   (true for every edit that doesn't touch the date field, and for a
  //   brand-new entry left on its today-default): keep the EXACT original
  //   timestamp rather than rebuilding it, so an edit that only changes
  //   the title doesn't quietly rewrite a precise created-at instant down
  //   to noon.
  // - The day WAS changed (backdating, or a brand-new entry moved off
  //   today): anchor the new timestamp to local noon, not local
  //   midnight — deliberately, to stay far from the UTC-day-rollover trap
  //   toIsoDate/parseIsoDate's own comments warn about (a near-midnight
  //   local time can serialize into the adjacent UTC calendar day).
  function resolveEntryDate(dayStr: string, previous?: string): string {
    if (previous && toIsoDate(new Date(previous)) === dayStr) return previous;
    const d = parseIsoDate(dayStr);
    d.setHours(12, 0, 0, 0);
    return d.toISOString();
  }

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim() || !body.trim()) return;
    submittedRef.current = true;
    // Defensive clamp against a future date — belt-and-suspenders on top
    // of the input's own `max`, which a browser's date picker generally
    // enforces but isn't a hard guarantee (e.g. manual keyboard entry in
    // some browsers).
    const safeDate = entryDate > todayIso() ? todayIso() : entryDate;
    // A pre-existing (from `initial`) stored photo that isn't in the final
    // `photos` array was genuinely removed during this edit — clean up its
    // Blob now that the removal is actually committed, rather than at
    // removePhoto() time, which would have destroyed it even if the whole
    // edit got canceled afterward.
    const keptRefs = new Set(photos.filter(isStoredPhotoRef));
    const droppedRefs = (initial?.photoUrls ?? []).filter(
      (url) => isStoredPhotoRef(url) && !keptRefs.has(url)
    );
    if (droppedRefs.length > 0) void deletePhotos(droppedRefs.map(photoRefId));
    const entry: LogEntry = {
      id: initial?.id ?? crypto.randomUUID(),
      weekLabel: entryLabel.trim() || `Entry ${weekNumber}`,
      date: resolveEntryDate(safeDate, initial?.date),
      title: title.trim(),
      body: body.trim(),
      mood,
      phase,
      additions: additions.length ? additions : undefined,
      highlightedRosterItemIds: highlightedRosterItemIds.length ? highlightedRosterItemIds : undefined,
      params,
      customValues: Object.keys(customValues).length ? customValues : undefined,
      photoUrls: photos.length ? photos : undefined,
    };
    onSubmit(entry);
    // Compares against the ORIGINAL owned-or-not state, not just the
    // current checkbox value — markBuilt alone can't tell "newly checked"
    // from "already was the owner," and those need opposite actions.
    if (markBuilt && !isBuiltOwner) onMarkBuilt?.(entry);
    else if (!markBuilt && isBuiltOwner) onUnmarkBuilt?.();
  }

  function setParam(key: keyof WaterParams, value: string) {
    setParams((prev) => ({ ...prev, [key]: value === '' ? undefined : Number(value) }));
  }

  return (
    <>
    <form onSubmit={submit} className={`card p-5 space-y-4 ${editing ? 'border-amber/40' : ''}`}>
      {dateExpanded ? (
        <div>
          <label className="field-label">Date</label>
          <input
            type="date"
            value={entryDate}
            max={todayIso()}
            onChange={(e) => setEntryDate(e.target.value)}
            className="field font-mono text-sm w-auto"
            autoFocus
          />
          <p className="text-[11px] text-foam-dim/60 mt-1">
            Back-date this to when something actually happened, not when
            you got around to writing it up — Timeline, build-stage
            detection, and chart spacing all key off this date.
          </p>
        </div>
      ) : (
        <p className="text-[11px] text-foam-dim/60">
          <button
            type="button"
            onClick={() => setDateExpanded(true)}
            className="text-amber hover:underline underline-offset-2 font-medium"
          >
            Today
          </button>
          {' — '}defaults to today. Click to back-date this entry.
        </p>
      )}
      <input
        placeholder="Entry label (e.g. &quot;Entry 12&quot;, a short title of its own, whatever's useful to you)"
        value={entryLabel}
        onChange={(e) => setEntryLabel(e.target.value)}
        className="field text-xs text-foam-dim"
      />
      <input
        placeholder="Entry title"
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        className="field font-medium"
        required
      />
      <textarea
        placeholder="What happened since your last entry?"
        value={body}
        onChange={(e) => setBody(e.target.value)}
        rows={4}
        className="field resize-y"
        required
      />

      <div>
        <p className="field-label">Mood (optional)</p>
        <div className="flex gap-2 flex-wrap">
          {(Object.keys(MOOD_LABELS) as LogEntry['mood'][]).map((m) => (
            <button
              type="button"
              key={m}
              onClick={() => setMood(mood === m ? undefined : m)}
              className={`pill py-1.5 px-3 ${
                mood === m
                  ? 'bg-moss text-foam'
                  : 'bg-deepwater-2 text-foam-dim border border-moss/30'
              }`}
            >
              {MOOD_LABELS[m!]}
            </button>
          ))}
        </div>
      </div>

      <div>
        <p className="field-label">Build stage (optional)</p>
        <p className="text-[11px] text-foam-dim/60 -mt-1 mb-2">
          A separate axis from mood — where the build actually is, not how it feels. Leave unset
          unless this entry marks a real stage transition. 🌊 Built is a different kind of thing
          sharing this row — not a phase (Cycling already names a real, distinct one), a separate,
          one-time historical fact that can stand alone or sit alongside whichever phase you pick.
        </p>
        <div className="flex gap-2 flex-wrap">
          {LOG_PHASE_ORDER.map((p) => (
            <button
              type="button"
              key={p}
              onClick={() => setPhase(phase === p ? undefined : p)}
              className={`pill py-1.5 px-3 ${
                phase === p
                  ? 'bg-amber text-deepwater'
                  : 'bg-deepwater-2 text-foam-dim border border-moss/30'
              }`}
            >
              {LOG_PHASE_LABELS[p]}
            </button>
          ))}
          {/* Same base pill styling as the six phases on purpose — no
              distinct visual treatment, the label text alone ("🌊 Built")
              is what identifies it as a different kind of thing, same as
              how each phase is identified by its own label. Disabled
              state is the one real departure: greyed and unclickable
              rather than vanishing, so the row never shifts once a Built
              milestone exists elsewhere — undoing/moving it happens on
              whichever entry currently owns it, not here. */}
          <button
            type="button"
            disabled={builtElsewhere}
            onClick={() => !builtElsewhere && setMarkBuilt((v) => !v)}
            className={`pill py-1.5 px-3 ${
              builtElsewhere
                ? 'bg-deepwater-2 text-foam-dim/40 border border-moss/15 cursor-not-allowed'
                : markBuilt
                  ? 'bg-amber text-deepwater'
                  : 'bg-deepwater-2 text-foam-dim border border-moss/30'
            }`}
          >
            🌊 Built
          </button>
        </div>
        {markBuilt && (
          <p className="text-[11px] text-amber/80 mt-2">
            You can still choose a build stage above, too — Built isn't one of the six phases.
          </p>
        )}
        {builtElsewhere && (
          <p className="text-[11px] text-foam-dim/60 mt-2">
            Already marked on a different entry — remove it there first to move it here.
          </p>
        )}
      </div>

      <div>
        <p className="field-label">Roster items (optional)</p>
        <p className="text-[11px] text-foam-dim/60 -mt-1 mb-2">
          Add an item, then use ✨ to flag it as notable and/or 📦 to mark a status it reached —
          either, both, or neither, independently.
        </p>
        <RosterHighlightPicker
          roster={roster}
          links={additions}
          onChangeLinks={setAdditions}
          highlightedIds={highlightedRosterItemIds}
          onChangeHighlighted={setHighlightedRosterItemIds}
        />
      </div>

      <div>
        <p className="field-label">Water parameters</p>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          <ParamInput label="Temp °F" value={params.temperature} onChange={(v) => setParam('temperature', v)} />
          <ParamInput label="pH" step="0.1" value={params.ph} onChange={(v) => setParam('ph', v)} />
          {waterType === 'freshwater' && (
            <>
              <ParamInput label="GH" value={params.gh} onChange={(v) => setParam('gh', v)} />
              <ParamInput label="KH" value={params.kh} onChange={(v) => setParam('kh', v)} />
              <ParamInput label="TDS" value={params.tds} onChange={(v) => setParam('tds', v)} />
            </>
          )}
          {waterType === 'saltwater' && (
            <ParamInput
              label="Salinity (SG)"
              step="0.001"
              value={params.salinity}
              onChange={(v) => setParam('salinity', v)}
            />
          )}
          <ParamInput label="NH₃" step="0.1" value={params.ammonia} onChange={(v) => setParam('ammonia', v)} />
          <ParamInput label="NO₂" step="0.1" value={params.nitrite} onChange={(v) => setParam('nitrite', v)} />
          <ParamInput label="NO₃" value={params.nitrate} onChange={(v) => setParam('nitrate', v)} />
        </div>
      </div>

      {customFields.length > 0 && (
        <div>
          <p className="field-label">This tank's tracking fields</p>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
            {customFields.map((f) => (
              <CustomFieldInput
                key={f.id}
                field={f}
                value={customValues[f.id]}
                onChange={(v) => setCustomValue(f.id, v)}
              />
            ))}
          </div>
          <p className="text-[11px] text-foam-dim/60 mt-2">
            Manage these in Settings — add, rename, or remove tracking fields anytime.
          </p>
        </div>
      )}

      <div>
        <label className="field-label">Photos</label>
        <input
          type="file"
          accept="image/*"
          multiple
          onChange={handlePhotos}
          className="text-sm text-foam-dim file:mr-3 file:px-3 file:py-1.5 file:rounded-md file:border file:border-moss/30 file:bg-transparent file:text-foam-dim file:text-xs file:cursor-pointer hover:file:text-foam hover:file:border-moss/60 file:transition-colors"
        />
        {uploading && <p className="text-xs text-foam-dim mt-2">Processing…</p>}
        {photos.length > 0 && (
          <div className="grid grid-cols-4 gap-2 mt-3">
            {photos.map((p, i) => (
              <div key={i} className="relative group">
                <img
                  src={p}
                  className="rounded-md border border-moss/30 aspect-square object-cover"
                  alt=""
                />
                <button
                  type="button"
                  onClick={() => removePhoto(i)}
                  aria-label="Remove photo"
                  className="absolute top-1 right-1 w-5 h-5 rounded-full bg-deepwater/90 border border-moss/40 text-foam-dim hover:text-coral hover:border-coral/50 flex items-center justify-center text-xs leading-none transition-colors"
                >
                  ✕
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="flex gap-2">
        <button type="submit" className="btn btn-secondary flex-1">
          {submitLabel}
        </button>
        <button type="button" onClick={onCancel} className="btn btn-ghost">
          Cancel
        </button>
      </div>
    </form>
    <Toast message={toastMessage} onDismiss={() => setToastMessage(null)} />
    </>
  );
}

function CustomFieldInput({
  field,
  value,
  onChange,
}: {
  field: CustomFieldDef;
  value: CustomFieldValue | undefined;
  onChange: (v: CustomFieldValue | undefined) => void;
}) {
  if (field.type === 'boolean') {
    // Matches Compatibility's TraitInput pill styling exactly (moss for
    // Yes, coral for No, same border/bg classes) plus a separate ✕ — not
    // the click-active-to-clear pattern used elsewhere in this app, to
    // stay visually consistent with the already-existing pattern this
    // was asked to match. One real difference underneath, though:
    // Compatibility's ✕ removes the whole trait (an optional add-on);
    // this field is a persistent, tank-level definition, so ✕ here only
    // clears THIS entry's value back to unset, never the field itself —
    // same visual shape, different operation, on purpose.
    return (
      <div>
        <p className="text-[10px] text-foam-dim font-mono uppercase tracking-wide">
          {field.label}
        </p>
        {/* The .field class itself, not a hand-tuned height — gives this
            the exact same box (padding, border, width) as the number/text
            inputs beside it, so the grid row lines up for real rather
            than approximately. The buttons inside keep their own styling
            unchanged; only the wrapper is new. */}
        <div className="field mt-0.5 flex items-center gap-1.5">
          <button
            type="button"
            onClick={() => onChange(true)}
            className={`text-xs rounded px-2 py-1 border ${
              value === true
                ? 'border-moss bg-moss/20 text-foam'
                : 'border-moss/30 text-foam-dim hover:border-moss/60'
            }`}
          >
            Yes
          </button>
          <button
            type="button"
            onClick={() => onChange(false)}
            className={`text-xs rounded px-2 py-1 border ${
              value === false
                ? 'border-coral bg-coral/20 text-foam'
                : 'border-moss/30 text-foam-dim hover:border-moss/60'
            }`}
          >
            No
          </button>
          <button
            type="button"
            onClick={() => onChange(undefined)}
            className="btn-icon danger text-xs"
            aria-label="Clear"
          >
            ✕
          </button>
        </div>
      </div>
    );
  }

  if (field.type === 'number') {
    return (
      <div>
        <label className="text-[10px] text-foam-dim font-mono uppercase tracking-wide">
          {field.label}
        </label>
        <input
          type="number"
          defaultValue={typeof value === 'number' ? value : ''}
          onChange={(e) => onChange(e.target.value === '' ? undefined : Number(e.target.value))}
          className="field font-mono text-sm mt-0.5 px-2 py-1.5"
        />
      </div>
    );
  }

  return (
    <div>
      <label className="text-[10px] text-foam-dim font-mono uppercase tracking-wide">
        {field.label}
      </label>
      <input
        type="text"
        defaultValue={typeof value === 'string' ? value : ''}
        onChange={(e) => onChange(e.target.value === '' ? undefined : e.target.value)}
        className="field text-sm mt-0.5 px-2 py-1.5"
      />
    </div>
  );
}

function ParamInput({
  label,
  step = '1',
  value,
  onChange,
}: {
  label: string;
  step?: string;
  value?: number;
  onChange: (v: string) => void;
}) {
  return (
    <div>
      <label className="text-[10px] text-foam-dim font-mono uppercase tracking-wide">
        {label}
      </label>
      <input
        type="number"
        step={step}
        defaultValue={value ?? ''}
        onChange={(e) => onChange(e.target.value)}
        className="field font-mono text-sm mt-0.5 px-2 py-1.5"
      />
    </div>
  );
}