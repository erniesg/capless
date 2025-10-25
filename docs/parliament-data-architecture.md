# Multi-Source Parliament Data Architecture

**Version:** 1.0
**Date:** 2025-10-25
**Status:** Design Specification
**Purpose:** Unified architecture for tracking Hansard sessions, YouTube videos, transcripts, and processed moments

---

## Executive Summary

This architecture provides a scalable, cost-effective system for correlating four data sources:
1. **Parliament Hansard Sessions** (from sprs.parl.gov.sg API → R2)
2. **YouTube Videos** (14th/15th Parliament recordings)
3. **YouTube Transcripts** (VTT captions from yt-dlp)
4. **Processed Moments** (viral-worthy segments extracted from Hansard)

**Key Design Decisions:**
- **Primary Storage:** Cloudflare D1 (SQLite) for structured relational data
- **File Storage:** Cloudflare R2 for raw JSON, audio, video assets
- **Cache Layer:** KV for fast lookups and rate limiting
- **Cost:** $0/month on Cloudflare free tier (up to ~2000 sessions)
- **Scale:** Supports 70 years of parliament data (1955-2025)

---

## Problem Statement

### Current Limitations

**KV-Only Implementation Issues:**
```typescript
// Current structure (workers/parliament-scraper/src/index.ts lines 20-24)
interface DateCheckRecord {
  last_checked: string;
  status: 'has_session' | 'no_session';
  attempts: number;
}
// Stored as: KV key `date:{DD-MM-YYYY}` → DateCheckRecord
```

**What's Missing:**
1. ❌ No correlation with YouTube videos (which sessions have videos?)
2. ❌ No tracking of transcript availability (VTT captions downloaded?)
3. ❌ No linking between Hansard timestamps and YouTube timestamps
4. ❌ No processing state tracking (moments extracted? embeddings generated?)
5. ❌ No parliament metadata (14th vs 15th parliament, session numbers)
6. ❌ No multi-source queries (find all sessions with videos AND moments)

### Required Capabilities

**Daily Monitoring Cron:**
```typescript
// What the daily cron should check:
1. New Hansard sessions published (currently done via /check-today)
2. New YouTube videos posted to parliament channel
3. Missing YouTube transcripts for known videos
4. Failed processing jobs (moment extraction, embeddings)
5. Sessions with videos but no moments yet
```

**API Endpoints Needed:**
```typescript
// Session queries
GET /api/sessions?has_video=true&has_moments=false&parliament=15
GET /api/sessions/:date/youtube  // Get YouTube video for session

// YouTube queries
GET /api/youtube/videos?transcript_available=false
GET /api/youtube/:video_id/moments  // Get moments for video

// Processing status
GET /api/processing/pending  // Sessions needing processing
POST /api/processing/retry/:date  // Retry failed processing
```

---

## Recommended Architecture: Hybrid D1 + R2 + KV

### Architecture Overview

```
┌─────────────────────────────────────────────────────────────┐
│                    Cloudflare Workers                       │
│  ┌─────────────────┐  ┌─────────────────┐  ┌─────────────┐ │
│  │ Parliament      │  │ YouTube         │  │ Moments     │ │
│  │ Scraper         │  │ Monitor         │  │ Processor   │ │
│  │ (existing)      │  │ (new)           │  │ (existing)  │ │
│  └────────┬────────┘  └────────┬────────┘  └──────┬──────┘ │
│           │                    │                   │        │
│           ▼                    ▼                   ▼        │
│  ┌──────────────────────────────────────────────────────┐  │
│  │           Unified Parliament API Worker              │  │
│  │       (New: Coordinates all data sources)            │  │
│  └───┬────────────────┬─────────────────┬───────────────┘  │
│      │                │                 │                  │
└──────┼────────────────┼─────────────────┼──────────────────┘
       │                │                 │
       ▼                ▼                 ▼
┌──────────────┐ ┌─────────────┐ ┌──────────────────┐
│ Cloudflare   │ │ Cloudflare  │ │ Cloudflare KV    │
│ D1 (SQLite)  │ │ R2 (S3)     │ │ (Cache + Locks)  │
│              │ │             │ │                  │
│ • sessions   │ │ • hansard/  │ │ • session:{date} │
│ • youtube    │ │ • youtube/  │ │ • youtube:{id}   │
│ • moments    │ │ • moments/  │ │ • rate_limit:*   │
│ • processing │ │ • audio/    │ │                  │
└──────────────┘ └─────────────┘ └──────────────────┘
```

### Why D1 (Not Enhanced KV or R2-Only)?

**Comparison Matrix:**

| Approach | Pros | Cons | Cost | Complexity |
|----------|------|------|------|------------|
| **Enhanced KV** | Fast reads, no SQL | No JOINs, manual indexing, limited queries | $5/mo | High (manual index management) |
| **R2 JSON Index** | Cheap storage | Slow queries, no relations, full scans needed | $2/mo | Very High (custom query engine) |
| **D1 + R2 + KV** ✅ | Relational queries, foreign keys, indexes, fast lookups | Requires SQL migration | **$0/mo** | Low (standard SQL) |

**D1 Advantages:**
- ✅ **Built-in relations:** Foreign keys between sessions, YouTube videos, moments
- ✅ **Complex queries:** `JOIN sessions WHERE has_video=true AND has_moments=false`
- ✅ **Indexes:** Fast lookups on date, parliament number, session number
- ✅ **Transactions:** Atomic updates across multiple tables
- ✅ **Free tier:** 100K writes/day, 5M reads/day (sufficient for parliament data)
- ✅ **SQL migrations:** Standard schema evolution with Drizzle ORM

