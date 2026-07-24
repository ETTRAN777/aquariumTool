// Google Identity Services attaches itself to `window.google` at runtime via
// the script tag loaded below — there's no official npm types package for
// it, so this is the minimal ambient shape actually used in this file.
declare global {
  namespace google.accounts.oauth2 {
    interface TokenResponse {
      access_token: string;
      error?: string;
    }
    interface TokenClient {
      requestAccessToken: () => void;
    }
    interface TokenClientConfig {
      client_id: string;
      scope: string;
      callback: (response: TokenResponse) => void;
    }
    function initTokenClient(config: TokenClientConfig): TokenClient;
  }
  interface Window {
    google?: typeof google;
  }
}

// Google Drive backup/restore — deliberately the smallest version of this
// that works. Both directions are 100% user-triggered (no background sync,
// no auto-upload, no auto-pull) by design: see the docket discussion this
// came out of — an automatic push on one device can silently clobber a
// manual edit made on another before the user ever gets a chance to
// reconcile them. Upload/Download exist ONLY as explicit button clicks.
//
// Uses Google Identity Services' token client (a pure client-side OAuth
// flow — no backend, matching the rest of this app) and calls the Drive
// REST API directly with fetch(). No `gapi` client library — it's a much
// heavier dependency than this needs for two REST calls.
//
// Scope is drive.file ONLY: this app can see/modify *only files it created
// itself* — never anything else in the user's Drive. That's a deliberate,
// meaningful trust boundary, not just the easiest option.
//
// ⚠ SETUP REQUIRED — this will not work until GOOGLE_CLIENT_ID below is
// replaced with a real OAuth Client ID from a Google Cloud project you
// control. See GOOGLE_DRIVE_SETUP.md for the exact steps. Nothing else in
// this file needs to change.
const GOOGLE_CLIENT_ID = '849825264445-3u0sf0efl4tno5pf5psja2qpopac1cs9.apps.googleusercontent.com';

const DRIVE_SCOPE = 'https://www.googleapis.com/auth/drive.file';
const BACKUP_FILENAME = 'tank-tracker-backup.json';

// Access token lives in memory only, never localStorage — it's re-requested
// (a Google popup) each fresh page load. That's consistent with the
// user-triggered-only design: nothing about this feature should be able to
// act on its own after the tab closes.
let cachedToken: string | null = null;
let tokenClient: google.accounts.oauth2.TokenClient | null = null;

function loadGisScript(): Promise<void> {
  return new Promise((resolve, reject) => {
    if (window.google?.accounts?.oauth2) {
      resolve();
      return;
    }
    const existing = document.getElementById('google-identity-services');
    if (existing) {
      existing.addEventListener('load', () => resolve());
      existing.addEventListener('error', () => reject(new Error('Failed to load Google Identity Services')));
      return;
    }
    const script = document.createElement('script');
    script.id = 'google-identity-services';
    script.src = 'https://accounts.google.com/gsi/client';
    script.async = true;
    script.defer = true;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error('Failed to load Google Identity Services'));
    document.head.appendChild(script);
  });
}

async function getAccessToken(): Promise<string> {
  if (cachedToken) return cachedToken;
  if (GOOGLE_CLIENT_ID.startsWith('YOUR_CLIENT_ID')) {
    throw new Error(
      'Google Drive backup is not configured yet — see GOOGLE_DRIVE_SETUP.md.'
    );
  }
  await loadGisScript();
  return new Promise((resolve, reject) => {
    tokenClient = window.google.accounts.oauth2.initTokenClient({
      client_id: GOOGLE_CLIENT_ID,
      scope: DRIVE_SCOPE,
      callback: (response) => {
        if (response.error) {
          reject(new Error('Google sign-in was cancelled or failed.'));
          return;
        }
        cachedToken = response.access_token;
        resolve(response.access_token);
      },
    });
    tokenClient.requestAccessToken();
  });
}

async function findBackupFileId(token: string): Promise<string | null> {
  const params = new URLSearchParams({
    q: `name='${BACKUP_FILENAME}' and trashed=false`,
    fields: 'files(id)',
    spaces: 'drive',
    // Newest first. Not load-bearing under normal operation (there should
    // only ever be one matching file — see uploadBackup below), but a
    // cheap safety net: if a stale duplicate ever ends up sitting in Drive
    // for any reason, this guarantees the app always picks the most recent
    // one rather than whatever order the API happens to return.
    orderBy: 'createdTime desc',
  });
  const res = await fetch(`https://www.googleapis.com/drive/v3/files?${params}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) throw new Error('Could not search Google Drive for an existing backup.');
  const json = await res.json();
  return json.files?.[0]?.id ?? null;
}

// Uploads (or replaces) the single canonical backup file. No versioning,
// no history — this mirrors the local Export button exactly, which also
// only ever produces "the current state," not a log of past states.
//
// Deliberately delete-then-create rather than PATCH-updating the existing
// file in place: Google's upload endpoint doesn't return a CORS preflight
// response that allows PATCH from a browser origin (confirmed — other
// developers hit this identical "Method PATCH is not allowed by
// Access-Control-Allow-Methods" error against this exact API). DELETE
// against the plain files endpoint and POST-to-create are both
// well-supported via CORS, so this gets the same end result without
// fighting an undocumented gap on Google's end.
export async function uploadBackup(jsonText: string): Promise<void> {
  const token = await getAccessToken();
  const existingId = await findBackupFileId(token);

  if (existingId) {
    const delRes = await fetch(`https://www.googleapis.com/drive/v3/files/${existingId}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!delRes.ok) throw new Error('Could not replace the existing Google Drive backup.');
  }

  const boundary = 'tank_tracker_backup_boundary';
  const metadata = { name: BACKUP_FILENAME, mimeType: 'application/json' };
  const body =
    `--${boundary}\r\n` +
    `Content-Type: application/json; charset=UTF-8\r\n\r\n` +
    `${JSON.stringify(metadata)}\r\n` +
    `--${boundary}\r\n` +
    `Content-Type: application/json\r\n\r\n` +
    `${jsonText}\r\n` +
    `--${boundary}--`;

  const res = await fetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': `multipart/related; boundary=${boundary}`,
    },
    body,
  });
  if (!res.ok) throw new Error('Upload to Google Drive failed.');
}

// Returns the raw JSON text of the backup file, or null if none exists yet
// (a first-time user with nothing uploaded — not an error). The caller
// feeds this through the exact same parseBackupJson() used by the file
// picker, so Drive download behaves identically to a manual import from
// here on — same dedup UI, same truncation warnings, same everything.
export async function downloadBackup(): Promise<string | null> {
  const token = await getAccessToken();
  const fileId = await findBackupFileId(token);
  if (!fileId) return null;
  const res = await fetch(`https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) throw new Error('Could not download the backup from Google Drive.');
  return res.text();
}