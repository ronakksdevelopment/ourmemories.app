# Our Memories — v1.0 (zero-setup edition)

Paste a Google Drive folder link, see your photos and videos as a gallery.
No Google Cloud project, no API key, no sign-in.

---

## Why no API key is needed (and what changed because of it)

A plain Drive share link alone normally can't give a website a reliable list
of files — that's what the Drive API is for, and every version of this app
up to now called that API with a key. This version avoids that entirely by
embedding **Google's own public folder viewer** (the same grid/preview Google
provides for embedding a shared folder on any website) directly in the page.
Google handles listing the files, generating thumbnails, and playing photos
and videos — this app is just the branded frame around it.

The trade-off: inside the gallery area you're looking at Google's own
Drive interface, not a fully custom-styled grid. Everything around it — the
logo, title, colors, refresh button, and install-as-an-app behavior — is
this app's own design.

---

## One-time setup (about 1 minute)

### 1. Share your Drive folder
1. In Google Drive, right-click your photo/video folder → **Share**.
2. Under **General access**, change it to **"Anyone with the link"**,
   role **Viewer**.
3. Copy the folder's link.

This step can't be skipped — some form of public access is unavoidable
without a sign-in system, since there's no backend server here holding a
private key on your behalf. Anyone who has the exact folder link can open it
directly in Drive, same as any link-shared Drive folder.

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

- **The gallery itself** is Google's embedded folder view — tap a thumbnail
  to preview it, with built-in zoom for photos and playback controls for
  videos.
- **Refresh icon (top right)** — tap to pull the latest contents of the
  folder; the icon spins while it reloads.
- **Auto-refresh** — while the app is open and visible, it quietly reloads
  the gallery about every 90 seconds to catch anything new.
- **Folder icon (top right)** — change the connected folder link, or install
  the app to your home screen.

---

## Why there's no upload or delete in this version

Viewing a public folder needs nothing more than a link. **Writing** to it —
uploading new files, moving things to the trash — needs the Drive API to
know *who* is making the change, which means real Google sign-in. Since this
version deliberately skips sign-in to stay this simple, add or remove files
the normal way, directly in the Google Drive app or website; this gallery
picks up the change on its next refresh.

A fuller version with upload, delete, and a completely custom-styled grid
(at the cost of a short one-time Google Cloud sign-in setup) is a different,
more involved build — just ask if you'd like that instead.

---

## Known limitations

- **The folder must stay set to "Anyone with the link."** Switch it back to
  "Restricted" and the gallery stops loading until it's public again.
- **The gallery's look and interactions** (how thumbnails are laid out, how
  the preview opens) come from Google, not this app, and can change if
  Google changes that interface.
- **Offline mode** only keeps this app's own frame (logo, buttons, loading
  screen) available without a connection — the gallery contents always need
  a live connection, since Google serves them.

---

## If something stops working

- **Gallery won't load / shows an access message:** the folder almost
  certainly isn't shared as "Anyone with the link" yet — check Drive's Share
  settings on that folder.
- **Wrong or old link pasted:** tap the folder icon in the gallery's top bar
  to paste a new link at any time.

---

## Project structure

```
our-memories/
  index.html          — app structure & screens
  styles.css           — all styling (cream / pink / lavender theme)
  app.js               — folder link parsing, embedded viewer, refresh
  manifest.json        — PWA install metadata
  service-worker.js    — offline app-shell caching
  assets/              — app icons generated from your logo
  README.md            — this file
```

Our Memories — Version 1.0.
