// ==UserScript==
// @name         YouTube Liked Videos Manager
// @namespace    Violentmonkey Scripts
// @version      1.4.2
// @description  Full-featured liked videos manager and checker with hide/dim, import/export, liked videos playlist scan, and hearts overlay
// @match        *://www.youtube.com/*
// @icon         data:image/svg+xml;charset=UTF-8,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20viewBox%3D%220%200%20100%20100%22%3E%3Ctext%20x%3D%2250%25%22%20y%3D%2250%25%22%20style%3D%22dominant-baseline%3Amiddle%3Btext-anchor%3Amiddle%3Bfont-size%3A80px%3B%22%3E%E2%9D%A4%EF%B8%8F%3C%2Ftext%3E%3C%2Fsvg%3E
// @grant        GM_getValue
// @grant        GM_setValue
// ==/UserScript==

(() => {
  "use strict";

  /******************************************************************
   * STORAGE & SYNC
   ******************************************************************/
  let likedIndex = new Set(GM_getValue("likedIndex", []));
  let hideLiked = GM_getValue("hideLiked", false);
  let dimLiked = GM_getValue("dimLiked", false);
  let showHearts = GM_getValue("showHearts", true);

  const persistIndex = (index) => GM_setValue("likedIndex", [...index]);
  const persistToggle = (k, v) => GM_setValue(k, v);

  // Sync across tabs using value change listener
  if (typeof GM_addValueChangeListener === "function") {
    GM_addValueChangeListener("likedIndex", (name, oldValue, newValue, remote) => {
      if (remote) {
        likedIndex.clear();
        (newValue || []).forEach((v) => likedIndex.add(v));
        console.log("[Sync] likedIndex updated from another tab");
        processVideos(); // update hearts/dim/hide immediately
      }
    });
  }

  // Helper to get fresh copy before any write
  function getLatestLikedIndex() {
    return new Set(GM_getValue("likedIndex", []));
  }

  /******************************************************************
   * VIDEO ID EXTRACTION
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

  // Index helper
  function getLikedStatus(liked, ID, type) {
    const index = getLatestLikedIndex();

    if (liked && !index.has(ID)) {
      index.add(ID);
      console.log(type, "Liked:", ID);
    } else if (!liked && index.has(ID)) {
      index.delete(ID);
      console.log(type, "Unliked:", ID);
    }

    likedIndex = index; // update in-memory copy
    persistIndex(index); // persist safely to storage
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
   * WATCH LIKE LISTENER
   ******************************************************************/
  // live click button update
  document.addEventListener(
    "click",
    (event) => {
      const btn = event.target.closest("segmented-like-dislike-button-view-model button[aria-pressed]");
      if (!btn) return;

      const videoId = getCurrentVideoId();
      if (!videoId) return;

      // Read AFTER YouTube toggles
      setTimeout(() => {
        const isLiked = btn.getAttribute("aria-pressed") === "true";
        getLikedStatus(isLiked, videoId, "[Watch]");
      }, 0); // add small delay if live watch likes are not added to index
    },
    true
  );

  // check watch like on load and add if missing
  function syncInitialWatchLike() {
    const videoId = getCurrentVideoId();
    if (!videoId) return false;

    const btn = document.evaluate(
      "//segmented-like-dislike-button-view-model//button[@aria-pressed]",
      document,
      null,
      XPathResult.FIRST_ORDERED_NODE_TYPE,
      null
    ).singleNodeValue;
    if (!btn) return false;

    const isLiked = btn.getAttribute("aria-pressed") === "true";
    if (!isLiked) return true;

    const index = getLatestLikedIndex();
    if (!index.has(videoId)) {
      index.add(videoId);
      likedIndex = index; // update in-memory
      persistIndex(index);
      console.log("[Watch Init] Liked:", videoId);
    }

    return true;
  }

  document.addEventListener("yt-navigate-finish", () => {
    let tries = 0;
    const t = setInterval(() => {
      if (syncInitialWatchLike() || ++tries > 5) clearInterval(t);
    }, 10); // recommended to keep this delay as is
  });

  /******************************************************************
   * FULLSCREEN WATCH LIKE LISTENER
   ******************************************************************/
  document.addEventListener(
    "click",
    (event) => {
      const btn = event.target.closest(".ytp-fullscreen-quick-actions button[aria-pressed]");
      if (!btn) return;

      const videoId = getCurrentVideoId();
      if (!videoId) return;

      // Read AFTER YouTube toggles
      setTimeout(() => {
        const isLiked = btn.getAttribute("aria-pressed") === "true";
        getLikedStatus(isLiked, videoId, "[Watch Fullscreen]");
      }, 0); // add small delay if live fullscreen watch likes are not added to index
    },
    true
  );

  /******************************************************************
   * SHORTS LIKE LISTENER
   ******************************************************************/
  document.addEventListener(
    "click",
    (event) => {
      const likeBtnHost = event.target.closest("like-button-view-model");
      if (!likeBtnHost) return;

      const videoId = getCurrentShortId();
      if (!videoId) return;

      const btn = likeBtnHost.querySelector("button[aria-pressed]");
      if (!btn) return;

      setTimeout(() => {
        const isLiked = btn.getAttribute("aria-pressed") === "true";
        getLikedStatus(isLiked, videoId, "[Shorts]");
      }, 0); // add small delay if live short likes are not added to index
    },
    true
  );

  /******************************************************************
   * HEART BADGE
   ******************************************************************/
  function addHeart(el) {
    const id = getVideoIdFromElement(el);
    if (!id || !likedIndex.has(id)) return; // skip unliked videos
    if (el.querySelector(`.yt-liked-indicator[data-id="${id}"]`)) return;

    const heart = document.createElement("div");
    heart.className = "yt-liked-indicator";
    heart.dataset.id = id;
    heart.textContent = "🤍";
    heart.style.cssText = `
            position:absolute;
            top:8px;
            right:8px;
            background:#ff0000;
            color:white;
            width:22px;
            height:22px;
            border-radius:50%;
            display:flex;
            align-items:center;
            justify-content:center;
            font-size:10px;
            z-index:20;
            pointer-events:none;
            box-shadow:0 2px 8px rgba(0,0,0,.4);
        `;

    const host = resolveOverlayHost(el);
    if (!host) return;

    if (getComputedStyle(host).position === "static") {
      host.style.position = "relative";
    }

    host.appendChild(heart);
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

  function syncHeart(el, id) {
    const existing = el.querySelector(`.yt-liked-indicator[data-id="${id}"]`);

    // Should NOT have a heart
    if (!showHearts || !likedIndex.has(id)) {
      if (existing) existing.remove();
      return;
    }

    // Should have a heart
    if (!existing) addHeart(el);
  }

  /******************************************************************
   * PROCESS VIDEOS
   ******************************************************************/
  function processVideos() {
    document
      .querySelectorAll(
        `
            ytd-rich-item-renderer,
            ytd-video-renderer,
            ytd-grid-video-renderer,
            ytd-playlist-video-renderer,
            yt-lockup-view-model,
            ytm-shorts-lockup-view-model,
            ytm-shorts-lockup-view-model-v2
        `
      )
      .forEach((el) => {
        const id = getVideoIdFromElement(el);

        // Reset display & opacity
        el.style.removeProperty("display");
        el.style.removeProperty("opacity");
        // Reset outer shelf
        const shelfItem = el.closest(".ytGridShelfViewModelGridShelfItem");
        if (shelfItem) shelfItem.style.removeProperty("display");

        if (id) {
          syncHeart(el, id);
        }

        if (id && likedIndex.has(id)) {
          if (hideLiked) {
            if (shelfItem) shelfItem.style.display = "none";
            else el.style.display = "none";
          } else if (dimLiked) {
            el.style.opacity = "0.55";
          }
        }
      });
  }

  /******************************************************************
   * CLEAR INDEX
   ******************************************************************/
  function clearLikedIndexTripleConfirm() {
    const total = likedIndex.size;

    if (!confirm(`⚠️ This will permanently DELETE ${total.toLocaleString()} liked videos.\n\nContinue?`))
      return;

    const typed = prompt("Type CLEAR (all caps) to confirm:");
    if (typed !== "CLEAR") return alert("Aborted.");

    const final = prompt(`FINAL STEP: Type ${total} to confirm:`);
    if (String(final) !== String(total)) return alert("Aborted.");

    likedIndex.clear();
    GM_setValue("likedIndex", []);

    alert("✅ Liked index cleared.");
    processVideos();
  }

  /******************************************************************
   * IMPORT / EXPORT
   ******************************************************************/
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
        type = "exported IDs";
      } else if (e.title?.startsWith("Liked ") && e.titleUrl) {
        id = extractVideoId(e.titleUrl);
        type = "Takeout JSON";
      }

      if (id && !likedIndex.has(id)) {
        likedIndex.add(id);
        added++;
      }
    }

    persistIndex();
    alert(`Imported ${added} liked videos (${type})`);
    processVideos();
  }

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
    persistIndex();
    alert(`Imported ${added} liked videos`);
    processVideos();
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

  function exportLikes() {
    const b = new Blob([JSON.stringify([...likedIndex], null, 2)], { type: "application/json" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(b);
    a.download = "liked_videos.json";
    a.click();
  }

  /******************************************************************
   * PLAYLIST SCAN
   ******************************************************************/
  async function playlistScan() {
    if (!location.pathname.includes("/playlist") || !location.search.includes("list=LL")) {
      return alert(
        "Playlist scan only works on your Liked videos playlist:\nwww.youtube.com/playlist?list=LL"
      );
    }

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
        return;
      }
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
      await delay(700);
    }

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

    persistIndex();
    processVideos();

    alert(`Playlist scan complete\nScanned: ${scanned}\nAdded: ${added}`);
  }

  /******************************************************************
   * HEART MENU
   ******************************************************************/
  function createMenu() {
    if (document.getElementById("yt-liked-menu")) return;

    const wrap = document.createElement("div");
    wrap.id = "yt-liked-menu";
    wrap.style.cssText = `
            position:fixed;
            bottom:20px;
            right:20px;
            z-index:99999;
            display:flex;
            flex-direction:column;
            align-items:flex-end;
            gap:6px;
        `;
    // prettier-ignore
    const items = [
      {icon:'❤️‍', label:'Show hearts', key:'showHearts',toggle: true, act:()=>{showHearts = !showHearts;persistToggle('showHearts',showHearts)}},
      {icon:'🩵', label:'Hide liked videos', key:'hideLiked', toggle:true, act:()=>{hideLiked=!hideLiked; persistToggle('hideLiked',hideLiked)}},
      {icon:'🩶', label:'Dim liked videos', key:'dimLiked', toggle:true, act:()=>{dimLiked=!dimLiked; persistToggle('dimLiked',dimLiked)}},
      {icon:'💖', label:'Liked playlist scan', act:playlistScan},
      {icon:'💗', label:'Import', act:openImport},
      {icon:'💞', label:'Export', act:exportLikes},
      {icon:'💔', label:'Clear liked index', act:clearLikedIndexTripleConfirm}
    ];

    const btns = [];

    // menu items FIRST
    items.forEach((i) => {
      const b = makeButton(
        `${i.label} ${i.icon}`,
        () => {
          i.act();
          update();
          processVideos();
        },
        "#333"
      );
      b.style.display = "none";
      wrap.appendChild(b);
      btns.push({ b, i });
    });

    // main button LAST
    const main = makeButton("♥️", toggleMenu, "#00bfa5");
    main.title = "Liked Video Controls";
    wrap.appendChild(main);
    main.style.padding = "6px";
    main.style.fontSize = "18px";
    main.style.borderRadius = "50%";

    document.body.appendChild(wrap);

    function toggleMenu() {
      const open = btns[0].b.style.display === "block";
      btns.forEach((x) => (x.b.style.display = open ? "none" : "block"));
    }

    function update() {
      btns.forEach(({ b, i }) => {
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
        }

        b.style.background = on ? "#d32f2f" : "#333";
        b.style.fontWeight = on ? "bold" : "normal";
      });
    }

    function openImport() {
      const f = document.createElement("input");
      f.type = "file";
      f.accept = ".json,.csv";
      f.onchange = () =>
        f.files[0].name.endsWith(".json") ? importTakeoutJson(f.files[0]) : importCsvLikes(f.files[0]);
      f.click();
    }

    document.addEventListener("click", (e) => {
      if (!wrap.contains(e.target)) btns.forEach((x) => (x.b.style.display = "none"));
    });
    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape") btns.forEach((x) => (x.b.style.display = "none"));
    });

    update();
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

  /******************************************************************
   * OBSERVER
   ******************************************************************/
  const obs = new MutationObserver((muts) => {
    if (!muts.some((m) => m.addedNodes.length)) return;
    clearTimeout(obs.t);
    obs.t = setTimeout(processVideos, 250);
  });

  obs.observe(document.body, { childList: true, subtree: true });

  createMenu();
  // Hide button when video full screen
  function setupFullscreenToggle() {
    const menu = document.getElementById("yt-liked-menu");
    if (!menu) return;

    let lastState = false;

    function check() {
      const isFull = !!document.fullscreenElement || document.querySelector(".ytp-fullscreen") !== null;

      if (isFull === lastState) return;
      lastState = isFull;

      // Hide or show entire menu
      menu.style.display = isFull ? "none" : "flex";

      // Close submenu buttons when entering fullscreen
      if (isFull) {
        menu.querySelectorAll("button").forEach((b, i) => {
          if (i !== menu.children.length - 1) b.style.display = "none";
        });
      }
    }

    // Fullscreen API (reliable)
    document.addEventListener("fullscreenchange", check);

    // YouTube class changes
    const obs = new MutationObserver(check);
    obs.observe(document.body, {
      attributes: true,
      subtree: true,
      attributeFilter: ["class"],
    });

    // Initial state
    check();
  }

  setupFullscreenToggle();
  processVideos();
})();
