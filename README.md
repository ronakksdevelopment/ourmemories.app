# Our Memories — v2.1 (custom gallery with automatic fallback, still no API key)

Paste a Google Drive folder link, see your photos and videos as a real,
custom-built gallery: a proper grid, tap-to-fullscreen viewing, pinch/
double-tap to zoom, swipe left/right between photos, multi-select, and
one-tap downloads straight to the device. No Google Cloud project, no API
key, no sign-in — and if the custom gallery can't load for any reason, the
app automatically falls back to the same reliable Google-embed view the
very first version of this app used, so you're never left with a blank
error screen.

---

## ⚠️ This version is a "jugaad" (workaround) — read this first

There's no official, keyless way for a plain web page to ask Google Drive
"list the files in this public folder." That normally requires the Drive
API and an API key. This version avoids that, but the price is that the
custom gallery relies on two things outside this app's control:

1. **A public CORS proxy.** Browsers aren't allowed to directly read the
   HTML of a page on a different site (like `drive.google.com`) — that's a
   browser security rule called CORS. To get around it without a backend
   server of its own, this app routes the request through a free,
   keyless, third-party CORS proxy. `app.js` tries a short list of these
   in order (see `CORS_PROXIES` near the top of the file) and uses
   whichever one answers first.
2. **Google's own folder-listing page keeping its current shape.** This
   app fetches the same HTML Google generates for its public
   "embeddedfolderview" (the thing v1.0 of this app put directly in an
   iframe) and parses file IDs and names out of that HTML with pattern
   matching, since Google doesn't publish or guarantee that markup.

**If either of those fails** — the proxy is down, blocked, or Google
changed the page enough to break the pattern matching — the app
automatically shows Google's own embedded folder view instead (exactly
like v1.0), with a small note at the bottom of the screen saying so. You
still see your photos either way; you just lose the custom fullscreen
viewer, zoom, and multi-select for that session, and get Google's own
preview (tap a photo → it already has its own zoom and download icon)
instead. The app quietly retries the custom gallery on every refresh, so
it switches back on its own once the proxy/parsing works again.

In short: when everything lines up, you get the fuller custom experience;
when it doesn't, you always still get a working gallery — just the
simpler one. See **If something stops working** below for what each
situation looks like.

---

## One-time setup (about 1 minute)

### 1. Share your Drive folder
1. In Google Drive, right-click your photo/video folder → **Share**.
2. Under **General access**, change it to **"Anyone with the link"**,
   role **Viewer**.
3. Copy the folder's link.

This step can't be skipped — some form of public access is unavoidable
without a sign-in system, since there's no backend server here holding a
private key on your behalf. Anyone who has the exact folder link can open
it directly in Drive, same as any link-shared Drive folder.

### 2. Put the app on GitHub Pages
1. Create a free **public** GitHub repository.
2. Upload every file from this project, keeping the `assets` folder intact:
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
3. In the repository, go to **Settings → Pages** → Source: **Deploy from a
   branch** → Branch: `main`, folder `/ (root)` → Save.
4. After a minute or two, GitHub shows your live link, e.g.
   `https://yourusername.github.io/our-memories/`.

### 3. Open it
1. Open your GitHub Pages link.
2. Paste in your folder link, tap **Open gallery**.
3. Your partner does the exact same thing on their own phone.

That's the whole setup — nothing to configure in Google Cloud at all.

---

## Using the app

**When the custom gallery is working:**
- **The grid** is this app's own — tap any photo or video thumbnail to
  open it fullscreen.
- **In the fullscreen viewer:**
  - **Swipe left/right** (or tap the arrow buttons / use the keyboard
    arrow keys on desktop) to move between photos and videos.
  - **Zoom:** double-tap a photo to zoom in, double-tap again to zoom
    back out, or pinch with two fingers. On desktop, double-click or
    scroll to zoom. Swiping to the next photo is disabled while zoomed
    in, so panning around a zoomed photo doesn't also flip the page.
  - **Bottom bar:** ✕ closes the viewer, the counter shows your position
    (e.g. "3 / 42"), and the download icon saves that one file straight to
    the device.
  - Videos play inline with normal playback controls.
