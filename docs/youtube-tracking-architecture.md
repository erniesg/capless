# YouTube Tracking System Architecture for Singapore Parliament Sessions

**Version:** 1.0
**Date:** 2025-10-25
**Status:** Production-Ready Design
**Purpose:** Comprehensive system to track, fetch, and integrate YouTube videos with Parliament Hansard sessions

---

## Executive Summary

### Problem Statement

The current system scrapes Parliament Hansard sessions (workers/parliament-scraper) but lacks integration with corresponding YouTube recordings. We need a robust system to:

1. Track which Parliament sessions have YouTube videos
2. Fetch YouTube video metadata (URL, duration, publish date, etc.)
3. Download and store YouTube transcripts (VTT captions)
4. Link YouTube timestamps to Hansard moments
5. Monitor for new uploads automatically via daily cron

### Current State Analysis

**Existing Components:**
- **parliament-scraper** (/workers/parliament-scraper): Scrapes Hansard sessions, stores in R2, tracks dates in KV
- **video-matcher** (/workers/video-matcher): Matches Hansard to YouTube videos using YouTube Data API v3
- **Storage**: R2 (raw Hansard JSON), KV (date check records)

**Gaps Identified:**
- No persistent relational database (D1) for correlating sessions, videos, transcripts
- No automated YouTube monitoring cron job
- No transcript download integration
- No systematic tracking of processing state
- KV-only tracking lacks complex query capability

### Recommended Solution

**Hybrid D1 + R2 + KV + YouTube Data API v3 Architecture:**

```
┌─────────────────────────────────────────────────────────────────┐
│                    Daily Cron Orchestration                      │
│  ┌──────────────┐  ┌──────────────┐  ┌────────────────────────┐ │
│  │ Hansard      │  │ YouTube      │  │ Transcript            │ │
│  │ Monitor      │  │ Monitor      │  │ Downloader            │ │
│  │ (existing)   │  │ (new)        │  │ (new)                 │ │
│  └──────┬───────┘  └──────┬───────┘  └────────┬───────────────┘ │
│         │                 │                   │                 │
│         ▼                 ▼                   ▼                 │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │         Parliament Data API Worker (Unified)             │  │
│  │         (Coordinates all YouTube operations)             │  │
│  └──┬────────────────┬─────────────────┬────────────────────┘  │
│     │                │                 │                       │
└─────┼────────────────┼─────────────────┼───────────────────────┘
      │                │                 │
      ▼                ▼                 ▼
┌─────────────┐ ┌──────────────┐ ┌─────────────────┐
│ D1 Database │ │ R2 Storage   │ │ KV Cache        │
│ (SQLite)    │ │ (S3-like)    │ │ (Fast lookup)   │
│             │ │              │ │                 │
│ • sessions  │ │ • hansard/   │ │ • session:{id}  │
│ • youtube   │ │ • youtube/   │ │ • youtube:{id}  │
│ • transcripts│ │   transcripts│ │ • rate_limit:*  │
│ • moments   │ │   videos/    │ │ • processing:*  │
└─────────────┘ └──────────────┘ └─────────────────┘
      ↑                                  ↑
      │                                  │
      └──────── YouTube Data API v3 ─────┘
```

**Key Design Decisions:**
1. **D1 for relational data**: Foreign keys between sessions, YouTube videos, transcripts, moments
2. **R2 for large files**: VTT transcripts, video clips, Hansard JSON
3. **KV for caching**: Fast session lookups, rate limiting, processing locks
4. **YouTube Data API v3**: Video search, metadata fetching (100 units/match = ~99 matches/day on free quota)
5. **yt-dlp for transcripts**: Download VTT captions (no YouTube API quota cost)

---

## Data Model Design

### D1 Schema (SQL)