**D1 Constraints (within free tier):**
- Database size: 500MB (our data: ~50MB for 2000 sessions + metadata)
- Read operations: 5M/day (avg 3.5 reads/second)
- Write operations: 100K/day (avg 1.2 writes/second)
- Storage per database: 500MB max

**Current Scale Estimate:**
```typescript
// Data volumes:
Sessions (1955-2025): ~2000 records × 500 bytes = 1MB
YouTube videos: ~500 records × 300 bytes = 150KB
Moments: ~10,000 records × 400 bytes = 4MB
Processing jobs: ~2000 records × 200 bytes = 400KB

Total D1 storage: ~6MB (1.2% of free tier limit)
Daily writes: ~100 (0.1% of free tier limit)
Daily reads: ~10,000 (0.2% of free tier limit)
```

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
  hansard_structure TEXT CHECK(hansard_structure IN ('html', 'json')),
  hansard_scraped_at TEXT,                 -- ISO timestamp

  -- YouTube correlation
  youtube_video_id TEXT,                   -- Foreign key to youtube_videos
  youtube_match_confidence REAL,           -- 0.0-1.0
  youtube_match_method TEXT,               -- 'title_date' | 'api_search' | 'manual'

  -- Processing state
  moments_extracted BOOLEAN DEFAULT FALSE,
  moments_count INTEGER DEFAULT 0,
  embeddings_generated BOOLEAN DEFAULT FALSE,

  -- Status tracking
  status TEXT CHECK(status IN ('pending', 'processing', 'completed', 'failed')),
  last_processed_at TEXT,
  processing_error TEXT,

  -- Metadata
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now')),

  FOREIGN KEY (youtube_video_id) REFERENCES youtube_videos(video_id)
);

-- Indexes for common queries
CREATE INDEX idx_sessions_parliament ON sessions(parliament_number);
CREATE INDEX idx_sessions_youtube ON sessions(youtube_video_id);
CREATE INDEX idx_sessions_status ON sessions(status);
CREATE INDEX idx_sessions_pending_processing
  ON sessions(hansard_available, moments_extracted)
  WHERE hansard_available = TRUE AND moments_extracted = FALSE;

