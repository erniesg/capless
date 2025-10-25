# Parliament Data Architecture - Quick Start Implementation Guide

**Version:** 1.0
**Date:** 2025-10-25
**Prerequisites:** Read [parliament-data-architecture.md](./parliament-data-architecture.md)

---

## 1. Pre-Implementation Checklist

Before starting implementation:

- [ ] Review architecture document
- [ ] Understand current KV schema limitations
- [ ] Verify Cloudflare account has D1 enabled
- [ ] Backup existing data (KV + R2)
- [ ] Set up development environment

**Estimated Time:** 1 hour

---

## 2. Phase 1: D1 Database Setup (2-3 hours)

### Step 1: Create D1 Database

```bash
cd /Users/erniesg/code/erniesg/capless/workers/parliament-scraper

# Create database (production)
npx wrangler d1 create parliament-db

# Output will show:
# [[d1_databases]]
# binding = "DB"
# database_name = "parliament-db"
# database_id = "xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
```

### Step 2: Update wrangler.toml

```toml
# Add to workers/parliament-scraper/wrangler.toml

[[d1_databases]]
binding = "DB"
database_name = "parliament-db"
database_id = "YOUR-DATABASE-ID-FROM-STEP-1"

# For development (optional)
[env.development.d1_databases]
binding = "DB"
database_name = "parliament-db-dev"
database_id = "YOUR-DEV-DATABASE-ID"
```

### Step 3: Create Migration File

```bash
# Create migrations directory
mkdir -p migrations

# Create initial migration
npx wrangler d1 migrations create parliament-db init-schema
```

### Step 4: Write Schema Migration

Copy this SQL into `migrations/0001_init-schema.sql`:

```sql
-- ============================================
-- SESSIONS TABLE
-- ============================================
CREATE TABLE sessions (
  date TEXT PRIMARY KEY,
  session_id TEXT UNIQUE NOT NULL,
  parliament_number INTEGER NOT NULL,
  session_number INTEGER,
  date_display TEXT,
  hansard_available BOOLEAN DEFAULT FALSE,
  hansard_r2_key TEXT,
  hansard_structure TEXT CHECK(hansard_structure IN ('html', 'json')),
  hansard_scraped_at TEXT,
  youtube_video_id TEXT,
  youtube_match_confidence REAL,
  youtube_match_method TEXT,
  moments_extracted BOOLEAN DEFAULT FALSE,
  moments_count INTEGER DEFAULT 0,
  embeddings_generated BOOLEAN DEFAULT FALSE,
  status TEXT CHECK(status IN ('pending', 'processing', 'completed', 'failed')),
  last_processed_at TEXT,
  processing_error TEXT,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now')),
  FOREIGN KEY (youtube_video_id) REFERENCES youtube_videos(video_id)
);

CREATE INDEX idx_sessions_parliament ON sessions(parliament_number);
CREATE INDEX idx_sessions_youtube ON sessions(youtube_video_id);
CREATE INDEX idx_sessions_status ON sessions(status);
CREATE INDEX idx_sessions_pending_processing
  ON sessions(hansard_available, moments_extracted)
  WHERE hansard_available = TRUE AND moments_extracted = FALSE;

-- ============================================
-- YOUTUBE VIDEOS TABLE
-- ============================================
CREATE TABLE youtube_videos (
  video_id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  url TEXT NOT NULL,
  duration_seconds INTEGER,
  published_at TEXT,
  channel_id TEXT,
  session_date TEXT,
  parliament_number INTEGER,
  is_interpretation BOOLEAN DEFAULT FALSE,
  transcript_available BOOLEAN DEFAULT FALSE,
  transcript_r2_key TEXT,
  transcript_format TEXT,
  transcript_downloaded_at TEXT,
  moments_matched BOOLEAN DEFAULT FALSE,
  timestamp_mapping_r2_key TEXT,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now')),
  FOREIGN KEY (session_date) REFERENCES sessions(date)
);

CREATE INDEX idx_youtube_session_date ON youtube_videos(session_date);
CREATE INDEX idx_youtube_parliament ON youtube_videos(parliament_number);
CREATE INDEX idx_youtube_transcript ON youtube_videos(transcript_available);

-- ============================================
-- MOMENTS TABLE
-- ============================================
CREATE TABLE moments (
  moment_id TEXT PRIMARY KEY,
  session_date TEXT NOT NULL,
  transcript_id TEXT,
  quote TEXT NOT NULL,
  speaker TEXT,
  topic TEXT,
  virality_score REAL,
  why_viral TEXT,
  hansard_timestamp_start TEXT,
  hansard_timestamp_end TEXT,
  youtube_video_id TEXT,
  youtube_start_seconds INTEGER,
  youtube_timestamp TEXT,
  youtube_url TEXT,
  timestamp_confidence REAL,
  embedding_generated BOOLEAN DEFAULT FALSE,
  vectorize_id TEXT,
  script_generated BOOLEAN DEFAULT FALSE,
  audio_generated BOOLEAN DEFAULT FALSE,
  video_generated BOOLEAN DEFAULT FALSE,
  script_r2_key TEXT,
  audio_r2_key TEXT,
  video_r2_key TEXT,
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
-- ============================================
CREATE TABLE processing_jobs (
  job_id TEXT PRIMARY KEY,
  job_type TEXT CHECK(job_type IN ('hansard_scrape', 'youtube_match', 'transcript_download', 'moment_extraction', 'embedding_generation', 'asset_generation')),
  entity_id TEXT NOT NULL,
  status TEXT CHECK(status IN ('pending', 'running', 'completed', 'failed')) DEFAULT 'pending',
  progress INTEGER DEFAULT 0,
  started_at TEXT,
  completed_at TEXT,
  duration_ms INTEGER,
  error_message TEXT,
  retry_count INTEGER DEFAULT 0,
  max_retries INTEGER DEFAULT 3,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);

CREATE INDEX idx_jobs_status ON processing_jobs(status);
CREATE INDEX idx_jobs_type ON processing_jobs(job_type);
CREATE INDEX idx_jobs_entity ON processing_jobs(entity_id);
```