```sql
-- ============================================
-- SESSIONS TABLE
-- Tracks all parliament sitting dates
-- ============================================
CREATE TABLE sessions (
  -- Primary identifiers
  date TEXT PRIMARY KEY,                    -- DD-MM-YYYY format
  session_id TEXT UNIQUE NOT NULL,          -- parliament-{YYYY-MM-DD}

  -- Parliament metadata
  parliament_number INTEGER NOT NULL,       -- 1-15
  session_number INTEGER,                   -- Session within parliament
  date_display TEXT,                        -- "Tuesday, 2 July 2024"

  -- Hansard data
  hansard_available BOOLEAN DEFAULT FALSE,
  hansard_r2_key TEXT,                     -- hansard/raw/{date}.json
  hansard_scraped_at TEXT,                 -- ISO timestamp

  -- YouTube correlation
  youtube_video_id TEXT,                   -- Foreign key to youtube_videos
  youtube_match_confidence REAL,           -- 0.0-1.0 (from video-matcher)
  youtube_match_method TEXT,               -- 'api_search' | 'static_mapping' | 'manual'

  -- Processing state
  moments_extracted BOOLEAN DEFAULT FALSE,
  moments_count INTEGER DEFAULT 0,

  -- Metadata
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now')),

  FOREIGN KEY (youtube_video_id) REFERENCES youtube_videos(video_id)
);

CREATE INDEX idx_sessions_parliament ON sessions(parliament_number);
CREATE INDEX idx_sessions_youtube ON sessions(youtube_video_id);
CREATE INDEX idx_sessions_pending
  ON sessions(hansard_available, youtube_video_id)
  WHERE hansard_available = TRUE AND youtube_video_id IS NULL;

-- ============================================
-- YOUTUBE VIDEOS TABLE
-- Tracks YouTube parliament recordings
-- ============================================
CREATE TABLE youtube_videos (
  video_id TEXT PRIMARY KEY,               -- YouTube video ID (e.g., "n9ZyN-lwiXg")

  -- Video metadata (from YouTube Data API)
  title TEXT NOT NULL,
  url TEXT NOT NULL,                       -- https://www.youtube.com/watch?v={video_id}
  duration_seconds INTEGER,                -- Parsed from ISO 8601 duration
  published_at TEXT,                       -- ISO timestamp
  channel_id TEXT,                         -- UC9JN3S8ACuN4xVLqWvHsLqg (Singapore Parliament)
  view_count INTEGER,
  thumbnail_url TEXT,

  -- Parliament correlation
  session_date TEXT,                       -- DD-MM-YYYY (may not match exactly)
  parliament_number INTEGER,               -- Inferred from date
  is_interpretation BOOLEAN DEFAULT FALSE, -- English interpretation version?

  -- Transcript availability
  transcript_available BOOLEAN DEFAULT FALSE,
  transcript_r2_key TEXT,                  -- youtube/transcripts/{video_id}.vtt
  transcript_format TEXT,                  -- 'vtt' | 'srt' | 'json'
  transcript_language TEXT,                -- 'en' | 'zh' | 'ms' | 'ta'
  transcript_downloaded_at TEXT,
  transcript_download_method TEXT,         -- 'yt-dlp' | 'youtube_api' | 'manual'

  -- Video file (optional download)
  video_downloaded BOOLEAN DEFAULT FALSE,
  video_r2_key TEXT,                       -- youtube/videos/{video_id}.mp4
  video_size_bytes INTEGER,
  video_downloaded_at TEXT,

  -- Timestamp mapping
  moments_matched BOOLEAN DEFAULT FALSE,   -- Moments linked to timestamps?
  timestamp_mapping_r2_key TEXT,           -- youtube/timestamps/{video_id}.json

  -- Metadata
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now')),

  FOREIGN KEY (session_date) REFERENCES sessions(date)
);

CREATE INDEX idx_youtube_session_date ON youtube_videos(session_date);
CREATE INDEX idx_youtube_parliament ON youtube_videos(parliament_number);
CREATE INDEX idx_youtube_transcript ON youtube_videos(transcript_available);
CREATE INDEX idx_youtube_pending_transcript
  ON youtube_videos(transcript_available, published_at DESC)
  WHERE transcript_available = FALSE;

-- ============================================
-- YOUTUBE TRANSCRIPTS TABLE
-- Tracks transcript segments with timestamps
-- ============================================
CREATE TABLE youtube_transcripts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  video_id TEXT NOT NULL,                  -- Foreign key to youtube_videos

  -- Transcript segment
  start_time_seconds REAL NOT NULL,        -- 123.45
  end_time_seconds REAL NOT NULL,          -- 125.67
  text TEXT NOT NULL,                      -- "The alterations were done..."

  -- Metadata
  confidence REAL,                         -- 0.0-1.0 (auto-generated confidence)
  speaker TEXT,                            -- Detected speaker (if available)

  -- Timestamps
  created_at TEXT DEFAULT (datetime('now')),

  FOREIGN KEY (video_id) REFERENCES youtube_videos(video_id)
);

CREATE INDEX idx_transcripts_video ON youtube_transcripts(video_id);
CREATE INDEX idx_transcripts_time ON youtube_transcripts(video_id, start_time_seconds);

-- ============================================
-- MOMENTS TABLE
-- Tracks extracted viral moments
-- ============================================
CREATE TABLE moments (
  moment_id TEXT PRIMARY KEY,              -- demo-moment-1, etc.

  -- Session correlation
  session_date TEXT NOT NULL,              -- DD-MM-YYYY
  transcript_id TEXT,                      -- parliament-{date}

  -- Moment content
  quote TEXT NOT NULL,
  speaker TEXT,
  topic TEXT,
  virality_score REAL,                     -- 0-10
  why_viral TEXT,

  -- Hansard timestamps
  hansard_timestamp_start TEXT,            -- HH:MM:SS
  hansard_timestamp_end TEXT,

  -- YouTube correlation
  youtube_video_id TEXT,
  youtube_start_seconds INTEGER,
  youtube_end_seconds INTEGER,
  youtube_timestamp TEXT,                  -- MM:SS format
  youtube_url TEXT,                        -- Shareable URL with ?t=
  timestamp_confidence REAL,               -- 0.0-1.0 (matching confidence)

  -- Asset generation
  script_generated BOOLEAN DEFAULT FALSE,
  audio_generated BOOLEAN DEFAULT FALSE,
  video_generated BOOLEAN DEFAULT FALSE,

  -- R2 asset keys
  script_r2_key TEXT,                      -- moments/scripts/{moment_id}.json
  audio_r2_key TEXT,                       -- moments/audio/{moment_id}.mp3
  video_r2_key TEXT,                       -- moments/videos/{moment_id}.mp4

  -- Metadata
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now')),

  FOREIGN KEY (session_date) REFERENCES sessions(date),
  FOREIGN KEY (youtube_video_id) REFERENCES youtube_videos(video_id)
);

CREATE INDEX idx_moments_session ON moments(session_date);
CREATE INDEX idx_moments_youtube ON moments(youtube_video_id);
CREATE INDEX idx_moments_virality ON moments(virality_score DESC);

-- ============================================
-- PROCESSING JOBS TABLE
-- Tracks async YouTube operations
-- ============================================
CREATE TABLE processing_jobs (
  job_id TEXT PRIMARY KEY,

  -- Job details
  job_type TEXT CHECK(job_type IN (
    'youtube_search',          -- Search for video matching session
    'youtube_match',           -- Match video to session via video-matcher
    'transcript_download',     -- Download VTT captions via yt-dlp
    'transcript_parse',        -- Parse VTT into segments
    'video_download',          -- Download full video file
    'timestamp_match',         -- Match moments to video timestamps
    'moment_extraction'        -- Extract moments from Hansard
  )),
  entity_id TEXT NOT NULL,                 -- date or video_id or moment_id

  -- Status
  status TEXT CHECK(status IN ('pending', 'running', 'completed', 'failed')) DEFAULT 'pending',
  progress INTEGER DEFAULT 0,              -- 0-100

  -- Timing
  started_at TEXT,
  completed_at TEXT,
  duration_ms INTEGER,

  -- Error handling
  error_message TEXT,
  error_stack TEXT,
  retry_count INTEGER DEFAULT 0,
  max_retries INTEGER DEFAULT 3,

  -- Rate limiting
  rate_limit_hit BOOLEAN DEFAULT FALSE,
  retry_after_seconds INTEGER,

  -- Metadata
  metadata TEXT,                           -- JSON string for job-specific data
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);

CREATE INDEX idx_jobs_status ON processing_jobs(status);
CREATE INDEX idx_jobs_type ON processing_jobs(job_type);
CREATE INDEX idx_jobs_entity ON processing_jobs(entity_id);
CREATE INDEX idx_jobs_pending
  ON processing_jobs(status, created_at)
  WHERE status = 'pending';
CREATE INDEX idx_jobs_failed_retryable
  ON processing_jobs(status, retry_count, max_retries)
  WHERE status = 'failed' AND retry_count < max_retries;
```

