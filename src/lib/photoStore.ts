// A photo stored here never touches the JSON blob saveData() writes to
// localStorage — that's the entire point. A LogEntry's photoUrls array
// holds a short reference string (see makePhotoRef/isStoredPhotoRef
// below) instead of the actual bytes, so the thing that was blowing out
// the origin's ~5-10MB localStorage quota (base64 photos, inflated ~33%
// over their real size, sitting inline in one giant JSON string) simply
// isn't in that JSON at all anymore. IndexedDB stores the real Blob, with
// no base64 tax, against a quota that scales with actual free disk space
// rather than a fixed few megabytes.
//
// Deliberately hand-rolled rather than pulling in Dexie/idb: this is one
// object store with three operations (put/get/delete-many), which the raw
// API handles in about the same number of lines a wrapper would need for
// its own setup — not worth a dependency for something this small. If
// this ever grows into the fuller local-first migration the TODO
// describes (the whole AppData model moving to IndexedDB, not just
// photos), that's the point to reach for a real wrapper library.

const DB_NAME = 'tidemark-photos';
const DB_VERSION = 1;
const STORE_NAME = 'photos';

let dbPromise: Promise<IDBDatabase> | null = null;

function openDb(): Promise<IDBDatabase> {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') {
      reject(new Error('IndexedDB is not available in this browser.'));
      return;
    }
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      req.result.createObjectStore(STORE_NAME, { keyPath: 'id' });
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error ?? new Error('Could not open the photo database.'));
  });
  // A failed open should be retried on the next call (a transient privacy-mode
  // block might not recur), not cached forever as a rejected promise.
  dbPromise.catch(() => {
    dbPromise = null;
  });
  return dbPromise;
}

export async function putPhoto(id: string, blob: Blob): Promise<void> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    tx.objectStore(STORE_NAME).put({ id, blob });
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error ?? new Error('Could not save photo.'));
  });
}

export async function getPhoto(id: string): Promise<Blob | undefined> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readonly');
    const req = tx.objectStore(STORE_NAME).get(id);
    req.onsuccess = () => resolve(req.result?.blob);
    req.onerror = () => reject(req.error ?? new Error('Could not read photo.'));
  });
}

// Single delete is just deletePhotos([id]) — kept as one implementation so
// callers never have to choose between two ops that do the same thing.
export async function deletePhoto(id: string): Promise<void> {
  return deletePhotos([id]);
}

// Batched into one transaction rather than one call per id — the entry
// form's submit-time cleanup and the whole-entry-delete path can both hand
// this a real list (a multi-photo entry, or a migration undo) without
// firing a separate transaction per photo.
export async function deletePhotos(ids: string[]): Promise<void> {
  if (ids.length === 0) return;
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    const store = tx.objectStore(STORE_NAME);
    for (const id of ids) store.delete(id);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error ?? new Error('Could not delete photo(s).'));
  });
}

// How much the stored photos actually weigh: the summed Blob sizes, which
// is the honest number for the IndexedDB half of Settings' storage meter
// (navigator.storage.estimate() can only report the whole origin combined,
// so it can't isolate "just the photos"). Reads each record's Blob handle
// through a cursor — Blob.size is metadata, so this doesn't pull the image
// bytes into memory.
export async function sumPhotoBytes(): Promise<{ count: number; bytes: number }> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readonly');
    const req = tx.objectStore(STORE_NAME).openCursor();
    let count = 0;
    let bytes = 0;
    req.onsuccess = () => {
      const cursor = req.result;
      if (cursor) {
        const blob = cursor.value?.blob as Blob | undefined;
        if (blob && typeof blob.size === 'number') {
          count += 1;
          bytes += blob.size;
        }
        cursor.continue();
      } else {
        resolve({ count, bytes });
      }
    };
    req.onerror = () => reject(req.error ?? new Error('Could not measure photo storage.'));
  });
}

// Every id currently stored, for finding Blobs nothing references anymore
// (see photoRefs.ts). Keys only, so no image data is read.
export async function listPhotoIds(): Promise<string[]> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readonly');
    const req = tx.objectStore(STORE_NAME).getAllKeys();
    req.onsuccess = () => resolve(req.result.map(String));
    req.onerror = () => reject(req.error ?? new Error('Could not list stored photos.'));
  });
}

// The reference format a photoUrls entry can hold, alongside a real data
// URI (legacy — see resizeImageToBase64's callers) or, per the type's own
// long-standing comment, a real relative path. An <img> tag can render
// either of those directly; a Blob sitting in IndexedDB can't be an <img>
// src at all until it's resolved to an object URL, which is what this
// reference exists to signal to TankPhoto. Prefixed and never bare, so it
// can never collide with a data: URI, a relative path, or an http(s) URL.
const REF_PREFIX = 'idb-photo:';

export function makePhotoRef(id: string): string {
  return `${REF_PREFIX}${id}`;
}

export function isStoredPhotoRef(url: string): boolean {
  return url.startsWith(REF_PREFIX);
}

export function photoRefId(url: string): string {
  return url.slice(REF_PREFIX.length);
}