# YouTube Liked Videos Tracker

A userscript that shows which YouTube videos you've already liked—before you click them.

Adds heart badges to liked video thumbnails and lets you hide or dim them. For users tracking watch history with likes.

---
## 🛠 Installation
1. Install a userscript manager:
   - [**Tampermonkey**](https://www.tampermonkey.net/) (for Chromium browsers)
   - [**Violentmonkey**](https://violentmonkey.github.io/) (Recommended for Firefox)
2. Install the script: [YouTubeLikedVideosTracker.user.js](https://github.com/wisyntax/youtube-liked-videos-tracker/raw/refs/heads/main/YouTubeLikedVideosTracker.user.js)

---
## 📥 Initial Setup

Before the script can mark videos, you need to import your liked videos. Choose one of these methods:

### Option A: The CSV Method (**Recommended** and tested on 45k+ likes**)
This is the most reliable method.

1. Go to your [YouTube Likes and Dislikes Activity Page](https://myactivity.google.com/page?page=youtube_likes).

2. Open your browser console (`F12` → Console tab) and paste the auto-scroll script below:
   - The script optimizes page performance by hiding images and reducing animations
   - Press **Esc** to stop scrolling early if needed
   - ⚠️ **Ignore console errors** about blocked images—this is intentional and saves memory (you can filter them out in console settings)

    ```js
    window.stopScrolling=false;if(!window.scrollStyle){window.scrollStyle=document.createElement("style");window.scrollStyle.textContent=`img{display:none!important}*{font-size:15px!important;line-height:1.5!important;margin-top:0!important;margin-bottom:0!important;border:none!important;animation:none!important}.xDtZAf *{padding:0!important}.iXL6O *{height:0!important}.iXL6O svg{display:none}.MCZgpb{place-content:center;padding:5px 0px;gap:5px}.MCZgpb button,.YxbmAc button{display:flex;place-content:center;height:20px;width:10px;overflow:clip}.MCZgpb button *,.YxbmAc button *{position:absolute;top:0!important}.YxbmAc{height:35px!important}*::before,*::after{display:none!important}`;document.head.appendChild(window.scrollStyle)}document.querySelectorAll("img[src]").forEach((img)=>img.removeAttribute("src"));if(!window.cspApplied){const meta=document.createElement("meta");meta.httpEquiv="Content-Security-Policy";meta.content="img-src 'self' data: https://*.gstatic.com https://s.ytimg.com;";document.head.appendChild(meta);window.cspApplied=true;console.log("CSP Updated: Blocking i.ytimg.com while allowing UI assets.")}addEventListener("keydown",(e)=>e.key==="Escape"&&(window.stopScrolling=true));(async()=>{const endSelector=".hV1B3e:not(.Bqk8Ac) > div:not([jsaction])";let itemCount=0,loop=0;while(!window.stopScrolling){loop++;scrollTo(0,document.documentElement.scrollHeight);if(document.querySelector(endSelector)){console.clear();console.log("End of history reached ✔");break}if(loop==240){const currentItems=document.querySelectorAll(".xDtZAf").length;if(currentItems!==itemCount){console.log(`Loaded ${currentItems} items...`);itemCount=currentItems}loop=0}await new Promise((r)=>setTimeout(r,250))}if(window.stopScrolling){console.clear();console.log("User stopped script ✔")}console.log(`Total items: ${document.querySelectorAll(".xDtZAf").length}`)})();
    ```
3. Once scrolling completes, paste the extraction script below to download your CSV file:
   - This generates `youtube_activity_YYYY-MM-DD.csv` with all your activity data

    ```js
    (()=>{const totalItems=document.querySelectorAll(".xDtZAf").length;console.log(`Total items found in DOM: ${totalItems}`);const r=[],s=new Set(),actionCounts={};let duplicateCount=0,noIdCount=0;document.querySelectorAll(".xDtZAf").forEach(v=>{try{const a=v.querySelector(".QTGV3c");if(!a)return;const actionNodes=Array.from(a.childNodes).filter(n=>n.nodeType===3).map(n=>n.textContent.trim()).filter(t=>t.length>0);const action=actionNodes.join(" ").toLowerCase()||"unknown";actionCounts[action]=(actionCounts[action]||0)+1;const l=a.querySelector("a");if(!l)return;const titleText=l.textContent.trim();let id;try{id=new URL(l.href).searchParams.get("v");}catch(e){console.error("Invalid URL:",l.href);return;}if(!id){noIdCount++;const isPlaylist=l.href.includes('/playlist?list=');if(isPlaylist){console.log(`⊘ Skipped playlist: "${titleText||'[no title]'}"`);}else{console.warn("⊘ Skipped: No video ID found");console.log("  Title:",titleText||"[no title]");console.log("  Link:",l.href);}return;}if(s.has(id)){duplicateCount++;console.warn("Skipped duplicate: Video ID",id);return;}s.add(id);const title=titleText&&titleText.length>0?titleText:"[deleted or private]";let n="[deleted or private]",u="",channelId="";const ae=v.querySelector(".SiEggd a");if(ae){const authorText=ae.textContent.trim();if(authorText&&authorText.length>0){n=authorText;u=ae.href||"";const channelMatch=u.match(/\/channel\/([^?]+)/);channelId=channelMatch?channelMatch[1]:"";}}let timestamp="",date="";const timeElement=v.querySelector(".H3Q9vf");if(timeElement){const timeText=timeElement.textContent.trim();const parts=timeText.split("•");timestamp=parts[0].trim();}const dateAttr=v.getAttribute("data-date");if(dateAttr){date=dateAttr.replace(/(\d{4})(\d{2})(\d{2})$/,'$1-$2-$3');}let duration="";const durationElement=v.querySelector(".bI9urf");if(durationElement){duration=durationElement.textContent.trim();}r.push([action,`"${title.replaceAll('"','""')}"`,`https://youtube.com/watch?v=${id}`,`"${n.replaceAll('"','""')}"`,u,channelId,date,timestamp,duration]);}catch(e){console.error("Error processing video:",e);}});console.log(`Extraction complete. Total videos found: ${r.length}`);console.log("Action breakdown: "+Object.entries(actionCounts).map(([k,v])=>`${k} (${v})`).join(", "));console.log(`Items skipped (playlists/missing IDs): ${noIdCount}`);const c="action,video_title,video_link,author_name,author_link,channel_id,date,time,duration\n"+r.map(x=>x.join(",")).join("\n");const blob=new Blob([c],{type:"text/csv"});const a=document.createElement("a");a.href=URL.createObjectURL(blob);a.download=`youtube_activity_${new Date().toISOString().split('T')[0]}.csv`;document.body.appendChild(a);a.click();URL.revokeObjectURL(a.href);a.remove();console.log("CSV downloaded ✔");})();
    ```

4. Import the downloaded CSV file: Open the heart menu → **Options** → **💗 Import**

### Option B: Playlist Scan

Scan your Liked Videos playlist directly on YouTube. Quick and easy, but limited to 5,000 videos due to YouTube's playlist cap.

**Best for:**
- Initial setup with fewer than 5,000 likes
- Keeping your index updated with new likes from mobile, TV, or other browsers
- Quick maintenance scans

**How to use:**
1. Navigate to your [Liked Videos Playlist](https://www.youtube.com/playlist?list=LL)
2. Click the **💖 Scan liked playlist** button in the heart menu
3. Enter the number of videos to scan, or leave empty to scan all available
4. The script will auto-scroll and load videos until complete

<details>
<summary><b>Option C: Google Takeout (Not Recommended)</b></summary>

**⚠️ Important limitations:**
- Google Takeout no longer includes liked videos in the "YouTube and YouTube Music" export
- Takeout only exports videos logged in "My Activity"—not all liked videos are recorded there

**Steps:**
1. Go to [Google Takeout](https://takeout.google.com/)
2. Click **Deselect all**
3. Enable **My Activity**
4. Click **All activity data included**
   - Click **Deselect all**
   - Enable **YouTube**
   - Click **OK**
5. Scroll down → **Next step** → **Create export**
6. Download the export when it's ready
7. Extract and import: `MyActivity.json`

</details>

---
## ✨ Features

### ❤️ Liked Video Detection
Automatically detects and marks liked videos across YouTube with heart overlays on thumbnails.

**Where it works:**
- Home, Subscriptions, Search, History
- Channel pages and Playlists
- Shorts (grid and shelf views)
- Video end screens and autoplay suggestions

The script detects like/unlike actions in real-time and syncs across tabs.

---
### 🎛️ Floating Heart Menu

Access the script menu from the heart button in the bottom-right corner.

**Main Menu:**
- ❤️ **Show hearts** - Display heart overlays on liked videos
- 🩵 **Dim liked videos** - Reduce opacity of liked videos
- 🩶 **Hide liked videos** - Hide liked videos (disabled on Liked Videos playlist)
- 💖 **Scan liked playlist** - Update index from your Liked Videos playlist

**Options Submenu:**
- ❣️ **Highlight title** - Color liked video titles (includes color picker)
- 💙 **Opacity slider** - Adjust dimming strength (10%-90%)
- ❤️‍🔥 **Quick mode** - Faster processing, disables debounce delays (requires page reload)
- 💗 **Import likes** - Import from CSV/JSON
- 💞 **Export likes** - Export your index as JSON
- 💔 **Clear liked index** - Clear all videos from the script's index

All toggles persist across sessions and sync across tabs.

---
## 💾 Export & Backup

Click **💞 Export** in the Options submenu to download your liked videos index as a JSON file.

**When to export:**
- Before clearing browser data or reinstalling
- Before major script updates
- Periodically as a backup

You can re-import this file anytime to restore your index.

---
## 🔐 Privacy & Security

- **100% local** - Works entirely offline after installation
- **No external requests** - Never connects to external servers
- **No data collection** - No analytics, cookies, or telemetry sent anywhere
- **No account access** - Read-only, never writes to your YouTube account
- **Local storage only** - All data stays in your browser via userscript storage

Your liked videos data never leaves your device.