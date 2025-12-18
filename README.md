# YouTube Liked Videos Manager

A **Violentmonkey userscript** that locally tracks your liked YouTube videos, add heart icons to liked video thumbnails, gives you controls to hide, dim, import, export, and manage them across YouTube.

All data is stored **locally in your browser**. Nothing is sent anywhere. No account changes.

---

## 🛠 Installation

1. Install a userscript manager
   - recommended [**Violentmonkey**](https://violentmonkey.github.io/)
2. Go to [YouTubeLikedVideosManager.user.js](https://github.com/krahsiw/youtube-liked-videos-manager/raw/refs/heads/main/YouTubeLikedVideosManager.user.js) and install the script

---

## ✨ Features

### ❤️ Liked Video Detection
- Detects liked videos across:
  - Home
  - Subscriptions
  - Search
  - History
  - Playlists
- Adds a heart overlay on the thumbnails of liked videos
- Layout-aware (grid, list, history, playlist)

---

### 🎛️ Floating Cascade Menu
A turquoise heart ♥️ fixed in the bottom-right corner.

Click to expand controls:

- ❤️‍ **Show hearts**
- 🩵 **Hide liked videos**
- 🩶 **Dim liked videos**
- 💖 **Scan “Liked Videos” playlist**
- 💗 **Import likes**
- 💞 **Export likes**
- 💔 **Clear liked index** (triple-confirmed)

All toggles persist across reloads.

---

## 📃 Liked Playlist Scan
 Initialize and populate the liked Index with this if your likes are under 5k. **If not, use Import Options**.
- Use scan to update liked index
  - **currently does not autoscroll so scroll to your desired point in the playlist before activating scan**
- Works only on:
  ```
  https://www.youtube.com/playlist?list=LL
  ```

---

## 📥 Import Options

You can populate the liked index using:

### ✔ CSV
- ***MOST RELIABLE AND RECOMMENDED FOR FIRST IMPORT***
  - tested on **45k+ likes**
  - get likes google takeout option misses

1. Go to *Your likes and dislikes on YouTube videos* [My Activity page](https://myactivity.google.com/page?utm_source=my-activity&hl=en&page=youtube_likes) and then scroll all the way to the end or run this script in your browser console to autoscroll:
   - pressing esc will stop the script prematurely
    ```js
    window.stopScrolling=false;window.addEventListener("keydown",e=>e.key==="Escape"&&(window.stopScrolling=true));(async()=>{while(!document.querySelector("div.hV1B3e > div")&&!window.stopScrolling){window.scrollTo(0,document.documentElement.scrollHeight);await new Promise(r=>setTimeout(r,50))}console.log(window.stopScrolling?"Scrolling stopped via ESC ✔":"Reached the end ✔")})();

    ``` 
2. After your reach the end, run this script in your console to get the csv file:
    ```js
    (()=>{const r=[],s=new Set();document.querySelectorAll(".xDtZAf").forEach(v=>{try{const a=v.querySelector(".QTGV3c");if(!a)return;const action=Array.from(a.childNodes).filter(n=>n.nodeType===3).map(n=>n.textContent.trim()).join(" ").toLowerCase();const l=a.querySelector("a");if(!l)return;const id=new URL(l.href).searchParams.get("v");if(!id||s.has(id))return;s.add(id);const title=l.textContent.trim()||"[deleted]";let n="[deleted]",u="[deleted]";try{const ae=v.querySelector(".SiEggd a");if(ae){n=ae.textContent.trim();u=ae.href}}catch{}r.push([action,`"${title.replaceAll('"','""')}"`,`https://youtube.com/watch?v=${id}`,`"${n.replaceAll('"','""')}"`,u])}catch{}});console.log(`Extraction complete. Total videos found: ${r.length}`);let c="action,video_title,video_link,author_name,author_link\n"+r.map(x=>x.join(",")).join("\n");const a=document.createElement("a");a.href="data:text/csv;charset=utf-8,"+encodeURIComponent(c);a.download="youtube_activity.csv";document.body.appendChild(a);a.click();a.remove();console.log("CSV downloaded ✔")})();
    ```
3. Import the csv file.

### ✔ Google Takeout

- Import Youtube `MyActivity.json` from **My Activity** in [Google Takeout](https://takeout.google.com/)
  - uses Google Takeout → My Activity → Youtube activity data
- Better for low-end PCs if they can't use CSV option as it could take a toll if likes are over 20k
- Not as reliable as CSV option
  - Google Takeout has no reliable way to get likes and dislikes
  - unfortunately misses some likes
### ✔ Script Export Imports
- Import JSON backups exported by this script

---

## 📤 Export

- Exports all liked video IDs as JSON
- Recommended before:
  - Browser resets
  - Storage clears
  - Script refactors

---

## 📦 Backup Recommendation

Export occasionally:

```
💞 Export → liked_videos.json
```

This allows easy restore if browser storage is cleared.

---

## 🔐 Privacy & Safety

- No external requests
- No analytics
- No cookies
- No account writes
- Local-only storage

---

## 🧾 License

Private / personal use. Modify freely for your own workflow.