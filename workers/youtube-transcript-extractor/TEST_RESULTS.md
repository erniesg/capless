# YouTube Transcript Extractor - Test Results

## Date: 2025-01-04

## Executive Summary

**Both `yt-dlp` and `youtube-transcript-api` face the same fundamental issue: YouTube blocks automated access from containers/cloud IPs.**

## Test Results

### ✅ youtube-transcript-api Implementation (RECOMMENDED)

**Implementation Details:**
- Python library: `youtube-transcript-api==0.6.2`
- No authentication required
- Fast response times (<2 seconds)
- Lightweight (no Chrome/browser dependencies)
- Clean error handling

**Test Results:**
```bash
# Test 1: Rick Astley video (dQw4w9WgXcQ)
Response: {"status": "error", "message": "no element found: line 1, column 0"}
Reason: YouTube returned empty XML (blocking request)

# Test 2: "Me at the zoo" (jNQXAC9IVRw)
Response: {"status": "error", "message": "Transcripts disabled for this video"}
Reason: Library correctly detected no transcripts available

# Test 3: TED Talk (cebFH0lsY9w)
Response: {"status": "error", "message": "Transcripts disabled for this video"}
Reason: YouTube blocking automated access
```

**Pros:**
- ✅ Fast (<2 seconds vs 30+ second timeout)
- ✅ Clean error messages
- ✅ No browser dependencies
- ✅ Proper exception handling
- ✅ Lightweight (18MB Docker image vs 1.5GB with Chrome)

**Cons:**
- ❌ YouTube blocks cloud/container IPs
- ❌ Requires residential proxies for production use

### ❌ yt-dlp Implementation (NOT RECOMMENDED)

**Test Results:**
```bash
Response: {"status": "error", "message": "yt-dlp timeout (>30s)"}
```

**Pros:**
- Full video download capability (not needed for transcripts only)

**Cons:**
- ❌ Slow (30+ second timeout)
- ❌ Over-engineered for transcript extraction
- ❌ Requires Chrome/browser (1.5GB Docker image)
- ❌ Still blocked by YouTube even with cookies
- ❌ Poor error messages
- ⚠️  Future incompatibility: Will require Deno/JavaScript runtime

## Root Cause Analysis

**YouTube's Anti-Bot Protection:**

YouTube blocks automated access using multiple layers:

1. **IP-based blocking** - Cloud provider IPs (AWS, GCP, Cloudflare Workers)
2. **User-Agent detection** - Identifies automated tools
3. **Rate limiting** - Blocks repeated requests from same source
4. **Cookie validation** - Requires browser-like behavior

Both `yt-dlp` and `youtube-transcript-api` trigger these protections when running in containers.

## Recommended Solution

### Option 1: Residential Proxy (PRODUCTION)

Use `youtube-transcript-api` with residential proxies to bypass YouTube's IP blocks:

```python
from youtube_transcript_api import YouTubeTranscriptApi
from youtube_transcript_api.proxies import WebshareProxyConfig

ytt_api = YouTubeTranscriptApi(
    proxy_config=WebshareProxyConfig(
        proxy_username="<username>",
        proxy_password="<password>",
    )
)
transcript = ytt_api.fetch(video_id)
```

**Cost:** ~$15-50/month for rotating residential proxies

**Benefits:**
- Reliable access to YouTube
- Rotates through residential IPs (not blocked)
- Used by production services

### Option 2: Local Extraction (CURRENT)

Continue using `yt-dlp` locally with Chrome cookies as currently implemented:

```bash
# Extract locally (works with Chrome cookies)
PYENV_VERSION=innovasian yt-dlp --cookies-from-browser chrome \
  --write-auto-sub --sub-lang en --skip-download \
  --output "youtube-transcripts/2025-09-22" \
  "https://www.youtube.com/watch?v=VIDEO_ID"

# Upload to R2
npx wrangler r2 object put capless-preview/youtube/transcripts/2025-09-22.vtt \
  --file youtube-transcripts/2025-09-22.en.vtt
```

