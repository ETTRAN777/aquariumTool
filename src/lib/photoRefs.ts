// Which stored photos does the app's data actually point at? A LogEntry's
// photoUrls holds `idb-photo:<id>` references to Blobs in IndexedDB, and
// nothing deletes a Blob just because the data stopped pointing at it, so
// every code path that can drop references (replacing a tank from an
// import or Google Drive, deleting a tank, a migration whose result was
// thrown away) has to reclaim them itself. These two pure functions are
// the shared bookkeeping for that; keeping them free of IndexedDB makes
// them trivial to reason about and to test.

import type { AppData } from '../types';
import { isStoredPhotoRef, photoRefId } from './photoStore';

// Every Blob id any log entry in any tank currently references.
export function collectPhotoRefIds(data: AppData): Set<string> {
  const ids = new Set<string>();
  for (const tank of data.tanks) {
    for (const log of tank.logs) {
      for (const url of log.photoUrls ?? []) {
        if (isStoredPhotoRef(url)) ids.add(photoRefId(url));
      }
    }
  }
  return ids;
}

// Ids present in `before` but not in `after`: references that were
// dropped, whose Blobs are now unreachable.
export function droppedPhotoIds(before: Set<string>, after: Set<string>): string[] {
  const dropped: string[] = [];
  for (const id of before) if (!after.has(id)) dropped.push(id);
  return dropped;
}
