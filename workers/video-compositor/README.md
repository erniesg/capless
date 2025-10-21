# Capless Video Compositor Worker

**Worker 5 of 5** - Video rendering, multi-platform publishing, and storage management

## Overview

The Video Compositor Worker handles the final stage of the Capless pipeline:
- Triggering video rendering jobs on Modal (Remotion + FFmpeg)
- Tracking render progress via Durable Objects
- Publishing videos to TikTok, Instagram, and YouTube
- Managing R2 storage cleanup

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                  Video Compositor Worker                     │
├─────────────────────────────────────────────────────────────┤
│                                                               │
│  ┌──────────────┐    ┌──────────────┐    ┌──────────────┐  │
│  │ Modal Client │───▶│ Render       │───▶│ Publishers   │  │
│  │              │    │ Job Tracker  │    │ (Multi-API)  │  │
│  └──────────────┘    │ (Durable Obj)│    └──────────────┘  │
│                      └──────────────┘                        │
│                                                               │
│  ┌──────────────┐                                            │
│  │ R2 Manager   │ Storage cleanup & video hosting            │
│  └──────────────┘                                            │
│                                                               │
└─────────────────────────────────────────────────────────────┘
```

## API Endpoints

### 1. POST /api/video/compose

Trigger video rendering on Modal.

**Request:**
```json
{
  "script": "Okay so the Minister just explained...",
  "audio_url": "https://r2.dev/audio/gen_z.mp3",
  "video_url": "https://youtube.com/watch?v=abc123",
  "persona": "gen_z",
  "template": "tiktok_parliamentary",
  "effects": {
    "captions": {
      "enabled": true,
      "style": "word_by_word",
      "font_size": 48
    },
    "transitions": {
      "enabled": true,
      "type": "fade"
    },
    "overlays": {
      "persona_emoji": true,
      "progress_bar": true
    }
  },
  "webhook_url": "https://example.com/webhook",
  "webhook_events": ["completed", "failed"]
}
```

**Response:**
```json
{
  "job_id": "uuid-1234",
  "status": "rendering",
  "estimated_completion": 1729500000000,
  "modal_job_id": "modal-abc123"
}
```

**Validation:**
- `script`: Required, non-empty string
- `audio_url`: Required, valid URL
- `video_url`: Required, valid URL
- `persona`: One of: `gen_z`, `kopitiam_uncle`, `auntie`, `attenborough`
- `template`: One of: `tiktok_parliamentary`, `instagram_reels`, `youtube_shorts`

### 2. GET /api/video/status/:job_id

Get render job status and progress.

**Response:**
```json
{
  "job_id": "uuid-1234",
  "status": "rendering",
  "progress": 65,
  "video_url": null,
  "preview_url": "https://r2.dev/preview.gif",
  "created_at": 1729499900000,
  "updated_at": 1729499965000
}
```

**Status values:**
- `queued`: Job waiting to start
- `rendering`: Job in progress
- `completed`: Video ready (includes `video_url`)
- `failed`: Job failed (includes `error` field)

**Progress:**
- 0-100 percentage
- Preview URL available after 50% progress

### 3. POST /api/video/publish

Publish video to multiple platforms.

**Request:**
```json
{
  "video_url": "https://r2.dev/videos/final.mp4",
  "platforms": ["tiktok", "instagram", "youtube"],
  "schedule": 1729600000000,
  "metadata": {
    "title": "Parliament Explained: Healthcare",
    "description": "Minister explains insurance costs",
    "hashtags": ["Parliament", "Singapore", "Healthcare", "Capless"]
  }
}
```

**Response:**
```json
{
  "published": 2,
  "failed": 1,
  "results": [
    {
      "platform": "tiktok",
      "success": true,
      "url": "https://www.tiktok.com/@capless/video/123",
      "post_id": "123"
    },
    {
      "platform": "instagram",
      "success": true,
      "url": "https://www.instagram.com/p/xyz",
      "post_id": "xyz"
    },
    {
      "platform": "youtube",
      "success": false,
      "error": "Quota exceeded"
    }
  ]
}
```

**Scheduled Publishing:**
```json
{
  "scheduled": true,
  "publish_at": 1729600000000,
  "job_id": "schedule-uuid"
}
```

**Platform-specific notes:**
- **TikTok**: Max 2200 char caption, auto-formats hashtags
- **Instagram**: Reels only, requires Business Account
- **YouTube**: Shorts format, auto-adds `#Shorts` tag

