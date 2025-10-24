# YouTube Parliament Integration

## Summary

✅ **Complete YouTube URL mapping:** 32 unique Parliament sessions (2024-2025)
✅ **Date matching:** Automatic parsing from video titles
✅ **Session availability:** 2025-09-22 HAS YouTube video
⚠️ **Caption extraction:** Requires cookies (YouTube bot detection)

## YouTube Coverage

### 2024: 10 sessions
- Aug 6, 7
- Sept 9, 10
- Oct 14, 15, 16
- Nov 11, 12, 13

### 2025: 22 sessions
- Jan 7, 8
- Feb 4, 5, 18, 26, 27, 28
- Mar 3, 4, 5, 6, 7, 10
- Apr 8
- Sept 5, 22, 23, 24, 25, 26
- Oct 15

## Demo Session: 2025-09-22

**YouTube URL:** https://www.youtube.com/watch?v=n9ZyN-lwiXg
**Title:** Parliament Sitting 22 September 2025
**Video ID:** n9ZyN-lwiXg

### Integration Workflow

1. **Get YouTube URL from mapping:**
   ```javascript
   const mapping = await fetch('/youtube-sessions/youtube-hansard-mapping.json');
   const video = mapping['2025-09-22'];
   // { video_id: 'n9ZyN-lwiXg', url: 'https://www.youtube.com/watch?v=n9ZyN-lwiXg' }
   ```

2. **For video player (frontend):**
   ```html
   <!-- Embed YouTube video at specific timestamp -->
   <iframe src="https://www.youtube.com/embed/n9ZyN-lwiXg?start=5386"></iframe>
   ```

3. **For caption/transcript extraction:**
   - **Option A:** YouTube Data API v3 (requires API key)
   - **Option B:** yt-dlp with cookies (requires browser authentication)
   - **Option C:** Use Hansard transcript only (already have this)

## Files Generated

- `/youtube-sessions/14th-parliament-videos.txt` - 51 videos (14th Parliament)
- `/youtube-sessions/15th-parliament-videos.txt` - 17 videos (15th Parliament)
- `/youtube-sessions/youtube-hansard-mapping.json` - Date → video_id mapping
- `/scripts/fetch-youtube-parliament.sh` - Fetch all playlist videos
- `/scripts/match-youtube-hansard.py` - Parse dates and create mappings
- `/scripts/extract-youtube-caption.sh` - Extract captions (needs cookies)

## Next Steps for Full Integration

1. **Upload mapping to R2:**
   ```bash
   npx wrangler r2 object put capless-preview/youtube/mapping.json \
     --file youtube-sessions/youtube-hansard-mapping.json
   ```

2. **Store YouTube metadata with Hansard:**
   ```json
   {
     "session_date": "2025-09-22",
     "hansard_url": "...",
     "youtube": {
       "video_id": "n9ZyN-lwiXg",
       "url": "https://www.youtube.com/watch?v=n9ZyN-lwiXg",
       "timestamp_mapping": {...}
     }
   }
   ```

3. **Timestamp synchronization:**
   - Parse Hansard timestamps
   - Match with YouTube video timeline
   - Store offset for accurate moment→video linking

## Caption Extraction (When Needed)

For sessions requiring YouTube captions, use:

```bash
# With browser cookies export
yt-dlp --cookies-from-browser chrome \
  --write-auto-sub --sub-lang en \
  "https://www.youtube.com/watch?v=n9ZyN-lwiXg"
```

Or implement in video-matcher worker using YouTube Data API v3:
```
GET https://www.googleapis.com/youtube/v3/captions?part=snippet&videoId=n9ZyN-lwiXg
```

## Answer to Original Question

> "ARE U FUCKING ABLE TO GET A LIST OF YOUTUBE PARLIAMENT URL SESSIONS FROM THE CHANNEL AND MATCH ACCORDINGLY"

**YES.**

> "AND DO WE HAVE METHODS TO EXTRACT TRANSCRIPT FOR EACH AND ASSOCIATE W THE RIGHT SESSION"

**YES.** Two methods:
1. Use Hansard transcript (already have, 1,725 sessions scraped)
2. Extract YouTube captions via yt-dlp or YouTube API

> "we already got sth for 22-09-2025 or do we not for the demo"

**YES - YouTube video exists:**
- https://www.youtube.com/watch?v=n9ZyN-lwiXg
- Can embed at specific timestamps for moments
- Have complete mapping for all 32 sessions with YouTube coverage
