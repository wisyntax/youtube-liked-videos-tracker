// ==UserScript==
// @name         YouTube Liked Videos Manager
// @namespace    Violentmonkey Scripts
// @version      1.3.0
// @description  Full-featured liked videos manager and checker with hide/dim, import/export, liked videos playlist scan, and hearts overlay
// @match        *://www.youtube.com/*
// @grant        GM_getValue
// @grant        GM_setValue
// ==/UserScript==

(() => {
    'use strict';

    /******************************************************************
     * STORAGE
     ******************************************************************/
    const likedIndex = new Set(GM_getValue('likedIndex', []));
    let hideLiked = GM_getValue('hideLiked', false);
    let dimLiked = GM_getValue('dimLiked', false);
    let showHearts = GM_getValue('showHearts', true);

    const persistIndex = () => GM_setValue('likedIndex', [...likedIndex]);
    const persistToggle = (k, v) => GM_setValue(k, v);

    /******************************************************************
     * VIDEO ID EXTRACTION
     ******************************************************************/
    function extractVideoId(url) {
        if (typeof url !== 'string') return null;
        return (
            url.match(/[?&]v=([^&]+)/)?.[1] ||
            url.match(/youtu\.be\/([^?/]+)/)?.[1] ||
            url.match(/\/shorts\/([^?/]+)/)?.[1] ||
            null
        );
    }

    function getVideoIdFromElement(el) {
        const a = el.querySelector('a[href*="/watch"], a[href*="/shorts/"]');
        return a ? extractVideoId(a.href) : null;
    }

    /******************************************************************
     * HEART BADGE
     ******************************************************************/
    function addHeart(el) {
        if (el.querySelector('.yt-liked-indicator')) return;

        const id = getVideoIdFromElement(el);
         if (!id || !likedIndex.has(id)) return; // 🔒 skip unliked videos

        const heart = document.createElement('div');
        heart.className = 'yt-liked-indicator';
        heart.textContent = '🤍';
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

        if (getComputedStyle(host).position === 'static') {
            host.style.position = 'relative';
        }

        host.appendChild(heart);
    }

    function resolveOverlayHost(el) {
        // 🟢 History page: anchor inside yt-thumbnail-view-model for perfect overlay
        const historyThumb = el.querySelector(
            'a.yt-lockup-view-model__content-image yt-thumbnail-view-model'
        );
        if (historyThumb) return historyThumb;

        // 🟢 Playlist page: anchor inside the inner <yt-image> for exact thumbnail
        const playlistThumb = el.querySelector(
            'ytd-thumbnail a#thumbnail'
        );
        if (playlistThumb) return playlistThumb;

        // 🟢 Standard video renderers
        const standardThumb =
            el.querySelector('a#thumbnail') ||
            el.querySelector('ytd-thumbnail') ||
            el.querySelector('yt-thumbnail-view-model');
        if (standardThumb) return standardThumb;

        // 🟡 Absolute fallback
        return null;
    }

    /******************************************************************
     * PROCESS VIDEOS
     ******************************************************************/
    function processVideos() {
        document.querySelectorAll(`
            ytd-rich-item-renderer,
            ytd-video-renderer,
            ytd-grid-video-renderer,
            ytd-playlist-video-renderer,
            yt-lockup-view-model
        `).forEach(el => {
            const id = getVideoIdFromElement(el);

            el.style.display = '';
            el.style.opacity = '1';

            if (id && likedIndex.has(id)) {
                if (showHearts)addHeart(el);
                if (hideLiked) el.style.display = 'none';
                else if (dimLiked) el.style.opacity = '0.45';
            }
        });
    }


    /******************************************************************
     * REMOVE HEARTS WHEN TOGGLE OFF
     ******************************************************************/

    function removeAllHearts() {
        document
            .querySelectorAll('.yt-liked-indicator')
            .forEach(h => h.remove());
    }

    /******************************************************************
     * DANGER ZONE — CLEAR INDEX
     ******************************************************************/
    function clearLikedIndexTripleConfirm() {
        const total = likedIndex.size;

        if (!confirm(
            `⚠️ This will permanently DELETE ${total.toLocaleString()} liked videos.\n\nContinue?`
        )) return;

        const typed = prompt('Type CLEAR (all caps) to confirm:');
        if (typed !== 'CLEAR') return alert('Aborted.');

        const final = prompt(`FINAL STEP: Type ${total} to confirm:`);
        if (String(final) !== String(total)) return alert('Aborted.');

        likedIndex.clear();
        GM_setValue('likedIndex', []);

        alert('✅ Liked index cleared.');
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
            return alert('Invalid JSON');
        }

        let added = 0;
        let type = 'unknown';

        for (const e of data || []) {
            let id = null;

            if (typeof e === 'string') {
                id = e; // your exported ID array
                type = 'exported IDs';
            } else if (e.title?.startsWith('Liked ') && e.titleUrl) {
                id = extractVideoId(e.titleUrl); // Takeout export
                type = 'Takeout JSON';
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
        const a = headers.indexOf('action');
        const l = headers.indexOf('video_link');
        if (a === -1 || l === -1) return alert('Invalid CSV');

        let added = 0;
        for (let i = 1; i < lines.length; i++) {
            const r = parseCsvLine(lines[i]);
            if (r?.[a] === 'liked') {
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

    const parseCsvLine = l => {
        if (!l) return null;
        const o = [];
        let c = '', q = false;
        for (const ch of l) {
            if (ch === '"') q = !q;
            else if (ch === ',' && !q) { o.push(c); c = ''; }
            else c += ch;
        }
        o.push(c);
        return o.map(v => v.trim());
    };

    function exportLikes() {
        const b = new Blob([JSON.stringify([...likedIndex], null, 2)], {type:'application/json'});
        const a = document.createElement('a');
        a.href = URL.createObjectURL(b);
        a.download = 'liked_videos.json';
        a.click();
    }

    /******************************************************************
     * PLAYLIST SCAN
     ******************************************************************/
    async function playlistScan() {
          // Only run on liked videos playlist
        if (!location.pathname.includes('/playlist') || !location.search.includes('list=LL')) {
            return alert('Playlist scan only works on your Liked videos playlist. (www.youtube.com/playlist?list=LL)');
        }
        const n = prompt('Number of videos to scan from playlist? (Leave empty for all)');
        if (n === null) return;
        const vids = document.querySelectorAll('ytd-playlist-video-renderer');
        let count = 0;
        for (const el of vids) {
            const id = getVideoIdFromElement(el);
            if (id && !likedIndex.has(id)) { likedIndex.add(id); count++; }
            if (n && count >= Number(n)) break;
        }
        persistIndex();
        alert(`Playlist scan complete — added ${count} new likes`);
        processVideos();
    }

    /******************************************************************
     * CASCADE MENU
     ******************************************************************/
    function createMenu() {
        if (document.getElementById('yt-liked-menu')) return;

        const wrap = document.createElement('div');
        wrap.id = 'yt-liked-menu';
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

        const items = [
            {icon:'❤️‍', label:'Show hearts', key:'showHearts',toggle: true, act:()=>{showHearts = !showHearts;persistToggle('showHearts',showHearts);if (!showHearts) removeAllHearts()}},
            {icon:'🩵', label:'Hide liked videos', key:'hideLiked', toggle:true, act:()=>{hideLiked=!hideLiked; persistToggle('hideLiked',hideLiked)}},
            {icon:'🩶', label:'Dim liked videos', key:'dimLiked', toggle:true, act:()=>{dimLiked=!dimLiked; persistToggle('dimLiked',dimLiked)}},
            {icon:'💖', label:'Liked playlist scan', act:playlistScan},
            {icon:'💗', label:'Import', act:openImport},
            {icon:'💞', label:'Export', act:exportLikes},
            {icon:'💔', label:'Clear liked index', act:clearLikedIndexTripleConfirm}
        ];

        const btns = [];

        // menu items FIRST
        items.forEach(i => {
            const b = makeButton(`${i.label} ${i.icon}`, () => {
                i.act();
                update();
                processVideos();
            }, '#333');
            b.style.display = 'none';
            wrap.appendChild(b);
            btns.push({b,i});
        });

        // main button LAST
        const main = makeButton('♥️', toggleMenu, '#00bfa5');
        main.title = 'Liked Video Controls';
        wrap.appendChild(main);
        main.style.padding = '6px';
        main.style.fontSize = '18px';
        main.style.borderRadius = '50%';


        document.body.appendChild(wrap);

        function toggleMenu() {
            const open = btns[0].b.style.display === 'block';
            btns.forEach(x => x.b.style.display = open ? 'none' : 'block');
        }

        function update() {
            btns.forEach(({ b, i }) => {
                if (!i.toggle || !i.key) return;

                let on = false;

                switch (i.key) {
                    case 'hideLiked':
                        on = hideLiked;
                        break;
                    case 'dimLiked':
                        on = dimLiked;
                        break;
                    case 'showHearts':
                        on = showHearts;
                        break;
                }

                b.style.background = on ? '#d32f2f' : '#333';
                b.style.fontWeight = on ? 'bold' : 'normal';
            });
        }

        function openImport() {
            const f = document.createElement('input');
            f.type='file'; f.accept='.json,.csv';
            f.onchange=()=>f.files[0].name.endsWith('.json')
                ? importTakeoutJson(f.files[0])
                : importCsvLikes(f.files[0]);
            f.click();
        }

        document.addEventListener('click', e=>{
            if (!wrap.contains(e.target))
                btns.forEach(x=>x.b.style.display='none');
        });
        document.addEventListener('keydown', e=>{
            if(e.key==='Escape')
                btns.forEach(x=>x.b.style.display='none');
        });

        update();
    }

    function makeButton(text, fn, bg) {
        const b = document.createElement('button');
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
    const obs = new MutationObserver(() => {
        clearTimeout(obs.t);
        obs.t = setTimeout(processVideos, 250);
    });
    obs.observe(document.body, {childList:true, subtree:true});

    createMenu();
    processVideos();
})();
