# Google Drive Backup — Setup

The Upload/Download to Google Drive buttons won't work until you complete
this. It's a one-time setup in Google Cloud Console — nothing here requires
touching the app's code beyond pasting in one ID at the end.

## 1. Create a Google Cloud project

- Go to [console.cloud.google.com](https://console.cloud.google.com).
- Create a new project (or reuse an existing one) — name doesn't matter,
  e.g. "Tank Tracker".

## 2. Enable the Google Drive API

- In the left sidebar: **APIs & Services → Library**.
- Search "Google Drive API" → **Enable**.

## 3. Configure the OAuth consent screen

- **APIs & Services → OAuth consent screen**.
- User type: **External** (site visitors aren't in a Google Workspace org
  you control).
- App name: "Tank Tracker" (or whatever you want shown on the Google
  sign-in popup). Support email and developer contact: your email.
- Scopes: add `https://www.googleapis.com/auth/drive.file`. This is the
  narrow scope — the app can only see/touch files *it created itself*,
  never anything else in someone's Drive. Google may ask you to justify why
  you need it; "app-created backup file only, user-initiated" is accurate
  and sufficient.
- **Test users**: add your own Google account here. While the app is in
  "Testing" status (the default — see the note below), only accounts listed
  here can actually sign in and use the feature.

## 4. Create the OAuth Client ID

- **APIs & Services → Credentials → Create Credentials → OAuth client ID**.
- Application type: **Web application**.
- Name: anything, e.g. "Tank Tracker Web".
- **Authorized JavaScript origins**: add `https://ettran777.github.io`.
  - Note this is the *origin* — scheme + host only, no path. Same concept
    as the robots.txt root-path issue from earlier: this covers the whole
    `ettran777.github.io` domain (Tank Tracker, Portfolio, everything),
    not just `/aquariumTool/` specifically — there's no way to scope an
    OAuth origin to a subpath, only the whole domain.
  - No redirect URI needed — this flow (Google Identity Services' token
    client, a popup, not a redirect) only needs the origin.
- Click Create. Copy the generated Client ID — looks like
  `123456789-abc...apps.googleusercontent.com`.

## 5. Drop the Client ID into the code

In `src/lib/googleDrive.ts`, replace:

```ts
const GOOGLE_CLIENT_ID = 'YOUR_CLIENT_ID.apps.googleusercontent.com';
```

with the real ID from step 4. That's the only code change needed.

## Testing vs. public rollout — read this before you assume it's "done"

**For testing it yourself:** the steps above are enough. As long as your
own Google account is listed as a test user (step 3), Upload/Download will
work for you right now, no further steps.

**For a random visitor on Reddit to be able to use it:** while the app is
in "Testing" publishing status, ONLY accounts explicitly added as test
users can sign in — everyone else hits an error, not just a scary warning.
Testing mode caps out at 100 test users, and each one has to be added
manually by email in the Cloud Console — not something that scales to "post
gets attention."

To open it up to anyone, you'd need to move the app to **"Published"**
status via Google's verification process, which requires (at minimum) a
real privacy policy URL and a homepage URL, and can take real review time.
Until that's done, this feature effectively only works for you and whoever
you've manually added — worth knowing going in, not discovering after
someone reports it's broken for them.