### 4. POST /api/video/cleanup

Clean up old videos from R2 storage.

**Request:**
```json
{
  "older_than": 1729000000000,
  "pattern": "renders/*",
  "dry_run": false
}
```

**Response:**
```json
{
  "deleted_count": 15,
  "freed_space_mb": 250.5,
  "deleted_files": [
    "renders/job-123.mp4",
    "renders/job-124.mp4",
    "..."
  ]
}
```

**Dry Run Mode:**
```json
{
  "deleted_count": 0,
  "freed_space_mb": 0,
  "deleted_files": [],
  "would_delete_count": 15
}
```

**Cleanup Patterns:**
- `renders/*`: All rendered videos
- `videos/temp/*`: Temporary files
- `videos/2024/*`: Videos from 2024

### 5. GET /health

Health check endpoint.

**Response:**
```json
{
  "status": "healthy",
  "service": "capless-video-compositor",
  "timestamp": "2025-10-21T10:00:00Z",
  "modal_available": true,
  "r2_available": true,
  "tiktok_api_available": true,
  "instagram_api_available": true,
  "youtube_api_available": true
}
```

**Status values:**
- `healthy`: All services operational
- `degraded`: Some services unavailable
- `unhealthy`: Critical services down

## State Management

### Durable Object: RenderJobTracker

Manages video render job state with real-time WebSocket updates.

**Internal Endpoints:**
- `POST /initialize`: Create new job
- `GET /state`: Get current state
- `POST /update`: Update job state
- `POST /progress`: Update progress (0-100)
- `POST /complete`: Mark as completed
- `POST /fail`: Mark as failed
- `WebSocket`: Real-time progress updates

**State Schema:**
```typescript
{
  job_id: string;
  status: 'queued' | 'rendering' | 'completed' | 'failed';
  modal_job_id: string;
  progress: number;
  video_url?: string;
  preview_url?: string;
  error?: string;
  retry_count: number;
  created_at: number;
  updated_at: number;
  metadata?: {
    script: string;
    audio_url: string;
    video_url: string;
    persona: string;
    template: string;
  };
}
```

## Configuration

### Environment Variables

Set via `wrangler.toml`:

```toml
[vars]
ENVIRONMENT = "production"
MODAL_ENDPOINT = "https://api.modal.com/v1"
MODAL_POLL_INTERVAL_MS = 10000
MODAL_MAX_RETRIES = 3
MODAL_TIMEOUT_MS = 300000
R2_CLEANUP_DAYS = 7
R2_PUBLIC_URL = "https://pub-capless.r2.dev"
```

### Secrets

Set via `wrangler secret put`:

```bash
wrangler secret put MODAL_API_KEY
wrangler secret put TIKTOK_ACCESS_TOKEN
wrangler secret put INSTAGRAM_ACCESS_TOKEN
wrangler secret put YOUTUBE_API_KEY
wrangler secret put UPSTASH_REDIS_REST_URL
wrangler secret put UPSTASH_REDIS_REST_TOKEN
```

### Resource Bindings

**R2 Bucket:**
```toml
[[r2_buckets]]
binding = "R2"
bucket_name = "capless"
```

**Durable Objects:**
```toml
[[durable_objects.bindings]]
name = "RENDER_JOB_TRACKER"
class_name = "RenderJobTracker"
```

## Development

### Install Dependencies

```bash
npm install
```

### Run Tests

```bash
# All tests
npm test

# Unit tests only
npm run test:unit

# Integration tests
npm run test:integration

# With coverage
npm run test:coverage
```

### Local Development