-- ============================================
-- YOUTUBE VIDEOS TABLE
-- Tracks YouTube parliament recordings
-- ============================================
CREATE TABLE youtube_videos (
  video_id TEXT PRIMARY KEY,               -- YouTube video ID

  -- Video metadata
  title TEXT NOT NULL,
  url TEXT NOT NULL,
  duration_seconds INTEGER,
  published_at TEXT,                       -- ISO timestamp
  channel_id TEXT,

  -- Parliament correlation
  session_date TEXT,                       -- DD-MM-YYYY (may not match sessions exactly)
  parliament_number INTEGER,               -- Inferred from date
  is_interpretation BOOLEAN DEFAULT FALSE, -- English interpretation version?

  -- Transcript availability
  transcript_available BOOLEAN DEFAULT FALSE,
  transcript_r2_key TEXT,                  -- youtube/transcripts/{video_id}.vtt
  transcript_format TEXT,                  -- 'vtt' | 'srt' | 'json'
  transcript_downloaded_at TEXT,

  -- Processing state
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
  youtube_timestamp TEXT,                  -- MM:SS format
  youtube_url TEXT,                        -- Shareable URL with ?t=
  timestamp_confidence REAL,               -- 0.0-1.0

  -- Embeddings
  embedding_generated BOOLEAN DEFAULT FALSE,
  vectorize_id TEXT,                       -- ID in Vectorize index

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
CREATE INDEX idx_moments_pending_assets
  ON moments(script_generated, audio_generated, video_generated)
  WHERE video_generated = FALSE;

-- ============================================
-- PROCESSING JOBS TABLE
-- Tracks async processing tasks
-- ============================================
CREATE TABLE processing_jobs (
  job_id TEXT PRIMARY KEY,

  -- Job details
  job_type TEXT CHECK(job_type IN ('hansard_scrape', 'youtube_match', 'transcript_download', 'moment_extraction', 'embedding_generation', 'asset_generation')),
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
  retry_count INTEGER DEFAULT 0,
  max_retries INTEGER DEFAULT 3,

  -- Metadata
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);

CREATE INDEX idx_jobs_status ON processing_jobs(status);
CREATE INDEX idx_jobs_type ON processing_jobs(job_type);
CREATE INDEX idx_jobs_entity ON processing_jobs(entity_id);
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
│   │   └── {video_id}.vtt                 # VTT captions from yt-dlp
│   │   └── {video_id}.json                # Processed transcript segments
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
└── embeddings/
    └── {parliament_number}/
        └── session-{date}-embeddings.json # Vector embeddings per session
```

### KV Namespace Structure

```typescript
// Fast lookups and caching
interface KVSchema {
  // Session cache (1 hour TTL)
  'session:{date}': {
    hansard_available: boolean;
    youtube_video_id: string | null;
    moments_count: number;
    last_updated: string;
  };

  // YouTube cache (1 hour TTL)
  'youtube:{video_id}': {
    title: string;
    duration_seconds: number;
    transcript_available: boolean;
    session_date: string | null;
  };

  // Processing locks (10 minute TTL)
  'lock:processing:{entity_id}': {
    job_id: string;
    started_at: string;
    worker_id: string;
  };

  // Rate limiting (1 minute TTL)
  'rate:youtube_api': number;               // Current request count
  'rate:hansard_api': number;
  'rate:openai_api': number;
}
```

---

## Migration Plan

### Phase 1: D1 Setup (2 hours)

**1. Create D1 database:**
```bash
cd /Users/erniesg/code/erniesg/capless/workers/parliament-scraper

# Create database
npx wrangler d1 create parliament-db

# Add to wrangler.toml
[[d1_databases]]
binding = "DB"
database_name = "parliament-db"
database_id = "<generated-id>"
```

**2. Initialize schema:**
```bash
# Create migration
npx wrangler d1 migrations create parliament-db init-schema

# Edit migrations/0001_init-schema.sql with schema above
# Apply migration
npx wrangler d1 migrations apply parliament-db
```

**3. Verify schema:**
```bash
npx wrangler d1 execute parliament-db --command "SELECT name FROM sqlite_master WHERE type='table';"
# Should show: sessions, youtube_videos, moments, processing_jobs
```

### Phase 2: Backfill Existing Data (4 hours)

**1. Migrate existing KV data to D1:**

```typescript
// workers/parliament-scraper/scripts/migrate-kv-to-d1.ts

import { parseISO, format } from 'date-fns';

interface Env {
  DATES_KV: KVNamespace;
  DB: D1Database;
  R2: R2Bucket;
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const migrations = {
      sessions: 0,
      youtube: 0,
      errors: [] as string[]
    };

    // Step 1: Get all KV keys with date:* prefix
    console.log('[Migrate] Fetching all KV date records...');
    const kvKeys = await env.DATES_KV.list({ prefix: 'date:' });

    for (const key of kvKeys.keys) {
      const date = key.name.replace('date:', ''); // DD-MM-YYYY
      const record = await env.DATES_KV.get(key.name, 'json') as {
        last_checked: string;
        status: 'has_session' | 'no_session';
        attempts: number;
      };

      try {
        // Convert DD-MM-YYYY to YYYY-MM-DD for session_id
        const [day, month, year] = date.split('-');
        const sessionId = `parliament-${year}-${month}-${day}`;

        // Determine parliament number from date
        const dateObj = new Date(parseInt(year), parseInt(month) - 1, parseInt(day));
        const parliamentNumber = inferParliamentNumber(dateObj);

        // Check if session has Hansard in R2
        const hansardKey = `hansard/raw/${date}.json`;
        const hansardExists = await env.R2.head(hansardKey);

        // Insert into D1
        await env.DB.prepare(`
          INSERT INTO sessions (
            date, session_id, parliament_number,
            hansard_available, hansard_r2_key, hansard_scraped_at,
            status, created_at, updated_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        `).bind(
          date,
          sessionId,
          parliamentNumber,
          hansardExists !== null,
          hansardExists ? hansardKey : null,
          record.last_checked,
          record.status === 'has_session' ? 'completed' : 'pending',
          record.last_checked,
          new Date().toISOString()
        ).run();

        migrations.sessions++;
      } catch (error: any) {
        migrations.errors.push(`${date}: ${error.message}`);
      }
    }

    // Step 2: Load YouTube mapping JSON
    console.log('[Migrate] Loading YouTube video mappings...');
    const youtubeMapping = await fetch('https://raw.githubusercontent.com/erniesg/capless/master/youtube-sessions/youtube-hansard-mapping.json');
    const videos = await youtubeMapping.json();

    for (const [sessionDate, video] of Object.entries(videos)) {
      try {
        const { video_id, title, url, is_interpretation } = video as any;

        // Extract duration from YouTube (would need API call in production)
        const [day, month, year] = sessionDate.split('-');
        const parliamentNumber = inferParliamentNumber(new Date(parseInt(year), parseInt(month) - 1, parseInt(day)));

        await env.DB.prepare(`
          INSERT INTO youtube_videos (
            video_id, title, url, session_date, parliament_number,
            is_interpretation, created_at, updated_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        `).bind(
          video_id,
          title,
          url,
          sessionDate,
          parliamentNumber,
          is_interpretation,
          new Date().toISOString(),
          new Date().toISOString()
        ).run();

        // Update sessions table with YouTube correlation
        await env.DB.prepare(`
          UPDATE sessions
          SET youtube_video_id = ?,
              youtube_match_confidence = 1.0,
              youtube_match_method = 'static_mapping',
              updated_at = ?
          WHERE date = ?
        `).bind(video_id, new Date().toISOString(), sessionDate).run();

        migrations.youtube++;
      } catch (error: any) {
        migrations.errors.push(`YouTube ${sessionDate}: ${error.message}`);
      }
    }

    return new Response(JSON.stringify({
      message: 'Migration complete',
      sessions_migrated: migrations.sessions,
      youtube_videos_migrated: migrations.youtube,
      errors: migrations.errors
    }, null, 2), {
      headers: { 'Content-Type': 'application/json' }
    });
  }
};

function inferParliamentNumber(date: Date): number {
  // Parliament periods (approximate):
  if (date < new Date('2020-08-24')) return 13;
  if (date < new Date('2025-09-05')) return 14;
  return 15;
}
```

**2. Run migration:**
```bash
npx wrangler dev workers/parliament-scraper/scripts/migrate-kv-to-d1.ts
curl http://localhost:8787/migrate
```

### Phase 3: Update Parliament Scraper Worker (3 hours)

**1. Update index.ts to use D1:**

```typescript
// workers/parliament-scraper/src/index.ts

export interface Env {
  R2: R2Bucket;
  DATES_QUEUE: Queue;
  DATES_KV: KVNamespace;  // Keep for backwards compatibility during migration
  DB: D1Database;         // NEW: D1 database
}

