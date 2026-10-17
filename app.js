/* ===========================================================
   Our Memories — v1.0 app logic
   Vanilla JS. No build step. Talks directly to the Google Drive API.
   =========================================================== */

(() => {
  "use strict";

  /* ----------------------------------------------------------
     Constants & small helpers
  ---------------------------------------------------------- */
  const DRIVE_SCOPE = "https://www.googleapis.com/auth/drive.file";
  const DRIVE_API = "https://www.googleapis.com/drive/v3";
  const DRIVE_UPLOAD_API = "https://www.googleapis.com/upload/drive/v3";
  const LS = {
    clientId: "om_client_id",
    apiKey: "om_api_key",
    folderId: "om_folder_id",
    folderName: "om_folder_name",
    accountEmail: "om_account_email",
  };
  const FILE_FIELDS =
    "id,name,mimeType,thumbnailLink,webViewLink,webContentLink,createdTime,videoMediaMetadata,imageMediaMetadata,size";
  const PAGE_SIZE = 60;

  const $ = (id) => document.getElementById(id);
  const qs = (sel, root = document) => root.querySelector(sel);

  function toast(msg, ms = 2600) {
    const el = $("toast");
    el.textContent = msg;
    el.classList.remove("hidden");
    clearTimeout(toast._t);
    toast._t = setTimeout(() => el.classList.add("hidden"), ms);
  }

  function escapeHtml(str) {
    return String(str).replace(/[&<>"']/g, (c) => ({
      "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
    }[c]));
  }

  /* ----------------------------------------------------------
     Font Awesome CDN graceful fallback
     If the stylesheet failed to load (offline / CDN blocked),
     fall back to plain-text glyphs stored in data-fallback.
  ---------------------------------------------------------- */
  function checkFontAwesome() {
    const probe = document.createElement("i");
    probe.className = "fa-solid fa-xmark";
    probe.style.position = "absolute";
    probe.style.visibility = "hidden";
    document.body.appendChild(probe);
    const family = getComputedStyle(probe, "::before").fontFamily || "";
    document.body.removeChild(probe);
    if (!family.toLowerCase().includes("font awesome")) {
      document.documentElement.classList.add("no-fa");
    }
  }

  /* ----------------------------------------------------------
     State
  ---------------------------------------------------------- */
  const state = {
    clientId: localStorage.getItem(LS.clientId) || "",
    apiKey: localStorage.getItem(LS.apiKey) || "",
    folderId: localStorage.getItem(LS.folderId) || "",
    folderName: localStorage.getItem(LS.folderName) || "",
    accountEmail: localStorage.getItem(LS.accountEmail) || "",
    accessToken: null,
    tokenClient: null,
    pickerLoaded: false,
    gapiLoaded: false,

    files: [],           // all loaded file metadata, in display order
    nextPageToken: null,
    loadingGallery: false,

    selectMode: false,
    selectedIds: new Set(),

    viewerIndex: -1,
    viewerObjectUrl: null,

    deferredInstallPrompt: null,
    pendingConfirmAction: null,
  };

  /* ----------------------------------------------------------
     Boot
  ---------------------------------------------------------- */
  document.addEventListener("DOMContentLoaded", init);

  function init() {
    checkFontAwesome();
    registerServiceWorker();
    wireStaticEvents();

    window.addEventListener("beforeinstallprompt", (e) => {
      e.preventDefault();
      state.deferredInstallPrompt = e;
    });

    setTimeout(() => {
      $("splash").classList.add("hidden");
      routeToStart();
    }, 400);
  }

  function routeToStart() {
    if (!state.clientId || !state.apiKey) {
      showSetupStep("config");
      showScreen("setup");
      return;
    }
    loadGoogleClient(() => {
      if (!state.folderId) {
        showSetupStep("connect");
        showScreen("setup");
      } else {
        // Try a silent sign-in; if it fails the user will see the connect screen.
        showScreen("gallery");
        requestAccessToken({ silent: true })
          .then(() => enterGallery())
          .catch(() => {
            showSetupStep("connect");
            showScreen("setup");
          });
      }
    });
  }

  function showScreen(name) {
    $("screen-setup").classList.toggle("hidden", name !== "setup");
    $("screen-gallery").classList.toggle("hidden", name !== "gallery");
  }

  function showSetupStep(step) {
    $("setup-step-config").classList.toggle("hidden", step !== "config");
    $("setup-step-connect").classList.toggle("hidden", step !== "connect");
    $("setup-step-folder").classList.toggle("hidden", step !== "folder");
    $("setup-error").classList.add("hidden");
  }

  function setupError(msg) {
    const el = $("setup-error");
    el.textContent = msg;
    el.classList.remove("hidden");
  }

  /* ----------------------------------------------------------
     Google API / Identity Services loading
  ---------------------------------------------------------- */
  function loadGoogleClient(cb) {
    // gapi (for Drive API + Picker) and GIS (for OAuth) are loaded via <script>
    // tags in index.html; wait for them to be ready.
    const ready = () => window.gapi && window.google && window.google.accounts;
    if (ready()) return cb();
    const iv = setInterval(() => {
      if (ready()) {
        clearInterval(iv);
        cb();
      }
    }, 100);
    setTimeout(() => clearInterval(iv), 15000);
  }

  function ensureGapiClient() {
    return new Promise((resolve, reject) => {
      if (state.gapiLoaded) return resolve();
      window.gapi.load("client:picker", {
        callback: async () => {
          try {
            await window.gapi.client.init({ apiKey: state.apiKey });
            state.gapiLoaded = true;
            state.pickerLoaded = true;
            resolve();
          } catch (err) {
            reject(err);
          }
        },
        onerror: () => reject(new Error("Could not load Google's API library.")),
      });
    });
  }

  function requestAccessToken({ interactive = false, silent = false } = {}) {
    return new Promise((resolve, reject) => {
      if (!state.tokenClient) {
        state.tokenClient = window.google.accounts.oauth2.initTokenClient({
          client_id: state.clientId,
          scope: DRIVE_SCOPE,
          callback: () => {}, // overwritten per-call below
        });
      }
      state.tokenClient.callback = (resp) => {
        if (resp.error) {
          reject(new Error(resp.error));
          return;
        }
        state.accessToken = resp.access_token;
        fetchAccountEmail().finally(() => resolve(resp));
      };
      state.tokenClient.error_callback = (err) => reject(err);
      try {
        state.tokenClient.requestAccessToken({
          prompt: silent ? "none" : (interactive ? "consent" : ""),
        });
      } catch (err) {
        reject(err);
      }
    });
  }

  async function fetchAccountEmail() {
    try {
      const res = await fetch(
        "https://www.googleapis.com/oauth2/v3/userinfo",
        { headers: { Authorization: `Bearer ${state.accessToken}` } }
      );
      if (!res.ok) return;
      const data = await res.json();
      if (data.email) {
        state.accountEmail = data.email;
        localStorage.setItem(LS.accountEmail, data.email);
      }
    } catch (_) { /* non-critical */ }
  }

  function driveHeaders(extra = {}) {
    return { Authorization: `Bearer ${state.accessToken}`, ...extra };
  }

  /* Wraps a Drive fetch call; on 401 tries one silent token refresh+retry. */
  async function driveFetch(url, options = {}, _retried = false) {
    const res = await fetch(url, {
      ...options,
      headers: { ...(options.headers || {}), ...driveHeaders() },
    });
    if (res.status === 401 && !_retried) {
      await requestAccessToken({ silent: true });
      return driveFetch(url, options, true);
    }
    return res;
  }

  /* ----------------------------------------------------------
     Setup screen wiring
  ---------------------------------------------------------- */
  function wireStaticEvents() {
    $("btn-save-config").addEventListener("click", onSaveConfig);
    $("btn-show-help").addEventListener("click", () => $("sheet-help").classList.remove("hidden"));
    $("btn-close-help").addEventListener("click", () => $("sheet-help").classList.add("hidden"));
    $("btn-edit-config").addEventListener("click", () => showSetupStep("config"));
    $("btn-google-signin").addEventListener("click", onGoogleSignIn);
    $("btn-pick-folder").addEventListener("click", onPickFolder);
    $("btn-signout").addEventListener("click", onSignOut);

    $("btn-select-mode").addEventListener("click", enterSelectMode);
    $("btn-cancel-select").addEventListener("click", exitSelectMode);
    $("btn-select-all").addEventListener("click", toggleSelectAll);
    $("btn-download-selected").addEventListener("click", downloadSelected);
    $("btn-delete-selected").addEventListener("click", confirmDeleteSelected);

    $("btn-fab").addEventListener("click", toggleFabMenu);
    $("btn-upload-photos").addEventListener("click", () => { closeFabMenu(); $("input-upload-photos").click(); });
    $("btn-upload-videos").addEventListener("click", () => { closeFabMenu(); $("input-upload-videos").click(); });
    $("input-upload-photos").addEventListener("change", (e) => handleFilesChosen(e.target.files));
    $("input-upload-videos").addEventListener("change", (e) => handleFilesChosen(e.target.files));
    $("btn-close-upload").addEventListener("click", () => $("sheet-upload").classList.add("hidden"));

    $("btn-retry").addEventListener("click", () => loadGallery({ reset: true }));
    $("btn-load-more").addEventListener("click", () => loadGallery({ reset: false }));

    $("btn-settings").addEventListener("click", openSettings);
    $("btn-close-settings").addEventListener("click", () => $("sheet-settings").classList.add("hidden"));
    $("btn-change-folder").addEventListener("click", () => {
      $("sheet-settings").classList.add("hidden");
      showSetupStep("folder");
      showScreen("setup");
    });
    $("btn-settings-signout").addEventListener("click", onSignOut);
    $("btn-install").addEventListener("click", onInstallClick);
    $("btn-privacy-note").addEventListener("click", () => {
      $("sheet-settings").classList.add("hidden");
      $("sheet-privacy").classList.remove("hidden");
    });
    $("btn-close-privacy").addEventListener("click", () => $("sheet-privacy").classList.add("hidden"));
    $("btn-close-install-help").addEventListener("click", () => $("sheet-install-help").classList.add("hidden"));

    $("btn-confirm-cancel").addEventListener("click", closeConfirmDialog);
    $("btn-confirm-ok").addEventListener("click", () => {
      const action = state.pendingConfirmAction;
      closeConfirmDialog();
      if (action) action();
    });

    $("btn-viewer-close").addEventListener("click", closeViewer);
    $("btn-viewer-prev").addEventListener("click", () => showViewerAt(state.viewerIndex - 1));
    $("btn-viewer-next").addEventListener("click", () => showViewerAt(state.viewerIndex + 1));
    $("btn-viewer-download").addEventListener("click", downloadCurrentViewerFile);
    document.addEventListener("keydown", onViewerKeydown);
    wireViewerSwipe();
    wireViewerZoom();
  }

  function onSaveConfig() {
    const clientId = $("input-client-id").value.trim();
    const apiKey = $("input-api-key").value.trim();
    if (!clientId || !apiKey) {
      setupError("Please fill in both the Client ID and the API key.");
      return;
    }
    state.clientId = clientId;
    state.apiKey = apiKey;
    localStorage.setItem(LS.clientId, clientId);
    localStorage.setItem(LS.apiKey, apiKey);
    loadGoogleClient(() => showSetupStep("connect"));
  }

  async function onGoogleSignIn() {
    try {
      await ensureGapiClient();
      await requestAccessToken({ interactive: true });
      showSetupStep("folder");
      if (state.accountEmail) {
        toast(`Signed in as ${state.accountEmail}`);
      }
    } catch (err) {
      console.error(err);
      setupError(
        "Sign-in didn't complete. Double check your Client ID, and that your Google account is added as a test user in Google Cloud Console."
      );
    }
  }

  function extractFolderId(input) {
    if (!input) return null;
    const trimmed = input.trim();
    // Bare ID (no slashes/spaces)
    if (/^[a-zA-Z0-9_-]{10,}$/.test(trimmed) && !trimmed.includes("/")) return trimmed;
    const m = trimmed.match(/folders\/([a-zA-Z0-9_-]+)/) || trimmed.match(/[?&]id=([a-zA-Z0-9_-]+)/);
    return m ? m[1] : null;
  }

  async function onPickFolder() {
    try {
      await ensureGapiClient();
      if (!state.accessToken) await requestAccessToken({ interactive: true });

      const linkGuess = extractFolderId($("input-folder-link").value);

      const view = new google.picker.DocsView(google.picker.ViewId.FOLDERS)
        .setIncludeFolders(true)
        .setSelectFolderEnabled(true)
        .setMimeTypes("application/vnd.google-apps.folder");
      if (linkGuess) {
        try { view.setParent(linkGuess); } catch (_) { /* ignore invalid id */ }
      }

      const picker = new google.picker.PickerBuilder()
        .addView(view)
        .setOAuthToken(state.accessToken)
        .setDeveloperKey(state.apiKey)
        .setCallback((data) => onPickerResult(data))
        .build();
      picker.setVisible(true);
    } catch (err) {
      console.error(err);
      setupError("Couldn't open Google's folder picker. Check your API key and that the Picker API is enabled.");
    }
  }

  function onPickerResult(data) {
    if (data.action === google.picker.Action.PICKED) {
      const folder = data.docs[0];
      state.folderId = folder.id;
      state.folderName = folder.name;
      localStorage.setItem(LS.folderId, folder.id);
      localStorage.setItem(LS.folderName, folder.name);
      toast(`Connected to "${folder.name}"`);
      enterGallery();
    }
  }

  function onSignOut() {
    if (state.accessToken) {
      try { google.accounts.oauth2.revoke(state.accessToken, () => {}); } catch (_) {}
    }
    state.accessToken = null;
    state.folderId = "";
    state.folderName = "";
    state.accountEmail = "";
    localStorage.removeItem(LS.folderId);
    localStorage.removeItem(LS.folderName);
    localStorage.removeItem(LS.accountEmail);
    $("sheet-settings").classList.add("hidden");
    showSetupStep("connect");
    showScreen("setup");
  }

  /* ----------------------------------------------------------
     Gallery
  ---------------------------------------------------------- */
  function enterGallery() {
    showScreen("gallery");
    state.files = [];
    state.nextPageToken = null;
    loadGallery({ reset: true });
  }

  async function loadGallery({ reset }) {
    if (state.loadingGallery) return;
    if (!reset && !state.nextPageToken) return;
    state.loadingGallery = true;

    if (reset) {
      state.files = [];
      $("gallery-grid").innerHTML = "";
    }
    setGalleryState(state.files.length ? "grid" : "loading");

    try {
      if (!state.accessToken) await requestAccessToken({ silent: true });

      const q = `'${state.folderId}' in parents and trashed = false and (mimeType contains 'image/' or mimeType contains 'video/')`;
      const params = new URLSearchParams({
        q,
        fields: `nextPageToken, files(${FILE_FIELDS})`,
        orderBy: "createdTime desc",
        pageSize: String(PAGE_SIZE),
      });
      if (!reset && state.nextPageToken) params.set("pageToken", state.nextPageToken);

      const res = await driveFetch(`${DRIVE_API}/files?${params.toString()}`);
      if (!res.ok) throw new Error(`Drive API error (${res.status})`);
      const data = await res.json();

      state.files = reset ? (data.files || []) : state.files.concat(data.files || []);
      state.nextPageToken = data.nextPageToken || null;

      renderGrid();
      setGalleryState(state.files.length ? "grid" : "empty");
      $("btn-load-more").classList.toggle("hidden", !state.nextPageToken);
    } catch (err) {
      console.error(err);
      $("gallery-error-text").textContent =
        "Couldn't load your memories. Check your connection and that the folder is still shared with you.";
      setGalleryState("error");
    } finally {
      state.loadingGallery = false;
    }
  }

  function setGalleryState(which) {
    $("gallery-loading").classList.toggle("hidden", which !== "loading");
    $("gallery-empty").classList.toggle("hidden", which !== "empty");
    $("gallery-error").classList.toggle("hidden", which !== "error");
    $("gallery-grid").classList.toggle("hidden", which !== "grid");
    if (which !== "grid") $("btn-load-more").classList.add("hidden");
  }

  function bigThumb(url) {
    if (!url) return url;
    return url.replace(/=s\d+$/, "=s800");
  }

  function renderGrid() {
    const grid = $("gallery-grid");
    grid.innerHTML = "";
    state.files.forEach((file, idx) => {
      const isVideo = file.mimeType && file.mimeType.startsWith("video/");
      const tile = document.createElement("button");
      tile.className = "tile";
      tile.setAttribute("role", "listitem");
      tile.dataset.id = file.id;
      tile.dataset.index = String(idx);
      if (state.selectedIds.has(file.id)) tile.classList.add("selected");

      const img = document.createElement("img");
      img.loading = "lazy";
      img.alt = file.name || "";
      img.src = file.thumbnailLink ? bigThumb(file.thumbnailLink) : "assets/icon-192.png";
      tile.appendChild(img);

      if (isVideo) {
        const badge = document.createElement("span");
        badge.className = "tile-video-badge";
        badge.innerHTML = '<i class="fa-solid fa-play" data-fallback="\u25B6"></i>';
        tile.appendChild(badge);
      }

      const check = document.createElement("span");
      check.className = "tile-check";
      tile.appendChild(check);

      tile.addEventListener("click", () => onTileClick(idx));
      grid.appendChild(tile);
    });
  }

  function onTileClick(idx) {
    const file = state.files[idx];
    if (state.selectMode) {
      toggleSelection(file.id);
    } else {
      openViewer(idx);
    }
  }

  /* ----------------------------------------------------------
     Selection mode
  ---------------------------------------------------------- */
  function enterSelectMode() {
    state.selectMode = true;
    state.selectedIds.clear();
    $("gallery-header").classList.add("hidden");
    $("selection-bar").classList.remove("hidden");
    updateSelectionCount();
    renderGrid();
  }

  function exitSelectMode() {
    state.selectMode = false;
    state.selectedIds.clear();
    $("gallery-header").classList.remove("hidden");
    $("selection-bar").classList.add("hidden");
    renderGrid();
  }

  function toggleSelection(id) {
    if (state.selectedIds.has(id)) state.selectedIds.delete(id);
    else state.selectedIds.add(id);
    updateSelectionCount();
    const tile = qs(`.tile[data-id="${CSS.escape(id)}"]`);
    if (tile) tile.classList.toggle("selected", state.selectedIds.has(id));
  }

  function toggleSelectAll() {
    if (state.selectedIds.size === state.files.length) {
      state.selectedIds.clear();
    } else {
      state.files.forEach((f) => state.selectedIds.add(f.id));
    }
    updateSelectionCount();
    renderGrid();
  }

  function updateSelectionCount() {
    const n = state.selectedIds.size;
    $("selection-count").textContent = `${n} selected`;
  }

  /* ----------------------------------------------------------
     Delete
  ---------------------------------------------------------- */
  function confirmDeleteSelected() {
    const n = state.selectedIds.size;
    if (!n) { toast("Select something first."); return; }
    openConfirmDialog(
      n === 1
        ? "Move this item to Google Drive's trash?"
        : `Move ${n} items to Google Drive's trash?`,
      doDeleteSelected
    );
  }

  async function doDeleteSelected() {
    const ids = Array.from(state.selectedIds);
    let ok = 0, fail = 0;
    for (const id of ids) {
      try {
        const res = await driveFetch(`${DRIVE_API}/files/${id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ trashed: true }),
        });
        if (res.ok) { ok++; } else { fail++; }
      } catch (_) { fail++; }
    }
    state.files = state.files.filter((f) => !state.selectedIds.has(f.id));
    exitSelectMode();
    renderGrid();
    setGalleryState(state.files.length ? "grid" : "empty");
    if (fail === 0) toast(`${ok} item${ok === 1 ? "" : "s"} moved to trash.`);
    else toast(`${ok} moved to trash, ${fail} failed.`);
  }

  /* ----------------------------------------------------------
     Confirm dialog (generic)
  ---------------------------------------------------------- */
  function openConfirmDialog(text, onConfirm) {
    $("dialog-confirm-text").textContent = text;
    state.pendingConfirmAction = onConfirm;
    $("dialog-confirm").classList.remove("hidden");
  }
  function closeConfirmDialog() {
    $("dialog-confirm").classList.add("hidden");
    state.pendingConfirmAction = null;
  }

  /* ----------------------------------------------------------
     Download (single + bulk, with optional ZIP bundling)
  ---------------------------------------------------------- */
  async function fetchFileBlob(fileId) {
    const res = await driveFetch(`${DRIVE_API}/files/${fileId}?alt=media`);
    if (!res.ok) throw new Error(`Download failed (${res.status})`);
    return res.blob();
  }

  function triggerBlobDownload(blob, filename) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 4000);
  }

  async function downloadSelected() {
    const ids = Array.from(state.selectedIds);
    if (!ids.length) { toast("Select something first."); return; }
    const items = state.files.filter((f) => ids.includes(f.id));

    if (items.length === 1) {
      await downloadSingleFile(items[0]);
      return;
    }

    if (window.JSZip) {
      toast(`Preparing ${items.length} files as a zip…`, 5000);
      try {
        const zip = new JSZip();
        for (const file of items) {
          const blob = await fetchFileBlob(file.id);
          zip.file(file.name || file.id, blob);
        }
        const zipBlob = await zip.generateAsync({ type: "blob" });
        triggerBlobDownload(zipBlob, "our-memories.zip");
        toast("Download ready.");
      } catch (err) {
        console.error(err);
        toast("Couldn't build the zip. Try downloading fewer items at once.");
      }
    } else {
      toast(`Downloading ${items.length} files one by one…`, 4000);
      for (const file of items) {
        try { await downloadSingleFile(file, { silent: true }); }
        catch (_) { /* continue with the rest */ }
      }
      toast("Downloads finished.");
    }
  }

  async function downloadSingleFile(file, { silent } = {}) {
    try {
      const blob = await fetchFileBlob(file.id);
      triggerBlobDownload(blob, file.name || "memory");
      if (!silent) toast("Download ready.");
    } catch (err) {
      console.error(err);
      if (!silent) toast("Couldn't download this file.");
      throw err;
    }
  }

  /* ----------------------------------------------------------
     Upload
  ---------------------------------------------------------- */
  function toggleFabMenu() {
    const open = $("fab-menu").classList.contains("hidden");
    $("fab-menu").classList.toggle("hidden", !open);
    $("btn-fab").setAttribute("aria-expanded", String(open));
    qs(".fab-wrap").classList.toggle("open", open);
  }
  function closeFabMenu() {
    $("fab-menu").classList.add("hidden");
    $("btn-fab").setAttribute("aria-expanded", "false");
    qs(".fab-wrap").classList.remove("open");
  }

  function handleFilesChosen(fileList) {
    const files = Array.from(fileList || []);
    if (!files.length) return;
    $("input-upload-photos").value = "";
    $("input-upload-videos").value = "";
    uploadFiles(files);
  }

  function uploadFiles(files) {
    const sheet = $("sheet-upload");
    const list = $("upload-list");
    list.innerHTML = "";
    $("btn-close-upload").classList.add("hidden");
    sheet.classList.remove("hidden");

    let remaining = files.length;
    const rows = [];

    files.forEach((file) => {
      const row = document.createElement("div");
      row.className = "upload-item";
      const previewUrl = file.type.startsWith("image/") ? URL.createObjectURL(file) : null;
      row.innerHTML = `
        ${previewUrl ? `<img class="upload-item-thumb" src="${previewUrl}" alt="">`
                     : `<div class="upload-item-thumb" style="display:flex;align-items:center;justify-content:center;">
                          <i class="fa-regular fa-circle-play" data-fallback="\u25B6"></i>
                        </div>`}
        <div class="upload-item-info">
          <div class="upload-item-name">${escapeHtml(file.name)}</div>
          <div class="upload-item-bar"><div class="upload-item-bar-fill" style="width:0%"></div></div>
          <div class="upload-item-status">Waiting…</div>
        </div>`;
      list.appendChild(row);
      rows.push(row);
    });

    let idx = 0;
    const next = () => {
      if (idx >= files.length) return;
      const file = files[idx];
      const row = rows[idx];
      idx++;
      uploadOneFile(file, row).finally(() => {
        remaining--;
        if (remaining === 0) {
          $("btn-close-upload").classList.remove("hidden");
          loadGallery({ reset: true });
        }
        next();
      });
    };
    // Upload two at a time to keep things responsive without hammering the API.
    next();
    if (files.length > 1) next();
  }

  function uploadOneFile(file, row) {
    const bar = qs(".upload-item-bar-fill", row);
    const status = qs(".upload-item-status", row);
    return new Promise((resolve) => {
      const metadata = { name: file.name, parents: [state.folderId] };
      const boundary = "our-memories-boundary";
      const metaPart =
        `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n` +
        JSON.stringify(metadata) + `\r\n`;
      const filePart =
        `--${boundary}\r\nContent-Type: ${file.type || "application/octet-stream"}\r\n\r\n`;
      const closeDelim = `\r\n--${boundary}--`;

      // Build the multipart body from the File blob directly — mixing strings
      // and a Blob/File in the Blob constructor keeps the binary bytes intact.
      const body = new Blob([metaPart, filePart, file, closeDelim]);

      const xhr = new XMLHttpRequest();
      xhr.open("POST", `${DRIVE_UPLOAD_API}/files?uploadType=multipart&fields=id,name,mimeType,thumbnailLink`);
      xhr.setRequestHeader("Authorization", `Bearer ${state.accessToken}`);
      xhr.setRequestHeader("Content-Type", `multipart/related; boundary=${boundary}`);

      xhr.upload.onprogress = (e) => {
        if (e.lengthComputable) {
          bar.style.width = `${Math.round((e.loaded / e.total) * 100)}%`;
        }
      };
      xhr.onload = () => {
        if (xhr.status >= 200 && xhr.status < 300) {
          bar.style.width = "100%";
          status.textContent = "Uploaded";
          status.classList.add("ok");
        } else {
          status.textContent = `Failed (${xhr.status})`;
          status.classList.add("err");
        }
        resolve();
      };
      xhr.onerror = () => {
        status.textContent = "Failed — check your connection";
        status.classList.add("err");
        resolve();
      };
      status.textContent = "Uploading…";
      xhr.send(body);
    });
  }

  /* ----------------------------------------------------------
     Settings sheet
  ---------------------------------------------------------- */
  function openSettings() {
    $("settings-folder-name").textContent = state.folderName || "—";
    $("settings-account").textContent = state.accountEmail || "—";
    $("sheet-settings").classList.remove("hidden");
  }

  function onInstallClick() {
    if (state.deferredInstallPrompt) {
      state.deferredInstallPrompt.prompt();
      state.deferredInstallPrompt.userChoice.finally(() => {
        state.deferredInstallPrompt = null;
      });
    } else {
      $("sheet-settings").classList.add("hidden");
      $("sheet-install-help").classList.remove("hidden");
    }
  }

  /* ----------------------------------------------------------
     Viewer
  ---------------------------------------------------------- */
  function openViewer(idx) {
    $("viewer").classList.remove("hidden");
    showViewerAt(idx);
  }

  function closeViewer() {
    $("viewer").classList.add("hidden");
    cleanupViewerMedia();
  }

  function cleanupViewerMedia() {
    const video = $("viewer-video");
    video.pause();
    video.removeAttribute("src");
    video.load();
    if (state.viewerObjectUrl) {
      URL.revokeObjectURL(state.viewerObjectUrl);
      state.viewerObjectUrl = null;
    }
  }

  async function showViewerAt(idx) {
    if (idx < 0 || idx >= state.files.length) return;
    cleanupViewerMedia();
    state.viewerIndex = idx;
    const file = state.files[idx];
    const isVideo = file.mimeType && file.mimeType.startsWith("video/");

    $("viewer-counter").textContent = `${idx + 1} of ${state.files.length}`;
    $("btn-viewer-prev").style.visibility = idx === 0 ? "hidden" : "visible";
    $("btn-viewer-next").style.visibility = idx === state.files.length - 1 ? "hidden" : "visible";

    $("viewer-image").classList.add("hidden");
    $("viewer-video").classList.add("hidden");
    $("viewer-fallback").classList.add("hidden");
    $("viewer-image").classList.remove("zoomed");
    $("viewer-loading").classList.remove("hidden");

    try {
      if (isVideo) {
        await showVideoInViewer(file);
      } else {
        await showImageInViewer(file);
      }
    } finally {
      $("viewer-loading").classList.add("hidden");
    }
  }

  async function showImageInViewer(file) {
    try {
      const blob = await fetchFileBlob(file.id);
      const url = URL.createObjectURL(blob);
      state.viewerObjectUrl = url;
      const img = $("viewer-image");
      img.src = url;
      img.alt = file.name || "";
      img.classList.remove("hidden");
    } catch (err) {
      console.error(err);
      // Fall back to the large thumbnail if the full file can't be fetched.
      if (file.thumbnailLink) {
        const img = $("viewer-image");
        img.src = bigThumb(file.thumbnailLink);
        img.classList.remove("hidden");
      } else {
        toast("Couldn't load this photo.");
      }
    }
  }

  async function showVideoInViewer(file) {
    try {
      const blob = await fetchFileBlob(file.id);
      const url = URL.createObjectURL(blob);
      state.viewerObjectUrl = url;
      const video = $("viewer-video");
      video.src = url;
      video.classList.remove("hidden");
    } catch (err) {
      console.error(err);
      $("viewer-fallback-text").textContent = "This video can't be played here.";
      $("viewer-fallback-link").href = file.webViewLink || "#";
      $("viewer-fallback").classList.remove("hidden");
    }
  }

  async function downloadCurrentViewerFile() {
    const file = state.files[state.viewerIndex];
    if (!file) return;
    await downloadSingleFile(file);
  }

  function onViewerKeydown(e) {
    if ($("viewer").classList.contains("hidden")) return;
    if (e.key === "Escape") closeViewer();
    else if (e.key === "ArrowLeft") showViewerAt(state.viewerIndex - 1);
    else if (e.key === "ArrowRight") showViewerAt(state.viewerIndex + 1);
  }

  function wireViewerSwipe() {
    const stage = $("viewer-stage");
    let startX = 0, startY = 0, tracking = false;
    stage.addEventListener("touchstart", (e) => {
      if (e.touches.length !== 1) return;
      startX = e.touches[0].clientX;
      startY = e.touches[0].clientY;
      tracking = true;
    }, { passive: true });
    stage.addEventListener("touchend", (e) => {
      if (!tracking) return;
      tracking = false;
      const dx = e.changedTouches[0].clientX - startX;
      const dy = e.changedTouches[0].clientY - startY;
      if (Math.abs(dx) > 60 && Math.abs(dx) > Math.abs(dy) * 1.3) {
        if (dx < 0) showViewerAt(state.viewerIndex + 1);
        else showViewerAt(state.viewerIndex - 1);
      }
    }, { passive: true });
  }

  function wireViewerZoom() {
    const img = $("viewer-image");
    img.addEventListener("click", () => img.classList.toggle("zoomed"));
  }

  /* ----------------------------------------------------------
     Service worker
  ---------------------------------------------------------- */
  function registerServiceWorker() {
    if ("serviceWorker" in navigator) {
      window.addEventListener("load", () => {
        navigator.serviceWorker.register("service-worker.js").catch((err) => {
          console.warn("Service worker registration failed:", err);
        });
      });
    }
  }

  // Close the fab menu when tapping elsewhere.
  document.addEventListener("click", (e) => {
    const wrap = qs(".fab-wrap");
    if (wrap && !wrap.contains(e.target) && !wrap.classList.contains("hidden")) {
      wrap.classList.remove("open");
      $("fab-menu") && $("fab-menu").classList.add("hidden");
    }
  });

})();
