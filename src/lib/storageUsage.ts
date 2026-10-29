// Storage-usage numbers for Settings' meter. Two backends, two honest
// answers (see the TODO entry this came from):
//
//  - localStorage has no size API at all, so "used" is counted directly
//    from what's in it, and "the cap" is MEASURED, once, by actually
//    probing this browser. A hard-coded per-browser table was considered
//    and rejected: browsers disagree, change between versions, and are
//    easy to misdetect (Chromium forks, in-app browsers, every iOS
//    browser being WebKit underneath), so a table would show a confident
//    wrong number the moment any of that drifted. The documented ~5 MiB
//    figure is only used as a labeled fallback for "not measured yet".
//  - IndexedDB's quota is disk-based, not a fixed number, so the honest
//    "used" figure is the summed Blob size of the photos this app stored
//    (photoStore.sumPhotoBytes), and navigator.storage.estimate() is
//    offered only as a clearly-labeled origin-wide ESTIMATE, never as a
//    precise ceiling.
//
// Unit note: localStorage "used" and "cap" here are both counted in
// string length (UTF-16 code units, key + value), the same accounting
// the existing "Free up local storage" card already uses for its own
// numbers. That keeps used/cap internally consistent with each other and
// with that card; it is NOT a literal on-disk byte count, and different
// browsers weigh non-ASCII text differently, so everything here is
// presented as approximate.

const CAP_CACHE_KEY = 'tidemark:storage-cap:v1';
const PROBE_KEY = 'tidemark:__cap-probe__';

// Browsers document ~5 MiB of localStorage per origin (10 MiB total for
// Web Storage). Used only to size the probe's upper bound and as the
// "typical" fallback label before a real measurement exists.
export const TYPICAL_LOCAL_STORAGE_CAP = 5 * 1024 * 1024;
// The probe never allocates beyond this many characters; if a write of
// this size still succeeds the result is recorded as "at least" this much
// rather than searching forever. Far above anything browsers allow today.
const PROBE_CEILING = 16 * 1024 * 1024;
// Bisection stops once the remaining uncertainty is this small. ~2K out of
// ~5M is well under the precision anything on screen can show.
const PROBE_TOLERANCE = 2048;

export interface MeasuredCap {
  // Total capacity in the units described above: what was already stored
  // plus what could still be written.
  cap: number;
  // True only if the probe hit its own ceiling without ever failing, in
  // which case the real cap is at least this large.
  atLeast: boolean;
  measuredAt: string;
}

// Everything currently in localStorage, key + value, counted the same
// way the probe counts its own writes.
export function localStorageUsedUnits(): number {
  let total = 0;
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key === null) continue;
      total += key.length + (localStorage.getItem(key)?.length ?? 0);
    }
  } catch {
    // Storage blocked outright — report nothing used rather than throwing
    // from a display-only helper.
  }
  return total;
}