// NEW: Helper functions for D1
async function getSession(db: D1Database, date: string) {
  return await db
    .prepare('SELECT * FROM sessions WHERE date = ?')
    .bind(date)
    .first();
}

async function upsertSession(db: D1Database, date: string, data: Partial<Session>) {
  const [day, month, year] = date.split('-');
  const sessionId = `parliament-${year}-${month}-${day}`;
  const parliamentNumber = inferParliamentNumber(new Date(parseInt(year), parseInt(month) - 1, parseInt(day)));

  return await db
    .prepare(`
      INSERT INTO sessions (
        date, session_id, parliament_number, hansard_available, hansard_r2_key,
        hansard_scraped_at, status, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(date) DO UPDATE SET
        hansard_available = excluded.hansard_available,
        hansard_r2_key = excluded.hansard_r2_key,
        hansard_scraped_at = excluded.hansard_scraped_at,
        status = excluded.status,
        updated_at = excluded.updated_at
    `)
    .bind(
      date,
      sessionId,
      parliamentNumber,
      data.hansard_available ?? false,
      data.hansard_r2_key ?? null,
      data.hansard_scraped_at ?? new Date().toISOString(),
      data.status ?? 'completed',
      new Date().toISOString()
    )
    .run();
}

// MODIFY: Queue consumer to update D1 instead of just KV
async queue(batch: MessageBatch<DateMessage>, env: Env): Promise<void> {
  for (const message of batch.messages) {
    const { date, attempt } = message.body;

    try {
      // Check if already exists in D1
      const existingSession = await getSession(env.DB, date);
      if (existingSession?.hansard_available) {
        console.log(`[Skip] ${date} already in D1`);
        message.ack();
        continue;
      }

      // Fetch Hansard
      const hansard = await fetchHansard(date);

      // Save to R2
      const r2Key = `hansard/raw/${date}.json`;
      await saveToR2(env.R2, date, hansard);

      // Update D1 with session data
      await upsertSession(env.DB, date, {
        hansard_available: true,
        hansard_r2_key: r2Key,
        hansard_scraped_at: new Date().toISOString(),
        status: 'completed'
      });

      // Keep KV for cache (1 hour TTL)
      await env.DATES_KV.put(`session:${date}`, JSON.stringify({
        hansard_available: true,
        youtube_video_id: null,
        moments_count: 0,
        last_updated: new Date().toISOString()
      }), { expirationTtl: 3600 });

      message.ack();
    } catch (error: any) {
      if (error.message.includes('HTTP 500')) {
        // No session - update D1
        await upsertSession(env.DB, date, {
          hansard_available: false,
          status: 'pending'
        });
        message.ack();
      } else {
        message.retry();
      }
    }
  }
}
```

### Phase 4: Create Unified Parliament API Worker (6 hours)

**1. Create new worker:**
```bash
cd /Users/erniesg/code/erniesg/capless/workers
mkdir parliament-api
cd parliament-api
npm init -y
npm install --save-dev wrangler typescript @cloudflare/workers-types
npm install drizzle-orm
```

**2. Implement API endpoints:**

```typescript
// workers/parliament-api/src/index.ts

import { Env } from './types';
import { Router } from './router';

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const router = new Router(env);
    return router.handle(request);
  },

  // Cron: Daily monitoring
  async scheduled(event: ScheduledEvent, env: Env): Promise<void> {
    console.log('[Cron] Running daily parliament data checks...');

    // 1. Check for new Hansard sessions
    await checkNewHansardSessions(env);

    // 2. Check for new YouTube videos
    await checkNewYouTubeVideos(env);

    // 3. Check for missing transcripts
    await checkMissingTranscripts(env);

    // 4. Retry failed processing jobs
    await retryFailedJobs(env);
  }
};

// router.ts
export class Router {
  constructor(private env: Env) {}

  async handle(request: Request): Promise<Response> {
    const url = new URL(request.url);

    // Session endpoints
    if (url.pathname === '/api/sessions' && request.method === 'GET') {
      return this.listSessions(url.searchParams);
    }
    if (url.pathname.match(/^\/api\/sessions\/[^/]+$/) && request.method === 'GET') {
      const date = url.pathname.split('/').pop()!;
      return this.getSession(date);
    }
    if (url.pathname.match(/^\/api\/sessions\/[^/]+\/youtube$/) && request.method === 'GET') {
      const date = url.pathname.split('/')[3];
      return this.getSessionYouTube(date);
    }

    // YouTube endpoints
    if (url.pathname === '/api/youtube/videos' && request.method === 'GET') {
      return this.listYouTubeVideos(url.searchParams);
    }
    if (url.pathname.match(/^\/api\/youtube\/[^/]+\/moments$/) && request.method === 'GET') {
      const videoId = url.pathname.split('/')[3];
      return this.getVideoMoments(videoId);
    }

    // Processing endpoints
    if (url.pathname === '/api/processing/pending' && request.method === 'GET') {
      return this.getPendingProcessing();
    }
    if (url.pathname.match(/^\/api\/processing\/retry\/[^/]+$/) && request.method === 'POST') {
      const date = url.pathname.split('/').pop()!;
      return this.retryProcessing(date);
    }

    return new Response('Not Found', { status: 404 });
  }