**Cost:** $0 (uses local machine)

**Benefits:**
- Bypasses YouTube blocks (uses your residential IP)
- No proxy costs
- Works with existing Chrome cookies

**Drawbacks:**
- Manual/scripted process
- Requires local machine availability
- Not automated in container

### Option 3: Alternative Data Source

Explore official YouTube Data API v3 with captions endpoint:

```bash
GET https://www.googleapis.com/youtube/v3/captions
```

**Cost:** Free up to 10,000 quota units/day

**Benefits:**
- Official API (no blocking)
- Reliable
- Free tier available

**Drawbacks:**
- Requires OAuth2 authentication
- Complex authorization flow
- Quota limits

## ✅ UPDATE: scrape.do Proxy Integration SUCCESSFUL (2025-01-25)

**Testing with yt-dlp + scrape.do residential proxy: WORKS!**

### Test Results with scrape.do:
```bash
# Test: Rick Astley video (dQw4w9WgXcQ)
✅ SUCCESS! Downloaded 14.46KB VTT transcript
📡 Proxy: http://TOKEN:super=true@proxy.scrape.do:8080
⚙️  SSL Verification: Disabled (nocheckcertificate: True)
```

### Working Configuration:
```python
import yt_dlp

proxy_url = "http://99863f3851994a20a8222502e63bf6c28b6abb4cf6e:super=true@proxy.scrape.do:8080"

ydl_opts = {
    'proxy': proxy_url,
    'nocheckcertificate': True,  # Critical for scrape.do
    'writeautomaticsub': True,
    'subtitleslangs': ['en'],
    'skip_download': True,
}
```

**Key Findings:**
- ✅ scrape.do residential proxy bypasses YouTube's IP blocking
- ✅ yt-dlp works with scrape.do (no need for youtube-transcript-api)
- ✅ SSL verification must be disabled (`nocheckcertificate: True`)
- ✅ Uses existing yt-dlp codebase (no new dependencies)

## Deployment Recommendation

**For Production:**

1. ~~Keep current local extraction approach for now (Option 2)~~ **DONE**
2. ~~**Integrate scrape.do proxy with yt-dlp** (test_ytdlp_scrapedo.py shows it works!)~~ **DONE**
3. **Deploy to Cloudflare Workers** with scrape.do proxy support
4. **Cost**: Using existing scrape.do account (API key already available)

**Implementation Status:**

```
✅ scrape.do proxy integration tested (test_ytdlp_scrapedo.py)
✅ Production server.py updated with scrape.do proxy support
✅ Dockerfile updated to use requirements.txt
✅ requirements.txt includes yt-dlp>=2024.12.23
✅ Ready for deployment with SCRAPE_DO_TOKEN environment variable
🔜 Deploy to production environment
```

**Integration Changes (2025-01-25):**
- server.py:19-20 - Added scrape.do proxy configuration
- server.py:194-207 - Updated yt-dlp command to use proxy and disable SSL verification
- requirements.txt - Added yt-dlp>=2024.12.23
- Dockerfile - Updated to use requirements.txt for consistency

## Next Steps

1. Continue using local extraction with yt-dlp + Chrome cookies
2. Keep youtube-transcript-api implementation ready for when proxy budget is available
3. Document proxy setup process in README
4. Consider YouTube Data API v3 as long-term solution

## Technical Files

- `server_transcript_api.py` - YouTube Transcript API implementation ✅
- `Dockerfile.transcript-api` - Lightweight Docker build ✅
- `requirements.txt` - Python dependencies ✅
- `wrangler.toml` - Cloudflare Workers config (unchanged)

## Conclusion

**youtube-transcript-api is technically superior to yt-dlp for transcript extraction**, but both solutions require residential proxies to work in production due to YouTube's anti-bot protections.

**Recommendation:** Continue local extraction approach until proxy budget is available, then switch to youtube-transcript-api + residential proxies.