```bash
# Copy environment template
cp .dev.vars.example .dev.vars

# Edit with your test credentials
nano .dev.vars

# Start dev server
npm run dev

# Worker available at http://localhost:8787
```

### Deploy

```bash
# Deploy to production
npm run deploy

# Deploy to staging
wrangler deploy --env staging
```

## Testing

### Unit Tests

24 unit tests covering:
- Modal API client (7 tests)
- Platform publishers (7 tests)
- R2 storage manager (10 tests)

**Run:**
```bash
npm run test:unit
```

### Integration Tests

See `/tests/integration/video-compositor.spec.ts` for full test suite.

**Run:**
```bash
# Start dev server in one terminal
npm run dev

# Run integration tests in another terminal
cd ../../
npm run test:integration -- video-compositor
```

**Test Coverage:**
- Video composition (6 tests)
- Status tracking (5 tests)
- Multi-platform publishing (7 tests)
- Storage management (3 tests)
- Error handling (2 tests)
- Performance (2 tests)
- Webhooks (1 test)
- Health checks (3 tests)

## Error Handling

### Common Errors

**400 Bad Request:**
```json
{
  "error": "Validation error",
  "details": {
    "field": "script",
    "issue": "Required"
  }
}
```

**404 Not Found:**
```json
{
  "error": "Job not found"
}
```

**500 Internal Server Error:**
```json
{
  "error": "Failed to trigger render",
  "details": "Modal API error: 500 - Internal server error"
}
```

### Retry Logic

- **Modal API**: 3 retries with exponential backoff
- **Platform APIs**: No automatic retry (fails gracefully)
- **R2 Operations**: Built-in retry via SDK

### Timeout Configuration

- **Modal polling**: 10 seconds interval
- **Modal timeout**: 5 minutes total
- **Platform API**: 30 seconds per request

## Performance

### Metrics

- **Render time**: 30-180 seconds (Modal-dependent)
- **Publish time**: 15-30 seconds (parallel)
- **Cleanup time**: <5 seconds for 100 files

### Resource Profiles

- **CPU**: Low (mostly waiting on APIs)
- **Memory**: 1GB (downloading large videos)
- **Duration**: 30-300 seconds per request
- **Cost**: ~$0.50 per video (Modal rendering)

### Optimization

- **Parallel publishing**: TikTok + Instagram + YouTube simultaneously
- **Background polling**: Non-blocking Modal status checks
- **WebSocket updates**: Real-time progress for clients
- **R2 direct access**: No proxy overhead

## Modal Integration

### Trigger Render

```typescript
POST https://api.modal.com/v1/render/video
Authorization: Bearer <MODAL_API_KEY>

{
  "script": "...",
  "audio_url": "...",
  "video_url": "...",
  "persona": "gen_z",
  "template": "tiktok_parliamentary",
  "effects": { ... }
}
```

### Get Status

```typescript
GET https://api.modal.com/v1/render/status/{job_id}
Authorization: Bearer <MODAL_API_KEY>

Response:
{
  "status": "running",
  "progress": 50,
  "video_url": null
}
```

### Status Mapping

| Modal Status | Our Status |
|--------------|------------|
| `pending`, `queued` | `queued` |
| `running`, `processing` | `rendering` |
| `success`, `completed` | `completed` |
| Others | `failed` |

## Platform Publishing

### TikTok API

**Endpoint:** `https://open-api.tiktok.com/share/video/upload/`

**Requirements:**
- Video format: MP4
- Max duration: 60 seconds
- Caption limit: 2200 characters

### Instagram Graph API

**Endpoint:** `https://graph.instagram.com/v18.0`

**Requirements:**
- Business Account required
- Reels format (9:16 aspect ratio)
- Max duration: 90 seconds

**Process:**
1. Get Instagram Business Account ID
2. Create media container
3. Publish media container
4. Get permalink

### YouTube Data API

**Endpoint:** `https://www.googleapis.com/youtube/v3`

**Requirements:**
- Shorts format (vertical video)
- Max duration: 60 seconds
- Title limit: 100 characters
- Description limit: 5000 characters