export function readCachedCap(): MeasuredCap | null {
  try {
    const raw = localStorage.getItem(CAP_CACHE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (
      parsed &&
      typeof parsed.cap === 'number' &&
      Number.isFinite(parsed.cap) &&
      parsed.cap > 0 &&
      typeof parsed.atLeast === 'boolean' &&
      typeof parsed.measuredAt === 'string'
    ) {
      return { cap: parsed.cap, atLeast: parsed.atLeast, measuredAt: parsed.measuredAt };
    }
  } catch {
    // Unreadable or corrupt cache entry — treated as "not measured yet".
  }
  return null;
}

function writeCachedCap(result: MeasuredCap): void {
  try {
    localStorage.setItem(CAP_CACHE_KEY, JSON.stringify(result));
  } catch {
    // If even this tiny write fails the storage really is full; the
    // measurement is simply not remembered and the next session retries.
  }
}

function tryWrite(length: number): boolean {
  // Removed first so every attempt starts from the same footing instead of
  // depending on how a given browser accounts for replacing a value.
  try {
    localStorage.removeItem(PROBE_KEY);
    localStorage.setItem(PROBE_KEY, 'x'.repeat(length));
    return true;
  } catch {
    return false;
  }
}

// The actual probe. Synchronous on purpose: localStorage is synchronous,
// so nothing else in THIS tab can write in the middle of it — the brief
// "storage is nearly full" window can't make one of the app's own saves
// fail. (Another open tab could in theory write during it; the probe is
// short and runs once ever, so that is accepted.) The probe key is always
// removed in `finally`, so a thrown error can't leave test data behind.
//
// Accounts for what is already stored: it measures how much MORE can be
// written right now and adds what is already there, so the answer is the
// total capacity, not just the free part.
//
// Returns null (and caches nothing) if storage is unavailable — a
// failure is not a number, so it is retried next session, not remembered.
export function measureLocalStorageCap(): MeasuredCap | null {
  try {
    try {
      localStorage.removeItem(PROBE_KEY); // a stale probe from a crashed earlier run
    } catch {
      return null;
    }
    const usedBefore = localStorageUsedUnits();

    // Can anything be written at all?
    if (!tryWrite(1)) {
      // Nothing stored and a 1-char write fails: storage is blocked, not
      // full — no number to report. Something stored and the write fails:
      // it is genuinely full, so what's stored IS the cap (give or take a
      // character).
      if (usedBefore === 0) return null;
      return { cap: usedBefore, atLeast: false, measuredAt: new Date().toISOString() };
    }

    // Double until a write fails (or the ceiling is reached), then bisect
    // between the last success and the first failure.
    let lo = 1;
    let hi: number | null = null;
    while (lo < PROBE_CEILING) {
      const next = Math.min(lo * 2, PROBE_CEILING);
      if (tryWrite(next)) {
        lo = next;
      } else {
        hi = next;
        break;
      }
    }
    if (hi !== null) {
      while (hi - lo > PROBE_TOLERANCE) {
        const mid = Math.floor((lo + hi) / 2);
        if (tryWrite(mid)) lo = mid;
        else hi = mid;
      }
    }

    return {
      cap: usedBefore + lo + PROBE_KEY.length,
      atLeast: hi === null,
      measuredAt: new Date().toISOString(),
    };
  } finally {
    try {
      localStorage.removeItem(PROBE_KEY);
    } catch {
      // Nothing further to do.
    }
  }
}

// Once per page session, however many callers ask.
let ensurePromise: Promise<MeasuredCap | null> | null = null;

// Measures the cap only if it has never been measured, then remembers the
// answer permanently — once a number lands it is never probed again. Runs
// when the browser is idle so it never competes with first render. The
// returned promise resolves with the result (cached or fresh), so a UI
// that's already on screen can update itself when it lands.
export function ensureLocalStorageCapMeasured(): Promise<MeasuredCap | null> {
  if (ensurePromise) return ensurePromise;
  const cached = readCachedCap();
  if (cached) {
    ensurePromise = Promise.resolve(cached);
    return ensurePromise;
  }
  ensurePromise = new Promise((resolve) => {
    const run = () => {
      const result = measureLocalStorageCap();
      if (result) writeCachedCap(result);
      resolve(result);
    };
    const ric = (window as unknown as {
      requestIdleCallback?: (cb: () => void, opts?: { timeout: number }) => void;
    }).requestIdleCallback;
    if (typeof ric === 'function') ric(run, { timeout: 3000 });
    else setTimeout(run, 500);
  });
  return ensurePromise;
}

// navigator.storage.estimate() covers the WHOLE origin (localStorage,
// IndexedDB, caches) combined and is explicitly an estimate, so callers
// must present it as one.
export async function getOriginEstimate(): Promise<{ usage: number; quota: number } | null> {
  try {
    if (typeof navigator === 'undefined' || !navigator.storage?.estimate) return null;
    const { usage, quota } = await navigator.storage.estimate();
    if (typeof usage !== 'number' || typeof quota !== 'number') return null;
    return { usage, quota };
  } catch {
    return null;
  }
}