  async listSessions(params: URLSearchParams): Promise<Response> {
    const hasVideo = params.get('has_video') === 'true';
    const hasMoments = params.get('has_moments') === 'true';
    const parliament = params.get('parliament');
    const limit = parseInt(params.get('limit') || '100');
    const offset = parseInt(params.get('offset') || '0');

    let query = 'SELECT * FROM sessions WHERE 1=1';
    const bindings: any[] = [];

    if (hasVideo !== undefined) {
      query += ' AND youtube_video_id IS NOT NULL';
    }
    if (hasMoments !== undefined) {
      query += ' AND moments_extracted = ?';
      bindings.push(hasMoments);
    }
    if (parliament) {
      query += ' AND parliament_number = ?';
      bindings.push(parseInt(parliament));
    }

    query += ' ORDER BY date DESC LIMIT ? OFFSET ?';
    bindings.push(limit, offset);

    const { results } = await this.env.DB.prepare(query).bind(...bindings).all();

    return new Response(JSON.stringify({
      sessions: results,
      count: results.length,
      limit,
      offset
    }), {
      headers: { 'Content-Type': 'application/json' }
    });
  }

  async getSession(date: string): Promise<Response> {
    // Check KV cache first
    const cached = await this.env.DATES_KV.get(`session:${date}`, 'json');
    if (cached) {
      return new Response(JSON.stringify(cached), {
        headers: { 'Content-Type': 'application/json', 'X-Cache': 'HIT' }
      });
    }

    // Query D1
    const session = await this.env.DB
      .prepare('SELECT * FROM sessions WHERE date = ?')
      .bind(date)
      .first();

    if (!session) {
      return new Response('Session not found', { status: 404 });
    }

    // Cache for 1 hour
    await this.env.DATES_KV.put(`session:${date}`, JSON.stringify(session), {
      expirationTtl: 3600
    });

    return new Response(JSON.stringify(session), {
      headers: { 'Content-Type': 'application/json', 'X-Cache': 'MISS' }
    });
  }

  async getSessionYouTube(date: string): Promise<Response> {
    const result = await this.env.DB.prepare(`
      SELECT
        s.date,
        s.youtube_match_confidence,
        y.*
      FROM sessions s
      LEFT JOIN youtube_videos y ON s.youtube_video_id = y.video_id
      WHERE s.date = ?
    `).bind(date).first();

    if (!result) {
      return new Response('Session not found', { status: 404 });
    }

    return new Response(JSON.stringify(result), {
      headers: { 'Content-Type': 'application/json' }
    });
  }

  async getPendingProcessing(): Promise<Response> {
    // Sessions with Hansard but no moments
    const pendingMoments = await this.env.DB.prepare(`
      SELECT date, session_id, hansard_r2_key
      FROM sessions
      WHERE hansard_available = TRUE
        AND moments_extracted = FALSE
      ORDER BY date DESC
      LIMIT 50
    `).all();

    // YouTube videos without transcripts
    const pendingTranscripts = await this.env.DB.prepare(`
      SELECT video_id, title, session_date
      FROM youtube_videos
      WHERE transcript_available = FALSE
      ORDER BY published_at DESC
      LIMIT 50
    `).all();

    // Failed processing jobs
    const failedJobs = await this.env.DB.prepare(`
      SELECT *
      FROM processing_jobs
      WHERE status = 'failed'
        AND retry_count < max_retries
      ORDER BY created_at DESC
      LIMIT 50
    `).all();

    return new Response(JSON.stringify({
      pending_moments: pendingMoments.results,
      pending_transcripts: pendingTranscripts.results,
      failed_jobs: failedJobs.results
    }), {
      headers: { 'Content-Type': 'application/json' }
    });
  }
}
```

---

## API Design

### Session Endpoints

```typescript
// List sessions with filters
GET /api/sessions?has_video=true&has_moments=false&parliament=15&limit=100&offset=0
Response: {
  sessions: [
    {
      date: "22-09-2025",
      session_id: "parliament-2025-09-22",
      parliament_number: 15,
      hansard_available: true,
      youtube_video_id: "n9ZyN-lwiXg",
      moments_extracted: false,
      moments_count: 0
    }
  ],
  count: 1,
  limit: 100,
  offset: 0
}

// Get single session details
GET /api/sessions/22-09-2025
Response: {
  date: "22-09-2025",
  session_id: "parliament-2025-09-22",
  parliament_number: 15,
  session_number: 1,
  hansard_available: true,
  hansard_r2_key: "hansard/raw/22-09-2025.json",
  youtube_video_id: "n9ZyN-lwiXg",
  youtube_match_confidence: 1.0,
  moments_extracted: true,
  moments_count: 3
}

// Get YouTube video for session
GET /api/sessions/22-09-2025/youtube
Response: {
  video_id: "n9ZyN-lwiXg",
  title: "Parliament Sitting 22 September 2025",
  url: "https://www.youtube.com/watch?v=n9ZyN-lwiXg",
  duration_seconds: 36000,
  transcript_available: true,
  transcript_r2_key: "youtube/transcripts/n9ZyN-lwiXg.vtt"
}
```

### YouTube Endpoints

```typescript
// List YouTube videos
GET /api/youtube/videos?transcript_available=false&parliament=15
Response: {
  videos: [
    {
      video_id: "abc123",
      title: "Parliament Sitting 15 October 2025",
      session_date: "15-10-2025",
      transcript_available: false
    }
  ]
}

