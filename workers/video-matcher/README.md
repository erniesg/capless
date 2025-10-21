# Capless Video Matcher Worker

Cloudflare Worker that matches Hansard parliamentary transcripts with YouTube videos using the YouTube Data API v3.

## Features

- **Intelligent Video Matching**: Matches sitting dates to YouTube parliamentary videos using multiple criteria
- **Confidence Scoring**: 0-10 score based on date match, keywords, duration, and livestream status
- **Timestamp Extraction**: Finds specific moments within videos using descriptions or approximate times
- **Redis Caching**: 7-day cache for frequently accessed matches
- **R2 Storage**: Persistent storage of match results
- **Rate Limit Handling**: Graceful handling of YouTube API quota limits
- **Comprehensive Error Handling**: Detailed error responses with actionable suggestions

## Architecture

### Tech Stack
- **Runtime**: Cloudflare Workers (edge compute)
- **Framework**: Hono (lightweight web framework)
- **API**: YouTube Data API v3
- **Cache**: Upstash Redis (serverless)
- **Storage**: Cloudflare R2 (object storage)
- **Language**: TypeScript

### Data Flow

```
Request → Check Cache → Check R2 → YouTube API → Store Results → Response
            ↓ HIT           ↓ HIT         ↓ MISS        ↓
          Return         Return      Process & Score   Cache + Store
```

## API Endpoints

### 1. Match Video to Transcript

**POST** `/api/video/match`

Finds the best matching YouTube video for a parliamentary sitting date.

**Request Body:**
```json
{
  "transcript_id": "hansard-2024-07-02",
  "sitting_date": "02-07-2024",
  "speakers": ["Ms Rahayu Mahzam", "Mr Yip Hon Weng"],
  "youtube_channel_id": "UCq9h3I2kQQCLb7snx_X8zSw"
}
```

**Required Fields:**
- `transcript_id`: Unique identifier for the Hansard transcript
- `sitting_date`: Date in **DD-MM-YYYY** format (e.g., "02-07-2024")

**Optional Fields:**
- `speakers`: Array of speaker names to help matching
- `youtube_channel_id`: Override default channel (defaults to Singapore MDDI)

**Response (200 OK):**
```json
{
  "video_id": "dQw4w9WgXcQ",
  "video_url": "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
  "title": "Parliament Sitting - 2 July 2024",
  "duration": 9000,
  "publish_date": "2024-07-02T10:00:00Z",
  "confidence_score": 9.5,
  "match_criteria": [
    "date_match",
    "title_keywords_match",
    "duration_appropriate",
    "is_livestream"
  ],
  "channel_id": "UCq9h3I2kQQCLb7snx_X8zSw",
  "has_transcript": false,
  "metadata": {
    "description": "Singapore Parliament session...",
    "thumbnail_url": "https://img.youtube.com/vi/dQw4w9WgXcQ/maxresdefault.jpg"
  },
  "cached": false,
  "from_storage": false
}
```

**Confidence Score Breakdown:**
- **9-10**: Excellent match (exact date + keywords + livestream)
- **7-8**: Good match (exact date + keywords OR near date + all factors)
- **5-6**: Fair match (near date + some keywords)
- **0-4**: Poor match (rejected, returns 404)

### 2. Find Timestamp in Video

**POST** `/api/video/find-timestamp`

Locates a specific quote or moment within a video.

**Request Body:**
```json
{
  "video_id": "dQw4w9WgXcQ",
  "quote_text": "consequences of a knot that insurers find themselves caught in",
  "speaker": "Ms Rahayu Mahzam",
  "approximate_time": "2:30 PM"
}
```

**Required Fields:**
- `video_id`: YouTube video ID
- `quote_text`: The quote or topic to find

**Optional Fields:**
- `speaker`: Speaker name to help matching
- `approximate_time`: Time from Hansard (format: "HH:MM AM/PM")

**Response (200 OK):**
```json
{
  "video_id": "dQw4w9WgXcQ",
  "start_timestamp": 1234,
  "end_timestamp": 1264,
  "segment_url": "https://www.youtube.com/watch?v=dQw4w9WgXcQ&t=1234s",
  "confidence": 8,
  "method": "description",
  "matched_text": "Minister discusses healthcare insurance"
}
```

**Timestamp Methods:**
- **`description`**: Found in video description timestamps (confidence: 8-10)
- **`approximate`**: Calculated from Hansard time (confidence: 4-6)
- **`fallback`**: Start of video (confidence: 1-2)

