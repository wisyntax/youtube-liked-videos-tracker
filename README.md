# YouTube Liked Videos Checker & Manager

A **Violentmonkey userscript** that locally tracks your liked YouTube videos and gives you advanced controls to hide, dim, mark, import, export, and manage them across YouTube.

All data is stored **locally in your browser**. Nothing is sent anywhere. No account changes.

---

## 📄 Script File

The full userscript lives here:

```
youtube-liked-manager.user.js
```

This file is the **single source of truth**.

Versioning is controlled via the userscript header:

```js
// @version 1.3.0
```

Git tags and commits mirror this version.

---

## ✨ Features

### ❤️ Liked Video Detection
- Detects liked videos across:
  - Home
  - Subscriptions
  - Search
  - History
  - Playlists
- Adds a heart overlay directly on the **thumbnail itself**
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

## 📥 Import Options

You can populate the liked index using:

### ✔ Google Takeout
- Import Youtube `MyActivity.json` from `My Activity` in [Google Takeout](https://takeout.google.com/)
- Automatically parsed and deduplicated
- Not as reliable as CSV option

### ✔ CSV
- ***MOST RELIABLE AND RECOMMENDED FOR FIRST IMPORT***
  - get likes google takeout misses
- Must contain:
  - `action`
  - `video_link`
- Rows with `action=liked` are imported
- Go to [Your likes and dislikes on YouTube videos](https://myactivity.google.com/page?utm_source=my-activity&hl=en&page=youtube_likes) My Activity page and then middle click empty space, leave it scrolling down to make it hit the bottom and then run this in the browser console to get the CSV file.
  ```
  (() => {
    const videos = document.querySelectorAll(".xDtZAf");
    const rows = [];
    const seen = new Set();

    videos.forEach(video => {
        try {
            const actionElem = video.querySelector(".QTGV3c");
            if (!actionElem) return;

            // Grab only the text node directly inside .QTGV3c (not inside <a>)
            const action = Array.from(actionElem.childNodes)
                                .filter(n => n.nodeType === Node.TEXT_NODE)
                                .map(n => n.textContent.trim())
                                .join(" ")
                                .toLowerCase(); // "liked" or "disliked"

            const linkElem = actionElem.querySelector("a");
            if (!linkElem) return;

            const videoID = new URL(linkElem.href).searchParams.get("v");
            if (!videoID || seen.has(videoID)) return;
            seen.add(videoID);

            const title = linkElem.textContent.trim() || "[deleted]";

            let authorName = "[deleted]";
            let authorURL = "[deleted]";
            try {
                const authorElem = video.querySelector(".SiEggd a");
                if (authorElem) {
                    authorName = authorElem.textContent.trim();
                    authorURL = authorElem.href;
                }
            } catch {}

            rows.push([
                action, // now clean
                `"${title.replaceAll('"','""')}"`,
                `https://youtube.com/watch?v=${videoID}`,
                `"${authorName.replaceAll('"','""')}"`,
                authorURL
            ]);

        } catch (e) {}
    });

    console.log(`Extraction complete. Total videos found: ${rows.length}`);

    // Build CSV
    let csv = "action,video_title,video_link,author_name,author_link\n";
    csv += rows.map(r => r.join(",")).join("\n");

    // Download CSV
    const a = document.createElement("a");
    a.href = "data:text/csv;charset=utf-8," + encodeURIComponent(csv);
    a.download = "youtube_activity.csv";
    document.body.appendChild(a);
    a.click();
    a.remove();

    console.log("CSV downloaded ✔");
  })();
  ```
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

## 📃 Playlist Scan

- Works on:
  ```
  https://www.youtube.com/playlist?list=LL
  ```
- Scroll to your desired point of videos in the playlist before activating scan
- Optional scan limit (e.g. last 500 videos)

---

## 🧠 How It Works (Technical Overview)

- Extracts video IDs from:
  - Thumbnails
  - Watch links
  - Shorts
- Stores IDs in a local `Set` via `GM_setValue`
- Uses a `MutationObserver` for infinite scrolling
- Dynamically resolves correct thumbnail containers
- Avoids interfering with YouTube’s native UI

---

## 🛠 Installation

1. Install **Violentmonkey**
2. Create a new userscript
3. Paste the contents of:
```
youtube-liked-manager.user.js
```
4. Save and open YouTube

---

## 🔄 Development & Versioning

Recommended workflow:

```bash
# after updating the script
git add youtube-liked-manager.user.js
git commit -m "v1.3.1 Short description"
git push
```

Or faster:

```bash
git commit -am "v1.3.1 Short description"
git push
```

Current version history is tracked via Git commits.

---

## 🔐 Privacy & Safety

- No external requests
- No analytics
- No cookies
- No account writes
- Local-only storage

---

## 📦 Backup Recommendation

Export occasionally:

```
💞 Export → liked_videos.json
```

This allows easy restore if browser storage is cleared.

---

## 🧾 License

Private / personal use. Modify freely for your own workflow.