// Get moments for YouTube video
GET /api/youtube/n9ZyN-lwiXg/moments
Response: {
  video_id: "n9ZyN-lwiXg",
  session_date: "22-09-2025",
  moments: [
    {
      moment_id: "demo-moment-1",
      quote: "The alterations were done to cover up...",
      youtube_start_seconds: 5383,
      youtube_url: "https://www.youtube.com/watch?v=n9ZyN-lwiXg&t=5383s"
    }
  ]
}
```

### Processing Endpoints

```typescript
// Get pending processing tasks
GET /api/processing/pending
Response: {
  pending_moments: [
    { date: "22-09-2025", hansard_r2_key: "hansard/raw/22-09-2025.json" }
  ],
  pending_transcripts: [
    { video_id: "abc123", session_date: "15-10-2025" }
  ],
  failed_jobs: [
    {
      job_id: "job-123",
      job_type: "moment_extraction",
      entity_id: "22-09-2025",
      error_message: "OpenAI API timeout"
    }
  ]
}

// Retry failed processing
POST /api/processing/retry/22-09-2025
Response: {
  job_id: "job-456",
  status: "pending",
  entity_id: "22-09-2025"
}
```

---

## Cron Job Design

### Daily Monitoring Cron (runs 3x/day)

```typescript
// workers/parliament-api/src/cron.ts

export async function checkNewHansardSessions(env: Env): Promise<void> {
  console.log('[Cron] Checking for new Hansard sessions...');

  // Get latest session date from D1
  const latestSession = await env.DB
    .prepare('SELECT date FROM sessions ORDER BY date DESC LIMIT 1')
    .first();

  if (!latestSession) {
    console.log('[Cron] No sessions in DB, skipping Hansard check');
    return;
  }

  // Trigger parliament scraper /check-today endpoint
  const scraperUrl = 'https://capless-parliament-scraper.erniesg.workers.dev/check-today';
  const response = await fetch(scraperUrl);
  const result = await response.json();

  console.log(`[Cron] Hansard check: ${result.enqueued} dates queued`);
}

export async function checkNewYouTubeVideos(env: Env): Promise<void> {
  console.log('[Cron] Checking for new YouTube videos...');

  // Query YouTube API for parliament channel uploads
  const channelId = 'UC9JN3S8ACuN4xVLqWvHsLqg'; // Singapore Parliament
  const apiKey = env.YOUTUBE_API_KEY;

  const url = `https://www.googleapis.com/youtube/v3/search?part=snippet&channelId=${channelId}&maxResults=50&order=date&type=video&key=${apiKey}`;

  const response = await fetch(url);
  const data = await response.json();

  let newVideos = 0;

  for (const item of data.items) {
    const videoId = item.id.videoId;
    const title = item.snippet.title;
    const publishedAt = item.snippet.publishedAt;

    // Parse date from title
    const sessionDate = parseDateFromTitle(title);
    if (!sessionDate) continue;

    // Check if already in DB
    const existing = await env.DB
      .prepare('SELECT video_id FROM youtube_videos WHERE video_id = ?')
      .bind(videoId)
      .first();

    if (existing) continue;

    // Insert new video
    await env.DB.prepare(`
      INSERT INTO youtube_videos (
        video_id, title, url, session_date, parliament_number,
        is_interpretation, published_at, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).bind(
      videoId,
      title,
      `https://www.youtube.com/watch?v=${videoId}`,
      sessionDate,
      inferParliamentNumber(parseDateToDate(sessionDate)),
      title.includes('English interpretation'),
      publishedAt,
      new Date().toISOString(),
      new Date().toISOString()
    ).run();

    // Update sessions table
    await env.DB.prepare(`
      UPDATE sessions
      SET youtube_video_id = ?,
          youtube_match_confidence = 1.0,
          youtube_match_method = 'youtube_api',
          updated_at = ?
      WHERE date = ?
    `).bind(videoId, new Date().toISOString(), sessionDate).run();

    newVideos++;
  }

  console.log(`[Cron] Found ${newVideos} new YouTube videos`);
}

export async function checkMissingTranscripts(env: Env): Promise<void> {
  console.log('[Cron] Checking for missing transcripts...');

  // Find videos without transcripts
  const { results } = await env.DB.prepare(`
    SELECT video_id, title, session_date
    FROM youtube_videos
    WHERE transcript_available = FALSE
    ORDER BY published_at DESC
    LIMIT 10
  `).all();

  for (const video of results) {
    // Create processing job to download transcript
    const jobId = `transcript-${video.video_id}-${Date.now()}`;

    await env.DB.prepare(`
      INSERT INTO processing_jobs (
        job_id, job_type, entity_id, status, created_at
      ) VALUES (?, ?, ?, ?, ?)
    `).bind(
      jobId,
      'transcript_download',
      video.video_id,
      'pending',
      new Date().toISOString()
    ).run();

    // Trigger transcript download worker (would be separate worker)
    // await env.TRANSCRIPT_DOWNLOADER.fetch(...)
  }

  console.log(`[Cron] Queued ${results.length} transcript downloads`);
}

export async function retryFailedJobs(env: Env): Promise<void> {
  console.log('[Cron] Retrying failed processing jobs...');

  const { results } = await env.DB.prepare(`
    SELECT *
    FROM processing_jobs
    WHERE status = 'failed'
      AND retry_count < max_retries
    ORDER BY created_at DESC
    LIMIT 20
  `).all();

  for (const job of results) {
    // Update retry count
    await env.DB.prepare(`
      UPDATE processing_jobs
      SET status = 'pending',
          retry_count = retry_count + 1,
          updated_at = ?
      WHERE job_id = ?
    `).bind(new Date().toISOString(), job.job_id).run();

    // Re-trigger job based on type
    // await triggerProcessingJob(env, job);
  }

  console.log(`[Cron] Retried ${results.length} failed jobs`);
}