### R2 Bucket Structure

```
capless-preview/
├── hansard/
│   └── raw/
│       └── {DD-MM-YYYY}.json              # Original Hansard JSON from API
│
├── youtube/
│   ├── transcripts/
│   │   ├── {video_id}.vtt                 # VTT captions from yt-dlp
│   │   ├── {video_id}.srt                 # SRT format (alternative)
│   │   └── {video_id}.json                # Parsed transcript segments
│   ├── videos/
│   │   └── {video_id}.mp4                 # Full video downloads (optional)
│   └── timestamps/
│       └── {video_id}-moments.json        # Moment → timestamp mappings
│
├── moments/
│   ├── extractions/
│   │   └── {DD-MM-YYYY}-moments.json      # Extracted moments per session
│   ├── scripts/
│   │   └── {moment_id}-{persona}.json     # Generated scripts
│   ├── audio/
│   │   └── {moment_id}-{persona}.mp3      # TTS audio
│   └── videos/
│       └── {moment_id}-{persona}.mp4      # Rendered videos
│
└── video-matches/
    └── {transcript_id}.json               # video-matcher results (existing)
```

### KV Namespace Structure

```typescript
// Fast lookups and caching (1 hour TTL for most)
interface KVSchema {
  // Session cache
  'session:{date}': {
    hansard_available: boolean;
    youtube_video_id: string | null;
    moments_count: number;
    last_updated: string;
  };

  // YouTube cache
  'youtube:{video_id}': {
    title: string;
    duration_seconds: number;
    transcript_available: boolean;
    session_date: string | null;
  };

  // Processing locks (10 minute TTL)
  'lock:youtube_search:{date}': {
    job_id: string;
    started_at: string;
    worker_id: string;
  };
  'lock:transcript_download:{video_id}': {
    job_id: string;
    started_at: string;
  };

  // Rate limiting (1 minute TTL)
  'rate:youtube_api': number;               // Current request count
  'rate:youtube_api_quota': number;         // Daily quota usage (units)
  'rate:yt_dlp': number;                    // yt-dlp requests/minute
}
```

---

## YouTube API Integration Strategy

### YouTube Data API v3 Usage

**API Key Approach:**
- **Authentication**: API Key (simpler than OAuth for public data)
- **Quota**: 10,000 units/day (free tier)
- **Cost per video match**: ~101 units
  - Search API: 100 units
  - Videos.list API: 1 unit
- **Daily capacity**: ~99 video matches

**Quota Optimization:**
1. **Cache aggressively**: 7-day Redis cache (via video-matcher worker)
2. **Use R2 storage**: Permanent storage of match results
3. **Batch operations**: Search for multiple dates in single API call when possible
4. **Smart scheduling**: Run searches during off-peak hours
5. **Fallback to static mapping**: Use pre-mapped video IDs when available

**Rate Limiting Strategy:**
```typescript
// Rate limiter implementation
async function checkYouTubeQuota(env: Env): Promise<boolean> {
  const quotaKey = 'rate:youtube_api_quota';
  const currentUsage = await env.KV.get(quotaKey);
  const usageInt = currentUsage ? parseInt(currentUsage) : 0;

  const DAILY_QUOTA = 10000;
  const SAFETY_BUFFER = 1000; // Reserve 1000 units

  if (usageInt >= (DAILY_QUOTA - SAFETY_BUFFER)) {
    console.error(`[YouTube API] Quota limit reached: ${usageInt}/${DAILY_QUOTA}`);
    return false;
  }

  return true;
}

async function incrementQuotaUsage(env: Env, units: number): Promise<void> {
  const quotaKey = 'rate:youtube_api_quota';
  const currentUsage = await env.KV.get(quotaKey);
  const newUsage = (currentUsage ? parseInt(currentUsage) : 0) + units;

  // Store with 24-hour expiry (resets at midnight Pacific Time)
  const now = new Date();
  const tomorrow = new Date(now);
  tomorrow.setUTCHours(24 + 8, 0, 0, 0); // Midnight PT = 8am UTC next day
  const ttl = Math.floor((tomorrow.getTime() - now.getTime()) / 1000);

  await env.KV.put(quotaKey, newUsage.toString(), { expirationTtl: ttl });
  console.log(`[YouTube API] Quota usage: ${newUsage}/${10000} units`);
}
```

### Transcript Download Strategy (yt-dlp)

**Why yt-dlp instead of YouTube API:**
- YouTube Captions API requires OAuth (complex setup)
- yt-dlp is free and doesn't use API quota
- Supports multiple subtitle formats (VTT, SRT, JSON)
- Can download auto-generated captions

**Implementation Approach:**

Since Cloudflare Workers can't run Python/yt-dlp directly, we have 3 options:

**Option 1: External Service (Modal, Fly.io)**
```typescript
// Call external yt-dlp service
async function downloadTranscript(videoId: string): Promise<string> {
  const response = await fetch('https://ytdlp-service.modal.app/download-transcript', {
    method: 'POST',
    body: JSON.stringify({ video_id: videoId, format: 'vtt' })
  });

  const { transcript_url } = await response.json();

  // Download VTT file
  const vttResponse = await fetch(transcript_url);
  return await vttResponse.text();
}
```

**Option 2: YouTube Unofficial API (timdotv/get-youtube-transcript)**
```typescript
import { getSubtitles } from 'youtube-captions-scraper';

async function downloadTranscript(videoId: string): Promise<any> {
  try {
    const captions = await getSubtitles({
      videoID: videoId,
      lang: 'en' // English
    });

    return captions; // Array of { start, dur, text }
  } catch (error) {
    console.error(`[Transcript] Failed to download for ${videoId}:`, error);
    throw error;
  }
}
```