### 3. Get Cached Match

**GET** `/api/video/match/:transcript_id`

Retrieves a previously matched video from cache or storage.

**Response (200 OK):**
```json
{
  "video_id": "dQw4w9WgXcQ",
  "video_url": "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
  "title": "Parliament Sitting - 2 July 2024",
  "confidence_score": 9.5,
  "cached": true
}
```

**Response (404 Not Found):**
```json
{
  "error": "No match found for this transcript",
  "transcript_id": "hansard-2024-12-31"
}
```

### 4. Health Check

**GET** `/health`

Returns service health status.

**Response (200 OK):**
```json
{
  "status": "healthy",
  "service": "capless-video-matcher",
  "version": "1.0.0",
  "timestamp": "2025-01-20T10:30:00Z"
}
```

## Error Responses

### 400 Bad Request - Invalid Date Format
```json
{
  "error": "Invalid date format",
  "expected": "DD-MM-YYYY",
  "received": "2024-07-02"
}
```

### 404 Not Found - No Match
```json
{
  "error": "No matching video found",
  "code": "NO_MATCH_FOUND",
  "suggestion": "Try adjusting the sitting date or check if the video exists on YouTube"
}
```

### 429 Rate Limit Exceeded
```json
{
  "error": "YouTube API quota exceeded",
  "code": "RATE_LIMIT_ERROR",
  "retry_after": "3600"
}
```

### 503 Service Unavailable - YouTube API Error
```json
{
  "error": "YouTube API error: ...",
  "code": "YOUTUBE_API_ERROR"
}
```

## Setup & Deployment

### Prerequisites

