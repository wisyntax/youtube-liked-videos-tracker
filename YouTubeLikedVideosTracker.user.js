// ==UserScript==
// @name         YouTube Liked Videos Tracker
// @namespace    Violentmonkey Scripts
// @version      2.0
// @description  Adds hearts to liked videos, with options to dim or hide them.
// @author       arkWish
// @match        *://www.youtube.com/*
// @icon         data:image/svg+xml;charset=UTF-8,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20viewBox%3D%220%200%20100%20100%22%3E%3Ctext%20x%3D%2250%25%22%20y%3D%2250%25%22%20style%3D%22dominant-baseline%3Amiddle%3Btext-anchor%3Amiddle%3Bfont-size%3A80px%3B%22%3E%E2%9D%A4%EF%B8%8F%3C%2Ftext%3E%3C%2Fsvg%3E
// @grant        GM_getValue
// @grant        GM_setValue
// @grant        GM_addValueChangeListener
// ==/UserScript==

if (window.top !== window.self) {
  return; // stop script execution in subframes
}

(() => {
  "use strict";

  //*****************************************************************
  // #region STORAGE & SYNC
  //*****************************************************************
  let likedIndex = new Set(GM_getValue("likedIndex", []));
  let showHearts = GM_getValue("showHearts", true);
  let dimLiked = GM_getValue("dimLiked", false);
  let hideLiked = GM_getValue("hideLiked", false);
  let turboMode = GM_getValue("turboMode", true);
  let dimOpacity = GM_getValue("dimOpacity", 0.4);
  const DEBOUNCE_TIMER = 250;

  const persistIndex = (index) => GM_setValue("likedIndex", [...index]);
  const persistToggle = (k, v) => GM_setValue(k, v);

  // sync across tabs using value change listener
  if (typeof GM_addValueChangeListener === "function") {
    GM_addValueChangeListener("likedIndex", (name, oldValue, newValue, remote) => {
      if (remote) {
        likedIndex.clear();
        (newValue || []).forEach((v) => likedIndex.add(v));
        // console.log("[Sync] likedIndex updated from another tab"); //log
        processAllVideos();
      }
    });
  }

  // get fresh index immediately
  function loadIndexFromStorage() {
    return new Set(GM_getValue("likedIndex", []));
  }

  function turboToggleAlert() {
    const mode = turboMode ? "ENABLED" : "DISABLED";
    if (confirm(`Turbo mode ${mode}\n\nReload now to apply now?`)) {
      location.reload();
    }
  }

  //*****************************************************************
  // #region VIDEO ID EXTRACTION
  //*****************************************************************
  // containers for dim and hide logic
  const VIDEO_CONTAINER = [
    "ytd-rich-item-renderer",
    "yt-lockup-view-model",
    "ytd-video-renderer",
    "ytd-grid-video-renderer",
    "ytd-playlist-video-renderer",
    "ytd-playlist-panel-video-renderer",
    "ytm-shorts-lockup-view-model-v2",
    "a.ytp-modern-videowall-still",
    ".ytp-autonav-endscreen-upnext-container",
  ];

  const VIDEO_SELECTOR = VIDEO_CONTAINER.join(",");

  function extractVideoId(url) {
    if (typeof url !== "string") return null;
    return (
      url.match(/[?&]v=([^&]+)/)?.[1] ||
      url.match(/youtu\.be\/([^?/]+)/)?.[1] ||
      url.match(/\/shorts\/([^?/]+)/)?.[1] ||
      null
    );
  }

  // Get element video ID
  function getVideoIdFromElement(el) {
    // Handle video wall elements (they are the <a> tag themselves)
    if (el.classList?.contains("ytp-modern-videowall-still")) {
      return extractVideoId(el.href);
    }

    // Handle autoplay container
    if (el.classList?.contains("ytp-autonav-endscreen-upnext-container")) {
      const link = el.querySelector("a.ytp-autonav-endscreen-link-container");
      return link ? extractVideoId(link.href) : null;
    }

    // Handle regular containers
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

  //*****************************************************************
  // #region LIKES HANDLER
  //*****************************************************************
  function updateLiked(ID, isLiked, type) {
    if (!ID) return;
    const had = likedIndex.has(ID);
    if (isLiked && !had) likedIndex.add(ID);
    else if (!isLiked && had) likedIndex.delete(ID);
    else return;

    // console.log(type, isLiked ? "Liked:" : "Unliked:", ID); //log
    persistIndex(likedIndex);
  }

  // generic listener factory
  // handles watch page, fullscreen player, and shorts using the same logic
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
          processAllVideos();
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

  //*****************************************************************
  // #region HEART BADGE
  //*****************************************************************
  const HEART_HIDDEN_CLASS = "yt-liked-heart-hidden";
  const heartMap = new WeakMap(); // maps video element -> heart div

  // CSS rules rely on presence of .yt-liked-indicator via :has()
  // to dim or hide liked videos at the container level
  const heartToggleStyle = document.createElement("style");
  heartToggleStyle.id = "yt-liked";
  heartToggleStyle.title = "liked videos style";
  heartToggleStyle.textContent = `
:root {
  --yt-liked-dim-opacity: ${dimOpacity};
}

.yt-liked-heart-hidden { display: none !important; }

/* DIM liked videos - only apply to top-level parents */ 
body.yt-liked-dim :is(
  ytd-rich-item-renderer,  /* main, channel videos */
  ytd-video-renderer, /* search */
  ytd-grid-video-renderer,  /* channel */
  ytd-playlist-video-renderer,  /* playlists */
  ytd-playlist-panel-video-renderer,  /* playlist panel */
  .ytGridShelfViewModelGridShelfItem,  /* shorts grid */
  .ytp-modern-videowall-still,  /* video end screen */
  .ytp-autonav-endscreen-upnext-container  /* video autoplay - no need to add to hide */
):has(.yt-liked-indicator),
/* Selectors that need :not() */
body.yt-liked-dim yt-lockup-view-model:has(.yt-liked-indicator):not(ytd-rich-item-renderer *),  /* watch, history */
body.yt-liked-dim ytm-shorts-lockup-view-model-v2:has(.yt-liked-indicator):not(ytd-rich-item-renderer *):not(.ytGridShelfViewModelGridShelfItem *) {  /* shorts shelf */
  opacity: var(--yt-liked-dim-opacity);
}

/* HIDE liked videos - only apply to top-level parents */
body.yt-liked-hide :is(
  ytd-rich-item-renderer,  /* main, channel videos */
  ytd-video-renderer,  /* search */
  ytd-grid-video-renderer,  /* channel */
  ytd-playlist-panel-video-renderer,  /* playlist panel */
  .ytGridShelfViewModelGridShelfItem,  /* shorts grid */
  .ytp-modern-videowall-still  /* video end screen */
):has(.yt-liked-indicator),
body.yt-liked-hide yt-lockup-view-model:has(.yt-liked-indicator):not(ytd-rich-item-renderer *),  /* watch, history */
body.yt-liked-hide:not(.yt-liked-hide-disabled) ytd-playlist-video-renderer:has(.yt-liked-indicator),  /* playlists excluding liked videos*/
body.yt-liked-hide ytm-shorts-lockup-view-model-v2:has(.yt-liked-indicator):not(ytd-rich-item-renderer *):not(.ytGridShelfViewModelGridShelfItem *),  /* shorts shelf */
body.yt-liked-hide a.ytp-modern-videowall-still:has(.yt-liked-indicator) {
  display: none !important;
}

/* UNDIM dimmed on hover */
body.yt-liked-dim :is(
  ytd-rich-item-renderer,
  yt-lockup-view-model,
  ytd-video-renderer,
  ytd-grid-video-renderer,
  ytd-playlist-video-renderer,
  ytd-playlist-panel-video-renderer,
  .ytGridShelfViewModelGridShelfItem,
  ytm-shorts-lockup-view-model-v2,
  .ytp-modern-videowall-still,
  .ytp-autonav-endscreen-upnext-container
):hover {
  opacity: 1 !important;
  transition: opacity 200ms ease-in;
  transition-delay: 300ms;
}

/* HIDE menu on fullscreen */
html:fullscreen #yt-liked-menu,
html.ytp-fullscreen #yt-liked-menu,
ytd-app[fullscreen] #yt-liked-menu {
  display: none !important;
}
`;
  document.head.appendChild(heartToggleStyle);

  function updateDimOpacityCss() {
    document.documentElement.style.setProperty("--yt-liked-dim-opacity", dimOpacity);
  }

  // find host video thumbnail for heart
  function findThumbnailElement(el) {
    return (
      el.querySelector("a#thumbnail") ||
      el.querySelector("ytd-thumbnail") ||
      el.querySelector("yt-thumbnail-view-model") ||
      el.querySelector(".ytp-modern-videowall-still-image") || // endscreen
      el.querySelector(".ytp-autonav-endscreen-upnext-thumbnail") // autoplay
    );
  }
  // add a non-interactive heart overlay into the video thumbnail
  function addHeart(el) {
    const id = getVideoIdFromElement(el);
    if (!id || !likedIndex.has(id)) return; // skip unliked videos
    if (el.querySelector(".yt-liked-indicator")) return; // skip if a heart overlay already exists (prevents duplicates)

    const host = findThumbnailElement(el);
    if (!host) return;

    if (getComputedStyle(host).position === "static") {
      host.style.position = "relative";
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

  // Ensure heart state matches current index and visibility settings
  // Creates, removes, or hides the overlay as needed
  function updateHeartDisplay(el) {
    const id = getVideoIdFromElement(el);
    if (!id) return;

    let heart = heartMap.get(el);
    // ensure heart exists
    if (!heart) {
      addHeart(el);
      heart = heartMap.get(el);
      if (!heart) return;
    }
    // if video is NOT liked, remove heart
    if (!likedIndex.has(id)) {
      if (heart) {
        heart.remove();
        heartMap.delete(el);
      }
      return;
    }

    // toggle visibility only
    heart.classList.toggle(HEART_HIDDEN_CLASS, !showHearts);
  }

  function updateBodyToggles() {
    document.body.classList.toggle("yt-liked-dim", dimLiked);
    document.body.classList.toggle("yt-liked-hide", hideLiked);
  }

  // disable hide behavior on the Liked Videos playlist
  // just a bad idea in general to use hide on the liked playlist
  function updateHideClass() {
    const isLikedPlaylist = location.pathname.includes("/playlist") && location.search.includes("list=LL");
    document.body.classList.toggle("yt-liked-hide-disabled", isLikedPlaylist);
  }
  document.addEventListener("yt-navigate-finish", () => {
    updateHideClass();
    // force process all when a playlist page loads
    // youtube reuses playlist containers so hearts are not changed when thumbnail and children change
    if (location.pathname.includes("/playlist")) {
      if (turboMode) {
        requestAnimationFrame(processAllVideos);
      } else {
        setTimeout(() => {
          processAllVideos();
        }, DEBOUNCE_TIMER);
      }
    }
  });

  // autoplay container only gets attribute changes so new node mutation observer doesn't catch it
  // process all at the end of a video to catch the changes
  document.addEventListener("yt-autonav-pause-player-ended", () => {
    requestAnimationFrame(processAllVideos);
  });

  //*****************************************************************
  // #region PROCESS VIDEOS
  //*****************************************************************
  function processAllVideos() {
    document.querySelectorAll(VIDEO_SELECTOR).forEach((el) => {
      updateHeartDisplay(el);
    });
  }
  // debounce calls so the handler runs only after DOM mutations settle
  const debounce = (func, wait) => {
    let timeout;
    return (...args) => {
      clearTimeout(timeout);
      timeout = setTimeout(() => func(...args), wait);
    };
  };

  const videosToProcess = new Set();

  const flushPendingVideosRaw = () => {
    // const count = pendingVideos.size; //log
    // if (count === 0) return; //log
    // const startTime = performance.now(); //log

    videosToProcess.forEach((el) => updateHeartDisplay(el));

    videosToProcess.clear();

    // const duration = (performance.now() - startTime).toFixed(3); //log
    // console.log(`[Performance] Processed ${count} videos in ${duration}ms`); //log
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
    : debounce(flushPendingVideosRaw, DEBOUNCE_TIMER);
  // ignore mutations caused by UI (heart overlays / menu)
  const IGNORED_CLASSES = new Set(["yt-liked-indicator", "yt-liked-menu"]);

  // mutationObserver for newly added nodes
  const observer = new MutationObserver((muts) => {
    muts.forEach((m) => {
      m.addedNodes.forEach((n) => {
        if (!(n instanceof HTMLElement)) return;
        // Skip if it's an ignored element
        if (n.classList && Array.from(n.classList).some((c) => IGNORED_CLASSES.has(c))) return;

        if (n.matches?.(VIDEO_SELECTOR)) {
          videosToProcess.add(n);
        } else {
          n.querySelectorAll?.(VIDEO_SELECTOR).forEach((el) => videosToProcess.add(el));
        }
      });
    });

    flushPendingVideos();
  });

  observer.observe(document.body, { childList: true, subtree: true });

  //*****************************************************************
  // #region PLAYLIST SCAN
  //*****************************************************************
  async function playlistScan() {
    if (!location.pathname.includes("/playlist") || !location.search.includes("list=LL")) {
      return alert(
        "Playlist scan only works on your Liked videos playlist:\nwww.youtube.com/playlist?list=LL"
      );
    }

    const max = prompt("Auto-scroll will load the playlist.\n\nMax videos to scan (leave empty for all):");
    if (max === null) return;

    const textOnlyStyle = document.createElement("style");
    // style breaks if title is added so id only
    textOnlyStyle.id = "yt-liked-text-mode-scan";
    textOnlyStyle.textContent = `
    /* Hide thumbnails */
    ytd-playlist-video-renderer ytd-thumbnail,
    ytd-playlist-video-renderer img {
      display: none !important;
    }

    /* Reduce padding/margins */
    ytd-playlist-video-renderer #content {
      padding: 4px 0 !important;
    }

    /* Keep title readable */
    ytd-playlist-video-renderer #video-title {
      font-size: 13px !important;
      line-height: 1 !important;
    }
    `;
    document.head.appendChild(textOnlyStyle);

    const startUrl = location.href;

    const delay = (ms) => new Promise((r) => setTimeout(r, ms));

    let lastCount = 0;
    let stableRounds = 0;

    // auto-scroll until:
    // - video count stops increasing for several rounds
    // - OR user-defined max is reached
    while (true) {
      if (location.href !== startUrl) {
        alert("Scan aborted - page navigated");
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
    const index = loadIndexFromStorage();

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

  //*****************************************************************
  // #region IMPORT / EXPORT / CLEAR
  //*****************************************************************
  // takeout and script import
  async function importTakeoutJson(file) {
    if (!file) return;
    let data;
    try {
      data = JSON.parse(await file.text());
    } catch {
      return alert("Invalid JSON");
    }

    const index = loadIndexFromStorage();
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

    const index = loadIndexFromStorage();
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
  // should probably never touch this
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
    const dateStr = new Date().toISOString().split("T")[0];
    const b = new Blob([JSON.stringify([...loadIndexFromStorage()], null, 2)], { type: "application/json" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(b);
    a.download = `liked_videos_${dateStr}.json`;
    a.click();
  }

  // clear index
  function clearLikedIndexDoubleConfirm() {
    const total = likedIndex.size;

    if (!confirm(`⚠️ Permanently delete ${total.toLocaleString()} videos from index?`)) return;

    const typed = prompt("Type CLEAR (all caps) to confirm:");
    if (typed !== "CLEAR") return alert("Aborted.");

    likedIndex.clear();
    persistIndex(likedIndex);

    alert("✅ Liked index cleared.");
    processAllVideos();
  }

  //*****************************************************************
  // #region HEART MENU
  //*****************************************************************
  function createMenu() {
    if (document.getElementById("yt-liked-menu")) return;

    const menuContainer = document.createElement("div");
    menuContainer.id = "yt-liked-menu";
    menuContainer.style.cssText = `
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
    const menuItems = [
      { icon: "❤️‍", label: "Show hearts", key: "showHearts", toggle: true, act: () => { showHearts = !showHearts; persistToggle("showHearts", showHearts); } },
      { icon: "🩵", label: "Dim liked videos", key: "dimLiked", toggle: true, act: () => { dimLiked = !dimLiked; persistToggle("dimLiked", dimLiked); } },
      { icon: "🩶", label: "Hide liked videos", key: "hideLiked", toggle: true, act: () => { hideLiked = !hideLiked; persistToggle("hideLiked", hideLiked); } },
      { icon: "💖", label: "Liked playlist scan", act: playlistScan },
    ];
    // prettier-ignore
    const optionsItems = [
      { icon: "💙", label: "Dim opacity", key: "dimOpacity", slider: true, min: 0.1, max: 0.9, step: 0.05, act: (val) => { dimOpacity = val; persistToggle("dimOpacity", dimOpacity); updateDimOpacityCss(); } },
      { icon: "❤️‍🔥", label: "Turbo", key: "turboMode", toggle: true, act: () => { turboMode = !turboMode; persistToggle("turboMode", turboMode); turboToggleAlert(); } },
      { icon: "💗", label: "Import", act: openImport },
      { icon: "💞", label: "Export", act: exportLikes },
      { icon: "💔", label: "Clear liked index", act: clearLikedIndexDoubleConfirm },
    ];

    const menuButtons = [];

    // create menu buttons
    menuItems.forEach((i) => {
      const b = makeButton(
        `${i.label} ${i.icon}`,
        () => {
          i.act();
          updateButtons();
          updateBodyToggles();
          processAllVideos();
        },
        "#333"
      );
      b.style.display = "none";
      menuContainer.appendChild(b);
      menuButtons.push({ b, i });
    });

    // create options button (inside main menu)
    const options = makeButton("Options ❤️‍🩹", toggleOptions, "#333");
    options.style.display = "none"; // hidden until menu opens
    options.style.position = "relative"; // anchor for submenu
    menuContainer.appendChild(options);

    // options submenu container
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
    options.appendChild(optionsContainer);

    const optionsButtons = optionsItems.map((i) => {
      if (i.slider) {
        // Create slider input for opacity
        const sliderContainer = document.createElement("div");
        sliderContainer.style.cssText = `
          display: flex;
          align-items: center;
          position: absolute;
          gap: 6px;
          background: #333;
          color: #fff;
          border-radius: 14px;
          padding: 6px 10px;
          font-size: 12px;
          bottom: 0px;
          right: 43px;
        `;
        const label = document.createElement("span");
        label.textContent = `${i.label} ${i.icon}`;
        label.style.userSelect = "none";

        const slider = document.createElement("input");
        slider.type = "range";
        slider.min = i.min;
        slider.max = i.max;
        slider.step = i.step;
        slider.value = dimOpacity;
        slider.style.cssText = `width: 80px; cursor: pointer;`;

        const valueDisplay = document.createElement("span");
        valueDisplay.textContent = `${Math.round(dimOpacity * 100)}%`;
        valueDisplay.style.cssText = `width: 30px; text-align: right; user-select: none;`;

        slider.addEventListener("input", (e) => {
          dimOpacity = parseFloat(e.target.value);
          valueDisplay.textContent = `${Math.round(dimOpacity * 100)}%`;
          i.act(dimOpacity);
        });

        sliderContainer.appendChild(label);
        sliderContainer.appendChild(slider);
        sliderContainer.appendChild(valueDisplay);
        sliderContainer.style.display = "none";
        sliderContainer.style.whiteSpace = "nowrap";
        menuContainer.appendChild(sliderContainer);
        return { b: sliderContainer, i };
      } else {
        const b = makeButton(
          `${i.label} ${i.icon}`,
          () => {
            i.act();
            updateButtons();
            updateBodyToggles();
            processAllVideos();
          },
          "#333"
        );
        b.style.display = "none";
        b.style.whiteSpace = "nowrap";
        optionsContainer.appendChild(b);
        return { b, i };
      }
    });

    // Main toggle button
    const menuToggleButton = makeButton("♥️", toggleMenu, "#00bfa5");
    menuToggleButton.title = "Liked Video Controls";
    menuContainer.appendChild(menuToggleButton);
    menuToggleButton.style.padding = "6px";
    menuToggleButton.style.fontSize = "18px";
    menuToggleButton.style.borderRadius = "50%";

    document.body.appendChild(menuContainer);

    // Prevent submenu clicks from closing the menu
    options.addEventListener("click", (e) => {
      e.stopPropagation();
    });

    optionsContainer.addEventListener("click", (e) => {
      e.stopPropagation();
    });

    function toggleMenu() {
      const open = menuButtons[0].b.style.display === "block";
      menuButtons.forEach((x) => (x.b.style.display = open ? "none" : "block"));
      options.style.display = open ? "none" : "block";
      if (open) {
        optionsButtons.forEach((x) => (x.b.style.display = "none"));
        optionsContainer.style.display = "none";
      }
    }

    function toggleOptions() {
      const open = optionsButtons[0].b.style.display !== "none";
      optionsButtons.forEach((x) => {
        // Use "flex" for sliders, "block" for buttons
        const display = x.i.slider ? "flex" : "block";
        x.b.style.display = open ? "none" : display;
      });
      optionsContainer.style.display = open ? "none" : "flex";
    }

    function updateButtons() {
      [...menuButtons, ...optionsButtons].forEach(({ b, i }) => {
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
          b.style.background = on ? "#395ebdff" : "#333";
        }
      });

      // change the options button if turbo is on
      options.style.background = turboMode ? "#395ebdff" : "#333";
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
          !menuContainer.contains(e.target) ||
          e.target.closest("yt-chip-cloud-chip-renderer, tp-yt-paper-tab, ytd-searchbox")
        ) {
          menuButtons.forEach((x) => (x.b.style.display = "none"));
          options.style.display = "none";
          optionsButtons.forEach((x) => (x.b.style.display = "none"));
          optionsContainer.style.display = "none";
        }
      },
      true
    );

    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape") {
        menuButtons.forEach((x) => (x.b.style.display = "none"));
        options.style.display = "none";
        optionsButtons.forEach((x) => (x.b.style.display = "none"));
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

  createMenu();
  updateBodyToggles();
  processAllVideos();
})();
