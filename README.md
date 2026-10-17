# Our Memories — v1.0

A private, mobile-first photo and video gallery for the two of you, built on
your own Google Drive folder and hosted for free on GitHub Pages.

No backend server, no paid services, no paid APIs. Just static files and
your Google account.

---

## What this app can and can't do (read this first)

- **It's not a secret vault.** GitHub Pages is a public hosting service. Anyone
  with the link can load the *app itself* — an empty shell with a "Sign in with
  Google" button. A private GitHub repository does **not** make the deployed
  website private either; GitHub Pages serves the built files publicly regardless.
- **Your photos stay private because of Google sign-in**, not because of the
  website address. The app only ever shows media to a Google account that you've
  explicitly approved (see Step 3 below), and only for the one folder you connect.
- **There's no separate password system.** Signing in with Google *is* the
  authentication. Don't rely on the app's URL being secret.
- Full video playback downloads the whole video file into the browser before
  it can play (more on this in the Known Limitations section) — this keeps
  everything free and serverless, at the cost of instant seeking on very large files.
- Multi-file download bundles everything into a `.zip` in your browser when
  possible; if that ever fails, it falls back to downloading files one by one.

---

## Part 1 — Set up Google Cloud (about 10–15 minutes, one-time)

Everything here is free. You're creating your own small Google Cloud project
that only you (and your partner) can use.

1. Go to **[console.cloud.google.com](https://console.cloud.google.com)** and
   sign in with the Google account whose Drive you'll use.
2. Click the project dropdown at the top → **New Project**. Name it something
   like "Our Memories" and create it.
3. With that project selected, go to **APIs & Services → Library** and enable:
   - **Google Drive API**
   - **Google Picker API**
4. Go to **APIs & Services → OAuth consent screen**.
   - User type: **External**.
   - Fill in the app name ("Our Memories"), your email as support contact, and
     your email again as developer contact. You can leave the logo and other
     optional fields blank.
   - On the **Scopes** step, you don't need to add anything manually — the app
     requests its scope at runtime.
   - On the **Test users** step, add **your own Gmail address and your
     partner's Gmail address**. This is the important step that keeps your
     gallery limited to just the two of you.
   - Save and finish. **Leave the app in "Testing" publishing status** — do
     not click "Publish App". Testing mode is exactly what you want: it's
     free, requires no review from Google, and only the test users you listed
     can ever sign in.
5. Go to **APIs & Services → Credentials**.
   - Click **Create credentials → OAuth client ID**.
     - Application type: **Web application**.
     - Under **Authorized JavaScript origins**, add the address your gallery
       will live at, e.g. `https://yourusername.github.io` (see Part 3 for the
       exact address — you can come back and edit this afterwards).
     - Create it, then copy the **Client ID** (it ends in
       `.apps.googleusercontent.com`). You'll paste this into the app itself.
   - Click **Create credentials → API key**.
     - Click into the new key and choose **Restrict key**.
     - Under **Application restrictions**, choose **HTTP referrers** and add
       your GitHub Pages address (e.g. `https://yourusername.github.io/*`).
     - Under **API restrictions**, restrict it to **Google Drive API** and
       **Google Picker API**.
     - Save, then copy the **API key**.

Keep this browser tab open — you'll need the Client ID and API key again in
Part 4.

> **Why Testing mode instead of a "real" published app?** Publishing an app
> that requests Drive access normally requires Google to review it, which can
> take weeks and isn't meant for a two-person personal project. Testing mode
> skips that entirely and is explicitly designed for exactly this situation —
> up to 100 named testers, free, forever, no review required.

---

## Part 2 — Prepare your Google Drive folder

1. In Google Drive, create (or choose) a folder for your shared photos and
   videos — e.g. "Our Memories".
2. Share that folder with your partner's Google account (the same one you
   added as a test user above) so you both have access to it in Drive.
3. You don't need to make the folder "public" or "anyone with the link" —
   in fact, don't. Normal "shared with specific people" sharing is all this
   app needs, and it's safer.

---

## Part 3 — Put the files on GitHub Pages

1. Go to **[github.com](https://github.com)**, sign in (or create a free
   account), and click **New repository**.
   - Name it anything, e.g. `our-memories`.
   - Make it **Public** (GitHub Pages' free tier serves public repos; the
     repo being public just means people can see your *code*, not your photos —
     see the privacy note at the top of this file).
   - Create the repository.
2. Upload every file from this project into the repository, **keeping the
   folder structure**:
   ```
   our-memories/
     index.html
     styles.css
     app.js
     manifest.json
     service-worker.js
     README.md
     assets/
       icon-192.png
       icon-512.png
       apple-touch-icon.png
       favicon-32.png
       favicon-16.png
   ```
   The easiest way: on your repository's page, click **Add file → Upload
   files**, then drag in everything (including the `assets` folder) and commit.