### Step 5: Apply Migration

```bash
# Apply to production
npx wrangler d1 migrations apply parliament-db

# Apply to development (if using)
npx wrangler d1 migrations apply parliament-db --env development
```

### Step 6: Verify Schema

```bash
# Check tables exist
npx wrangler d1 execute parliament-db --command "SELECT name FROM sqlite_master WHERE type='table';"

# Expected output:
# ┌───────────────────┐
# │ name              │
# ├───────────────────┤
# │ sessions          │
# │ youtube_videos    │
# │ moments           │
# │ processing_jobs   │
# └───────────────────┘
```

---

## 3. Phase 2: Data Migration (3-4 hours)

### Step 1: Create Migration Worker

```bash
cd /Users/erniesg/code/erniesg/capless/workers/parliament-scraper
mkdir -p scripts
```

Create `scripts/migrate-kv-to-d1.ts`:

```typescript
/**
 * Migration script: KV + R2 → D1
 * Runs once to backfill existing data
 */

interface Env {
  DATES_KV: KVNamespace;
  DB: D1Database;
  R2: R2Bucket;
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    // Safety check: require confirmation parameter
    if (url.searchParams.get('confirm') !== 'yes') {
      return new Response(JSON.stringify({
        error: 'Migration requires confirmation',
        usage: 'Add ?confirm=yes to run migration',
        warning: 'This will modify D1 database'
      }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    console.log('[Migration] Starting KV → D1 migration...');

    const stats = {
      sessions_migrated: 0,
      sessions_errors: 0,
      youtube_migrated: 0,
      youtube_errors: 0,
      errors: [] as string[]
    };

    try {
      // ============================================
      // STEP 1: Migrate Sessions from R2
      // ============================================
      console.log('[Migration] Step 1: Migrating sessions from R2...');

      let cursor: string | undefined = undefined;
      let totalObjects = 0;

      do {
        const list = await env.R2.list({
          prefix: 'hansard/raw/',
          limit: 1000,
          cursor
        });

        totalObjects += list.objects.length;

        for (const obj of list.objects) {
          const date = obj.key.replace('hansard/raw/', '').replace('.json', '');

          try {
            // Parse date to get parliament number
            const [day, month, year] = date.split('-').map(Number);
            const sessionDate = new Date(year, month - 1, day);
            const parliamentNumber = inferParliamentNumber(sessionDate);
            const sessionId = `parliament-${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;

            // Insert session
            await env.DB.prepare(`
              INSERT OR IGNORE INTO sessions (
                date, session_id, parliament_number,
                hansard_available, hansard_r2_key,
                hansard_scraped_at, status,
                created_at, updated_at
              ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
            `).bind(
              date,
              sessionId,
              parliamentNumber,
              true,
              obj.key,
              obj.uploaded.toISOString(),
              'completed',
              obj.uploaded.toISOString(),
              new Date().toISOString()
            ).run();

            stats.sessions_migrated++;

            if (stats.sessions_migrated % 100 === 0) {
              console.log(`[Migration] Sessions: ${stats.sessions_migrated}/${totalObjects}`);
            }
          } catch (error: any) {
            stats.sessions_errors++;
            stats.errors.push(`Session ${date}: ${error.message}`);
          }
        }

        cursor = list.truncated ? list.cursor : undefined;
      } while (cursor);

      console.log(`[Migration] Step 1 complete: ${stats.sessions_migrated} sessions migrated`);

      // ============================================
      // STEP 2: Migrate YouTube Videos
      // ============================================
      console.log('[Migration] Step 2: Migrating YouTube videos...');

      // Load youtube-hansard-mapping.json from GitHub
      const mappingUrl = 'https://raw.githubusercontent.com/erniesg/capless/master/youtube-sessions/youtube-hansard-mapping.json';
      const mappingResponse = await fetch(mappingUrl);
      const videoMapping = await mappingResponse.json();

      for (const [sessionDate, video] of Object.entries(videoMapping)) {
        try {
          const { video_id, title, url, is_interpretation } = video as any;

          const [day, month, year] = sessionDate.split('-').map(Number);
          const parliamentNumber = inferParliamentNumber(new Date(year, month - 1, day));

          // Insert YouTube video
          await env.DB.prepare(`
            INSERT OR IGNORE INTO youtube_videos (
              video_id, title, url, session_date,
              parliament_number, is_interpretation,
              created_at, updated_at
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

          // Update session with YouTube video
          await env.DB.prepare(`
            UPDATE sessions
            SET youtube_video_id = ?,
                youtube_match_confidence = 1.0,
                youtube_match_method = 'static_mapping',
                updated_at = ?
            WHERE date = ?
          `).bind(video_id, new Date().toISOString(), sessionDate).run();

          stats.youtube_migrated++;
        } catch (error: any) {
          stats.youtube_errors++;
          stats.errors.push(`YouTube ${sessionDate}: ${error.message}`);
        }
      }

      console.log(`[Migration] Step 2 complete: ${stats.youtube_migrated} videos migrated`);

      // ============================================
      // STEP 3: Summary
      // ============================================
      return new Response(JSON.stringify({
        success: true,
        message: 'Migration complete',
        stats: {
          sessions: {
            migrated: stats.sessions_migrated,
            errors: stats.sessions_errors
          },
          youtube: {
            migrated: stats.youtube_migrated,
            errors: stats.youtube_errors
          },
          total_errors: stats.errors.length
        },
        errors: stats.errors.slice(0, 10) // Show first 10 errors
      }, null, 2), {
        headers: { 'Content-Type': 'application/json' }
      });

    } catch (error: any) {
      console.error('[Migration] Fatal error:', error);
      return new Response(JSON.stringify({
        success: false,
        error: error.message,
        stats
      }, null, 2), {
        status: 500,
        headers: { 'Content-Type': 'application/json' }
      });
    }
  }
};

function inferParliamentNumber(date: Date): number {
  if (date < new Date('1959-05-31')) return 1;
  if (date < new Date('1963-09-21')) return 2;
  if (date < new Date('1968-04-13')) return 3;
  if (date < new Date('1972-09-02')) return 4;
  if (date < new Date('1976-12-23')) return 5;
  if (date < new Date('1981-01-08')) return 6;
  if (date < new Date('1985-01-07')) return 7;
  if (date < new Date('1989-01-09')) return 8;
  if (date < new Date('1992-09-07')) return 9;
  if (date < new Date('1997-01-23')) return 10;
  if (date < new Date('2002-01-03')) return 11;
  if (date < new Date('2007-01-08')) return 12;
  if (date < new Date('2016-01-15')) return 13;
  if (date < new Date('2020-08-24')) return 14;
  if (date < new Date('2025-09-05')) return 15;
  return 15;
}
```

### Step 2: Add to wrangler.toml

```toml
# Add migration worker route
[[routes]]
pattern = "parliament-migrate.erniesg.workers.dev/*"
script = "scripts/migrate-kv-to-d1"
```

### Step 3: Run Migration

```bash
# Deploy migration worker
npx wrangler publish scripts/migrate-kv-to-d1.ts

# Run migration (DRY RUN first)
curl "https://parliament-migrate.erniesg.workers.dev?confirm=no"

# If dry run looks good, run actual migration
curl "https://parliament-migrate.erniesg.workers.dev?confirm=yes"

# Expected output:
# {
#   "success": true,
#   "message": "Migration complete",
#   "stats": {
#     "sessions": {
#       "migrated": 1847,
#       "errors": 0
#     },
#     "youtube": {
#       "migrated": 29,
#       "errors": 0
#     }
#   }
# }
```

### Step 4: Verify Migration

```bash
# Check session count
npx wrangler d1 execute parliament-db --command "SELECT COUNT(*) as total FROM sessions;"

# Check YouTube videos
npx wrangler d1 execute parliament-db --command "SELECT COUNT(*) as total FROM youtube_videos;"

# Check sessions with videos
npx wrangler d1 execute parliament-db --command "
  SELECT parliament_number, COUNT(*) as count
  FROM sessions
  WHERE youtube_video_id IS NOT NULL
  GROUP BY parliament_number;
"
```

---

## 4. Phase 3: Update Parliament Scraper (2 hours)

### Step 1: Update Types

Add to `workers/parliament-scraper/src/index.ts`:

```typescript
export interface Env {
  R2: R2Bucket;
  DATES_QUEUE: Queue;
  DATES_KV: KVNamespace;  // Keep for cache
  DB: D1Database;         // NEW: D1 database
}

interface Session {
  date: string;
  session_id: string;
  parliament_number: number;
  hansard_available: boolean;
  hansard_r2_key: string | null;
  hansard_scraped_at: string | null;
  youtube_video_id: string | null;
  status: 'pending' | 'processing' | 'completed' | 'failed';
}
```

### Step 2: Add D1 Helper Functions

```typescript
async function getSession(db: D1Database, date: string): Promise<Session | null> {
  return await db
    .prepare('SELECT * FROM sessions WHERE date = ?')
    .bind(date)
    .first() as Session | null;
}

async function upsertSession(
  db: D1Database,
  date: string,
  data: Partial<Session>
): Promise<void> {
  const [day, month, year] = date.split('-').map(Number);
  const sessionId = `parliament-${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
  const parliamentNumber = inferParliamentNumber(new Date(year, month - 1, day));

  await db.prepare(`
    INSERT INTO sessions (
      date, session_id, parliament_number,
      hansard_available, hansard_r2_key, hansard_scraped_at,
      status, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(date) DO UPDATE SET
      hansard_available = excluded.hansard_available,
      hansard_r2_key = excluded.hansard_r2_key,
      hansard_scraped_at = excluded.hansard_scraped_at,
      status = excluded.status,
      updated_at = excluded.updated_at
  `).bind(
    date,
    sessionId,
    parliamentNumber,
    data.hansard_available ?? false,
    data.hansard_r2_key ?? null,
    data.hansard_scraped_at ?? new Date().toISOString(),
    data.status ?? 'pending',
    new Date().toISOString(),
    new Date().toISOString()
  ).run();
}
```

### Step 3: Update Queue Consumer

Replace the queue handler:

```typescript
async queue(batch: MessageBatch<DateMessage>, env: Env): Promise<void> {
  for (const message of batch.messages) {
    const { date, attempt } = message.body;

    try {
      // Check D1 first (source of truth)
      const session = await getSession(env.DB, date);
      if (session?.hansard_available) {
        console.log(`[Skip] ${date} already in D1`);
        message.ack();
        continue;
      }

      // Fetch Hansard
      const hansard = await fetchHansard(date);
      const r2Key = `hansard/raw/${date}.json`;

      // Save to R2
      await saveToR2(env.R2, date, hansard);

      // Update D1
      await upsertSession(env.DB, date, {
        hansard_available: true,
        hansard_r2_key: r2Key,
        hansard_scraped_at: new Date().toISOString(),
        status: 'completed'
      });

      // Update KV cache (1 hour TTL)
      await env.DATES_KV.put(`session:${date}`, JSON.stringify({
        hansard_available: true,
        last_updated: new Date().toISOString()
      }), { expirationTtl: 3600 });

      message.ack();

    } catch (error: any) {
      if (error.message.includes('HTTP 500')) {
        // No session found
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

### Step 4: Deploy Updated Worker

```bash
npx wrangler publish
```

---

## 5. Testing & Validation (1 hour)

### Test 1: Query Sessions

```bash
# Test D1 queries
npx wrangler d1 execute parliament-db --command "
  SELECT
    s.date,
    s.parliament_number,
    s.hansard_available,
    y.video_id
  FROM sessions s
  LEFT JOIN youtube_videos y ON s.youtube_video_id = y.video_id
  WHERE s.parliament_number = 15
  LIMIT 10;
"
```

### Test 2: Run Daily Check

```bash
# Trigger /check-today endpoint
curl https://capless-parliament-scraper.erniesg.workers.dev/check-today

# Verify new sessions are added to D1
npx wrangler d1 execute parliament-db --command "
  SELECT date, status FROM sessions
  ORDER BY date DESC
  LIMIT 5;
"
```

### Test 3: Verify Data Integrity

```bash
# Count sessions in R2
npx wrangler r2 object list capless-preview --prefix hansard/raw/ | wc -l

# Count sessions in D1
npx wrangler d1 execute parliament-db --command "
  SELECT COUNT(*) FROM sessions WHERE hansard_available = TRUE;
"

# Should match!
```

---

## 6. Next Steps

After completing implementation:

1. **Create Parliament API Worker** (see architecture doc Phase 2)
2. **Set up daily cron monitoring** (see architecture doc Phase 3)
3. **Update moments extraction** to write to D1
4. **Build dashboard** for data visualization

---

## Troubleshooting

### Issue: Migration fails with "database not found"

```bash
# Verify database exists
npx wrangler d1 list

# If not found, recreate
npx wrangler d1 create parliament-db
```

### Issue: Foreign key constraint error

```sql
-- Temporarily disable foreign key checks during migration
PRAGMA foreign_keys = OFF;

-- Run migration

-- Re-enable
PRAGMA foreign_keys = ON;
```

### Issue: "Too many API requests" during migration

```typescript
// Add delay between batch inserts
for (const record of records) {
  await insertRecord(record);
  await new Promise(resolve => setTimeout(resolve, 100)); // 100ms delay
}
```

---

## Success Criteria

Migration is complete when:

- [ ] D1 database created with all 4 tables
- [ ] All existing sessions migrated from R2
- [ ] All YouTube videos migrated from mapping JSON
- [ ] Parliament scraper worker updated to use D1
- [ ] KV cache still working (for fast lookups)
- [ ] Test queries returning correct data
- [ ] Daily cron still functioning

**Total Time: ~10 hours** over 2-3 days