**Option 3: YouTube Embed Transcript Scraping**
```typescript
// Scrape from YouTube's embed page (less reliable)
async function scrapeTranscript(videoId: string): Promise<string> {
  const response = await fetch(`https://www.youtube.com/watch?v=${videoId}`);
  const html = await response.text();

  // Extract caption tracks JSON from HTML
  const captionsRegex = /"captions":(\{.*?\})/;
  const match = html.match(captionsRegex);

  if (!match) throw new Error('No captions found');

  const captions = JSON.parse(match[1]);
  const captionTrack = captions.playerCaptionsTracklistRenderer.captionTracks[0];

  // Download VTT from caption track URL
  const vttResponse = await fetch(captionTrack.baseUrl);
  return await vttResponse.text();
}
```

**Recommended: Option 2 (youtube-captions-scraper)** - No external dependencies, works in Workers, free.

### Video Matching Flow

```typescript
// Integration with existing video-matcher worker

async function matchSessionToYouTube(
  env: Env,
  session: Session
): Promise<YouTubeVideo | null> {
  const date = session.date; // DD-MM-YYYY

  // 1. Check if already matched
  const existing = await env.DB
    .prepare('SELECT youtube_video_id FROM sessions WHERE date = ?')
    .bind(date)
    .first();

  if (existing?.youtube_video_id) {
    console.log(`[Match] Session ${date} already has video ${existing.youtube_video_id}`);
    return null;
  }

  // 2. Check quota before calling video-matcher
  if (!await checkYouTubeQuota(env)) {
    throw new Error('YouTube API quota exceeded');
  }

  // 3. Call video-matcher worker
  const matcherUrl = 'https://capless-video-matcher.erniesg.workers.dev/api/video/match';
  const response = await fetch(matcherUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      transcript_id: session.session_id,
      sitting_date: date,
      speakers: [] // Could extract from Hansard
    })
  });

  if (!response.ok) {
    if (response.status === 404) {
      console.log(`[Match] No YouTube video found for ${date}`);
      return null;
    }
    throw new Error(`video-matcher failed: ${response.statusText}`);
  }

  const match = await response.json();

  // 4. Increment quota usage (100 for search + 1 for videos.list)
  await incrementQuotaUsage(env, 101);

  // 5. Store match in D1
  await env.DB.prepare(`
    INSERT INTO youtube_videos (
      video_id, title, url, duration_seconds, published_at,
      channel_id, session_date, parliament_number, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).bind(
    match.video_id,
    match.title,
    match.video_url,
    match.duration,
    match.publish_date,
    match.channel_id,
    date,
    session.parliament_number,
    new Date().toISOString(),
    new Date().toISOString()
  ).run();

  // 6. Update session with YouTube link
  await env.DB.prepare(`
    UPDATE sessions
    SET youtube_video_id = ?,
        youtube_match_confidence = ?,
        youtube_match_method = 'api_search',
        updated_at = ?
    WHERE date = ?
  `).bind(
    match.video_id,
    match.confidence_score / 10, // Convert 0-10 to 0.0-1.0
    new Date().toISOString(),
    date
  ).run();

  return match;
}
```

---

## Cron Job Integration

### Daily Cron Configuration

```toml
# wrangler.toml for parliament-data-orchestrator worker

[triggers]
crons = [
  "0 16 * * *",  # 12:00 AM SGT (16:00 UTC) - After parliament day ends
  "0 0 * * *",   # 8:00 AM SGT (00:00 UTC)  - Morning check
  "0 4 * * *"    # 12:00 PM SGT (04:00 UTC) - Midday check
]
```

### Cron Execution Flow

```typescript
// workers/parliament-data-orchestrator/src/index.ts

export default {
  async scheduled(event: ScheduledEvent, env: Env): Promise<void> {
    console.log('[Cron] Parliament data sync started:', new Date().toISOString());

    try {
      // 1. Check for new Hansard sessions
      await checkNewHansardSessions(env);

      // 2. Match sessions to YouTube videos
      await matchUnmatchedSessions(env);

      // 3. Download missing transcripts
      await downloadMissingTranscripts(env);

      // 4. Retry failed jobs
      await retryFailedJobs(env);

      // 5. Cleanup old processing locks
      await cleanupStaleLocks(env);

      console.log('[Cron] Parliament data sync completed successfully');
    } catch (error) {
      console.error('[Cron] Sync failed:', error);
      // Don't throw - let cron continue running
    }
  }
};

async function checkNewHansardSessions(env: Env): Promise<void> {
  console.log('[Cron] Step 1: Checking for new Hansard sessions...');

  // Trigger parliament-scraper /check-today endpoint
  const scraperUrl = 'https://capless-parliament-scraper.erniesg.workers.dev/check-today';
  const response = await fetch(scraperUrl);
  const result = await response.json();

  console.log(`[Hansard] Enqueued ${result.enqueued} dates for scraping`);
}

async function matchUnmatchedSessions(env: Env): Promise<void> {
  console.log('[Cron] Step 2: Matching sessions to YouTube videos...');

  // Find sessions with Hansard but no YouTube video
  const { results } = await env.DB.prepare(`
    SELECT date, session_id, parliament_number
    FROM sessions
    WHERE hansard_available = TRUE
      AND youtube_video_id IS NULL
      AND parliament_number >= 14  -- Only recent parliaments likely have videos
    ORDER BY date DESC
    LIMIT 10  -- Process 10 per run to avoid quota exhaustion
  `).all();

  let matched = 0;
  let failed = 0;

  for (const session of results) {
    try {
      // Check for existing processing lock
      const lockKey = `lock:youtube_search:${session.date}`;
      const existingLock = await env.KV.get(lockKey);

      if (existingLock) {
        console.log(`[Match] ${session.date} already being processed`);
        continue;
      }

      // Acquire lock
      const jobId = `youtube_search_${session.date}_${Date.now()}`;
      await env.KV.put(lockKey, jobId, { expirationTtl: 600 }); // 10 minute lock

      // Create processing job
      await env.DB.prepare(`
        INSERT INTO processing_jobs (
          job_id, job_type, entity_id, status, started_at, created_at
        ) VALUES (?, ?, ?, ?, ?, ?)
      `).bind(
        jobId,
        'youtube_search',
        session.date,
        'running',
        new Date().toISOString(),
        new Date().toISOString()
      ).run();

      // Perform matching
      const video = await matchSessionToYouTube(env, session);

      if (video) {
        matched++;

        // Mark job as completed
        await env.DB.prepare(`
          UPDATE processing_jobs
          SET status = 'completed',
              completed_at = ?,
              duration_ms = CAST((julianday(?) - julianday(started_at)) * 86400000 AS INTEGER)
          WHERE job_id = ?
        `).bind(
          new Date().toISOString(),
          new Date().toISOString(),
          jobId
        ).run();

        console.log(`[Match] ✓ ${session.date} → ${video.video_id}`);
      } else {
        // No match found - not an error
        await env.DB.prepare(`
          UPDATE processing_jobs
          SET status = 'completed',
              completed_at = ?,
              error_message = 'No matching video found'
          WHERE job_id = ?
        `).bind(new Date().toISOString(), jobId).run();
      }

      // Release lock
      await env.KV.delete(lockKey);

    } catch (error: any) {
      failed++;

      // Mark job as failed
      await env.DB.prepare(`
        UPDATE processing_jobs
        SET status = 'failed',
            error_message = ?,
            completed_at = ?
        WHERE job_id = ?
      `).bind(
        error.message,
        new Date().toISOString(),
        jobId
      ).run();

      console.error(`[Match] ✗ ${session.date}:`, error.message);
    }

    // Rate limit: 1 second between searches
    await new Promise(resolve => setTimeout(resolve, 1000));
  }

  console.log(`[YouTube Match] Processed: ${results.length}, Matched: ${matched}, Failed: ${failed}`);
}

async function downloadMissingTranscripts(env: Env): Promise<void> {
  console.log('[Cron] Step 3: Downloading missing transcripts...');

  // Find videos without transcripts
  const { results } = await env.DB.prepare(`
    SELECT video_id, title, session_date
    FROM youtube_videos
    WHERE transcript_available = FALSE
    ORDER BY published_at DESC
    LIMIT 5  -- Process 5 per run
  `).all();

  let downloaded = 0;
  let failed = 0;

  for (const video of results) {
    try {
      const lockKey = `lock:transcript_download:${video.video_id}`;
      const existingLock = await env.KV.get(lockKey);

      if (existingLock) {
        console.log(`[Transcript] ${video.video_id} already being processed`);
        continue;
      }

      // Acquire lock
      const jobId = `transcript_${video.video_id}_${Date.now()}`;
      await env.KV.put(lockKey, jobId, { expirationTtl: 600 });

      // Create processing job
      await env.DB.prepare(`
        INSERT INTO processing_jobs (
          job_id, job_type, entity_id, status, started_at, created_at
        ) VALUES (?, ?, ?, ?, ?, ?)
      `).bind(
        jobId,
        'transcript_download',
        video.video_id,
        'running',
        new Date().toISOString(),
        new Date().toISOString()
      ).run();

      // Download transcript using youtube-captions-scraper
      const { getSubtitles } = await import('youtube-captions-scraper');
      const captions = await getSubtitles({
        videoID: video.video_id,
        lang: 'en'
      });

      // Convert to VTT format
      const vtt = convertToVTT(captions);

      // Store in R2
      const r2Key = `youtube/transcripts/${video.video_id}.vtt`;
      await env.R2.put(r2Key, vtt, {
        httpMetadata: { contentType: 'text/vtt' },
        customMetadata: {
          video_id: video.video_id,
          session_date: video.session_date || '',
          downloaded_at: new Date().toISOString()
        }
      });

      // Also store JSON segments
      const jsonKey = `youtube/transcripts/${video.video_id}.json`;
      await env.R2.put(jsonKey, JSON.stringify(captions, null, 2), {
        httpMetadata: { contentType: 'application/json' }
      });

      // Parse into transcript segments table
      for (const caption of captions) {
        await env.DB.prepare(`
          INSERT INTO youtube_transcripts (
            video_id, start_time_seconds, end_time_seconds, text, created_at
          ) VALUES (?, ?, ?, ?, ?)
        `).bind(
          video.video_id,
          caption.start,
          caption.start + caption.dur,
          caption.text,
          new Date().toISOString()
        ).run();
      }

      // Update youtube_videos table
      await env.DB.prepare(`
        UPDATE youtube_videos
        SET transcript_available = TRUE,
            transcript_r2_key = ?,
            transcript_format = 'vtt',
            transcript_language = 'en',
            transcript_downloaded_at = ?,
            transcript_download_method = 'youtube-captions-scraper',
            updated_at = ?
        WHERE video_id = ?
      `).bind(
        r2Key,
        new Date().toISOString(),
        new Date().toISOString(),
        video.video_id
      ).run();

      // Mark job as completed
      await env.DB.prepare(`
        UPDATE processing_jobs
        SET status = 'completed',
            completed_at = ?,
            progress = 100
        WHERE job_id = ?
      `).bind(new Date().toISOString(), jobId).run();

      downloaded++;
      console.log(`[Transcript] ✓ ${video.video_id} (${captions.length} segments)`);

      // Release lock
      await env.KV.delete(lockKey);

    } catch (error: any) {
      failed++;

      await env.DB.prepare(`
        UPDATE processing_jobs
        SET status = 'failed',
            error_message = ?,
            completed_at = ?
        WHERE job_id = ?
      `).bind(
        error.message,
        new Date().toISOString(),
        jobId
      ).run();

      console.error(`[Transcript] ✗ ${video.video_id}:`, error.message);
    }

    // Rate limit: 2 seconds between downloads
    await new Promise(resolve => setTimeout(resolve, 2000));
  }

  console.log(`[Transcripts] Downloaded: ${downloaded}, Failed: ${failed}`);
}

async function retryFailedJobs(env: Env): Promise<void> {
  console.log('[Cron] Step 4: Retrying failed jobs...');

  const { results } = await env.DB.prepare(`
    SELECT *
    FROM processing_jobs
    WHERE status = 'failed'
      AND retry_count < max_retries
      AND (rate_limit_hit = FALSE OR retry_after_seconds IS NULL OR
           CAST((julianday('now') - julianday(updated_at)) * 86400 AS INTEGER) > retry_after_seconds)
    ORDER BY created_at DESC
    LIMIT 10
  `).all();

  for (const job of results) {
    try {
      // Reset job to pending with incremented retry count
      await env.DB.prepare(`
        UPDATE processing_jobs
        SET status = 'pending',
            retry_count = retry_count + 1,
            updated_at = ?
        WHERE job_id = ?
      `).bind(new Date().toISOString(), job.job_id).run();

      console.log(`[Retry] Job ${job.job_id} (${job.job_type}) attempt ${job.retry_count + 1}/${job.max_retries}`);
    } catch (error) {
      console.error(`[Retry] Failed to retry job ${job.job_id}:`, error);
    }
  }
}

async function cleanupStaleLocks(env: Env): Promise<void> {
  console.log('[Cron] Step 5: Cleaning up stale processing locks...');

  // Find jobs that have been running for >30 minutes
  const { results } = await env.DB.prepare(`
    SELECT job_id, entity_id, job_type
    FROM processing_jobs
    WHERE status = 'running'
      AND CAST((julianday('now') - julianday(started_at)) * 1440 AS INTEGER) > 30
  `).all();

  for (const job of results) {
    // Mark as failed
    await env.DB.prepare(`
      UPDATE processing_jobs
      SET status = 'failed',
          error_message = 'Job timeout (stale lock)',
          completed_at = ?
      WHERE job_id = ?
    `).bind(new Date().toISOString(), job.job_id).run();

    // Remove KV lock
    const lockKey = `lock:${job.job_type}:${job.entity_id}`;
    await env.KV.delete(lockKey);

    console.log(`[Cleanup] Removed stale lock for ${job.job_id}`);
  }
}

function convertToVTT(captions: any[]): string {
  let vtt = 'WEBVTT\n\n';

  for (let i = 0; i < captions.length; i++) {
    const caption = captions[i];
    const start = formatTimestamp(caption.start);
    const end = formatTimestamp(caption.start + caption.dur);

    vtt += `${i + 1}\n`;
    vtt += `${start} --> ${end}\n`;
    vtt += `${caption.text}\n\n`;
  }

  return vtt;
}

function formatTimestamp(seconds: number): string {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = Math.floor(seconds % 60);
  const ms = Math.floor((seconds % 1) * 1000);

  return `${pad(hours)}:${pad(minutes)}:${pad(secs)}.${pad(ms, 3)}`;
}

function pad(num: number, size: number = 2): string {
  return num.toString().padStart(size, '0');
}
```

---

## Edge Cases and Error Handling

### Edge Case 1: Multiple Videos for One Session

**Problem:** Parliament sessions may be split into multiple YouTube videos (Part 1, Part 2).

**Solution:**
```typescript
// Modify youtube_videos table to support multi-part videos
ALTER TABLE youtube_videos ADD COLUMN part_number INTEGER DEFAULT 1;
ALTER TABLE youtube_videos ADD COLUMN total_parts INTEGER DEFAULT 1;

// When matching, detect "Part X" in title
function detectVideoPart(title: string): { part: number; total: number } {
  const partMatch = title.match(/Part (\d+) of (\d+)/i) || title.match(/Part (\d+)/i);

  if (partMatch) {
    return {
      part: parseInt(partMatch[1]),
      total: partMatch[2] ? parseInt(partMatch[2]) : 1
    };
  }

  return { part: 1, total: 1 };
}

// Link all parts to same session
await env.DB.prepare(`
  INSERT INTO youtube_videos (
    video_id, title, url, session_date, part_number, total_parts, ...
  ) VALUES (?, ?, ?, ?, ?, ?, ...)
`).bind(videoId, title, url, sessionDate, partInfo.part, partInfo.total, ...).run();
```

### Edge Case 2: Videos Uploaded Late

**Problem:** YouTube video might be uploaded days after the session.

**Solution:**
```typescript
// Search with wider date range
const searchParams = {
  publishedAfter: addDays(sessionDate, -7).toISOString(),  // 7 days before
  publishedBefore: addDays(sessionDate, +30).toISOString() // 30 days after
};

// Store last_checked timestamp to avoid redundant searches
await env.DB.prepare(`
  UPDATE sessions
  SET youtube_last_checked_at = ?
  WHERE date = ?
`).bind(new Date().toISOString(), date).run();

// Only re-check recent sessions (within 60 days)
const shouldRecheck = (session: Session) => {
  if (session.youtube_video_id) return false; // Already matched

  const sessionDate = parseDate(session.date);
  const daysSinceSession = differenceInDays(new Date(), sessionDate);

  return daysSinceSession <= 60; // Only search for videos within 60 days
};
```

### Edge Case 3: Transcript Availability Delays

**Problem:** YouTube may take hours/days to generate auto-captions.

**Solution:**
```typescript
// Implement exponential backoff for transcript downloads
async function scheduleTranscriptRetry(env: Env, videoId: string, attempt: number): Promise<void> {
  const delays = [3600, 7200, 21600, 86400]; // 1h, 2h, 6h, 24h
  const retryAfter = delays[Math.min(attempt, delays.length - 1)];

  await env.DB.prepare(`
    UPDATE processing_jobs
    SET status = 'pending',
        retry_count = retry_count + 1,
        retry_after_seconds = ?,
        updated_at = ?
    WHERE entity_id = ? AND job_type = 'transcript_download'
  `).bind(retryAfter, new Date().toISOString(), videoId).run();

  console.log(`[Transcript] ${videoId} will retry in ${retryAfter/3600} hours (attempt ${attempt + 1})`);
}
```

### Edge Case 4: Rate Limit Exceeded (YouTube API)

**Problem:** Hitting 10,000 unit daily quota.

**Solution:**
```typescript
// Graceful degradation when quota exceeded
try {
  const match = await matchSessionToYouTube(env, session);
} catch (error) {
  if (error.message.includes('quota')) {
    // Mark for retry tomorrow
    await env.DB.prepare(`
      INSERT INTO processing_jobs (
        job_id, job_type, entity_id, status, rate_limit_hit,
        retry_after_seconds, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?)
    `).bind(
      `youtube_search_${session.date}_${Date.now()}`,
      'youtube_search',
      session.date,
      'pending',
      true, // rate_limit_hit
      86400, // 24 hours
      new Date().toISOString()
    ).run();

    console.warn(`[Quota] YouTube API quota exceeded, ${session.date} queued for tomorrow`);
  } else {
    throw error;
  }
}
```

### Edge Case 5: Cloudflare Workers CPU Time Limits

**Problem:** Workers have 50ms CPU time limit on free tier, 30s on paid.

**Solution:**
```typescript
// Batch processing with early termination
async function processInBatches<T>(
  items: T[],
  processor: (item: T) => Promise<void>,
  batchSize: number = 10
): Promise<{ processed: number; failed: number }> {
  let processed = 0;
  let failed = 0;

  for (let i = 0; i < items.length; i += batchSize) {
    const batch = items.slice(i, i + batchSize);

    for (const item of batch) {
      try {
        await processor(item);
        processed++;
      } catch (error) {
        failed++;
        console.error('Batch processing error:', error);
      }
    }

    // Yield control to avoid CPU timeout
    await new Promise(resolve => setTimeout(resolve, 100));
  }

  return { processed, failed };
}

// Use in cron job
const sessions = await getUnmatchedSessions(env);
const result = await processInBatches(
  sessions,
  async (session) => await matchSessionToYouTube(env, session),
  5 // Process 5 at a time
);
```

### Edge Case 6: Transcript Language Variants

**Problem:** Videos may have multiple language transcripts (English, Chinese, Malay, Tamil).

**Solution:**
```typescript
// Store all available transcripts
interface TranscriptDownloadResult {
  available_languages: string[];
  primary_language: string;
}

async function downloadAllTranscripts(videoId: string): Promise<TranscriptDownloadResult> {
  const languages = ['en', 'zh', 'ms', 'ta'];
  const downloaded: string[] = [];

  for (const lang of languages) {
    try {
      const captions = await getSubtitles({ videoID: videoId, lang });

      // Store with language suffix
      const r2Key = `youtube/transcripts/${videoId}_${lang}.vtt`;
      const vtt = convertToVTT(captions);
      await env.R2.put(r2Key, vtt);

      downloaded.push(lang);
    } catch (error) {
      console.warn(`[Transcript] ${videoId} ${lang}: Not available`);
    }
  }

  return {
    available_languages: downloaded,
    primary_language: downloaded.includes('en') ? 'en' : downloaded[0]
  };
}

// Update D1 schema to track languages
ALTER TABLE youtube_videos ADD COLUMN available_languages TEXT; -- JSON array
```

---

## Cost Estimates

### YouTube Data API v3

| Operation | Quota Cost | Daily Limit | Monthly Cost |
|-----------|-----------|-------------|--------------|
| Search API | 100 units | 10,000 units/day | **$0** (free tier) |
| Videos.list | 1 unit | | |
| **Per video match** | **101 units** | ~99 matches/day | |
| **With caching** | ~10 units/day | ~1000 matches/day | |

**Paid Quota (if needed):**
- Base: 10,000 units/day (free)
- Additional: $0 for first 1M units, then pricing varies
- **Estimated cost: $0/month** (caching makes free tier sufficient)

### Transcript Download (yt-dlp / youtube-captions-scraper)

| Method | Cost | Rate Limit | Notes |
|--------|------|-----------|-------|
| youtube-captions-scraper | **$0** | ~60/minute | Unofficial API, may break |
| External yt-dlp service (Modal) | **$0.10/1000 calls** | Custom | More reliable |
| YouTube Captions API (OAuth) | **$0** | 10,000 units/day | Complex setup |

**Recommended: youtube-captions-scraper** ($0/month)

### Cloudflare Services

| Service | Free Tier | Usage Estimate | Cost |
|---------|-----------|----------------|------|
| **Workers** | 100K req/day | ~500 req/day | **$0** |
| **D1** | 100K writes/day, 5M reads/day | ~200 writes/day, ~2K reads/day | **$0** |
| **R2** | 10GB storage | ~3GB (transcripts) | **$0** |
| **KV** | 100K reads/day, 1K writes/day | ~1K reads/day, ~50 writes/day | **$0** |

**Total Infrastructure Cost: $0/month**

### Total Cost Summary

**Monthly Costs:**
- YouTube API: $0 (free tier with caching)
- Transcript downloads: $0 (youtube-captions-scraper)
- Cloudflare infrastructure: $0 (within free tier)
- **Total: $0/month**

**If scaling beyond free tier:**
- 10x traffic: ~$15/month
- 100x traffic: ~$150/month (would need quota increase from Google)

---

## Implementation Timeline

### Phase 1: D1 Schema & Migration (Week 1)
**Duration: 10 hours**

**Tasks:**
1. Create D1 database: `wrangler d1 create parliament-db` (30 min)
2. Write SQL schema migration (2 hours)
3. Create migration script (KV → D1) (3 hours)
4. Backfill existing sessions from R2 (2 hours)
5. Backfill YouTube video mappings (1 hour)
6. Verify data integrity with tests (1.5 hours)

**Deliverables:**
- D1 database with 4 tables (sessions, youtube_videos, youtube_transcripts, moments, processing_jobs)
- ~2000 sessions migrated
- ~30 existing YouTube videos linked
- Migration validation report

### Phase 2: YouTube Integration (Week 2)
**Duration: 15 hours**

**Tasks:**
1. Set up youtube-captions-scraper package (1 hour)
2. Implement transcript download function (3 hours)
3. Implement VTT parsing and D1 storage (2 hours)
4. Integrate with existing video-matcher worker (3 hours)
5. Add quota tracking and rate limiting (2 hours)
6. Write unit tests for YouTube functions (2 hours)
7. Integration testing with real YouTube API (2 hours)

**Deliverables:**
- Transcript download working for test videos
- D1 youtube_transcripts table populated
- Rate limiting preventing quota exhaustion
- Test coverage >80%

### Phase 3: Cron Orchestration (Week 3)
**Duration: 12 hours**

**Tasks:**
1. Create parliament-data-orchestrator worker scaffold (1 hour)
2. Implement checkNewHansardSessions() (1 hour)
3. Implement matchUnmatchedSessions() (3 hours)
4. Implement downloadMissingTranscripts() (3 hours)
5. Implement retryFailedJobs() (2 hours)
6. Set up cron triggers (3x/day) (1 hour)
7. Test cron execution with manual triggers (1 hour)

**Deliverables:**
- Daily cron running 3x/day
- Automatic session-to-video matching
- Automatic transcript downloads
- Failed job retry logic

### Phase 4: Integration & Production (Week 4)
**Duration: 12 hours**

**Tasks:**
1. Update parliament-scraper to write to D1 (3 hours)
2. Create unified Parliament Data API (4 hours)
3. End-to-end testing (2 hours)
4. Performance optimization (1 hour)
5. Documentation updates (1 hour)
6. Production deployment (1 hour)

**Deliverables:**
- All workers using D1
- Complete data pipeline tested (Hansard → YouTube → Transcript → Moments)
- API documentation
- Production deployment complete

**Total Implementation Time: 49 hours (~6 working days)**

---

## Success Metrics

### Technical Metrics

| Metric | Target | Measurement |
|--------|--------|-------------|
| **API Response Time** | <100ms (cached), <500ms (D1) | CloudFlare Analytics |
| **Cron Success Rate** | >99% | Processing jobs table |
| **YouTube Match Accuracy** | >90% confidence score | video-matcher results |
| **Transcript Availability** | >90% (for recent videos) | youtube_videos table |
| **Data Freshness** | <24 hours for new sessions | Last cron run timestamp |

### Business Metrics

| Metric | Target | Measurement |
|--------|--------|-------------|
| **Sessions Tracked** | ~2000 (1955-2025) | D1 sessions count |
| **YouTube Coverage** | >80% (14th/15th Parliament) | Video match ratio |
| **Transcript Coverage** | >90% (recent videos) | Transcript availability ratio |
| **Processing Completion** | >95% success rate | Completed jobs / total jobs |
| **Cost Efficiency** | $0/month | Cloudflare free tier |

---

## Monitoring and Observability

### Key Metrics to Track

```typescript
// Daily health check endpoint
app.get('/api/health', async (c) => {
  const db = c.env.DB;

  // Count sessions with/without YouTube
  const sessionStats = await db.prepare(`
    SELECT
      COUNT(*) as total,
      SUM(CASE WHEN youtube_video_id IS NOT NULL THEN 1 ELSE 0 END) as with_youtube,
      SUM(CASE WHEN moments_extracted THEN 1 ELSE 0 END) as with_moments
    FROM sessions
    WHERE hansard_available = TRUE
  `).first();

  // Count transcripts
  const transcriptStats = await db.prepare(`
    SELECT
      COUNT(*) as total,
      SUM(CASE WHEN transcript_available THEN 1 ELSE 0 END) as with_transcript
    FROM youtube_videos
  `).first();

  // Recent processing jobs
  const jobStats = await db.prepare(`
    SELECT
      status,
      COUNT(*) as count
    FROM processing_jobs
    WHERE created_at > datetime('now', '-24 hours')
    GROUP BY status
  `).all();

  // YouTube API quota usage
  const quotaUsage = await c.env.KV.get('rate:youtube_api_quota');

  return c.json({
    status: 'healthy',
    timestamp: new Date().toISOString(),
    sessions: sessionStats,
    transcripts: transcriptStats,
    processing_jobs_24h: jobStats.results,
    youtube_quota_used: quotaUsage ? parseInt(quotaUsage) : 0,
    youtube_quota_limit: 10000
  });
});
```

### Alerting Thresholds

```typescript
// Alert conditions
const alerts = {
  youtube_quota_exceeded: quotaUsage >= 9000,         // 90% of quota
  cron_failed: jobStats.failed > 10,                  // >10 failures in 24h
  transcript_download_rate_low: transcriptRate < 0.8, // <80% success
  stale_data: hoursSinceLastCron > 25                 // Cron hasn't run in 25h
};

// Send to monitoring service (e.g., Sentry, Datadog)
if (Object.values(alerts).some(a => a)) {
  await fetch('https://monitoring-service.com/alert', {
    method: 'POST',
    body: JSON.stringify({ alerts, timestamp: new Date().toISOString() })
  });
}
```

---

## Conclusion

This architecture provides a production-ready system for tracking YouTube recordings of Singapore Parliament sessions with the following key features:

**Data Model:**
- D1 relational database with foreign keys (sessions ↔ youtube_videos ↔ transcripts ↔ moments)
- R2 for storing large files (VTT transcripts, videos, Hansard JSON)
- KV for fast caching and rate limiting

**YouTube Integration:**
- Video matching via existing video-matcher worker (YouTube Data API v3)
- Transcript downloads via youtube-captions-scraper (no quota cost)
- Intelligent rate limiting and quota management
- Support for multiple language transcripts

**Automation:**
- Daily cron (3x/day) for monitoring new content
- Automatic session-to-video matching
- Automatic transcript downloads
- Failed job retry with exponential backoff

**Robustness:**
- Comprehensive error handling for all edge cases
- Processing locks to prevent duplicate work
- Graceful degradation on quota exhaustion
- Support for multi-part videos and late uploads

**Cost Efficiency:**
- $0/month on Cloudflare free tier
- Aggressive caching reduces API calls by 90%+
- Scales to 2000+ sessions, 500+ videos, 10K+ moments

**Implementation:**
- 49 hours total (~6 working days)
- Phased rollout with testing at each stage
- Backwards compatible with existing workers
- Full test coverage and monitoring

**Next Steps:**
1. Review architecture with team
2. Get approval for D1 migration
3. Begin Phase 1: D1 setup and schema creation
4. Deploy incrementally, testing at each phase
5. Monitor metrics and optimize as needed

---

**Document Status:** Production-Ready Design
**Author:** Backend Architecture Team
**Last Updated:** 2025-10-25
**Version:** 1.0
