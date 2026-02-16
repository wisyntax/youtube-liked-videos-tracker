// ==UserScript==
// @name         YouTube Liked Videos Tracker
// @namespace    https://github.com/wisyntax/youtube-liked-videos-tracker
// @version      2.7
// @license      MIT
// @description  Adds visual indicators to liked YouTube videos.
// @author       wisyntax
// @match        *://www.youtube.com/*
// @noframes
// @grant        GM_getValue
// @grant        GM_setValue
// @grant        GM_addValueChangeListener
// @icon         data:image/svg+xml,%3Csvg viewBox='0 0 32 32' xmlns='http://www.w3.org/2000/svg'%3E%3Ccircle cx='16' cy='16' r='16' fill='%2300bfa5'/%3E%3Cg transform='translate(16, 16) scale(0.65) translate(-16, -16)'%3E%3Cpath d='M15.217 29.2015C15.752 29.5 16.3957 29.4835 16.9275 29.1795C20.5106 27.1318 26.7369 22.4179 29.1822 16.2948C32.7713 8.3224 24.3441 1.95834 18.5197 6.5356C17.9122 7.01307 17.1483 7.55954 16.6226 8.07719C16.3849 8.31124 15.966 8.33511 15.7193 8.11061C15.0281 7.48177 13.9479 6.67511 13.2542 6.20577C8.28887 2.84639 -0.74574 7.27463 3.1081 16.7255C4.51986 20.9677 11.2474 26.9862 15.217 29.2015Z' fill='%23fff'/%3E%3C/g%3E%3C/svg%3E
// ==/UserScript==

