/* ===========================================================
   Our Memories — v1.0 app logic (zero-setup edition)
   Shows a *publicly shared* ("Anyone with the link") Google Drive
   folder using Google's own keyless embeddable folder viewer.
   No API key, no sign-in, no Google Cloud project required.
   =========================================================== */

(() => {
  "use strict";

  const LS = { folderId: "om_folder_id", folderLink: "om_folder_link" };
  const AUTO_REFRESH_MS = 90 * 1000;

  const $ = (id) => document.getElementById(id);

  const state = {
    folderId: localStorage.getItem(LS.folderId) || "",
    folderLink: localStorage.getItem(LS.folderLink) || "",
    autoRefreshTimer: null,
    deferredInstallPrompt: null,
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

    $("btn-refresh").addEventListener("click", () => loadGallery({ spin: true }));

    $("btn-change-folder").addEventListener("click", () => {
      $("input-folder-link-2").value = state.folderLink || "";
      $("sheet-settings").classList.remove("hidden");
    });
    $("btn-close-settings").addEventListener("click", () => $("sheet-settings").classList.add("hidden"));
    $("btn-save-settings").addEventListener("click", onSaveSettings);
    $("btn-install").addEventListener("click", onInstallClick);
    $("btn-close-install-help").addEventListener("click", () => $("sheet-install-help").classList.add("hidden"));

    $("gallery-frame").addEventListener("load", onFrameLoaded);

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
     Gallery — Google's own embeddable folder viewer handles
     thumbnails, photo/video playback and navigation for us.
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

  function loadGallery({ spin } = {}) {
    if (spin) {
      setRefreshSpinning(true);
      $("gallery-loading").classList.remove("hidden");
      $("gallery-frame").classList.add("hidden");
    }
    const url = `https://drive.google.com/embeddedfolderview?id=${encodeURIComponent(state.folderId)}#grid`;
    const frame = $("gallery-frame");
    // Changing src (even to the same address) forces a fresh request,
    // which is how both manual and automatic refresh work here.
    frame.src = url;
  }

  function onFrameLoaded() {
    $("gallery-loading").classList.add("hidden");
    $("gallery-frame").classList.remove("hidden");
    setRefreshSpinning(false);
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
