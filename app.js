/* ===========================================================
   Our Memories — v2.0 app logic (custom gallery, no API key)

   This build does NOT use the Google Drive API and needs no API
   key or sign-in. Instead it fetches the HTML that Google's own
   public, keyless "embeddedfolderview" page returns for a folder
   shared as "Anyone with the link", and parses the file list out
   of that HTML (ids, names, mime types). Everything after that —
   the grid, the fullscreen viewer, swiping, multi-select, and
   downloading — is this app's own code.

   Why this is a "jugaad" (workaround), not a proper integration:
   - embeddedfolderview is a cross-origin page, so the browser
     can't fetch() it directly (no CORS headers). This app routes
     the request through a public, free, keyless CORS proxy
     instead. That proxy is a third party this app doesn't control
     — if it's down, folder loading fails until it's back or the
     proxy URL below is swapped for another one.
   - The parser below looks for the file-entry markup Google's
     folder-view page is known to use. Google can change that
     markup at any time without notice, which would break parsing
     here too. Several fallback patterns are tried for exactly
     that reason, but if Google changes the page enough, this
     will need an update.
   - There's no official endpoint for "zip this whole public
     folder" without signing in, so downloads happen file-by-file
     (the browser just triggers one save after another).
   =========================================================== */

(() => {
  "use strict";

  const LS = { folderId: "om_folder_id", folderLink: "om_folder_link" };
  const AUTO_REFRESH_MS = 90 * 1000;

  // Public, keyless CORS proxies, tried in order. The first one
  // that returns usable HTML wins. If all of them are down or
  // blocked, the folder can still be opened directly in Drive via
  // the "Open folder in Drive" button in Settings.
  const CORS_PROXIES = [
    (url) => `https://corsproxy.io/?url=${encodeURIComponent(url)}`,
    (url) => `https://api.allorigins.win/raw?url=${encodeURIComponent(url)}`,
    (url) => `https://r.jina.ai/${url}`,
  ];

  const $ = (id) => document.getElementById(id);

  const state = {
    folderId: localStorage.getItem(LS.folderId) || "",
    folderLink: localStorage.getItem(LS.folderLink) || "",
    autoRefreshTimer: null,
    deferredInstallPrompt: null,
    items: [],          // [{id, name, mime, isVideo}]
    selectMode: false,
    selected: new Set(),
    lightboxIndex: -1,
    touchStartX: null,
    touchStartY: null,
  };

  function toast(msg, ms = 2800) {
    const el = $("toast");
    el.textContent = msg;
    el.classList.remove("hidden");
    clearTimeout(toast._t);
    toast._t = setTimeout(() => el.classList.add("hidden"), ms);
  }

  /* ----------------------------------------------------------
     Font Awesome CDN graceful fallback
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
     Boot
  ---------------------------------------------------------- */
  document.addEventListener("DOMContentLoaded", init);

  function init() {
    checkFontAwesome();
    registerServiceWorker();
    wireEvents();
    setTimeout(() => {
      $("splash").classList.add("hidden");
      if (state.folderId) {
        showScreen("gallery");
        loadGallery();
        startAutoRefresh();
      } else {
        $("input-folder-link").value = state.folderLink || "";
        showScreen("home");
      }
    }, 350);
  }

  function showScreen(name) {
    $("screen-home").classList.toggle("hidden", name !== "home");
    $("screen-gallery").classList.toggle("hidden", name !== "gallery");
  }

  function homeError(msg) {
    const el = $("home-error");
    el.textContent = msg || "";
    el.classList.toggle("hidden", !msg);
  }

  /* ----------------------------------------------------------
     Folder link parsing
  ---------------------------------------------------------- */
  function extractFolderId(input) {
    if (!input) return null;
    const trimmed = input.trim();
    if (/^[a-zA-Z0-9_-]{10,}$/.test(trimmed) && !trimmed.includes("/")) return trimmed;
    const m = trimmed.match(/folders\/([a-zA-Z0-9_-]+)/) || trimmed.match(/[?&]id=([a-zA-Z0-9_-]+)/);
    return m ? m[1] : null;
  }

  /* ----------------------------------------------------------
     Events
  ---------------------------------------------------------- */
  function wireEvents() {
    $("btn-load-gallery").addEventListener("click", onOpenGallery);

    $("btn-refresh").addEventListener("click", () => {
      const inFallback = !$("gallery-frame").classList.contains("hidden");
      if (inFallback) {
        setRefreshSpinning(true);
        showFallbackEmbed();
      } else {
        loadGallery({ spin: true });
      }
    });
    $("btn-retry").addEventListener("click", () => loadGallery({ spin: true }));
    $("gallery-frame").addEventListener("load", () => setRefreshSpinning(false));

    $("btn-change-folder").addEventListener("click", () => {
      $("input-folder-link-2").value = state.folderLink || "";
      $("sheet-settings").classList.remove("hidden");
    });
    $("btn-close-settings").addEventListener("click", () => $("sheet-settings").classList.add("hidden"));
    $("btn-save-settings").addEventListener("click", onSaveSettings);
    $("btn-open-in-drive").addEventListener("click", () => {
      if (state.folderId) window.open(`https://drive.google.com/drive/folders/${encodeURIComponent(state.folderId)}`, "_blank", "noopener");
    });
    $("btn-install").addEventListener("click", onInstallClick);
    $("btn-close-install-help").addEventListener("click", () => $("sheet-install-help").classList.add("hidden"));

    // Select mode
    $("btn-select-mode").addEventListener("click", () => setSelectMode(true));
    $("btn-select-cancel").addEventListener("click", () => setSelectMode(false));
    $("btn-select-download").addEventListener("click", onDownloadSelected);

    // Lightbox
    $("lightbox-close").addEventListener("click", closeLightbox);
    $("lightbox-prev").addEventListener("click", () => stepLightbox(-1));
    $("lightbox-next").addEventListener("click", () => stepLightbox(1));
    $("lightbox-download").addEventListener("click", () => {
      const item = state.items[state.lightboxIndex];
      if (item) downloadItem(item);
    });
    wireLightboxSwipe();
    document.addEventListener("keydown", (e) => {
      if ($("lightbox").classList.contains("hidden")) return;
      if (e.key === "Escape") closeLightbox();
      else if (e.key === "ArrowLeft") stepLightbox(-1);
      else if (e.key === "ArrowRight") stepLightbox(1);
    });

    document.addEventListener("visibilitychange", () => {
      if (document.hidden) stopAutoRefresh();
      else if (!$("screen-gallery").classList.contains("hidden")) startAutoRefresh();
    });

    window.addEventListener("beforeinstallprompt", (e) => {
      e.preventDefault();
      state.deferredInstallPrompt = e;
    });
  }

  function onOpenGallery() {
    const link = $("input-folder-link").value.trim();
    const folderId = extractFolderId(link);
    if (!folderId) {
      homeError("That doesn't look like a Google Drive folder link. Paste the full link from Drive's \"Share\" menu.");
      return;
    }
    homeError(null);
    saveFolderConfig(folderId, link);
    showScreen("gallery");
    loadGallery();
    startAutoRefresh();
  }

  function onSaveSettings() {
    const link = $("input-folder-link-2").value.trim();
    const folderId = extractFolderId(link);
    if (!folderId) {
      toast("That doesn't look like a valid Drive folder link.");
      return;
    }
    saveFolderConfig(folderId, link);
    $("sheet-settings").classList.add("hidden");
    loadGallery();
  }

  function saveFolderConfig(folderId, link) {
    state.folderId = folderId;
    state.folderLink = link;
    localStorage.setItem(LS.folderId, folderId);
    localStorage.setItem(LS.folderLink, link);
  }

  /* ----------------------------------------------------------
     Gallery loading — fetch Google's public folder-view HTML
     through a CORS proxy, parse out the file list, render our
     own grid.
  ---------------------------------------------------------- */
  function startAutoRefresh() {
    stopAutoRefresh();
    state.autoRefreshTimer = setInterval(() => loadGallery({ spin: false }), AUTO_REFRESH_MS);
  }
  function stopAutoRefresh() {
    if (state.autoRefreshTimer) clearInterval(state.autoRefreshTimer);
    state.autoRefreshTimer = null;
  }

  function setRefreshSpinning(on) {
    $("refresh-icon").classList.toggle("spinning", on);
  }

  function setGalleryState(name) {
    // name: "loading" | "empty" | "error" | "grid" | "fallback"
    $("gallery-loading").classList.toggle("hidden", name !== "loading");
    $("gallery-empty").classList.toggle("hidden", name !== "empty");
    $("gallery-error").classList.toggle("hidden", name !== "error");
    $("gallery-grid").classList.toggle("hidden", name !== "grid");
    $("gallery-frame").classList.toggle("hidden", name !== "fallback");
    $("gallery-fallback-note").classList.toggle("hidden", name !== "fallback");
    // Multi-select only works against our own parsed grid — hide
    // the select icon whenever we're showing Google's own embed.
    $("btn-select-mode").classList.toggle("hidden", name === "fallback");
    if (name !== "fallback") $("select-bar").classList.add("hidden");
  }

  function showFallbackEmbed() {
    const url = `https://drive.google.com/embeddedfolderview?id=${encodeURIComponent(state.folderId)}#grid`;
    $("gallery-frame").src = url;
    setGalleryState("fallback");
  }

  async function loadGallery({ spin } = {}) {
    if (!state.folderId) return;
    if (spin) setRefreshSpinning(true);
    const hadItemsBefore = state.items.length > 0;
    const wasInFallback = !$("gallery-frame").classList.contains("hidden");
    if (!hadItemsBefore && !wasInFallback) setGalleryState("loading");

    try {
      const html = await fetchFolderHtml(state.folderId);
      const items = parseFolderHtml(html);
      // Too few recognizable items usually means the parser didn't
      // actually find real entries (Google changed the markup, or
      // the proxy returned something unexpected) rather than the
      // folder genuinely being empty, so treat it the same as a
      // failure and fall back rather than show a false "empty".
      if (items.length === 0) {
        throw new Error("Parser found no items");
      }
      state.items = items;
      renderGrid(items);
      setGalleryState("grid");
    } catch (err) {
      console.warn("Custom gallery parse failed, falling back to Google's embed:", err);
      if (!hadItemsBefore) {
        showFallbackEmbed();
      } else if (!wasInFallback) {
        toast("Couldn't refresh — showing the last loaded photos.");
      }
    } finally {
      setRefreshSpinning(false);
    }
  }

  async function fetchFolderHtml(folderId) {
    const target = `https://drive.google.com/embeddedfolderview?id=${encodeURIComponent(folderId)}#grid`;
    let lastErr;
    for (const buildProxyUrl of CORS_PROXIES) {
      try {
        const res = await fetch(buildProxyUrl(target), { cache: "no-store" });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const text = await res.text();
        if (text && text.length > 200) return text;
        throw new Error("Empty response");
      } catch (err) {
        lastErr = err;
      }
    }
    throw lastErr || new Error("All proxies failed");
  }

  /* ----------------------------------------------------------
     Parsing — Google's embeddedfolderview page lists each file
     as an entry carrying its file id, name and a flip/mime class.
     The exact markup isn't officially documented and can change,
     so several patterns are tried, most specific first.
  ---------------------------------------------------------- */
  function parseFolderHtml(html) {
    const seen = new Map();

    // Pattern A: entries like <div class="flip-entry" ... data-id="FILEID" ...>
    //            with a title usually in a following element/attribute.
    const entryRe = /data-id="([a-zA-Z0-9_-]{15,})"[^>]*>/g;
    let m;
    while ((m = entryRe.exec(html))) {
      const id = m[1];
      if (!seen.has(id)) seen.set(id, { id, name: "", mime: "" });
    }

    // Pattern B: links to drive file preview/view URLs, which carry
    // the id in the path: /file/d/FILEID/ or open?id=FILEID
    const linkRe = /\/file\/d\/([a-zA-Z0-9_-]{15,})|[?&]id=([a-zA-Z0-9_-]{15,})/g;
    while ((m = linkRe.exec(html))) {
      const id = m[1] || m[2];
      if (id && id !== undefined && !seen.has(id) && id.length >= 15) {
        seen.set(id, { id, name: "", mime: "" });
      }
    }

    // Try to recover display names and whether each is a video by
    // looking at a window around each id for a title-ish attribute
    // or text, and for common video indicators. The window is kept
    // short and clipped at the start of the next entry's own id so
    // a neighboring file's name/type can't bleed into this one.
    const ids = Array.from(seen.keys());
    for (const entry of seen.values()) {
      const idx = html.indexOf(entry.id);
      let windowEnd = idx >= 0 ? idx + 600 : -1;
      if (idx >= 0) {
        for (const otherId of ids) {
          if (otherId === entry.id) continue;
          const otherIdx = html.indexOf(otherId, idx + entry.id.length);
          if (otherIdx > idx && otherIdx < windowEnd) windowEnd = otherIdx;
        }
      }
      const windowHtml = idx >= 0 ? html.slice(idx, windowEnd) : "";

      const titleMatch =
        windowHtml.match(/aria-label="([^"]{1,200})"/) ||
        windowHtml.match(/title="([^"]{1,200})"/) ||
        windowHtml.match(/>([^<>{}]{1,120})<\/a>/);
      if (titleMatch && titleMatch[1]) {
        entry.name = decodeHtmlEntities(titleMatch[1].trim());
      }

      const videoIndicators = /\.mp4|\.mov|\.webm|\.mkv|\.avi|video\/mp4|video\/quicktime/i;
      entry.isVideo = videoIndicators.test(entry.name) || videoIndicators.test(windowHtml);
    }

    // Drop anything that still has no usable id, de-dup, and filter
    // out ids that are clearly not file ids (e.g. matched the
    // folder id itself).
    let items = Array.from(seen.values()).filter((e) => e.id && e.id !== state.folderId);

    // Fallback names.
    items.forEach((e, i) => {
      if (!e.name) e.name = `Photo ${i + 1}`;
    });

    return items;
  }

  function decodeHtmlEntities(str) {
    const ta = document.createElement("textarea");
    ta.innerHTML = str;
    return ta.value;
  }

  /* ----------------------------------------------------------
     URLs — keyless thumbnail / content URLs Drive serves for
     publicly shared files.
  ---------------------------------------------------------- */
  function thumbUrl(id, size = 480) {
    return `https://drive.google.com/thumbnail?id=${encodeURIComponent(id)}&sz=w${size}`;
  }
  function fullImageUrl(id) {
    return `https://lh3.googleusercontent.com/d/${encodeURIComponent(id)}=w1600`;
  }
  function downloadUrl(id) {
    return `https://drive.google.com/uc?export=download&id=${encodeURIComponent(id)}`;
  }

  /* ----------------------------------------------------------
     Grid rendering
  ---------------------------------------------------------- */
  function renderGrid(items) {
    const grid = $("gallery-grid");
    grid.innerHTML = "";
    const frag = document.createDocumentFragment();

    items.forEach((item, index) => {
      const cell = document.createElement("button");
      cell.type = "button";
      cell.className = "grid-cell";
      cell.dataset.index = String(index);
      cell.setAttribute("aria-label", item.name);

      const img = document.createElement("img");
      img.src = thumbUrl(item.id, 300);
      img.alt = "";
      img.loading = "lazy";
      img.referrerPolicy = "no-referrer";
      cell.appendChild(img);

      if (item.isVideo) {
        const badge = document.createElement("span");
        badge.className = "grid-video-badge";
        badge.innerHTML = '<i class="fa-solid fa-play" data-fallback="▶"></i>';
        cell.appendChild(badge);
      }

      const check = document.createElement("span");
      check.className = "grid-check";
      check.innerHTML = '<i class="fa-solid fa-circle-check" data-fallback="✓"></i>';
      cell.appendChild(check);

      cell.addEventListener("click", () => onCellTap(index));

      let pressTimer = null;
      cell.addEventListener("pointerdown", () => {
        pressTimer = setTimeout(() => {
          if (!state.selectMode) setSelectMode(true);
          toggleSelect(index);
        }, 450);
      });
      const clearPress = () => { if (pressTimer) clearTimeout(pressTimer); };
      cell.addEventListener("pointerup", clearPress);
      cell.addEventListener("pointerleave", clearPress);
      cell.addEventListener("pointercancel", clearPress);

      frag.appendChild(cell);
    });

    grid.appendChild(frag);
    updateSelectionUI();
  }

  function onCellTap(index) {
    if (state.selectMode) {
      toggleSelect(index);
    } else {
      openLightbox(index);
    }
  }

  /* ----------------------------------------------------------
     Multi-select
  ---------------------------------------------------------- */
  function setSelectMode(on) {
    state.selectMode = on;
    if (!on) state.selected.clear();
    $("select-bar").classList.toggle("hidden", !on);
    $("gallery-grid").classList.toggle("select-mode", on);
    updateSelectionUI();
  }

  function toggleSelect(index) {
    if (state.selected.has(index)) state.selected.delete(index);
    else state.selected.add(index);
    updateSelectionUI();
  }

  function updateSelectionUI() {
    const cells = $("gallery-grid").children;
    for (const cell of cells) {
      const idx = Number(cell.dataset.index);
      cell.classList.toggle("is-selected", state.selected.has(idx));
    }
    $("select-count").textContent = `${state.selected.size} selected`;
  }

  async function onDownloadSelected() {
    if (state.selected.size === 0) {
      toast("Select at least one photo or video first.");
      return;
    }
    const indices = Array.from(state.selected).sort((a, b) => a - b);
    toast(`Downloading ${indices.length} item${indices.length > 1 ? "s" : ""}…`);
    for (const i of indices) {
      const item = state.items[i];
      if (item) {
        downloadItem(item);
        // Small gap so the browser doesn't block a burst of
        // simultaneous downloads as a popup flood.
        await new Promise((r) => setTimeout(r, 350));
      }
    }
    setSelectMode(false);
  }

  function downloadItem(item) {
    const a = document.createElement("a");
    a.href = downloadUrl(item.id);
    a.download = item.name || "";
    a.target = "_blank";
    a.rel = "noopener";
    document.body.appendChild(a);
    a.click();
    a.remove();
  }

  /* ----------------------------------------------------------
     Lightbox — fullscreen viewer with swipe + bottom nav.
  ---------------------------------------------------------- */
  function openLightbox(index) {
    state.lightboxIndex = index;
    $("lightbox").classList.remove("hidden");
    document.body.style.overflow = "hidden";
    renderLightbox();
  }

  function closeLightbox() {
    $("lightbox").classList.add("hidden");
    document.body.style.overflow = "";
    $("lightbox-video").pause();
  }

  function stepLightbox(dir) {
    const next = state.lightboxIndex + dir;
    if (next < 0 || next >= state.items.length) return;
    state.lightboxIndex = next;
    renderLightbox();
  }

  function renderLightbox() {
    const item = state.items[state.lightboxIndex];
    if (!item) return;

    $("lightbox-name").textContent = item.name;
    $("lightbox-counter").textContent = `${state.lightboxIndex + 1} / ${state.items.length}`;
    $("lightbox-prev").classList.toggle("hidden", state.lightboxIndex <= 0);
    $("lightbox-next").classList.toggle("hidden", state.lightboxIndex >= state.items.length - 1);

    const img = $("lightbox-img");
    const video = $("lightbox-video");
    const spinner = $("lightbox-spinner");

    video.pause();
    video.removeAttribute("src");
    video.classList.add("hidden");
    img.classList.add("hidden");
    spinner.classList.remove("hidden");

    if (item.isVideo) {
      video.src = downloadUrl(item.id);
      video.onloadeddata = () => {
        spinner.classList.add("hidden");
        video.classList.remove("hidden");
      };
      video.onerror = () => {
        spinner.classList.add("hidden");
        toast("Couldn't play this video — try downloading it instead.");
      };
    } else {
      img.onload = () => {
        spinner.classList.add("hidden");
        img.classList.remove("hidden");
      };
      img.onerror = () => {
        // Fall back to the thumbnail at a larger size if the
        // full-resolution URL pattern doesn't work for this file.
        if (img.src !== thumbUrl(item.id, 1600)) {
          img.src = thumbUrl(item.id, 1600);
        } else {
          spinner.classList.add("hidden");
          toast("Couldn't load full image.");
        }
      };
      img.src = fullImageUrl(item.id);
    }
  }

  function wireLightboxSwipe() {
    const stage = $("lightbox-stage");
    const img = $("lightbox-img");

    // ---- Zoom state (pinch + double-tap), image only ----
    let scale = 1;
    let originX = 0, originY = 0; // translate in px, at scale=1 baseline
    let pinchStartDist = null;
    let pinchStartScale = 1;
    let panStart = null;
    let lastTapTime = 0;
    let lastTapPoint = null;

    function applyTransform() {
      img.style.transform = `translate(${originX}px, ${originY}px) scale(${scale})`;
      img.style.transition = "";
    }
    function resetZoom(animate) {
      scale = 1; originX = 0; originY = 0;
      if (animate) img.style.transition = "transform 0.18s ease";
      applyTransform();
    }
    function clampScale(s) { return Math.min(4, Math.max(1, s)); }

    // Reset zoom whenever a new image is shown.
    img.addEventListener("load", () => resetZoom(false));

    function dist(touches) {
      const [a, b] = touches;
      return Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY);
    }
    function midpoint(touches) {
      const [a, b] = touches;
      return { x: (a.clientX + b.clientX) / 2, y: (a.clientY + b.clientY) / 2 };
    }

    stage.addEventListener("touchstart", (e) => {
      if (e.touches.length === 2) {
        pinchStartDist = dist(e.touches);
        pinchStartScale = scale;
      } else if (e.touches.length === 1) {
        const t = e.touches[0];
        state.touchStartX = t.clientX;
        state.touchStartY = t.clientY;
        if (scale > 1) {
          panStart = { x: t.clientX - originX, y: t.clientY - originY };
        }
      }
    }, { passive: true });

    stage.addEventListener("touchmove", (e) => {
      if (e.touches.length === 2 && pinchStartDist) {
        const newDist = dist(e.touches);
        scale = clampScale(pinchStartScale * (newDist / pinchStartDist));
        applyTransform();
      } else if (e.touches.length === 1 && panStart && scale > 1) {
        const t = e.touches[0];
        originX = t.clientX - panStart.x;
        originY = t.clientY - panStart.y;
        applyTransform();
      }
    }, { passive: true });

    stage.addEventListener("touchend", (e) => {
      if (e.touches.length === 0) {
        pinchStartDist = null;
        panStart = null;
      }
      if (state.touchStartX === null) return;
      const t = e.changedTouches[0];
      const dx = t.clientX - state.touchStartX;
      const dy = t.clientY - state.touchStartY;

      // Double-tap to zoom (only meaningful when not actively pinching).
      const now = Date.now();
      if (lastTapPoint && now - lastTapTime < 320 &&
          Math.hypot(t.clientX - lastTapPoint.x, t.clientY - lastTapPoint.y) < 30) {
        if (scale > 1) {
          resetZoom(true);
        } else {
          scale = 2.4;
          img.style.transition = "transform 0.18s ease";
          applyTransform();
        }
        lastTapTime = 0;
        lastTapPoint = null;
        state.touchStartX = null;
        state.touchStartY = null;
        return;
      }
      lastTapTime = now;
      lastTapPoint = { x: t.clientX, y: t.clientY };

      state.touchStartX = null;
      state.touchStartY = null;

      // Swipe to move between photos — only when not zoomed in,
      // so panning a zoomed photo doesn't also flip the page.
      if (scale > 1) return;
      if (Math.abs(dx) < 50 || Math.abs(dx) < Math.abs(dy) * 1.2) return;
      if (dx < 0) stepLightbox(1);
      else stepLightbox(-1);
    }, { passive: true });

    // Desktop: double-click to zoom, wheel to zoom.
    img.addEventListener("dblclick", () => {
      if (scale > 1) resetZoom(true);
      else { scale = 2.4; img.style.transition = "transform 0.18s ease"; applyTransform(); }
    });
    stage.addEventListener("wheel", (e) => {
      if (img.classList.contains("hidden")) return;
      e.preventDefault();
      scale = clampScale(scale + (e.deltaY < 0 ? 0.2 : -0.2));
      if (scale === 1) { originX = 0; originY = 0; }
      applyTransform();
    }, { passive: false });

    // Expose reset so other code (closing/navigating the lightbox) can call it.
    wireLightboxSwipe._resetZoom = resetZoom;
  }

  /* ----------------------------------------------------------
     Install / PWA
  ---------------------------------------------------------- */
  function onInstallClick() {
    if (state.deferredInstallPrompt) {
      state.deferredInstallPrompt.prompt();
      state.deferredInstallPrompt.userChoice.finally(() => { state.deferredInstallPrompt = null; });
    } else {
      $("sheet-settings").classList.add("hidden");
      $("sheet-install-help").classList.remove("hidden");
    }
  }

  function registerServiceWorker() {
    if ("serviceWorker" in navigator) {
      window.addEventListener("load", () => {
        navigator.serviceWorker.register("service-worker.js").catch((err) => {
          console.warn("Service worker registration failed:", err);
        });
      });
    }
  }

})();