(() => {
  "use strict";

  //*****************************************************************
  // #region STORAGE & SYNC
  //*****************************************************************
  let likedIndex = new Set(GM_getValue("likedIndex", []));
  let showHearts = GM_getValue("showHearts", true);
  let dimLiked = GM_getValue("dimLiked", false);
  let hideLiked = GM_getValue("hideLiked", false);
  let badgeHeartColor = GM_getValue("badgeHeartColor", "#FFFFFF");
  let badgeBackgroundColor = GM_getValue("badgeBackgroundColor", "#ff0033");
  let highlightTitle = GM_getValue("highlightTitle", true);
  let titleColor = GM_getValue("titleColor", "#ff0033");
  let dimOpacity = GM_getValue("dimOpacity", 0.65);
  let turboMode = GM_getValue("turboMode", true);

  const DEBOUNCE_TIME = 250;

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

  function turboToggleAlert() {
    const mode = turboMode ? "DISABLE" : "ENABLE";
    if (confirm(`Reload required!\n\n${mode} quick mode?`)) {
      turboMode = !turboMode;
      persistToggle("turboMode", turboMode);
      location.reload();
    }
  }

  //*****************************************************************
  // #region CSS LOGIC
  //*****************************************************************
  // CSS rules rely on presence of .ytlvt-liked-indicator via :has()
  // to dim or hide liked videos at the container level
  const heartToggleStyle = document.createElement("style");
  heartToggleStyle.id = "ytlvt-style";
  heartToggleStyle.title = "YouTube Liked Videos Tracker Style";
  heartToggleStyle.textContent = `
:root {
  --ytlvt-liked-title-color: ${titleColor};
  --ytlvt-liked-dim-opacity: ${dimOpacity};
  --ytlvt-liked-heart-color: ${badgeHeartColor};
  --ytlvt-liked-heart-background-color: ${badgeBackgroundColor};
}

.ytlvt-liked-indicator {
fill: var(--ytlvt-liked-heart-color);
background: var(--ytlvt-liked-heart-background-color);
}

.ytlvt-liked-heart-hidden {display: none !important;}

/* COLOR liked video titles when hearts are shown */
body.ytlvt-liked-highlight-title :is(
  ytd-rich-item-renderer,  /* homepage, channel videos */
  yt-lockup-view-model,  /* watch, history */
  ytd-video-renderer,  /* search */
  ytd-grid-video-renderer,  /* channel */
  ytd-playlist-video-renderer,  /* playlists */
  ytd-playlist-panel-video-renderer,  /* playlist panel */
  .ytGridShelfViewModelGridShelfItem,  /* shorts grid */
  ytm-shorts-lockup-view-model-v2,  /* shorts shelf */
  .ytp-ce-element,  /* video end screen */
  .ytp-videowall-still,  /* old video end wall */
  .ytp-modern-videowall-still,  /* video end wall */
  .ytp-autonav-endscreen-upnext-container  /* video autoplay - no need to add to hide */
):has(.ytlvt-liked-indicator:not(.ytlvt-liked-heart-hidden)) :is(
  .yt-lockup-metadata-view-model__title,
  .ytp-ce-video-title,
  .ytp-videowall-still-info-title,
  .ytp-modern-videowall-still-info-title,
  .ytp-autonav-endscreen-upnext-title,
  #video-title,
  a[title]
) {
  color: var(--ytlvt-liked-title-color) !important;
}

/* DIM liked videos - only apply to top-level parents */
body.ytlvt-liked-dim :is(
  ytd-rich-item-renderer,
  ytd-video-renderer,
  ytd-grid-video-renderer,
  ytd-playlist-video-renderer,
  ytd-playlist-panel-video-renderer,
  .ytGridShelfViewModelGridShelfItem,
  .ytp-ce-element,
  .ytp-videowall-still,
  .ytp-modern-videowall-still,
  .ytp-autonav-endscreen-upnext-container
):has(.ytlvt-liked-indicator),
/* Selectors that need :not() to prevent double dim */
body.ytlvt-liked-dim yt-lockup-view-model:has(.ytlvt-liked-indicator):not(ytd-rich-item-renderer *),
body.ytlvt-liked-dim ytm-shorts-lockup-view-model-v2:has(.ytlvt-liked-indicator):not(ytd-rich-item-renderer *):not(.ytGridShelfViewModelGridShelfItem *)
{
  opacity: var(--ytlvt-liked-dim-opacity);
}

/* UNDIM dimmed on hover */
body.ytlvt-liked-dim :is(
  ytd-rich-item-renderer,
  yt-lockup-view-model,
  ytd-video-renderer,
  ytd-grid-video-renderer,
  ytd-playlist-video-renderer,
  ytd-playlist-panel-video-renderer,
  .ytGridShelfViewModelGridShelfItem,
  ytm-shorts-lockup-view-model-v2,
  .ytp-ce-element,
  .ytp-videowall-still,
  .ytp-modern-videowall-still,
  .ytp-autonav-endscreen-upnext-container
):hover {
  opacity: 1 !important;
  transition: opacity 200ms ease-in;
  transition-delay: 300ms;
}

/* HIDE liked videos unless disabled */
body.ytlvt-liked-hide:not(.ytlvt-liked-hide-disabled) :is(
  ytd-rich-item-renderer,
  yt-lockup-view-model,
  ytd-video-renderer,
  ytd-grid-video-renderer,
  ytd-playlist-video-renderer,
  ytd-playlist-panel-video-renderer,
  .ytGridShelfViewModelGridShelfItem,
  ytm-shorts-lockup-view-model-v2,
  .ytp-ce-element,
  .ytp-videowall-still,
  .ytp-modern-videowall-still
):has(.ytlvt-liked-indicator) {
  display: none !important;
}

/* HIDE heart menu on fullscreen */
html:fullscreen #ytlvt-heart-menu,
html.ytp-fullscreen #ytlvt-heart-menu,
ytd-app[fullscreen] #ytlvt-heart-menu {
  display: none !important;
}


/*--- menu-button changes ---*/

/* menu button style when toggled */
.ytlvt-menu-button-on {
  background: #d32f2f !important;
  font-weight: bold;
}

/* option button style when toggled */
.ytlvt-option-button-on {
  background: #395ebdff !important;
}

/* hide coloPicker when options not visible */
#ytlvt-heart-menu:not(:has(#ytlvt-options-button.visible)) input[type="color"],
/* hide showHearts colorpicker when not on */
#ytlvt-showHearts-button:not(.showHearts-on) input[type="color"],
/* hide highlightTitle colorpicker when not on  */
#ytlvt-highlightTitle-button:not(.highlightTitle-on) input[type="color"]{
  display: none !important;
}

/* opacity slider change when dim enabled */
#ytlvt-heart-menu:has(.dimLiked-on) #ytlvt-dimOpacity-button {
  background: #395ebdff !important;
  accent-color: #d32f2f;
}

/* option toggle button style change when turbo enabled */
#ytlvt-heart-menu:has(.turboMode-on) #ytlvt-options-button {
  background: #395ebdff !important;
}

/* greyout every other menu button when hide button enabled*/
body:not(.ytlvt-liked-hide-disabled) #ytlvt-heart-menu:has(.hideLiked-on) .ytlvt-menu-button-container:not(:has(.hideLiked-on)),
/* greyout highlightTitle when showHearts not on  */
#ytlvt-heart-menu:not(:has(.showHearts-on)):not(:has(.hideLiked-on)) #ytlvt-highlightTitle-button,
.ytlvt-liked-hide-disabled #ytlvt-heart-menu:not(:has(.showHearts-on)):has(.hideLiked-on) #ytlvt-highlightTitle-button,
/* greyout opacity when dimLiked not on  */
#ytlvt-heart-menu:not(:has(.dimLiked-on)):not(:has(.hideLiked-on)) #ytlvt-dimOpacity-button,
.ytlvt-liked-hide-disabled #ytlvt-heart-menu:not(:has(.dimLiked-on)):has(.hideLiked-on) #ytlvt-dimOpacity-button,
/* greyout hide button when disabled */
body.ytlvt-liked-hide-disabled #ytlvt-hideLiked-button {
  filter: sepia();
}

/* light up buttons on hover */
#ytlvt-heart-menu button::after {
  content: "";
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  backdrop-filter: brightness(1.2) contrast(1.1);
  opacity: 0;
  pointer-events: none;
}
#ytlvt-heart-menu button:hover::after {
  opacity: 1;
}

/* Colorpicker appearance fix */
#ytlvt-heart-menu input[type="color"] {-webkit-appearance: none;}
#ytlvt-heart-menu input[type="color"]::-webkit-color-swatch-wrapper {padding: 0;}
#ytlvt-heart-menu input[type="color"]::-webkit-color-swatch {border: none;}


/*--- menu MAIN-button change on toggles ---*/

/* showHearts main heart change */
#ytlvt-heart-menu:has(.showHearts-on) #ytlvt-menu-main-button {
 fill: red !important;
}

/* highlightTitle main heart change */
#ytlvt-heart-menu:has(.highlightTitle-on):has(.showHearts-on) #ytlvt-menu-main-button svg {
  stroke: yellow;
  stroke-width: 6px;
  stroke-linejoin: round;
  paint-order: stroke;
}

/* dimLiked main heart background dim */
#ytlvt-heart-menu:has(.dimLiked-on) #ytlvt-menu-main-button {
  background: rgba(0, 191, 165, 65%) !important;
}

/* hideLiked main heart hide */
body:not(.ytlvt-liked-hide-disabled) #ytlvt-heart-menu:has(.hideLiked-on) #ytlvt-menu-main-button {
  opacity: 65%;
  background: #0000 !important;
  fill: #0000 !important;
  outline: 3px dashed red;
  outline-offset: -3px;
}
body:not(.ytlvt-liked-hide-disabled) #ytlvt-heart-menu:has(.hideLiked-on) #ytlvt-menu-main-button svg {
  display: none !important;
}

/* main button greyout when no toggle */
#ytlvt-heart-menu:not(:has(.ytlvt-menu-button-on)) #ytlvt-menu-main-button {
  filter: grayscale() contrast(4);
  fill: #000 !important;
}
`;
  document.head.appendChild(heartToggleStyle);

  function updateBadgeHeartColorCss() {
    document.documentElement.style.setProperty("--ytlvt-liked-heart-color", badgeHeartColor);
  }
  function updateBadgeBackgroundColorCss() {
    document.documentElement.style.setProperty("--ytlvt-liked-heart-background-color", badgeBackgroundColor);
  }
  function updateTitleColorCss() {
    document.documentElement.style.setProperty("--ytlvt-liked-title-color", titleColor);
  }
  function updateDimOpacityCss() {
    document.documentElement.style.setProperty("--ytlvt-liked-dim-opacity", dimOpacity);
  }

  function updateBodyToggles() {
    document.body.classList.toggle("ytlvt-liked-dim", dimLiked);
    document.body.classList.toggle("ytlvt-liked-hide", hideLiked);
    document.body.classList.toggle("ytlvt-liked-highlight-title", highlightTitle);
  }

  function isDisableHidePage() {
    return (
      (location.pathname.includes("/playlist") && location.search.includes("list=LL")) ||
      location.pathname.includes("/feed/playlists") ||
      location.pathname.includes("/feed/library") ||
      location.pathname.includes("/feed/you")
    );
  }
  function isLikedPlaylist() {
    return location.pathname.includes("/playlist") && location.search.includes("list=LL");
  }

  function updateMenuUI() {
    // Disable hide on the Playlists, Liked Videos playlist & library page
    document.body.classList.toggle("ytlvt-liked-hide-disabled", isDisableHidePage());

    // Show/hide playlist scan button
    const scanButtonContainer = document.getElementById("ytlvt-playlistScan-button")?.parentElement;
    if (scanButtonContainer) {
      scanButtonContainer.style.display = isLikedPlaylist() ? "flex" : "none";
    }
  }

  document.addEventListener("yt-navigate-finish", () => {
    updateMenuUI();
  });

  // autoplay container only gets attribute changes and doesn't have thumbnail as id so mutation observer doesn't catch it
  // process all at the end of a video to catch the changes
  document.addEventListener("yt-autonav-pause-player-ended", () => {
    requestAnimationFrame(processAllVideos);
  });

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
    ".ytp-ce-element", // end screen
    ".ytp-videowall-still", // end wall old (V to toggle at end of video)
    ".ytp-modern-videowall-still", // end wall
    ".ytp-autonav-endscreen-upnext-container", // autoplay
  ];

  const VIDEO_SELECTOR = VIDEO_CONTAINER.join(",");

  // Get video thumbnail to anchor indicator
  function getThumbnailElement(el) {
    return (
      el.querySelector("a#thumbnail") ||
      el.querySelector("ytd-thumbnail") ||
      el.querySelector("yt-thumbnail-view-model") ||
      el.querySelector(".ytp-ce-covering-image") ||
      el.querySelector(".ytp-videowall-still-image") ||
      el.querySelector(".ytp-modern-videowall-still-image") ||
      el.querySelector(".ytp-autonav-endscreen-upnext-thumbnail")
    );
  }

  // helper for getVideoIdFromElement and imports
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
    // Handle video wall elements (they are the <a> tag themselves)
    if (
      el.classList?.contains("ytp-videowall-still") ||
      el.classList?.contains("ytp-modern-videowall-still")
    ) {
      return extractVideoId(el.href);
    }

    // Handle regular containers
    const a = el.querySelector('a[href*="/watch"], a[href*="/shorts"]');
    return a ? extractVideoId(a.href) : null;
  }

  function getCurrentVideoId() {
    const videoRenderer = document.querySelector("ytd-watch-flexy");
    return videoRenderer?.videoId || null;
  }

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

        const btn = btnHost.querySelector("like-button-view-model button[aria-pressed]");
        if (!btn) return;

        setTimeout(() => {
          const liked = btn.getAttribute("aria-pressed") === "true";
          updateLiked(ID, liked, type);
          processAllVideos();
        }, 0);
      },
      true,
    );
  }

  // Watch / fullscreen / shorts
  listenLikes("segmented-like-dislike-button-view-model", getCurrentVideoId, "[Watch]");
  listenLikes("yt-player-quick-action-buttons", getCurrentVideoId, "[Watch Fullscreen]");
  listenLikes("reel-action-bar-view-model", getCurrentShortId, "[Shorts]");

  // SPA navigation: sync initial watch video like
  document.addEventListener("yt-navigate-finish", () => {
    setTimeout(() => {
      const videoId = getCurrentVideoId();
      if (!videoId) return;
      const btn = document.querySelector(
        "segmented-like-dislike-button-view-model like-button-view-model button[aria-pressed]",
      );
      if (!btn) return;
      const isLiked = btn.getAttribute("aria-pressed") === "true";
      updateLiked(videoId, isLiked, "[Watch SPA]");
    }, 0);
  });

  //*****************************************************************
  // #region HEART BADGE
  //*****************************************************************
  const HEART_HIDDEN_CLASS = "ytlvt-liked-heart-hidden";
  const heartMap = new WeakMap(); // maps video element -> heart div

  // add a non-interactive heart overlay into the video thumbnail
  function addHeart(el) {
    const id = getVideoIdFromElement(el);
    if (!id || !likedIndex.has(id)) return; // skip unliked videos
    if (el.querySelector(".ytlvt-liked-indicator")) return; // skip if a heart overlay already exists (prevents duplicates)

    const host = getThumbnailElement(el);
    if (!host) return;

    if (getComputedStyle(host).position === "static") {
      host.style.position = "relative";
    }

    const heart = document.createElement("div");
    heart.className = "ytlvt-liked-indicator";
    heart.dataset.id = id;

    // Create SVG heart
    const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    svg.setAttribute("viewBox", "-4 0 40 32");
    svg.style.cssText = "width:18px;height:18px;background:none!important;";

    const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
    path.setAttribute(
      "d",
      "M15.217 29.2015C15.752 29.5 16.3957 29.4835 16.9275 29.1795C20.5106 27.1318 26.7369 22.4179 29.1822 16.2948C32.7713 8.3224 24.3441 1.95834 18.5197 6.5356C17.9122 7.01307 17.1483 7.55954 16.6226 8.07719C16.3849 8.31124 15.966 8.33511 15.7193 8.11061C15.0281 7.48177 13.9479 6.67511 13.2542 6.20577C8.28887 2.84639 -0.74574 7.27463 3.1081 16.7255C4.51986 20.9677 11.2474 26.9862 15.217 29.2015Z",
    );
    path.setAttribute("fill", "");

    svg.appendChild(path);
    heart.appendChild(svg);

    Object.assign(heart.style, {
      position: "absolute",
      top: "8px",
      right: "8px",
      background: "",
      width: "22px",
      height: "22px",
      borderRadius: "50%",
      display: "flex",
      justifyContent: "center",
      alignItems: "center",
      zIndex: "20",
      pointerEvents: "none",
      userSelect: "none",
      boxShadow: "0 2px 8px rgba(0,0,0,.4)",
    });

    host.appendChild(heart);
    heartMap.set(el, heart);
  }

  // ensure heart state matches current index and visibility settings
  // creates, removes, or hides the overlay as needed
  function updateHeartDisplay(el) {
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

    // check if heart is orphaned (not a child of this element anymore)
    // youtube destroys hearts inside elements during layout changes (window resize, channel tab switch)
    if (heart && !el.contains(heart)) {
      heart = null;
      heartMap.delete(el);
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

  const flushPendingVideos =
    turboMode ?
      () => {
        if (rafScheduled) return;
        rafScheduled = true;

        requestAnimationFrame(() => {
          rafScheduled = false;
          flushPendingVideosRaw();
        });
      }
    : debounce(flushPendingVideosRaw, DEBOUNCE_TIME);
  // ignore mutations caused by UI (heart overlays / menu)
  const IGNORED_CLASSES = new Set(["ytlvt-liked-indicator", "ytlvt-heart-menu"]);

  // mutationObserver for newly added nodes and href changes
  const observer = new MutationObserver((muts) => {
    const nodesToProcess = new Set();

    muts.forEach((m) => {
      // Handle added nodes
      if (m.type === "childList") {
        m.addedNodes.forEach((n) => {
          if (!(n instanceof HTMLElement)) return;
          // Skip if it's an ignored element
          if (n.classList && Array.from(n.classList).some((c) => IGNORED_CLASSES.has(c))) return;

          if (n.matches?.(VIDEO_SELECTOR)) {
            nodesToProcess.add(n);
          } else {
            n.querySelectorAll?.(VIDEO_SELECTOR).forEach((el) => nodesToProcess.add(el));
          }
        });
      }

      // Handle href attribute changes on thumbnail links
      if (m.type === "attributes" && m.attributeName === "href") {
        if (m.target instanceof HTMLElement && m.target.id === "thumbnail") {
          // Find the parent video container
          const videoContainer = m.target.closest(VIDEO_SELECTOR);
          if (videoContainer) {
            nodesToProcess.add(videoContainer);
          }
        }
      }
    });

    if (nodesToProcess.size > 0) {
      videosToProcess.forEach((el) => nodesToProcess.add(el));
      videosToProcess.clear();
      nodesToProcess.forEach((el) => videosToProcess.add(el));
      flushPendingVideos();
    }
  });

  observer.observe(document.body, {
    childList: true,
    subtree: true,
    attributes: true,
    attributeFilter: ["href"],
  });

  //*****************************************************************
  // #region PLAYLIST SCAN
  //*****************************************************************
  let isScanActive = false;
  let isScanScrolling = false;

  async function playlistScan() {
    if (isScanScrolling) {
      isScanScrolling = false;
    }
    if (isScanActive) return;
    if (!location.pathname.includes("/playlist") || !location.search.includes("list=LL")) {
      return alert(
        "Playlist scan only works on your Liked videos playlist:\nwww.youtube.com/playlist?list=LL",
      );
    }

    const hasExistingLikes = likedIndex.size > 0;

    let max;
    if (hasExistingLikes) {
      // If user has existing likes, default to scanning loaded only
      const response = prompt(
        `${likedIndex.size.toLocaleString()} liked videos in script index.\n\nEnter max videos to scan (blank = loaded only):`,
      );
      if (response === null) return; // User cancelled
      max = response === "" ? null : response; // null means scan loaded only
    } else {
      // If no existing likes, default to scan all
      const response = prompt(
        `${likedIndex.size.toLocaleString()} liked videos in script index.\n\nEnter max videos to scan (blank = all):`,
      );
      if (response === null) return; // User cancelled
      max = response;
    }

    // If max is null, just scan loaded (no scrolling)
    const shouldScroll = max !== null;
    const startUrl = location.href;

    isScanActive = true;
    let playlistStyle;
    let escapeListener;
    let escapePressed = false;

    function scanGuard() {
      if (location.href !== startUrl) {
        alert("Scan aborted - page navigated");
        if (playlistStyle) playlistStyle.remove();
        isScanActive = false;
        isScanScrolling = false;
        return true;
      }
      if (escapePressed) {
        alert("Scan aborted - ESC pressed");
        document.removeEventListener("keydown", escapeListener);
        if (playlistStyle) playlistStyle.remove();
        isScanActive = false;
        isScanScrolling = false;
        return true;
      }
      return false;
    }

    const delay = (ms) => new Promise((r) => setTimeout(r, ms));

    // Only scroll if user specified a max or has no existing likes
    if (shouldScroll) {
      isScanScrolling = true;
      let lastCount = 0;
      let stableRounds = 0;
      playlistStyle = document.createElement("style");
      // style breaks if title is added so id only
      playlistStyle.id = "ytlvt-text-mode-scan";
      playlistStyle.textContent = `
      /* Change scan button */
      #ytlvt-playlistScan-button {
      background: #d32f2f !important;
      font-weight: bold;
      }

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
      document.head.appendChild(playlistStyle);

      escapeListener = (e) => {
        if (e.key === "Escape") {
          escapePressed = true;
        }
      };
      document.addEventListener("keydown", escapeListener);

      while (true) {
        if (!isScanScrolling) break;
        if (scanGuard()) return;

        const vids = document.querySelectorAll("ytd-playlist-video-renderer").length;
        if (vids === lastCount) {
          stableRounds++;
        } else {
          stableRounds = 0;
          lastCount = vids;
        }

        if (stableRounds >= 4) break;
        if (max && vids >= Number(max)) break;

        window.scrollTo(0, document.documentElement.scrollHeight);
        await delay(1500);
      }
    }

    if (scanGuard()) return;

    // Scan loaded videos
    const els = document.querySelectorAll("ytd-playlist-video-renderer");
    let scanned = 0;
    let added = 0;

    for (const el of els) {
      const id = getVideoIdFromElement(el);
      scanned++;

      if (id && !likedIndex.has(id)) {
        likedIndex.add(id);
        added++;
      }

      if (max && scanned >= Number(max)) break;
    }

    persistIndex(likedIndex);
    const scanEndStatus = !isScanScrolling && shouldScroll ? "interrupted by user" : "complete";
    setTimeout(() => {
      processAllVideos();
      alert(
        `Playlist scan ${scanEndStatus}\nScanned: ${scanned.toLocaleString()}\nAdded: ${added.toLocaleString()}\nScript index: ${likedIndex.size.toLocaleString()}`,
      );
      if (playlistStyle) playlistStyle.remove();
      isScanActive = false;
      isScanScrolling = false;
      document.removeEventListener("keydown", escapeListener);
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

    let added = 0;
    let type = "unknown";

    for (const e of data || []) {
      let id = null;

      if (typeof e === "string") {
        id = e;
        type = "Backup index";
      } else if (e.title?.startsWith("Liked ") && e.titleUrl) {
        id = extractVideoId(e.titleUrl);
        type = "Takeout JSON";
      }

      if (id && !likedIndex.has(id)) {
        likedIndex.add(id);
        added++;
      }
    }

    persistIndex(likedIndex);
    processAllVideos();
    alert(`Imported ${added.toLocaleString()} new liked videos (${type})`);
  }

  // CSV import
  async function importCsvLikes(file) {
    const lines = (await file.text()).split(/\r?\n/);
    const headers = parseCsvLine(lines[0]);
    const a = headers.indexOf("action");
    const l = headers.indexOf("video_link");
    if (a === -1 || l === -1) return alert("Invalid CSV");

    let added = 0;

    for (let i = 1; i < lines.length; i++) {
      const r = parseCsvLine(lines[i]);
      if (r?.[a] === "liked") {
        const id = extractVideoId(r[l]);
        if (id && !likedIndex.has(id)) {
          likedIndex.add(id);
          added++;
        }
      }
    }

    persistIndex(likedIndex);
    processAllVideos();
    alert(`Imported ${added.toLocaleString()} new liked videos`);
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
    const dateStr = new Date().toISOString().split("T")[0];
    const b = new Blob([JSON.stringify([...likedIndex], null, 2)], { type: "application/json" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(b);
    a.download = `ytlvt_liked_index_${dateStr}.json`;
    a.click();
  }

  // clear index
  function clearLikedIndexDoubleConfirm() {
    const total = likedIndex.size;

    if (!confirm(`⚠️ Permanently delete ${total.toLocaleString()} videos from script index?`)) return;

    const typed = prompt("Type CLEAR (all caps) to confirm:");
    if (typed !== "CLEAR") return alert("Aborted.");

    likedIndex.clear();
    persistIndex(likedIndex);
    processAllVideos();
    alert("✅ Liked index cleared.");
  }

  //*****************************************************************
  // #region HEART MENU
  //*****************************************************************
  function createMenu() {
    if (document.getElementById("ytlvt-heart-menu")) return;

    const buttonContainers = new Map();

    const menuContainer = document.createElement("div");
    menuContainer.id = "ytlvt-heart-menu";
    menuContainer.style.cssText = `
      position: fixed;
      bottom: 20px;
      right: 20px;
      z-index: 99999;
      display: flex;
      flex-direction: column;
      align-items: flex-end;
      gap: 6px;
      pointer-events: none;
    `;
    // prettier-ignore
    const menuItems = [
      { icon: "❤️‍", label: "Show hearts", state: () => showHearts, key: "showHearts", toggle: true, act: () => {showHearts = !showHearts; persistToggle("showHearts", showHearts);}},
      { icon: "🩵", label: "Dim liked videos", state: () => dimLiked, key: "dimLiked", toggle: true, act: () => {dimLiked = !dimLiked; persistToggle("dimLiked", dimLiked);}},
      { icon: "🩶", label: "Hide liked videos", state: () => hideLiked, key: "hideLiked", toggle: true, act: () => {hideLiked = !hideLiked; persistToggle("hideLiked", hideLiked);}},
      { icon: "💖", label: "Scan liked playlist ", key: "playlistScan" , act: playlistScan },
    ];
    // prettier-ignore
    const optionsItems = [
      { icon: "❣️", label: "Highlight title", state: () => highlightTitle, key:"highlightTitle", toggle: true, act:() => {highlightTitle = !highlightTitle; persistToggle("highlightTitle", highlightTitle);}},
      { icon: "💙", label: "Opacity", key: "dimOpacity", slider: true, min: 0.1, max: 0.9, step: 0.05, act: (val) => {dimOpacity = val; persistToggle("dimOpacity", dimOpacity); updateDimOpacityCss();}},
      { icon: "❤️‍🔥", label: "Quick", state: () => turboMode, key: "turboMode", toggle: true, act: turboToggleAlert },
      { icon: "💗", label: "Import", act: openImport },
      { icon: "💞", label: "Export", act: exportLikes },
      { icon: "💔", label: "Clear index", act: clearLikedIndexDoubleConfirm },
    ];

    const menuButtons = [];

    // create menu buttons
    menuItems.forEach((i) => {
      const button = makeButton(
        `${i.label} ${i.icon}`,
        () => {
          i.act();
          updateBodyToggles();
          processAllVideos();
        },
        "#333",
      );
      button.id = `ytlvt-${i.key}-button`;

      if (i.key == "showHearts") {
        button.style.gap = "6px";
        const heartColorInput = makeColorPicker("badgeHeartColor");
        heartColorInput.value = badgeHeartColor;
        heartColorInput.addEventListener("change", (e) => {
          badgeHeartColor = e.target.value;
          persistToggle("badgeHeartColor", badgeHeartColor);
          updateBadgeHeartColorCss();
        });
        button.prepend(heartColorInput);
        const heartBackgroundColorInput = makeColorPicker("badgeBackgroundColor");
        heartBackgroundColorInput.value = badgeBackgroundColor;
        heartBackgroundColorInput.addEventListener("change", (e) => {
          badgeBackgroundColor = e.target.value;
          persistToggle("badgeBackgroundColor", badgeBackgroundColor);
          updateBadgeBackgroundColorCss();
        });
        heartBackgroundColorInput.style.marginRight = "2px";
        button.prepend(heartBackgroundColorInput);
      }

      // check state on init and add listener for user button toggle to toggle class
      if (i.state) {
        button.classList.toggle("ytlvt-menu-button-on", i.state());
        button.classList.toggle(`${i.key}-on`, i.state());
        button.addEventListener(`click`, () => {
          button.classList.toggle("ytlvt-menu-button-on", i.state());
          button.classList.toggle(`${i.key}-on`, i.state());
        });
      }

      button.style.display = "none";

      const container = document.createElement("div");
      container.style.cssText = `
        display: none; 
        flex-direction: row; 
        gap: 6px;
      `;
      container.className = "ytlvt-menu-button-container";
      container.appendChild(button);
      buttonContainers.set(i.key, container);
      menuContainer.appendChild(container);
      menuButtons.push({ b: button, i });
    });

    // Main toggle button
    const mainButtonContainer = document.createElement("div");
    mainButtonContainer.style.cssText = `
      display: flex; 
      flex-direction: row; 
      gap: 6px;
    `;
    const mainButton = document.createElement("button");
    mainButton.id = "ytlvt-menu-main-button";
    mainButton.type = "button";
    mainButton.onclick = toggleMenu;
    // Create SVG directly cause youtube uses Trusted Types
    const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    svg.setAttribute("viewBox", "-4 0 40 32");
    svg.style.cssText = "width:18px;aspect-ratio:1/1;scale:1.5;";

    const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
    path.setAttribute(
      "d",
      "M15.217 29.2015C15.752 29.5 16.3957 29.4835 16.9275 29.1795C20.5106 27.1318 26.7369 22.4179 29.1822 16.2948C32.7713 8.3224 24.3441 1.95834 18.5197 6.5356C17.9122 7.01307 17.1483 7.55954 16.6226 8.07719C16.3849 8.31124 15.966 8.33511 15.7193 8.11061C15.0281 7.48177 13.9479 6.67511 13.2542 6.20577C8.28887 2.84639 -0.74574 7.27463 3.1081 16.7255C4.51986 20.9677 11.2474 26.9862 15.217 29.2015Z",
    );
    path.setAttribute("fill", "");

    svg.appendChild(path);
    mainButton.appendChild(svg);
    mainButton.style.cssText = `
      background: #00bfa5;
      display: flex;
      font-size: 18px;
      width: 36px;
      aspect-ratio: 1/1;
      padding: 5.5px;
      border:none;
      border-radius: 50%;
      justify-content: center;
      align-content: center;
      cursor:pointer;
      box-shadow:0 3px 10px rgba(0,0,0,.35);
      fill: white;
      overflow: clip;
      position: relative;
    `;
    mainButtonContainer.appendChild(mainButton);
    menuContainer.appendChild(mainButtonContainer);

    // options submenu container
    const optionsContainer = document.createElement("div");
    optionsContainer.id = "ytlvt-menu-options-container";
    optionsContainer.style.cssText = `
      display: flex;
      flex-direction: row;
      gap: 6px;
      bottom: 0;
      right: 100%;
    `;
    optionsContainer.style.display = "none";
    menuContainer.insertBefore(optionsContainer, mainButtonContainer);

    // create options button
    const options = makeButton("Options ❤️‍🩹", toggleOptions, "#333");
    options.id = "ytlvt-options-button";
    options.style.display = "none";
    options.style.position = "relative"; // anchor for submenu
    optionsContainer.appendChild(options);
    const optionsButtons = optionsItems.map((i) => {
      if (i.slider) {
        // create slider input for opacity
        const sliderContainer = document.createElement("div");
        sliderContainer.style.cssText = `
          display: none;
          align-items: center;
          gap: 6px;
          background: #333;
          color: #fff;
          border-radius: 20px;
          padding: 0px 10px;
          font-size: 12px;
          box-shadow:0 3px 10px rgba(0,0,0,.35);
          white-space: nowrap;
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
        valueDisplay.style.cssText = `width: 24px; user-select: none; text-align: center;`;

        slider.addEventListener("input", (e) => {
          dimOpacity = parseFloat(e.target.value);
          valueDisplay.textContent = `${Math.round(dimOpacity * 100)}%`;
          i.act(dimOpacity);
        });

        sliderContainer.appendChild(label);
        sliderContainer.appendChild(slider);
        sliderContainer.appendChild(valueDisplay);
        sliderContainer.id = `ytlvt-${i.key}-button`;
        buttonContainers.get("dimLiked")?.prepend(sliderContainer);
        return { b: sliderContainer, i };
      } else if (i.key == "turboMode") {
        const b = makeButton(
          `${i.label} ${i.icon}`,
          () => {
            i.act();
          },
          "#333",
        );
        b.id = `ytlvt-${i.key}-button`;
        b.title = "Disable debounce";
        b.style.display = "none";
        b.style.whiteSpace = "nowrap";

        b.classList.toggle("ytlvt-option-button-on", i.state());
        b.classList.toggle(`${i.key}-on`, i.state());
        b.addEventListener("click", () => {
          b.classList.toggle("ytlvt-option-button-on", i.state());
          b.classList.toggle(`${i.key}-on`, i.state());
        });

        optionsContainer.prepend(b);
        return { b, i };
      } else if (i.key === "highlightTitle") {
        const b = makeButton(
          `${i.label} ${i.icon}`,
          () => {
            i.act();
            updateBodyToggles();
          },
          "#333",
        );
        b.id = `ytlvt-${i.key}-button`;
        b.style.display = "none";
        b.style.whiteSpace = "nowrap";
        b.style.alignItems = "center";
        b.style.gap = "6px";
        b.classList.toggle("ytlvt-option-button-on", i.state());
        b.classList.toggle(`${i.key}-on`, i.state());
        b.addEventListener("click", () => {
          b.classList.toggle("ytlvt-option-button-on", i.state());
          b.classList.toggle(`${i.key}-on`, i.state());
        });

        // create color picker inside the button
        const colorInput = makeColorPicker("titleColor");
        colorInput.value = titleColor;
        colorInput.addEventListener("change", (e) => {
          titleColor = e.target.value;
          persistToggle("titleColor", titleColor);
          updateTitleColorCss();
        });
        b.prepend(colorInput);
        buttonContainers.get("showHearts")?.prepend(b);

        return { b, i };
      } else {
        // bottom row option buttons
        const b = makeButton(
          `${i.label} ${i.icon}`,
          () => {
            i.act();
          },
          "#009783ff",
        );
        b.style.display = "none";
        b.style.whiteSpace = "nowrap";
        b.style.fontSize = "16px";

        mainButtonContainer.insertBefore(b, mainButton);
        return { b, i };
      }
    });

    document.body.appendChild(menuContainer);

    // Re-enable pointer events on interactive elements
    menuContainer.querySelectorAll("button, input").forEach((el) => {
      el.style.pointerEvents = "auto";
    });
    // Re-enable for containers that need to be interactive
    menuContainer.querySelectorAll(".ytlvt-menu-button-container, #ytlvt-heart-menu > div").forEach((el) => {
      el.style.pointerEvents = "auto";
    });

    // Prevent submenu clicks from closing the menu
    options.addEventListener("click", (e) => {
      e.stopPropagation();
    });
    optionsContainer.addEventListener("click", (e) => {
      e.stopPropagation();
    });

    function toggleMenu() {
      const open = menuButtons[0].b.style.display === "flex";
      menuButtons.forEach((x) => {
        if (x.i.key === "playlistScan" && !isLikedPlaylist()) {
          return;
        }
        const display = x.i.key === "showHearts" ? "flex" : "block";
        x.b.style.display = open ? "none" : display;
      });

      // Hide/show menu button containers
      document.querySelectorAll(".ytlvt-menu-button-container").forEach((el) => {
        const button = el.querySelector("button");
        if (button?.id === "ytlvt-playlistScan-button" && !isLikedPlaylist()) {
          return;
        }
        el.style.display = open ? "none" : "flex";
      });

      options.style.display = open ? "none" : "flex";
      options.classList?.remove("visible");
      optionsContainer.style.display = open ? "none" : "flex";

      if (open) {
        optionsButtons.forEach((x) => (x.b.style.display = "none"));
      }
    }

    function toggleOptions() {
      const open = optionsButtons[0].b.style.display !== "none";
      optionsButtons.forEach((x) => {
        // Use "flex" for sliders, "block" for buttons
        const display = x.i.key === "highlightTitle" || x.i.slider ? "flex" : "block";
        x.b.style.display = open ? "none" : display;
      });
      options.classList.toggle("visible", !open);
    }

    function openImport() {
      const f = document.createElement("input");
      f.type = "file";
      f.accept = ".json,.csv";
      f.onchange = () =>
        f.files[0].name.endsWith(".json") ? importTakeoutJson(f.files[0]) : importCsvLikes(f.files[0]);
      f.click();
    }

    // close menu when user clicks outside it
    document.addEventListener(
      "click",
      (e) => {
        if (
          !menuContainer.contains(e.target) ||
          e.target.closest("yt-chip-cloud-chip-renderer, tp-yt-paper-tab, ytd-searchbox")
        ) {
          document.querySelectorAll(".ytlvt-menu-button-container").forEach((el) => {
            el.style.display = "none";
          });
          menuButtons.forEach((x) => (x.b.style.display = "none"));
          options.style.display = "none";
          options.classList?.remove("visible");
          optionsButtons.forEach((x) => (x.b.style.display = "none"));
          optionsContainer.style.display = "none";
        }
      },
      true,
    );

    // close menu on escape key press
    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape") {
        document.querySelectorAll(".ytlvt-menu-button-container").forEach((el) => {
          el.style.display = "none";
        });
        menuButtons.forEach((x) => (x.b.style.display = "none"));
        options.style.display = "none";
        options.classList?.remove("visible");
        optionsButtons.forEach((x) => (x.b.style.display = "none"));
        optionsContainer.style.display = "none";
      }
    });
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
      border-radius:20px;
      padding:7px 10px;
      font-size:12px;
      cursor:pointer;
      box-shadow:0 3px 10px rgba(0,0,0,.35);
      overflow: clip;
      position: relative;
    `;
    return b;
  }

  function makeColorPicker(id) {
    const b = document.createElement("input");
    b.id = `ytlvt-${id}-button`;
    b.type = "color";
    b.style.cssText = `
      cursor: pointer;
      padding: 0px;
      width: 16px;
      height: 16px;
      border: none;
      border-radius: 50%;
      scale: 1.1;
      outline: solid white;
      outline-width: medium;
      outline-width: 2px;
      outline-offset: -1px;
    `;
    b.addEventListener("click", (e) => {
      e.stopPropagation();
    });
    return b;
  }

  createMenu();
  updateBodyToggles();
  processAllVideos();
})();