**Auto-formatting:**
- Adds `#Shorts` tag automatically
- Converts hashtags to proper format

## Storage Management

### R2 Bucket Structure

```
capless/
├── videos/
│   ├── renders/
│   │   └── job_*.mp4          # Rendered videos (7 day retention)
│   ├── published/
│   │   └── platform_*.mp4     # Platform-specific versions
│   └── temp/
│       └── download_*.mp4     # Temporary downloads (immediate cleanup)
```

### Cleanup Strategy

**Automatic cleanup:**
- Renders: 7 days retention
- Temp files: Immediate after use
- Published: 30 days retention

**Manual cleanup:**
```bash
curl -X POST http://localhost:8787/api/video/cleanup \
  -H "Content-Type: application/json" \
  -d '{
    "older_than": 1729000000000,
    "pattern": "renders/*",
    "dry_run": true
  }'
```

## Monitoring

### Logs

```bash
# Tail worker logs
wrangler tail

# Filter by status
wrangler tail --status error

# Filter by method
wrangler tail --method POST
```

### Metrics

Access via Cloudflare Dashboard:
- Request count
- Error rate
- Response time
- Durable Object operations
- R2 storage usage

### Alerts

Set up alerts for:
- Error rate > 5%
- Modal API timeout
- Platform API failures
- R2 storage quota

## Troubleshooting

### Modal Jobs Timing Out

**Symptom:** Jobs stuck in "rendering" status

**Solutions:**
- Check Modal API key validity
- Verify Modal endpoint URL
- Increase `MODAL_TIMEOUT_MS`
- Check Modal dashboard for job status

### Platform Publishing Failures

**TikTok:**
- Verify access token not expired
- Check video format (MP4)
- Ensure caption under 2200 chars

**Instagram:**
- Verify Business Account connected
- Check Reels requirements (9:16 ratio)
- Token refresh needed every 60 days

**YouTube:**
- Check API quota remaining
- Verify OAuth2 credentials
- Ensure video < 60 seconds

### R2 Storage Issues

**Upload failures:**
- Check R2 bucket permissions
- Verify bucket name correct
- Check file size limits

**Cleanup not working:**
- Verify pattern syntax
- Check `older_than` timestamp
- Review R2 list permissions

## Production Checklist

- [ ] Set all secrets via `wrangler secret put`
- [ ] Configure R2 bucket with CORS
- [ ] Set up Modal API account and endpoints
- [ ] Obtain platform API credentials:
  - [ ] TikTok Developer account + access token
  - [ ] Instagram Business Account + Graph API token
  - [ ] YouTube Data API key + OAuth2
- [ ] Configure Durable Objects namespace
- [ ] Set up monitoring and alerts
- [ ] Test end-to-end pipeline
- [ ] Configure cleanup cron job
- [ ] Set up error tracking (Sentry)
- [ ] Document API rate limits

## Architecture Decisions

### Why Modal for Rendering?

- Serverless GPU access for video processing
- No infrastructure management
- Pay-per-use pricing
- Remotion + FFmpeg integration

### Why Durable Objects for State?

- Strong consistency for job tracking
- WebSocket support for real-time updates
- No external database needed
- Automatic regional replication

### Why Single Worker for All Publishing?

- **Workflow coupling**: Publishing is one atomic operation
- **Parallel execution**: Publish to all platforms simultaneously
- **Error handling**: Unified retry logic and error reporting
- **Cost efficiency**: Single worker deployment vs 3 separate services

### Why R2 for Storage?

- Zero egress fees (Cloudflare CDN)
- S3-compatible API
- Global distribution
- Cost-effective for video files

## License

MIT

## Support

For issues, contact: erniesg@gmail.com

## Related Workers

1. **Ingestion Worker** - Parse Hansard transcripts
2. **Video Matcher Worker** - Find YouTube videos
3. **Moments Worker** - Extract viral moments
4. **Asset Generator Worker** - Generate scripts + audio
5. **Video Compositor Worker** - This worker

See `/ARCHITECTURE.md` for complete system design.
