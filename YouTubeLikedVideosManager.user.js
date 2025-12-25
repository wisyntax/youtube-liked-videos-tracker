// ==UserScript==
// @name         YouTube Liked Videos Manager
// @namespace    Violentmonkey Scripts
// @version      1.5.5.2
// @description  Full-featured liked videos manager and checker with hide/dim, import/export, liked videos playlist scan, and hearts overlay
// @match        *://www.youtube.com/*
// @icon         data:image/svg+xml;charset=UTF-8,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20viewBox%3D%220%200%20100%20100%22%3E%3Ctext%20x%3D%2250%25%22%20y%3D%2250%25%22%20style%3D%22dominant-baseline%3Amiddle%3Btext-anchor%3Amiddle%3Bfont-size%3A80px%3B%22%3E%E2%9D%A4%EF%B8%8F%3C%2Ftext%3E%3C%2Fsvg%3E
// @grant        GM_getValue
// @grant        GM_setValue
// @grant        GM_addValueChangeListener
// ==/UserScript==

(() => {
  "use strict";

  /******************************************************************
  // #region STORAGE & SYNC
   ******************************************************************/
  let likedIndex = new Set(GM_getValue("likedIndex", []));
  let hideLiked = GM_getValue("hideLiked", false);
  let dimLiked = GM_getValue("dimLiked", false);
  let showHearts = GM_getValue("showHearts", true);
  let turboMode = GM_getValue("turboMode", false);

  const persistIndex = (index) => GM_setValue("likedIndex", [...index]);
  const persistToggle = (k, v) => GM_setValue(k, v);

  // Sync across tabs using value change listener
  if (typeof GM_addValueChangeListener === "function") {
    GM_addValueChangeListener("likedIndex", (name, oldValue, newValue, remote) => {
      if (remote) {
        likedIndex.clear();
        (newValue || []).forEach((v) => likedIndex.add(v));
        console.log("[Sync] likedIndex updated from another tab");
        processAllVideos();
      }
    });
  }

  // Helper to get fresh index copy immediately
  function getLatestLikedIndex() {
    return new Set(GM_getValue("likedIndex", []));
  }

  // turbo toggle alert
  let turboTogglePrompt = false;

  function turboToggle() {
    if (turboTogglePrompt) return;
    turboTogglePrompt = true;
    if (
      confirm("Turbo mode was changed.\n\n" + "Reload now to apply it?\n\n" + "Press Cancel to reload later.")
    ) {
      location.reload();
    }
  }

  /******************************************************************
  // #region VIDEO ID EXTRACTION
   ******************************************************************/
  function extractVideoId(url) {
    if (typeof url !== "string") return null;
    return (
      url.match(/[?&]v=([^&]+)/)?.[1] ||
      url.match(/youtu\.be\/([^?/]+)/)?.[1] ||
      url.match(/\/shorts\/([^?/]+)/)?.[1] ||
      null
    );
  }

  function getVideoIdFromElement(el) {
    const a = el.querySelector('a[href*="/watch"], a[href*="/shorts"], a[href^="/shorts"]');
    return a ? extractVideoId(a.href) : null;
  }

  // Get current watch video ID
  function getCurrentVideoId() {
    const videoRenderer = document.querySelector("ytd-watch-flexy");
    return videoRenderer?.videoId || null;
  }

  // Get current shorts video ID
  function getCurrentShortId() {
    const activeShort = document.querySelector("ytd-reel-video-renderer[is-active]");
    if (!activeShort) return null;

    const a = activeShort.querySelector('a[href*="/shorts/"]');
    if (!a) return null;

    return a.href.split("/shorts/").pop().split("?")[0];
  }

  /******************************************************************
  // #region LIKES HANDLER
   ******************************************************************/
  function updateLiked(ID, isLiked, type) {
    if (!ID) return;
    const had = likedIndex.has(ID);
    if (isLiked && !had) likedIndex.add(ID);
    else if (!isLiked && had) likedIndex.delete(ID);
    else return;

    console.log(type, isLiked ? "Liked:" : "Unliked:", ID);
    persistIndex(likedIndex);
  }

  // Generic listener factory
  function listenLikes(selector, getIdFn, type) {
    document.addEventListener(
      "click",
      (e) => {
        const btnHost = e.target.closest(selector);
        if (!btnHost) return;

        const ID = getIdFn();
        if (!ID) return;

        const btn = btnHost.querySelector("button[aria-pressed]");
        if (!btn) return;

        setTimeout(() => {
          const liked = btn.getAttribute("aria-pressed") === "true";
          updateLiked(ID, liked, type);
        }, 0);
      },
      true
    );
  }

  // Watch / fullscreen / shorts
  listenLikes("segmented-like-dislike-button-view-model", getCurrentVideoId, "[Watch]");
  listenLikes(".ytp-fullscreen-quick-actions", getCurrentVideoId, "[Watch Fullscreen]");
  listenLikes("like-button-view-model", getCurrentShortId, "[Shorts]");

  // SPA navigation: sync initial watch video like
  document.addEventListener("yt-navigate-finish", () => {
    setTimeout(() => {
      const videoId = getCurrentVideoId();
      if (!videoId) return;
      const btn = document.querySelector("segmented-like-dislike-button-view-model button[aria-pressed]");
      if (!btn) return;
      const isLiked = btn.getAttribute("aria-pressed") === "true";
      updateLiked(videoId, isLiked, "[Watch SPA]");
    }, 0);
  });

  /******************************************************************
  // #region HEART BADGE
   ******************************************************************/
  const HEART_HIDDEN_CLASS = "yt-liked-heart-hidden";
  const heartMap = new WeakMap(); // maps video element -> heart div
  const hostMap = new WeakMap(); // maps video element -> overlay host

  const style = document.createElement("style");
  style.textContent = `
  .yt-liked-heart-hidden { display: none !important; }
`;
  document.head.appendChild(style);

  function addHeart(el) {
    const id = getVideoIdFromElement(el);
    if (!id || !likedIndex.has(id)) return; // skip unliked videos
    if (heartMap.has(el)) return; // already has heart

    // resolve host only once
    let host = hostMap.get(el);
    if (!host) {
      host = resolveOverlayHost(el);
      if (!host) return;
      hostMap.set(el, host);

      if (getComputedStyle(host).position === "static") {
        host.style.position = "relative";
      }
    }

    const heart = document.createElement("div");
    heart.className = "yt-liked-indicator";
    heart.dataset.id = id;
    heart.textContent = "🤍";

    Object.assign(heart.style, {
      position: "absolute",
      top: "8px",
      right: "8px",
      background: "#ff0000",
      color: "white",
      width: "22px",
      height: "22px",
      borderRadius: "50%",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      fontSize: "10px",
      zIndex: "20",
      pointerEvents: "none",
      boxShadow: "0 2px 8px rgba(0,0,0,.4)",
    });

    host.appendChild(heart);
    heartMap.set(el, heart);
  }

  function resolveOverlayHost(el) {
    // Shorts shelf (search / home)
    const shortsShelfThumb = el.querySelector('a[href^="/shorts"] yt-thumbnail-view-model');
    if (shortsShelfThumb) return shortsShelfThumb;

    // History page: anchor inside yt-thumbnail-view-model for perfect overlay
    const historyThumb = el.querySelector("a.yt-lockup-view-model__content-image yt-thumbnail-view-model");
    if (historyThumb) return historyThumb;

    // Playlist page: anchor inside the inner <yt-image> for exact thumbnail
    const playlistThumb = el.querySelector("ytd-thumbnail a#thumbnail");
    if (playlistThumb) return playlistThumb;

    // Standard video renderers
    const standardThumb =
      el.querySelector("a#thumbnail") ||
      el.querySelector("ytd-thumbnail") ||
      el.querySelector("yt-thumbnail-view-model");
    if (standardThumb) return standardThumb;

    // Absolute fallback
    return null;
  }

  function syncHeart(el) {
    const id = getVideoIdFromElement(el);
    if (!id) return;

    let heart = heartMap.get(el);

    // if video is NOT liked, remove heart
    if (!likedIndex.has(id)) {
      if (heart) {
        heart.remove();
        heartMap.delete(el);
      }
      return;
    }

    // ensure heart exists
    if (!heart) {
      addHeart(el);
      heart = heartMap.get(el);
      if (!heart) return;
    }

    // toggle visibility only
    heart.classList.toggle(HEART_HIDDEN_CLASS, !showHearts);
  }

  /******************************************************************
  // #region PROCESS VIDEOS
   ******************************************************************/
  function processVideo(el) {
  const id = getVideoIdFromElement(el);
  if (!id) return;

  // Check if video ID changed - if so, reprocess
  const previousId = el._ytLikedProcessed;
  if (previousId && previousId !== id) {
  const oldHeart = heartMap.get(el);
  if (oldHeart) {
    oldHeart.remove();
    heartMap.delete(el);
  }
}

  // Skip if already processed for this video ID
  if (el._ytLikedProcessed === id) {
    return;
  }

  // Mark as processed for this video ID
  el._ytLikedProcessed = id;
  applyVideoStyles(el);
}

  function applyVideoStyles(el) {
    const id = getVideoIdFromElement(el);
    if (!id) return;
    // Reset display & opacity
    el.style.display = "";
    el.style.opacity = "";
    const shelf = el.closest(".ytGridShelfViewModelGridShelfItem");
    if (shelf) shelf.style.display = "";

    // Heart
    syncHeart(el);

    // Hide / dim liked
    if (likedIndex.has(id)) {
      if (hideLiked) (shelf || el).style.display = "none";
      else if (dimLiked) el.style.opacity = "0.55";
    }
  }

  // check for "ytm-shorts-lockup-view-model" if youtube changes short shelf again
  const VIDEO_SELECTOR =
    "ytd-rich-item-renderer," +
    "ytd-video-renderer," +
    "ytd-grid-video-renderer," +
    "ytd-playlist-video-renderer," +
    "yt-lockup-view-model," +
    "ytm-shorts-lockup-view-model-v2";


  // Process all elements, re-apply toggles
  function processAllVideos() {
  document.querySelectorAll(VIDEO_SELECTOR).forEach(applyVideoStyles);
}


  // Debounce helper
  const debounce = (func, wait) => {
    let timeout;
    return (...args) => {
      clearTimeout(timeout);
      timeout = setTimeout(() => func.apply(this, args), wait);
    };
  };

  // MutationObserver for newly added nodes
  const pendingVideos = new Set();

  const flushPendingVideosRaw = () => {
    const count = pendingVideos.size;
    if (count === 0) return;

    const startTime = performance.now();

    pendingVideos.forEach((el) => processVideo(el));
    pendingVideos.clear();

    const duration = (performance.now() - startTime).toFixed(2);
    console.log(`[Performance] Processed ${count} videos in ${duration}ms`);
  };

  let rafScheduled = false;

  const flushPendingVideos = turboMode
    ? () => {
        if (rafScheduled) return;
        rafScheduled = true;

        requestAnimationFrame(() => {
          rafScheduled = false;
          flushPendingVideosRaw();
        });
      }
    : debounce(flushPendingVideosRaw, 250);

  const observer = new MutationObserver((muts) => {
    // console.log(`[Observer] Detected ${muts.length} mutations`);
    // Ignore mutations from script elements
    if (muts.length === 1) {
      const target = muts[0].target;
      const addedNode = muts[0].addedNodes[0];
      if (
        target?.classList?.contains("yt-liked-indicator") ||
        target?.id === "yt-liked-menu" ||
        addedNode?.classList?.contains("yt-liked-indicator") ||
        addedNode?.id === "yt-liked-menu"
      ) {
        return;
      }
    }

    muts.forEach((m) => {
      m.addedNodes.forEach((n) => {
        if (!(n instanceof HTMLElement)) return;

        if (n.matches?.(VIDEO_SELECTOR)) {
          pendingVideos.add(n);
        } else {
          n.querySelectorAll?.(VIDEO_SELECTOR).forEach((el) => pendingVideos.add(el));
        }
      });
    });

    flushPendingVideos();
  });

  observer.observe(document.body, { childList: true, subtree: true });

  document.addEventListener("yt-page-data-updated", () => {
    console.log('yt-page-data-updated')
    requestAnimationFrame(processAllVideos);
  });

  /******************************************************************
  // #region PLAYLIST SCAN
   ******************************************************************/
  async function playlistScan() {
    if (!location.pathname.includes("/playlist") || !location.search.includes("list=LL")) {
      return alert(
        "Playlist scan only works on your Liked videos playlist:\nwww.youtube.com/playlist?list=LL"
      );
    }

    const textOnlyStyle = document.createElement("style");
    textOnlyStyle.textContent = `
    /* Kill thumbnails */
    ytd-playlist-video-renderer ytd-thumbnail,
    ytd-playlist-video-renderer yt-image,
    ytd-playlist-video-renderer img {
      display: none !important;
    }

    /* Flatten layout */
    ytd-playlist-video-renderer {
      min-height: auto !important;
    }

    /* Reduce padding/margins */
    ytd-playlist-video-renderer #content {
      padding: 4px 0 !important;
    }

    /* Keep title readable */
    ytd-playlist-video-renderer #video-title {
      font-size: 13px !important;
      line-height: 1.3 !important;
    }
    `;
    document.head.appendChild(textOnlyStyle);

    const startUrl = location.href;

    const max = prompt(
      "Auto-scroll will load the playlist.\n\n" +
        "Optional: max videos to scan\n" +
        "(Leave empty for ALL liked videos)"
    );
    if (max === null) return;

    const delay = (ms) => new Promise((r) => setTimeout(r, ms));

    let lastCount = 0;
    let stableRounds = 0;

    // Auto-scroll loop
    while (true) {
      if (location.href !== startUrl) {
        alert("Playlist scan aborted — navigation detected.");
        setTimeout(() => {
          textOnlyStyle.remove();
        }, 5000);
        return;
      }

      const vids = document.querySelectorAll("ytd-playlist-video-renderer").length;
      if (vids === lastCount) {
        stableRounds++;
      } else {
        stableRounds = 0;
        lastCount = vids;
      }

      if (stableRounds >= 4) break; // end loop if number of videos don't change for x loops
      if (max && vids >= Number(max)) break; // end loop if user entered num and if vids greater than usernum

      window.scrollTo(0, document.documentElement.scrollHeight);
      await delay(1500); // loop delay: lower delay scrolls faster but also ends faster
    }

    // Scan loaded videos
    const els = document.querySelectorAll("ytd-playlist-video-renderer");
    let scanned = 0;
    let added = 0;
    const index = getLatestLikedIndex(); // fresh copy from storage

    for (const el of els) {
      const id = getVideoIdFromElement(el);
      scanned++;

      if (id && !index.has(id)) {
        index.add(id);
        added++;
      }

      if (max && scanned >= Number(max)) break;
    }

    likedIndex = index;
    persistIndex(index);
    setTimeout(() => {
      processAllVideos();
      alert(`Playlist scan complete\nScanned: ${scanned}\nAdded: ${added}`);
      setTimeout(() => {
        textOnlyStyle.remove();
      }, 1000);
    }, 0);
  }

  /******************************************************************
  // #region IMPORT / EXPORT / CLEAR
   ******************************************************************/
  // takeout and script import
  async function importTakeoutJson(file) {
    if (!file) return;
    let data;
    try {
      data = JSON.parse(await file.text());
    } catch {
      return alert("Invalid JSON");
    }

    const index = getLatestLikedIndex();
    let added = 0;
    let type = "unknown";

    for (const e of data || []) {
      let id = null;

      if (typeof e === "string") {
        id = e;
        type = "exported IDs";
      } else if (e.title?.startsWith("Liked ") && e.titleUrl) {
        id = extractVideoId(e.titleUrl);
        type = "Takeout JSON";
      }

      if (id && !index.has(id)) {
        index.add(id);
        added++;
      }
    }

    likedIndex = index;
    persistIndex(index);
    processAllVideos();
    alert(`Imported ${added} liked videos (${type})`);
  }

  // CSV import
  async function importCsvLikes(file) {
    const lines = (await file.text()).split(/\r?\n/);
    const headers = parseCsvLine(lines[0]);
    const a = headers.indexOf("action");
    const l = headers.indexOf("video_link");
    if (a === -1 || l === -1) return alert("Invalid CSV");

    const index = getLatestLikedIndex();
    let added = 0;

    for (let i = 1; i < lines.length; i++) {
      const r = parseCsvLine(lines[i]);
      if (r?.[a] === "liked") {
        const id = extractVideoId(r[l]);
        if (id && !index.has(id)) {
          index.add(id);
          added++;
        }
      }
    }

    likedIndex = index;
    persistIndex(index);
    processAllVideos();
    alert(`Imported ${added} liked videos`);
  }

  const parseCsvLine = (l) => {
    if (!l) return null;

    const o = [];
    let c = "";
    let q = false;

    for (let i = 0; i < l.length; i++) {
      const ch = l[i];

      if (ch === '"' && l[i + 1] === '"') {
        c += '"';
        i++;
      } else if (ch === '"') {
        q = !q;
      } else if (ch === "," && !q) {
        o.push(c);
        c = "";
      } else {
        c += ch;
      }
    }

    o.push(c);
    return o.map((v) => v.trim());
  };

  // export index
  function exportLikes() {
    const b = new Blob([JSON.stringify([...getLatestLikedIndex()], null, 2)], { type: "application/json" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(b);
    a.download = "liked_videos.json";
    a.click();
  }

  // clear index
  function clearLikedIndexDoubleConfirm() {
    const total = likedIndex.size;

    if (!confirm(`⚠️ This will permanently DELETE ${total.toLocaleString()} liked videos.\n\nContinue?`))
      return;

    const typed = prompt("Type CLEAR (all caps) to confirm:");
    if (typed !== "CLEAR") return alert("Aborted.");

    likedIndex.clear();
    persistIndex(likedIndex);

    alert("✅ Liked index cleared.");
    processAllVideos();
  }

  /******************************************************************
// #region HEART MENU (Updated with Options submenu)
******************************************************************/
  function createMenu() {
    if (document.getElementById("yt-liked-menu")) return;

    const wrap = document.createElement("div");
    wrap.id = "yt-liked-menu";
    wrap.style.cssText = `
        position: fixed;
        bottom: 20px;
        right: 20px;
        z-index: 99999;
        display: flex;
        flex-direction: column;
        align-items: flex-end;
        gap: 6px;
    `;
    // prettier-ignore
    const mainItems = [
        { icon: "❤️‍", label: "Show hearts", key: "showHearts", toggle: true, act: () => { showHearts = !showHearts; persistToggle("showHearts", showHearts); } },
        { icon: "🩵", label: "Dim liked videos", key: "dimLiked", toggle: true, act: () => { dimLiked = !dimLiked; persistToggle("dimLiked", dimLiked); } },
        { icon: "🩶", label: "Hide liked videos", key: "hideLiked", toggle: true, act: () => { hideLiked = !hideLiked; persistToggle("hideLiked", hideLiked); } },
        { icon: "💖", label: "Liked playlist scan", act: playlistScan },
    ];
    // prettier-ignore
    const optionsItems = [
        { icon: "❤️‍🔥", label: "Turbo", key: "turboMode", toggle: true, act: () => { turboMode = !turboMode; persistToggle("turboMode", turboMode); turboToggle(); } },
        { icon: "💗", label: "Import", act: openImport },
        { icon: "💞", label: "Export", act: exportLikes },
        { icon: "💔", label: "Clear liked index", act: clearLikedIndexDoubleConfirm },
    ];

    const btns = [];

    // Create main buttons
    mainItems.forEach((i) => {
      const b = makeButton(
        `${i.label} ${i.icon}`,
        () => {
          i.act();
          updateButtons();
          processAllVideos();
        },
        "#333"
      );
      b.style.display = "none";
      wrap.appendChild(b);
      btns.push({ b, i });
    });

    // Create Options button (inside main menu)
    const optionsBtn = makeButton("Options ❤️‍🩹", toggleOptions, "#333");
    optionsBtn.style.display = "none"; // hidden until main opens
    optionsBtn.style.position = "relative"; // anchor for submenu
    wrap.appendChild(optionsBtn);

    // Options submenu container
    const optionsContainer = document.createElement("div");
    optionsContainer.style.cssText = `
        display: flex;
        flex-direction: row;
        gap: 6px;
        position: absolute;
        bottom: 0;
        right: 100%;
        margin-right: 6px;
    `;
    optionsContainer.style.display = "none"; // hidden by default
    optionsBtn.appendChild(optionsContainer);

    const optionsBtns = optionsItems.map((i) => {
      const b = makeButton(
        `${i.label} ${i.icon}`,
        () => {
          i.act();
          updateButtons();
          processAllVideos();
        },
        "#333"
      );
      b.style.display = "none";
      b.style.whiteSpace = "nowrap";
      optionsContainer.appendChild(b);
      return { b, i };
    });

    // Main toggle button
    const main = makeButton("♥️", toggleMain, "#00bfa5");
    main.title = "Liked Video Controls";
    wrap.appendChild(main);
    main.style.padding = "6px";
    main.style.fontSize = "18px";
    main.style.borderRadius = "50%";

    document.body.appendChild(wrap);

    // Prevent submenu clicks from closing the menu
    optionsBtn.addEventListener("click", (e) => {
      e.stopPropagation();
    });

    optionsContainer.addEventListener("click", (e) => {
      e.stopPropagation();
    });

    function toggleMain() {
      const open = btns[0].b.style.display === "block";
      btns.forEach((x) => (x.b.style.display = open ? "none" : "block"));
      optionsBtn.style.display = open ? "none" : "block";
      if (open) {
        optionsBtns.forEach((x) => (x.b.style.display = "none"));
        optionsContainer.style.display = "none";
      }
    }

    function toggleOptions() {
      const open = optionsBtns[0].b.style.display === "block";
      optionsBtns.forEach((x) => (x.b.style.display = open ? "none" : "block"));
      optionsContainer.style.display = open ? "none" : "flex";
    }

    function updateButtons() {
      [...btns, ...optionsBtns].forEach(({ b, i }) => {
        if (!i.toggle || !i.key) return;
        let on = false;
        switch (i.key) {
          case "hideLiked":
            on = hideLiked;
            break;
          case "dimLiked":
            on = dimLiked;
            break;
          case "showHearts":
            on = showHearts;
            break;
          case "turboMode":
            on = turboMode;
            break;
        }

        // normal buttons
        b.style.background = on ? "#d32f2f" : "#333";
        b.style.fontWeight = on ? "bold" : "normal";

        // specifically change the Turbo Mode button color
        if (i.key === "turboMode") {
          b.style.background = on ? "#395ebdff" : "#555"; // choose your colors
        }
      });

      // optionally, also change the Options button if Turbo is on
      optionsBtn.style.background = turboMode ? "#395ebdff" : "#333";
    }
    function openImport() {
      const f = document.createElement("input");
      f.type = "file";
      f.accept = ".json,.csv";
      f.onchange = () =>
        f.files[0].name.endsWith(".json") ? importTakeoutJson(f.files[0]) : importCsvLikes(f.files[0]);
      f.click();
    }

    document.addEventListener(
      "click",
      (e) => {
        if (
          !wrap.contains(e.target) ||
          e.target.closest("yt-chip-cloud-chip-renderer, tp-yt-paper-tab, ytd-searchbox")
        ) {
          btns.forEach((x) => (x.b.style.display = "none"));
          optionsBtn.style.display = "none";
          optionsBtns.forEach((x) => (x.b.style.display = "none"));
          optionsContainer.style.display = "none";
        }
      },
      true
    );

    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape") {
        btns.forEach((x) => (x.b.style.display = "none"));
        optionsBtn.style.display = "none";
        optionsBtns.forEach((x) => (x.b.style.display = "none"));
        optionsContainer.style.display = "none";
      }
    });

    updateButtons();
  }

  function makeButton(text, fn, bg) {
    const b = document.createElement("button");
    b.type = "button";
    b.textContent = text;
    b.onclick = fn;
    b.style.cssText = `
        background:${bg};
        color:#fff;
        border:none;
        border-radius:14px;
        padding:7px 10px;
        font-size:12px;
        cursor:pointer;
        box-shadow:0 3px 10px rgba(0,0,0,.35);
    `;
    return b;
  }

  // HIDE MENU ON FULLSCREEN
  function setupFullscreenToggle() {
    const menu = document.getElementById("yt-liked-menu");
    if (!menu) return;

    let lastState = false;

    function check() {
      const isFull = !!document.fullscreenElement || document.querySelector(".ytp-fullscreen") !== null;

      if (isFull === lastState) return;
      lastState = isFull;

      // hide or show entire menu
      menu.style.display = isFull ? "none" : "flex";

      // close submenu buttons when entering fullscreen
      if (isFull) {
        menu.querySelectorAll("button").forEach((b, i) => {
          if (i !== menu.children.length - 1) b.style.display = "none";
        });
      }
    }

    // Fullscreen API (reliable)
    document.addEventListener("fullscreenchange", check);

    // youtube class changes
    const obs = new MutationObserver(check);
    obs.observe(document.body, {
      attributes: true,
      subtree: true,
      attributeFilter: ["class"],
    });

    // initial state
    check();
  }

  createMenu();
  setupFullscreenToggle();
  processAllVideos();
})();