function parseDateFromTitle(title: string): string | null {
  const pattern = /(\d+)\s+(January|February|March|April|May|June|July|August|September|October|November|December)\s+(\d{4})/;
  const match = title.match(pattern);
  if (!match) return null;

  const [_, day, month, year] = match;
  const monthMap: Record<string, number> = {
    January: 1, February: 2, March: 3, April: 4, May: 5, June: 6,
    July: 7, August: 8, September: 9, October: 10, November: 11, December: 12
  };

  const monthNum = monthMap[month];
  return `${day.padStart(2, '0')}-${monthNum.toString().padStart(2, '0')}-${year}`;
}
```

---

## Implementation Phases

### Phase 1: Foundation (Week 1)
**Objective:** Set up D1 schema and migrate existing data

**Tasks:**
1. Create D1 database and schema (2 hours)
2. Write migration script (KV → D1) (3 hours)
3. Backfill existing sessions from R2 (2 hours)
4. Backfill YouTube video mappings (2 hours)
5. Verify data integrity (1 hour)

**Deliverables:**
- ✅ D1 database with 4 tables
- ✅ ~2000 sessions migrated
- ✅ ~30 YouTube videos linked
- ✅ Migration validation report

### Phase 2: Parliament API Worker (Week 2)
**Objective:** Build unified query API

**Tasks:**
1. Create new worker scaffold (1 hour)
2. Implement session endpoints (4 hours)
3. Implement YouTube endpoints (3 hours)
4. Implement processing endpoints (2 hours)
5. Add KV caching layer (2 hours)
6. Write integration tests (3 hours)

**Deliverables:**
- ✅ Parliament API worker deployed
- ✅ All endpoints tested
- ✅ API documentation

### Phase 3: Cron Monitoring (Week 3)
**Objective:** Automated daily checks

**Tasks:**
1. Implement Hansard scraper integration (2 hours)
2. Implement YouTube API polling (3 hours)
3. Implement transcript downloader (4 hours)
4. Implement failed job retry logic (2 hours)
5. Set up cron triggers (1 hour)

**Deliverables:**
- ✅ Daily cron running 3x/day
- ✅ New Hansard sessions auto-detected
- ✅ New YouTube videos auto-linked
- ✅ Missing transcripts auto-downloaded

### Phase 4: Integration & Testing (Week 4)
**Objective:** End-to-end validation

**Tasks:**
1. Update existing workers to use D1 (4 hours)
2. Test full data flow (Hansard → YouTube → Moments) (3 hours)
3. Performance optimization (2 hours)
4. Documentation updates (2 hours)
5. Production deployment (1 hour)

**Deliverables:**
- ✅ All workers using D1
- ✅ Complete data pipeline tested
- ✅ Production deployment complete

---

## Cost Analysis

### Cloudflare Free Tier Limits

| Service | Free Tier | Our Usage | Status |
|---------|-----------|-----------|--------|
| **Workers** | 100K requests/day | ~10K/day | ✅ 10% |
| **D1** | 100K writes/day, 5M reads/day | ~100 writes/day, ~10K reads/day | ✅ 0.2% |
| **R2** | 10GB storage, 1M writes/month | ~2GB storage, ~3K writes/month | ✅ 20% |
| **KV** | 100K reads/day, 1K writes/day | ~5K reads/day, ~50 writes/day | ✅ 5% |

**Total Monthly Cost: $0** (within free tier)

### Paid Tier Cost Estimate (if scaling beyond free tier)

```typescript
// At 10x current usage:
Workers: $5/month (beyond 10M requests)
D1: $5/month (beyond 25M reads)
R2: $0.15/GB × 20GB = $3/month
KV: Free (still within limits)

Total: ~$13/month for 10x scale
```

---

## Success Metrics

### Technical Metrics

| Metric | Target | Measurement |
|--------|--------|-------------|
| **API Response Time** | < 100ms (cached), < 500ms (DB) | CloudFlare Analytics |
| **Data Freshness** | < 24 hours for new sessions | Cron job logs |
| **Query Success Rate** | > 99.9% | Error rate monitoring |
| **Migration Accuracy** | 100% data match | Validation scripts |

### Business Metrics

| Metric | Target | Measurement |
|--------|--------|-------------|
| **Sessions Tracked** | ~2000 (1955-2025) | D1 count |
| **YouTube Coverage** | > 80% (14th/15th Parliament) | Video match ratio |
| **Transcript Coverage** | > 90% (recent videos) | Transcript availability |
| **Processing Completion** | > 95% success rate | Processing jobs status |

---

## Comparison with Alternative Approaches

### Why NOT Enhanced KV?

**Proposed KV Schema (rejected):**
```typescript
// Multiple namespaces approach
'session:{date}' → { hansard_available, youtube_id, moments_count }
'youtube:{video_id}' → { session_date, transcript_available }
'processing:{date}' → { status, last_attempt }
```

**Problems:**
1. ❌ No JOINs: Must fetch session, then fetch YouTube, then fetch moments (3 API calls)
2. ❌ No complex queries: Can't query "sessions with videos but no moments"
3. ❌ Manual indexing: Must maintain separate index keys for queries
4. ❌ No transactions: Updates across namespaces can be inconsistent
5. ❌ Limited filtering: Can't efficiently paginate or filter results

**Example Complex Query (impossible with KV):**
```sql
-- Find all 15th Parliament sessions with YouTube videos but no moments
SELECT s.date, s.session_id, y.video_id, y.title
FROM sessions s
JOIN youtube_videos y ON s.youtube_video_id = y.video_id
WHERE s.parliament_number = 15
  AND s.youtube_video_id IS NOT NULL
  AND s.moments_extracted = FALSE
ORDER BY s.date DESC
LIMIT 50;