3. Go to the repository's **Settings → Pages**.
   - Under **Source**, choose **Deploy from a branch**.
   - Branch: `main` (or `master`), folder: `/ (root)`. Save.
4. GitHub will show you the live address after a minute or two, usually:
   ```
   https://yourusername.github.io/our-memories/
   ```
5. **Go back to Google Cloud Console** (Part 1, step 5) and double-check your
   OAuth Client ID's **Authorized JavaScript origins** and your API key's
   **HTTP referrer restriction** both match this exact address (just the
   `https://yourusername.github.io` part, no need for the trailing path).

---

## Part 4 — Connect the app

1. Open your GitHub Pages link on your phone or computer.
2. **Step 1 — Connect this app to Google:** paste in the Client ID and API
   key you copied in Part 1. These are saved only in your browser's local
   storage — they are never written into the app's code or uploaded anywhere.
3. **Step 2 — Sign in with Google:** sign in with the account you listed as
   a test user. The first time, Google will show an "unverified app" warning
   screen — this is expected for apps in Testing mode. Click **Advanced →
   Go to Our Memories (unsafe)** to continue; it's safe because it's your own
   project.
4. **Step 3 — Choose your folder:** optionally paste your Drive folder's
   link to jump straight there, then use the **Select folder from Google
   Drive** button and click your folder once to select it (don't double-click
   into it — a single click + the picker's "Select" action is what grants
   access).

That's it — your gallery loads. Your partner repeats Part 4 on their own
phone, signing in with their own test-user account.

---

## Using the app

- **Grid home screen** — tap any photo or video to open it full-screen.
- **+ button** — upload photos or videos straight from your device into the
  connected Drive folder.
- **Select mode** (circle-check icon) — tap items to select them, then
  download or move them to Drive's trash from the bar at the top.
- **Settings** (gear icon) — see your connected folder and account, sign out,
  install the app, or change folders.
- **Install App** — adds Our Memories to your home screen like a native app.
  If your browser doesn't support one-tap install (notably iPhone Safari),
  the app shows you the manual "Add to Home Screen" steps instead.

---

## Known limitations (so nothing feels broken)

- **Video playback downloads the full file first.** Because this is a free,
  static site with no server, the only reliable way to play a private Drive
  video in a browser is to fetch it (with your sign-in) and hand the browser
  the whole thing. Short clips play almost instantly; very large videos take
  a moment to buffer, and won't support jumping to an unbuffered point until
  more of the file has loaded. If a video's format genuinely can't play in
  the browser, the app offers an **Open in Google Drive** button instead of a
  broken player.
- **Sessions expire.** Google's sign-in token lasts about an hour. The app
  tries to silently refresh it; if that fails, you'll just need to tap
  "Sign in with Google" again — your folder connection itself isn't lost.
- **Offline mode** only keeps the app's interface (not your photos) available
  without a connection — opening actual media always needs internet.
- **Bulk download as a zip** depends on your browser being able to hold all
  selected files in memory at once. For a very large selection, downloading
  in smaller batches is more reliable.

---

## If something stops working

- **"Access blocked" or sign-in fails:** double-check the Google account is
  listed under **Test users** on the OAuth consent screen, and that the
  Client ID's **Authorized JavaScript origins** exactly matches your GitHub
  Pages address (including `https://`, no trailing slash mismatch).
- **Folder picker won't open / errors about the API key:** confirm the
  Picker API is enabled and that your API key's HTTP referrer restriction
  includes your GitHub Pages address.
- **Gallery loads but is empty / can't see new folder uploads from the Drive
  app itself:** make sure you selected the folder *through the in-app picker*
  at least once (not just pasted a link) — that step is what actually grants
  this app permission to read the folder's contents.
- **Want broader access** (e.g. because folder access through the picker
  isn't working for your setup): open `app.js` and change the `DRIVE_SCOPE`
  constant near the top from
  `https://www.googleapis.com/auth/drive.file` to
  `https://www.googleapis.com/auth/drive`, then sign out and sign in again.
  This grants full Drive access instead of per-folder access — still fine for
  a two-person Testing-mode project, just broader than strictly necessary.

---

## Project structure

```
our-memories/
  index.html          — app structure & screens
  styles.css           — all styling (cream / pink / lavender theme)
  app.js               — Google sign-in, Drive API calls, gallery, viewer, upload/delete
  manifest.json        — PWA install metadata
  service-worker.js    — offline app-shell caching
  assets/              — app icons generated from your logo
  README.md            — this file
```

Our Memories — Version 1.0.
