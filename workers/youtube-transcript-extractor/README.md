# YouTube Transcript Extractor Container

Cloudflare Container that extracts YouTube video transcripts using yt-dlp.

## Local Development

### Build and Run
```bash
docker build -t yt-dlp-extractor .
docker run -p 8080:8080 yt-dlp-extractor
```

### Test Extraction
```bash
# Health check
curl http://localhost:8080/health

# Extract transcript
curl -X POST http://localhost:8080/extract \
  -H "Content-Type: application/json" \
  -d '{"video_id":"n9ZyN-lwiXg","date":"2025-09-22"}'
```

## Deploy to Cloudflare

```bash
npx wrangler deploy
```

## API Endpoints

### GET /health
Health check endpoint

**Response:**
```json
{
  "status": "healthy",
  "service": "youtube-transcript-extractor",
  "version": "1.0.0"
}
```

### POST /extract
Extract YouTube video transcript

**Request:**
```json
{
  "video_id": "n9ZyN-lwiXg",
  "date": "2025-09-22"
}
```

**Response (Success):**
```json
{
  "status": "success",
  "video_id": "n9ZyN-lwiXg",
  "date": "2025-09-22",
  "transcript_length": 45123,
  "transcript_path": "youtube/transcripts/2025-09-22.vtt",
  "uploaded_to_r2": true
}
```

**Response (Error):**
```json
{
  "status": "error",
  "message": "No captions found for this video",
  "video_id": "n9ZyN-lwiXg",
  "date": "2025-09-22"
}
```

## Environment Variables

### Server Configuration
- `PORT`: HTTP server port (default: 8080)

### R2 Storage Configuration
Configure these environment variables to enable automatic uploads to Cloudflare R2:

- `R2_ACCOUNT_ID`: Cloudflare account ID
- `R2_ACCESS_KEY_ID`: R2 access key ID
- `R2_SECRET_ACCESS_KEY`: R2 secret access key
- `R2_BUCKET_NAME`: R2 bucket name (default: `capless-preview`)

If R2 credentials are not configured, transcripts will still be extracted but won't be uploaded. The container will log a warning and return `uploaded_to_r2: false` in the response.

## YouTube Authentication

**Important Limitation:** YouTube requires authentication to extract transcripts. The container includes automatic retry with cookie refresh to handle authentication errors.

### Automatic Cookie Refresh

The container automatically handles authentication failures by:
1. **Detecting auth errors** - Keywords: "Sign in to confirm", "not a bot", "cookies are no longer valid"
2. **Extracting fresh cookies** - Uses Chrome browser via `yt-dlp --cookies-from-browser chrome`
3. **Retrying extraction** - Max 2 attempts with fresh cookies between retries

**Requirements:**
- Chrome browser installed in container (included in Dockerfile)
- Chrome must be logged into YouTube (for cookie extraction)

**How it works:**
```
Attempt 1: Use existing cookies → Auth error detected
           ↓
Extract fresh cookies from Chrome → Copy to /app/cookies.txt
           ↓
Attempt 2: Retry with fresh cookies → Success
```

### Local Development (Manual Cookies)
Alternatively, mount YouTube cookies as `/app/cookies.txt`:
```bash
# Export cookies from Chrome
yt-dlp --cookies-from-browser chrome --cookies /tmp/youtube.txt --skip-download https://youtube.com/watch?v=VIDEO_ID

# Run container with cookies mounted
docker run -p 8080:8080 -v /tmp/youtube.txt:/app/cookies.txt yt-dlp-extractor
```

**Note:** YouTube rotates cookies frequently (30-60 min) as a security measure. The automatic retry mechanism handles this transparently.

### Production Deployment (Alternative Options)
For scenarios where Chrome browser is not available:
1. **YouTube Data API v3** - Use official API for video search/metadata (requires API key)
2. **Cookie refresh service** - External service for automated cookie rotation
3. **YouTube Premium** - More stable auth, fewer rate limits

## Cost Estimate

- Extraction time: ~10 seconds per video
- Cost per video: ~$0.0002
- Monthly cost (1 video/day): ~$0.006