-- With KV: Would require:
-- 1. List all session: keys (pagination issues)
-- 2. Fetch each session record (100s of reads)
-- 3. Filter in application code (slow)
-- 4. Fetch YouTube records for matches (more reads)
-- 5. Sort and paginate in memory (inefficient)
```

### Why NOT R2 JSON Index?

**Proposed R2 Schema (rejected):**
```
metadata/
├── sessions/
│   └── index.json  # All sessions in one file
├── youtube/
│   └── index.json  # All videos in one file
└── moments/
    └── index.json  # All moments in one file
```

**Problems:**
1. ❌ Slow queries: Must download entire index file (2MB+) for every query
2. ❌ No relations: Must manually link data across files
3. ❌ No concurrent updates: Last write wins (data loss risk)
4. ❌ No indexes: Linear scan for every query
5. ❌ Cache invalidation: Entire index invalidates on single update

**Performance Comparison:**
```typescript
// D1 query time: ~50ms
SELECT * FROM sessions WHERE date = '22-09-2025';

// R2 JSON index time: ~2000ms
1. Download sessions/index.json (2MB) → 1500ms
2. Parse JSON → 300ms
3. Find matching record → 200ms
```

---

## Appendix: Data Examples

### Sample Session Record (D1)

```json
{
  "date": "22-09-2025",
  "session_id": "parliament-2025-09-22",
  "parliament_number": 15,
  "session_number": 1,
  "date_display": "Tuesday, 22 September 2025",
  "hansard_available": true,
  "hansard_r2_key": "hansard/raw/22-09-2025.json",
  "hansard_structure": "json",
  "hansard_scraped_at": "2025-09-23T02:00:00Z",
  "youtube_video_id": "n9ZyN-lwiXg",
  "youtube_match_confidence": 1.0,
  "youtube_match_method": "static_mapping",
  "moments_extracted": true,
  "moments_count": 3,
  "embeddings_generated": false,
  "status": "completed",
  "last_processed_at": "2025-09-23T10:00:00Z",
  "created_at": "2025-09-23T02:00:00Z",
  "updated_at": "2025-09-23T10:00:00Z"
}
```

### Sample YouTube Video Record (D1)

```json
{
  "video_id": "n9ZyN-lwiXg",
  "title": "Parliament Sitting 22 September 2025",
  "url": "https://www.youtube.com/watch?v=n9ZyN-lwiXg",
  "duration_seconds": 36000,
  "published_at": "2025-09-22T16:00:00Z",
  "channel_id": "UC9JN3S8ACuN4xVLqWvHsLqg",
  "session_date": "22-09-2025",
  "parliament_number": 15,
  "is_interpretation": false,
  "transcript_available": true,
  "transcript_r2_key": "youtube/transcripts/n9ZyN-lwiXg.vtt",
  "transcript_format": "vtt",
  "transcript_downloaded_at": "2025-09-23T03:00:00Z",
  "moments_matched": true,
  "timestamp_mapping_r2_key": "youtube/timestamps/n9ZyN-lwiXg-moments.json",
  "created_at": "2025-09-22T16:30:00Z",
  "updated_at": "2025-09-23T10:00:00Z"
}
```

### Sample Moment Record (D1)

```json
{
  "moment_id": "demo-moment-1",
  "session_date": "22-09-2025",
  "transcript_id": "parliament-22-09-2025",
  "quote": "The alterations were done to cover up the incompleteness of documents but the contents were factual.",
  "speaker": "Minister (PUB)",
  "topic": "Public Sector Integrity",
  "virality_score": 10.0,
  "why_viral": "Minimizes document falsification - sounds like cover-up language",
  "hansard_timestamp_start": "01:29:46",
  "hansard_timestamp_end": "01:30:00",
  "youtube_video_id": "n9ZyN-lwiXg",
  "youtube_start_seconds": 5383,
  "youtube_timestamp": "89:43",
  "youtube_url": "https://www.youtube.com/watch?v=n9ZyN-lwiXg&t=5383s",
  "timestamp_confidence": 1.0,
  "embedding_generated": true,
  "vectorize_id": "vec-demo-moment-1",
  "script_generated": true,
  "audio_generated": true,
  "video_generated": false,
  "script_r2_key": "moments/scripts/demo-moment-1-gen_z.json",
  "audio_r2_key": "moments/audio/demo-moment-1-gen_z.mp3",
  "video_r2_key": null,
  "created_at": "2025-09-23T10:00:00Z",
  "updated_at": "2025-09-23T12:00:00Z"
}
```

---

## Conclusion

This architecture provides:

✅ **Unified Data Model:** D1 relational database for complex queries
✅ **Multi-Source Correlation:** Sessions ↔ YouTube ↔ Moments linkage
✅ **Fast Lookups:** KV cache + D1 indexes
✅ **Automated Monitoring:** Daily cron for new data
✅ **Cost Effective:** $0/month on Cloudflare free tier
✅ **Scalable:** Handles 2000+ sessions, 500+ videos, 10K+ moments
✅ **Production Ready:** Migration path from existing KV implementation

**Total Implementation Time: 4 weeks**
- Week 1: D1 setup + migration (10 hours)
- Week 2: Parliament API worker (15 hours)
- Week 3: Cron monitoring (12 hours)
- Week 4: Integration + testing (12 hours)

**Next Steps:**
1. Review architecture with team
2. Get approval for D1 migration
3. Begin Phase 1 implementation
4. Set up monitoring dashboards

---

**Document Status:** ✅ Complete Design Specification
**Authors:** Backend Architecture Team
**Last Updated:** 2025-10-25
