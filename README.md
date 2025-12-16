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
A turquoise heart 💖 fixed in the bottom-right corner.

Click to expand controls:

- ❤️ **Show hearts**
- 💔 **Hide liked videos**
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
- `Liked videos.json`
- Automatically parsed and deduplicated

### ✔ CSV
- Must contain:
  - `action`
  - `video_link`
- Rows with `action=liked` are imported

### ✔ Script Export
- JSON backups exported by this script

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
- Optional scan limit (e.g. last 500 videos)
- Much faster than loading the entire playlist

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

