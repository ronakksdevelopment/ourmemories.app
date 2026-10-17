# Our Memories — v2.0 (custom gallery, still no API key)

Paste a Google Drive folder link, see your photos and videos as a real,
custom-built gallery: a proper grid, tap-to-fullscreen viewing, swipe
left/right between photos, multi-select, and one-tap downloads straight to
the device. No Google Cloud project, no API key, no sign-in.

---

## ⚠️ This version is a "jugaad" (workaround) — read this first

There's no official, keyless way for a plain web page to ask Google Drive
"list the files in this public folder." That normally requires the Drive
API and an API key. This version avoids that, but the price is that it
relies on two things outside this app's control:

1. **A public CORS proxy.** Browsers aren't allowed to directly read the
   HTML of a page on a different site (like `drive.google.com`) — that's a
   browser security rule called CORS. To get around it without a backend
   server of its own, this app routes the request through a free,
   keyless, third-party CORS proxy. `app.js` tries a short list of these
   in order (see `CORS_PROXIES` near the top of the file) and uses
   whichever one answers first. **If all of them are down, slow, or
   blocked, the gallery won't load.** Swapping in a different proxy is a
   one-line change in that list.
2. **Google's own folder-listing page keeping its current shape.** This
   app fetches the same HTML Google generates for its public
   "embeddedfolderview" (the thing the old v1.0 of this app put in an
   iframe) and parses file IDs and names out of that HTML with pattern
   matching, since Google doesn't publish or guarantee that markup.
   Several fallback patterns are used so small changes shouldn't break it,
   but **a bigger redesign on Google's end could stop the parser from
   finding files** until someone updates the patterns in
   `parseFolderHtml()` in `app.js`.

In short: this is a real, working app, not a toy — but it's built on
reverse-engineered behavior rather than an official API, so it's more
fragile than a version built on the real Drive API. If it ever stops
loading photos and nothing in your folder or sharing settings changed,
this is why — see **If something stops working** below.

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

- **The grid** is this app's own — tap any photo or video thumbnail to
  open it fullscreen.
- **In the fullscreen viewer:**
  - **Swipe left/right** (or tap the arrow buttons / use the keyboard
    arrow keys on desktop) to move between photos and videos.
  - **Bottom bar:** ✕ closes the viewer, the counter shows your position
    (e.g. "3 / 42"), and the download icon saves that one file straight to
    the device.
  - Videos play inline with normal playback controls.
- **Select icon (✓, top right)** — turns on multi-select. Tap photos to
  select them (a checkmark appears), or long-press any thumbnail in the
  normal grid to jump straight into select mode. A bar at the bottom
  shows how many are selected and lets you **Download** all of them at
  once (one file after another — see note below) or **Cancel**.
- **Refresh icon (top right)** — tap to pull the latest contents of the
  folder; the icon spins while it reloads.
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
  to "Restricted" and the gallery stops loading until it's public again.
- **Relies on a third-party CORS proxy and on Google's unofficial
  folder-listing markup** — see the warning at the top of this file.
- **No real zip download** for multi-select — see the note above.
- **Offline mode** only keeps this app's own frame (logo, buttons, loading
  screen, grid layout) available without a connection — actual photos and
  videos always need a live connection.

---

## If something stops working

- **Gallery won't load / shows an error:** first check the folder is
  still shared as "Anyone with the link." If it is, the free CORS proxy
  this app depends on may be temporarily down — try the refresh icon
  again in a minute, or in the worst case swap the proxy list in
  `app.js` for a different public CORS proxy.
- **Photos load but names look like "Photo 1", "Photo 2"...**: the parser
  couldn't find a filename for that entry in Google's page — the photo
  itself will still open and download fine, just without its original
  name showing in the list.
- **A single photo or video won't open fullscreen:** tap "Open folder in
  Drive" (folder icon → Open folder in Drive) to view it directly in
  Drive instead.
- **Wrong or old link pasted:** tap the folder icon in the gallery's top
  bar to paste a new link at any time.

---

## Project structure

```
our-memories/
  index.html          — app structure & screens, grid, lightbox, select bar
  styles.css           — all styling (cream / pink / lavender theme)
  app.js               — folder parsing, grid, lightbox, swipe, downloads
  manifest.json        — PWA install metadata
  service-worker.js    — offline app-shell caching
  assets/              — app icons generated from your logo
  README.md            — this file
```

Our Memories — Version 2.0.