- **Select icon (✓, top right)** — turns on multi-select. Tap photos to
  select them (a checkmark appears), or long-press any thumbnail in the
  normal grid to jump straight into select mode. A bar at the bottom
  shows how many are selected and lets you **Download** all of them at
  once (one file after another — see note below) or **Cancel**.

**When the app has fallen back to Google's own view** (see the warning
above — you'll see a note at the bottom of the screen when this is
happening):
- The grid is Google's own embedded folder view. Tap a thumbnail to open
  Google's own preview, which has its own built-in zoom and a download
  icon in its corner.
- The select icon is hidden, since multi-select needs the custom gallery.

**Either way:**
- **Refresh icon (top right)** — tap to pull the latest contents of the
  folder; the icon spins while it reloads, and also gives the custom
  gallery another chance to load if it was showing the fallback.
- **Auto-refresh** — while the app is open and visible, it quietly reloads
  the gallery about every 90 seconds to catch anything new.
- **Folder icon (top right)** — change the connected folder link, open the
  real folder directly in Drive, or install the app to your home screen.

### A note on downloading several files at once

There's no keyless way to ask Google to zip up several files for you, so
"Download" on multiple selected items triggers one browser download per
file, back to back, rather than a single zip. Depending on your browser,
the first download after a multi-select may show a permission prompt
("allow multiple downloads?") — allow it, and the rest will follow
automatically. Each file lands in your device's normal Downloads folder
individually, under its own filename.

---

## Why there's still no upload or delete

Viewing a public folder needs nothing more than a link. **Writing** to it —
uploading new files, moving things to the trash — needs the Drive API to
know *who* is making the change, which means real Google sign-in. Since
this version deliberately skips sign-in to stay this simple, add or remove
files the normal way, directly in the Google Drive app or website; this
gallery picks up the change on its next refresh.

A fuller version built on the real Drive API (with a one-time free Google
Cloud sign-in setup) would trade away the "zero setup" property in exchange
for reliability — no CORS proxy, no HTML scraping, real thumbnails and
true zip downloads of a whole selection. Just ask if you'd rather have
that instead.

---

## Known limitations

- **The folder must stay set to "Anyone with the link."** Switch it back
  to "Restricted" and neither the custom gallery nor the fallback will
  load until it's public again.
- **The custom gallery (fullscreen/zoom/multi-select) relies on a
  third-party CORS proxy and on Google's unofficial folder-listing
  markup** — see the warning at the top of this file. When either one
  is unavailable, the app automatically shows the simpler, reliable
  fallback instead, so the gallery itself never stops working — only the
  extra features do.
- **No real zip download** for multi-select — see the note above.
- **Offline mode** only keeps this app's own frame (logo, buttons, loading
  screen, grid layout) available without a connection — actual photos and
  videos always need a live connection.

---

## If something stops working

- **You keep seeing "Showing Google's own view" at the bottom of the
  screen:** this means the custom gallery couldn't load (the CORS proxy
  is down, or Google changed its page), so the app is using the reliable
  fallback automatically. Your photos are still there and still viewable —
  you've just lost zoom/swipe/multi-select for now. Tapping refresh tries
  the custom gallery again.
- **Nothing loads at all, not even the fallback:** check the folder is
  still shared as "Anyone with the link" — that one requirement applies
  to both the custom gallery and the fallback.
- **Photos load but names look like "Photo 1", "Photo 2"...**: the parser
  couldn't find a filename for that entry in Google's page — the photo
  itself will still open and download fine, just without its original
  name showing in the list.
- **Wrong or old link pasted:** tap the folder icon in the gallery's top
  bar to paste a new link at any time.

---

## Project structure

```
our-memories/
  index.html          — app structure & screens, grid, lightbox, select bar, fallback iframe
  styles.css           — all styling (cream / pink / lavender theme)
  app.js               — folder parsing, grid, lightbox, zoom, swipe, downloads, fallback logic
  manifest.json        — PWA install metadata
  service-worker.js    — offline app-shell caching
  assets/              — app icons generated from your logo
  README.md            — this file
```

Our Memories — Version 2.1.
