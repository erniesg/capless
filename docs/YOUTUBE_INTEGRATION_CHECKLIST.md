# YouTube Transcript Integration - Development Checklist

**Objective:** Integrate YouTube video search, transcript extraction, and association with Hansard sessions into daily cron workflow.

**Architecture:** Cloudflare Worker (parliament-scraper) → Cloudflare Container (yt-dlp) → R2 Storage

**References:**
- [Cloudflare Containers](https://developers.cloudflare.com/containers/get-started/)
- [Workers Testing](https://developers.cloudflare.com/workers/development-testing/)
- [Vite Plugin](https://developers.cloudflare.com/workers/vite-plugin/)
- [Multi-Workers](https://developers.cloudflare.com/workers/development-testing/multi-workers/)

---

## Phase 1: Container Setup & Local Testing

**Goal:** Create yt-dlp container that extracts YouTube transcripts and test locally.

### 1.1 Container Scaffold
- [ ] Create directory `workers/youtube-transcript-extractor/`
- [ ] Create `Dockerfile` with Python 3.11 + yt-dlp
- [ ] Create `server.py` with HTTP endpoint `/extract`
- [ ] Create `wrangler.toml` with container config
- [ ] Create `.dockerignore` file

**Test:** `docker build -t yt-dlp-test .` succeeds

### 1.2 Transcript Extraction Logic
- [ ] Write test: Extract transcript for known video (2025-09-22, n9ZyN-lwiXg)
- [ ] Implement: `extract_transcript(video_id)` function
- [ ] Test: Verify VTT file contains expected text
- [ ] Handle: Video without captions (return error)
- [ ] Handle: Private/deleted videos (return error)

**Test:** `python -m pytest tests/test_extractor.py -v`

### 1.3 R2 Upload from Container
- [ ] Write test: Mock R2 upload with boto3
- [ ] Add boto3/s3 client to Dockerfile
- [ ] Implement: `upload_to_r2(vtt_content, date)` function
- [ ] Test: Verify R2 object exists at `youtube/transcripts/{date}.vtt`
- [ ] Add error handling for R2 failures

**Test:** Local R2 emulation with Minio or mock

### 1.4 HTTP Server Implementation
- [ ] Write test: POST to `/extract` returns 200
- [ ] Implement: Request validation (video_id, date required)
- [ ] Implement: Response format `{status, date, transcript_path}`
- [ ] Add logging for debugging
- [ ] Add health check endpoint `/health`

**Test:** `curl -X POST http://localhost:8080/extract -d '{"video_id":"n9ZyN-lwiXg","date":"2025-09-22"}'`

### 1.5 Local Container Testing
- [ ] Test: Build Docker image successfully
- [ ] Test: Run container locally on port 8080
- [ ] Test: Extract transcript for 2025-09-22 video
- [ ] Test: Verify VTT file saved locally (before R2)
- [ ] Test: Container handles 5 concurrent requests

**Test:** `docker run -p 8080:8080 yt-dlp-extractor`

### 1.6 Deploy to Cloudflare
- [ ] Deploy container: `npx wrangler deploy`
- [ ] Verify deployment: Check Cloudflare dashboard
- [ ] Test deployed endpoint: `curl https://<container-url>/health`
- [ ] Test extraction: Send POST request to deployed container
- [ ] Monitor logs: `npx wrangler tail`

**Test:** Deployed container extracts transcript successfully

---

## Phase 2: YouTube Search & Metadata Storage

**Goal:** Add YouTube video search by date and save metadata to R2.

### 2.1 YouTube API Integration
- [ ] Write test: Search returns video for known date (2025-09-22)
- [ ] Add `YOUTUBE_API_KEY` to wrangler.toml secrets
- [ ] Implement: `searchYouTubeByDate(date, apiKey)` function
- [ ] Test: Returns video_id for 2024-08-06 (qVELRx1pLEc)
- [ ] Handle: No results found (return null)
- [ ] Handle: API rate limit errors (retry logic)

**Test:** `npm test -- search-youtube.test.ts`

### 2.2 Metadata Schema & Storage
- [ ] Define TypeScript interface `YouTubeMetadata`
- [ ] Write test: Save metadata to R2 at `youtube/metadata/{date}.json`
- [ ] Implement: `saveYouTubeMetadata(date, videoId, title)` function
- [ ] Test: Read back from R2 and verify fields
- [ ] Add timestamp fields: `fetched_at`, `last_updated`

**Test:** R2 object exists with correct schema

### 2.3 Test Endpoint Creation
- [ ] Add route: `GET /test-youtube?date=YYYY-MM-DD`
- [ ] Write test: Endpoint searches YouTube for date
- [ ] Write test: Endpoint saves metadata to R2
- [ ] Implement: Return JSON `{video_id, url, metadata_path}`
- [ ] Add error handling: Invalid date format
- [ ] Add logging: Search results and R2 paths

**Test:** `curl "https://capless-parliament-scraper.erniesg.workers.dev/test-youtube?date=2025-09-22"`

### 2.4 Date Parsing & Validation
- [ ] Write test: Parse DD-MM-YYYY to YouTube search format
- [ ] Write test: Validate date range (2024-08-06 to today)
- [ ] Implement: Date conversion utilities
- [ ] Test: Handle invalid dates gracefully
- [ ] Test: Handle future dates (return null)

**Test:** Unit tests for date utilities

---

## Phase 3: Worker ↔ Container Integration

**Goal:** Parliament scraper worker calls container via service binding.

### 3.1 Service Binding Setup
- [ ] Add service binding in parliament-scraper `wrangler.toml`
- [ ] Define `YOUTUBE_EXTRACTOR: Fetcher` in Env interface
- [ ] Write test: Mock service binding call
- [ ] Test: Verify HTTP request format to container
- [ ] Test: Handle container timeout (30s limit)

**Test:** Mock integration test

### 3.2 Worker → Container Call
- [ ] Write test: Worker sends {video_id, date} to container
- [ ] Implement: `callTranscriptExtractor(videoId, date, env)`
- [ ] Write test: Parse container response
- [ ] Handle: Container returns error (retry once)
- [ ] Handle: Container timeout (log and continue)
- [ ] Add structured logging

**Test:** `npm test -- container-integration.test.ts`

### 3.3 End-to-End Flow
- [ ] Write test: Full flow (search → metadata → extract → R2)
- [ ] Implement: `processYouTubeForDate(date, env)` function
- [ ] Test: Verify 3 R2 objects created:
  - `youtube/metadata/{date}.json`
  - `youtube/transcripts/{date}.vtt`
  - `hansard/raw/{date}.json` (existing)
- [ ] Test: Idempotency (running twice doesn't duplicate)
- [ ] Add rollback on partial failure

**Test:** Integration test with local wrangler dev

### 3.4 Multi-Worker Local Testing
- [ ] Set up multi-worker dev with Vite
- [ ] Test: parliament-scraper + container running together
- [ ] Test: Service binding works locally
- [ ] Test: Breakpoints work in both workers
- [ ] Document: How to run multi-worker setup

**Test:** `npx wrangler dev --remote` for both workers

### 3.5 Deployment & Monitoring
- [ ] Deploy parliament-scraper with service binding
- [ ] Deploy container (if not already)
- [ ] Test: Call `/test-youtube?date=2025-09-22` in production
- [ ] Verify: Check R2 bucket for new files
- [ ] Monitor: `npx wrangler tail` for both workers
- [ ] Set up alerts: Container errors, R2 failures

**Test:** Production smoke test

---

## Phase 4: Backfill 32 Existing Videos

**Goal:** Process all 32 existing YouTube videos and save to R2.

### 4.1 Mapping File Upload
- [ ] Write test: Upload local JSON to R2
- [ ] Upload `youtube-sessions/youtube-hansard-mapping.json` to R2
- [ ] Save at: `youtube/mapping-v1.json` (versioned)
- [ ] Verify: File accessible via R2 API
- [ ] Add metadata: `uploaded_at`, `total_videos: 32`

**Test:** Read back from R2 and verify structure

### 4.2 Backfill Script Creation
- [ ] Create `scripts/backfill-youtube-transcripts.sh`
- [ ] Write test: Mock backfill for 2 videos
- [ ] Implement: Iterate through all 32 dates
- [ ] Add progress tracking: Log N/32 completed
- [ ] Add error recovery: Continue on failure
- [ ] Save progress: Track completed dates in KV

**Test:** Dry-run mode (no actual calls)

### 4.3 Rate Limiting & Throttling
- [ ] Add delay: 2 seconds between requests
- [ ] Respect YouTube API quota: Max 100/day
- [ ] Add retry logic: Exponential backoff
- [ ] Log quota usage: Track daily requests
- [ ] Handle quota exceeded: Pause and resume

**Test:** Simulate rate limit response

### 4.4 Backfill Execution
- [ ] Run backfill: `./scripts/backfill-youtube-transcripts.sh`
- [ ] Monitor: Real-time progress logs
- [ ] Verify: Check R2 for 32 transcript files
- [ ] Verify: Check R2 for 32 metadata files
- [ ] Document: Any failed videos (private/deleted)

**Test:** All 32 videos processed (or documented failures)

### 4.5 Data Validation
- [ ] Write script: `scripts/validate-youtube-data.sh`
- [ ] Test: All metadata files have required fields
- [ ] Test: All VTT files are valid WebVTT format
- [ ] Test: Dates match between Hansard and YouTube
- [ ] Generate report: Coverage statistics

**Test:** Validation script passes 100%

---

## Phase 5: Daily Cron Integration

**Goal:** Integrate YouTube processing into existing daily Hansard cron.

### 5.1 Queue Consumer Modification
- [ ] Write test: Queue message includes YouTube processing
- [ ] Update: `async function queue(batch, env)` to call YouTube
- [ ] Test: Hansard fetch → YouTube search → transcript extract
- [ ] Handle: Hansard exists but no YouTube video (log only)
- [ ] Handle: YouTube video found but no captions (log only)

**Test:** Unit test with mocked queue

### 5.2 Conditional YouTube Processing
- [ ] Add flag: `ENABLE_YOUTUBE=true` in wrangler.toml
- [ ] Write test: Skip YouTube if disabled
- [ ] Implement: Check if YouTube already processed (R2 exists)
- [ ] Skip: If metadata exists in R2 (idempotent)
- [ ] Force refresh: Query param `?force=true`

**Test:** Idempotency test

### 5.3 Error Handling & Retries
- [ ] Write test: YouTube fails but Hansard succeeds
- [ ] Implement: Don't fail entire job if YouTube fails
- [ ] Add: Separate KV key `youtube:{date}:status`
- [ ] Retry: Failed YouTube extractions next cron run
- [ ] Alert: After 3 consecutive failures

**Test:** Simulate YouTube API downtime

### 5.4 Testing with Artificial Date
- [ ] Create test date: Tomorrow (future date)
- [ ] Mock: Hansard response for test date
- [ ] Mock: YouTube video for test date
- [ ] Run cron: Manually trigger queue
- [ ] Verify: Both Hansard + YouTube saved to R2

**Test:** `curl -X POST /enqueue-date -d '{"date":"2025-10-26"}'`

### 5.5 Production Monitoring
- [ ] Deploy: Updated parliament-scraper with YouTube
- [ ] Monitor: Next 3 cron runs (12mn, 8am, 12noon SGT)
- [ ] Verify: New sessions get YouTube data
- [ ] Check: R2 storage growth rate
- [ ] Alert: Set up PagerDuty/email for failures

**Test:** Monitor logs for 3 days

### 5.6 Documentation Update
- [ ] Update: `ARCHITECTURE.md` with YouTube flow
- [ ] Document: R2 storage structure
- [ ] Document: How to manually trigger YouTube extraction
- [ ] Document: How to debug container issues
- [ ] Create: Runbook for common failures

**Test:** Team member can follow docs successfully

---

## Phase 6: Optimization & Cleanup

**Goal:** Improve performance and developer experience.

### 6.1 Performance Optimization
- [ ] Measure: Container cold start time
- [ ] Optimize: Reduce Docker image size (<100MB)
- [ ] Cache: YouTube API responses (1 hour)
- [ ] Parallel: Process multiple dates concurrently
- [ ] Monitor: Container CPU and memory usage

**Test:** Benchmark before/after

### 6.2 Cost Monitoring
- [ ] Track: Container execution time per video
- [ ] Track: YouTube API quota usage
- [ ] Track: R2 storage costs
- [ ] Calculate: Monthly costs for 30 videos
- [ ] Alert: If costs exceed $1/month

**Test:** Cost dashboard

### 6.3 Developer Experience
- [ ] Add: `npm run test:youtube` script
- [ ] Add: Local dev with Docker Compose
- [ ] Add: Mock YouTube API for tests
- [ ] Document: How to add new video manually
- [ ] Add: Linting for Python container code

**Test:** New developer can run tests locally

### 6.4 Future Enhancements (Optional)
- [ ] Add: Transcript search API
- [ ] Add: Timestamp matching (quote → video time)
- [ ] Add: Multi-language support (Mandarin/Malay)
- [ ] Add: Video thumbnail extraction
- [ ] Add: Speaker identification from audio

**Test:** Feature flags for experimental features

---

## Success Criteria

### Phase 1 Complete
- ✅ Container runs locally
- ✅ Container deployed to Cloudflare
- ✅ Extracts transcript for test video

### Phase 2 Complete
- ✅ YouTube search works for known dates
- ✅ Metadata saved to R2
- ✅ Test endpoint functional

### Phase 3 Complete
- ✅ Worker calls container successfully
- ✅ End-to-end flow works
- ✅ Multi-worker dev setup documented

### Phase 4 Complete
- ✅ 32 videos backfilled (or failures documented)
- ✅ All data validated
- ✅ Coverage report generated

### Phase 5 Complete
- ✅ Daily cron processes YouTube
- ✅ 3 days of successful runs
- ✅ Monitoring alerts configured

### Phase 6 Complete
- ✅ Performance optimized
- ✅ Costs under $1/month
- ✅ Developer docs updated

---

## Emergency Rollback Plan

If YouTube integration causes issues:

1. **Disable YouTube Processing**
   ```bash
   # Set env var in Cloudflare dashboard
   ENABLE_YOUTUBE=false
   ```

2. **Revert Deployment**
   ```bash
   npx wrangler rollback --worker parliament-scraper
   ```

3. **Delete Failed R2 Objects**
   ```bash
   npx wrangler r2 object delete capless-preview youtube/transcripts/BAD_DATE.vtt
   ```

---

## Timeline Estimate

- **Phase 1:** 4 hours (container setup + local testing)
- **Phase 2:** 3 hours (YouTube API + metadata)
- **Phase 3:** 4 hours (service binding + integration)
- **Phase 4:** 2 hours (backfill script + execution)
- **Phase 5:** 3 hours (cron integration + testing)
- **Phase 6:** 2 hours (optimization)

**Total:** ~18 hours (2-3 days)

---

## Contact & Support

- Container issues: Check Cloudflare dashboard logs
- YouTube API: Check quota at console.cloud.google.com
- R2 issues: Verify bucket permissions
- General help: Refer to Cloudflare docs linked above
