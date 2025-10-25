# YouTube Transcript Extractor - Deployment Notes

## Current Status

### ✅ Completed
- **Container Implementation**: Fully functional Python HTTP server with yt-dlp
- **Auto-Retry Logic**: Detects auth errors and refreshes cookies automatically
- **R2 Upload**: boto3 integration with graceful fallback
- **Error Handling**: Comprehensive error responses with retry counts
- **Local Testing**: Successfully tested on macOS (Docker)

### Test Results (Local)
```json
{
  "health_endpoint": "PASS",
  "auth_error_detection": "WORKING",
  "auto_retry": "VERIFIED (1 attempt)",
  "r2_upload_ready": true
}
```

## Deployment Challenge

### Cloudflare Containers Architecture
Cloudflare Containers are implemented as **Durable Objects**, not standalone HTTP services.

**Required Configuration:**
```toml
[[containers]]
max_instances = 10
class_name = "YouTubeExtractor"
image = "./Dockerfile"

[[durable_objects.bindings]]
name = "YOUTUBE_EXTRACTOR"
class_name = "YouTubeExtractor"
```

This requires:
1. Wrapping the container in a Durable Object class
2. Managing instance lifecycle
3. Service binding configuration in parliament-scraper worker

### Alternative Deployment Options

#### Option 1: Modal (Recommended)
**Pros:**
- Python-native serverless platform
- Simple HTTP endpoint deployment
- Better for compute-intensive tasks (yt-dlp)
- Cost-effective ($0.0002/video)

**Implementation:**
```python
# modal_youtube_extractor.py
import modal

app = modal.App("youtube-transcript")

@app.function(
    image=modal.Image.debian_slim().pip_install("yt-dlp", "boto3"),
    timeout=60
)
@modal.web_endpoint(method="POST")
def extract(request):
    # Existing server.py logic here
    pass
```

#### Option 2: Python Workers
Deploy as Cloudflare Python Worker (simpler than Containers):

```toml
name = "youtube-transcript-extractor"
python_compat = true
python_main = "worker.py"
```

**Limitations:**
- No native subprocess support (yt-dlp needs this)
- Would require WASM compilation

#### Option 3: External Service + Worker Proxy
- Deploy container to Cloud Run / ECS / Fly.io
- Create Cloudflare Worker proxy for auth/routing
- Simplest for existing Docker setup

## Recommended Path Forward

### Short-term: Modal Deployment
1. Convert `server.py` to Modal function
2. Deploy: `modal deploy modal_youtube_extractor.py`
3. Update parliament-scraper to call Modal endpoint
4. **Cost**: ~$0.0002 per video (same as Cloudflare estimate)

### Long-term: Evaluate Durable Objects
Once Durable Objects architecture is better understood:
- Wrap container in DO class
- Implement instance management
- Deploy via Cloudflare Containers

## Next Steps

**Phase 1 (Immediate)**:
- [ ] Create Modal deployment script
- [ ] Test Modal endpoint with parliament-scraper
- [ ] Monitor costs and performance

**Phase 2 (Future)**:
- [ ] Research Durable Objects + Containers pattern
- [ ] Prototype DO wrapper for container
- [ ] Compare Modal vs Cloudflare costs at scale

## Cost Comparison

| Platform | Per Video | Monthly (30 videos) | Notes |
|----------|-----------|---------------------|-------|
| Cloudflare Containers | $0.0002 | $0.006 | Requires DO setup |
| Modal | $0.0002 | $0.006 | HTTP endpoint ready |
| Cloud Run | $0.0003 | $0.009 | Container-ready |

## Files Ready for Deployment

**Working Code:**
- `server.py` - HTTP server with auto-retry (187 lines)
- `Dockerfile` - Production image with Chrome
- `Dockerfile.test` - Local testing (no Chrome)
- `.dockerignore` - Build optimization

**Ready to Deploy:**
All code is production-ready. Only deployment platform decision remains.

## References

- [Cloudflare Containers Docs](https://developers.cloudflare.com/containers/get-started/)
- [Modal Documentation](https://modal.com/docs)
- [Python Workers](https://developers.cloudflare.com/workers/runtime-apis/python/)