1. **Cloudflare Account**
   - Sign up at [dash.cloudflare.com](https://dash.cloudflare.com)
   - Install Wrangler: `npm install -g wrangler`
   - Login: `wrangler login`

2. **YouTube Data API v3 Key**
   - Go to [Google Cloud Console](https://console.cloud.google.com)
   - Create a new project or select existing
   - Enable "YouTube Data API v3"
   - Create credentials → API Key
   - Copy the API key (starts with `AIza...`)

3. **Upstash Redis**
   - Sign up at [console.upstash.com](https://console.upstash.com)
   - Create a Redis database (free tier available)
   - Copy REST URL and REST token

4. **Cloudflare R2 Bucket**
   - Create R2 bucket: `wrangler r2 bucket create capless`
   - Verify: `wrangler r2 bucket list`

### Installation

```bash
# Clone repository
cd capless/workers/video-matcher

# Install dependencies
npm install

# Set up secrets
wrangler secret put YOUTUBE_API_KEY
# Paste your YouTube API key

wrangler secret put UPSTASH_REDIS_REST_URL
# Paste your Upstash Redis URL

wrangler secret put UPSTASH_REDIS_REST_TOKEN
# Paste your Upstash Redis token
```

### Local Development

```bash
# Create .dev.vars file for local testing
cat > .dev.vars << EOF
YOUTUBE_API_KEY=AIza...
UPSTASH_REDIS_REST_URL=https://xxx.upstash.io
UPSTASH_REDIS_REST_TOKEN=AYN...
EOF

# Start local development server
npm run dev

# Test locally
curl -X POST http://localhost:8787/api/video/match \
  -H "Content-Type: application/json" \
  -d '{
    "transcript_id": "test-001",
    "sitting_date": "02-07-2024"
  }'
```

### Running Tests

```bash
# Run unit tests
npm test

# Run tests with coverage
npm run test:coverage

# Run integration tests (requires API credentials)
YOUTUBE_API_KEY=AIza... npm test
```

### Deployment

```bash
# Deploy to production
npm run deploy

# Your worker will be available at:
# https://capless-video-matcher.YOUR_SUBDOMAIN.workers.dev
```

## YouTube API Setup Guide

### Step 1: Create Google Cloud Project

1. Go to [Google Cloud Console](https://console.cloud.google.com)
2. Click "Select a project" → "New Project"
3. Enter project name: "Capless Video Matcher"
4. Click "Create"

### Step 2: Enable YouTube Data API v3

1. In the Cloud Console, go to "APIs & Services" → "Library"
2. Search for "YouTube Data API v3"
3. Click on it and press "Enable"

### Step 3: Create API Key

1. Go to "APIs & Services" → "Credentials"
2. Click "Create Credentials" → "API Key"
3. Copy the generated API key
4. (Optional) Click "Restrict Key":
   - Set "Application restrictions" to "HTTP referrers" or "IP addresses"
   - Set "API restrictions" to "Restrict key" → Select "YouTube Data API v3"

### Step 4: Monitor Quota Usage

1. Go to "APIs & Services" → "Dashboard"
2. Click on "YouTube Data API v3"
3. View "Quotas" tab to monitor usage
4. Default quota: **10,000 units/day**
5. Quota costs:
   - Search: 100 units per request
   - Videos.list: 1 unit per request
   - Total per match: ~101 units
   - Daily capacity: ~99 matches

### Quota Optimization Tips

- **Enable caching**: 7-day cache reduces API calls by 90%+
- **Use R2 storage**: Persistent matches survive cache expiration
- **Batch requests**: Process multiple transcripts in off-peak hours
- **Monitor usage**: Set up alerts in Google Cloud Console

## Configuration

### Environment Variables

Set in `wrangler.toml` [vars] section:

```toml
YOUTUBE_CHANNEL_ID = "UCq9h3I2kQQCLb7snx_X8zSw"  # Singapore MDDI
CACHE_TTL_SECONDS = "604800"  # 7 days
```

### Secrets

Set with `wrangler secret put SECRET_NAME`:

- `YOUTUBE_API_KEY`: YouTube Data API v3 key
- `UPSTASH_REDIS_REST_URL`: Upstash Redis URL
- `UPSTASH_REDIS_REST_TOKEN`: Upstash Redis token

## Performance

- **Cold start**: ~50ms (Cloudflare Workers)
- **Cache hit**: ~10-20ms (Redis)
- **Storage hit**: ~30-50ms (R2)
- **YouTube API**: ~200-500ms (external API)
- **Total (cache miss)**: ~300-600ms

## Caching Strategy

### Redis Cache (7 days)
- Key format: `video_match:{transcript_id}`
- Stores: Full VideoMatchResponse
- TTL: 604,800 seconds (7 days)
- Invalidation: Automatic expiry

### R2 Storage (Permanent)
- Path: `video-matches/{transcript_id}.json`
- Stores: Full match with metadata
- Retention: Indefinite
- Purpose: Restore cache after expiry

## Monitoring

### Logs

View logs in real-time:
```bash
wrangler tail
```

### Metrics

- Request count
- Error rate
- Cache hit rate
- API quota usage
- Response times

## Troubleshooting

### Issue: "YouTube API quota exceeded"

**Solution:**
1. Check quota usage in Google Cloud Console
2. Wait for daily quota reset (midnight Pacific Time)
3. Request quota increase from Google (takes 1-2 days)
4. Use caching to reduce API calls

### Issue: "No matching video found"

**Causes:**
- Video hasn't been uploaded yet
- Wrong sitting date
- Video is private/unlisted
- Channel ID is incorrect

**Solution:**
1. Verify sitting date format (DD-MM-YYYY)
2. Check if video exists on YouTube manually
3. Try ±1 day from sitting date
4. Verify channel ID is correct

### Issue: "Invalid date format"

**Solution:**
- Use DD-MM-YYYY format (e.g., "02-07-2024")
- Not YYYY-MM-DD or DD/MM/YYYY

### Issue: Redis connection errors

**Solution:**
1. Verify Upstash credentials are correct
2. Check if Redis instance is running
3. Verify REST URL includes https://
4. Test connection with curl:
```bash
curl https://YOUR_UPSTASH_URL/ping \
  -H "Authorization: Bearer YOUR_TOKEN"
```

## Development Roadmap

### Phase 1 (Current)
- [x] YouTube API integration
- [x] Confidence scoring
- [x] Redis caching
- [x] R2 storage
- [x] Timestamp extraction

### Phase 2 (Next)
- [ ] OAuth support for transcript/captions API
- [ ] Automatic transcript extraction
- [ ] Semantic search in transcripts
- [ ] Multi-language support

### Phase 3 (Future)
- [ ] Real-time video monitoring
- [ ] Webhook notifications
- [ ] Analytics dashboard
- [ ] A/B testing for matching algorithms

## Contributing

See main Capless repository for contribution guidelines.

## License

Proprietary - Capless AI Platform

## Support

For issues or questions:
1. Check [troubleshooting](#troubleshooting) section
2. Review [example responses](docs/example-responses.json)
3. Check Cloudflare Workers logs: `wrangler tail`
4. Open an issue in the main repository

---

**Built with**: TypeScript, Cloudflare Workers, Hono, YouTube Data API v3, Upstash Redis, Cloudflare R2
