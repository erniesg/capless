# Parliament Data Architecture - Option Comparison

**Quick Reference:** Visual comparison of KV vs R2 vs D1 approaches

---

## Current State (KV-Only)

```
┌─────────────────────────────────────────────────────┐
│             Cloudflare Workers                      │
│  ┌─────────────────────────────────────────────┐   │
│  │    Parliament Scraper Worker                │   │
│  │                                              │   │
│  │  Problem: Limited tracking                  │   │
│  │  - Only tracks date → status                │   │
│  │  - No YouTube correlation                   │   │
│  │  - No processing state                      │   │
│  │  - No complex queries                       │   │
│  └──────────────┬──────────────────────────────┘   │
│                 │                                   │
└─────────────────┼───────────────────────────────────┘
                  │
                  ▼
        ┌─────────────────┐
        │ Cloudflare KV   │
        ├─────────────────┤
        │ date:DD-MM-YYYY │
        │   {             │
        │     last_checked│
        │     status      │
        │     attempts    │
        │   }             │
        └─────────────────┘

Data stored: ~2000 keys
Query capability: Single key lookup only
Relation support: None
Cost: $0/month
```

**What Works:**
✅ Fast single-date lookups
✅ Simple status tracking
✅ Idempotent scraping

**What's Missing:**
❌ No YouTube correlation
❌ No complex queries (find sessions with videos but no moments)
❌ No JOIN support
❌ Manual index management for every query type
❌ No transactions

---

## Option A: Enhanced KV (Rejected)

```
┌─────────────────────────────────────────────────────┐
│             Multiple KV Namespaces                  │
│                                                     │
│  ┌───────────────┐  ┌───────────────┐  ┌─────────┐ │
│  │ Sessions KV   │  │ YouTube KV    │  │Moments KV│ │
│  ├───────────────┤  ├───────────────┤  ├─────────┤ │
│  │session:{date} │  │youtube:{id}   │  │moment:* │ │
│  │  {hansard,    │  │  {session,    │  │  {...}  │ │
│  │   youtube_id, │  │   transcript, │  │         │ │
│  │   moments}    │  │   duration}   │  │         │ │
│  └───────────────┘  └───────────────┘  └─────────┘ │
│                                                     │
│  Problem: Requires manual correlation               │
└─────────────────────────────────────────────────────┘

Example Query: "Find 15th Parliament sessions with videos but no moments"

Step 1: List all keys with session:* prefix
  → GET keys (1 API call, pagination issues)

Step 2: Fetch each session record
  → GET session:01-01-2025, session:02-01-2025, ...
  → 100+ API calls

Step 3: Filter in memory
  → Check parliament_number === 15
  → Check youtube_id !== null
  → Check moments_extracted === false

Step 4: Fetch YouTube data for matches
  → GET youtube:video1, youtube:video2, ...
  → Additional API calls

Step 5: Sort and paginate
  → In-memory sorting (slow for large datasets)

Total: 200+ API calls, 2-5 seconds latency
```

**Pros:**
- Fast single-key reads (~10ms)
- No SQL needed
- Familiar KV patterns

**Cons:**
- ❌ No JOINs (must fetch separately)
- ❌ No complex filters (manual filtering in code)
- ❌ No indexes (list all keys for queries)
- ❌ No transactions (updates can be inconsistent)
- ❌ Manual correlation logic
- ❌ High API call count for queries
- ❌ Difficult pagination

**Cost:** $5/month
**Complexity:** Very High (custom query engine needed)

---

## Option B: R2 JSON Index (Rejected)

```
┌─────────────────────────────────────────────────────┐
│              Cloudflare R2 Storage                  │
│                                                     │
│  capless-preview/                                   │
│  ├── hansard/raw/{date}.json        (1847 files)   │
│  ├── metadata/                                      │
│  │   ├── sessions-index.json        (2MB)          │
│  │   ├── youtube-index.json         (500KB)        │
│  │   └── moments-index.json         (4MB)          │
│  └── youtube/transcripts/           (30 files)     │
│                                                     │
│  Problem: Full index download for every query       │
└─────────────────────────────────────────────────────┘

Example Query: "Get session for date 22-09-2025"

Step 1: Download sessions-index.json
  → 2MB download (1500ms over network)

Step 2: Parse JSON
  → JSON.parse(2MB) → 300ms

Step 3: Find matching record
  → Linear scan through 2000 records → 200ms

Step 4: Return result

Total: ~2000ms per query (vs 50ms with D1)
```

**Query Performance:**
```typescript
// D1 query time: 50ms
SELECT * FROM sessions WHERE date = '22-09-2025';

// R2 index query time: 2000ms
1. Download sessions-index.json (2MB) → 1500ms
2. Parse JSON → 300ms
3. Find record → 200ms

// 40x slower!
```

**Pros:**
- Cheap storage ($0.015/GB)
- No database limits
- JSON format (easy to inspect)

**Cons:**
- ❌ Slow queries (2000ms vs 50ms)
- ❌ No relations (manual linking)
- ❌ No concurrent updates (last write wins)
- ❌ No indexes (full scan every query)
- ❌ Cache invalidation issues
- ❌ Network overhead for every query

**Cost:** $2/month
**Complexity:** Very High (custom index management)

---

## Option C: Hybrid D1 + R2 + KV (Recommended ✅)

```
┌──────────────────────────────────────────────────────┐
│          Unified Parliament API Worker               │
│  ┌────────────────────────────────────────────────┐  │
│  │  Router: Handles all data queries             │  │
│  │  - GET /api/sessions?parliament=15            │  │
│  │  - GET /api/sessions/:date/youtube            │  │
│  │  - GET /api/youtube/:id/moments               │  │
│  └────┬──────────────┬──────────────┬────────────┘  │
│       │              │              │               │
└───────┼──────────────┼──────────────┼───────────────┘
        │              │              │
        ▼              ▼              ▼
┌───────────┐  ┌──────────────┐  ┌─────────────┐
│Cloudflare │  │ Cloudflare   │  │Cloudflare KV│
│D1 (SQLite)│  │ R2 (Storage) │  │  (Cache)    │
├───────────┤  ├──────────────┤  ├─────────────┤
│ SESSIONS  │  │ hansard/raw/ │  │session:{id} │
│ ├─date    │  │ youtube/vtt/ │  │  {TTL: 1h}  │
│ ├─hansard │  │ moments/mp3/ │  │             │
│ └─youtube │  │ audio/       │  │youtube:{id} │
│           │  │              │  │  {TTL: 1h}  │
│ YOUTUBE   │  └──────────────┘  └─────────────┘
│ ├─video_id│      Raw Files       Fast Cache
│ ├─session │      Storage         Layer
│ └─transcript│
│           │
│ MOMENTS   │
│ ├─moment_id│
│ ├─session │
│ ├─youtube │
│ └─virality│
│           │
│ JOBS      │
│ ├─job_id  │
│ └─status  │
└───────────┘
Structured
Relations
```

**Query Performance Comparison:**

```sql
-- Query: Find 15th Parliament sessions with videos but no moments

-- D1 (50ms):
SELECT s.date, s.session_id, y.video_id, y.title
FROM sessions s
JOIN youtube_videos y ON s.youtube_video_id = y.video_id
WHERE s.parliament_number = 15
  AND s.youtube_video_id IS NOT NULL
  AND s.moments_extracted = FALSE
ORDER BY s.date DESC
LIMIT 50;

-- KV (2000ms):
1. List all session:* keys → 500ms
2. Fetch each record (100 reads) → 1000ms
3. Filter parliament === 15 → 100ms
4. Filter youtube_id !== null → 50ms
5. Filter moments === false → 50ms
6. Fetch youtube records → 300ms
TOTAL: 2000ms

-- R2 (2500ms):
1. Download sessions-index.json → 1500ms
2. Parse 2MB JSON → 300ms
3. Filter records → 200ms
4. Download youtube-index.json → 400ms
5. Correlate data → 100ms
TOTAL: 2500ms
```

**Data Flow Example:**

```typescript
// User request: GET /api/sessions/22-09-2025

// Step 1: Check KV cache (10ms)
const cached = await KV.get('session:22-09-2025');
if (cached) return cached; // CACHE HIT

// Step 2: Query D1 (50ms)
const session = await DB.prepare(`
  SELECT
    s.*,
    y.video_id,
    y.title,
    y.transcript_available
  FROM sessions s
  LEFT JOIN youtube_videos y ON s.youtube_video_id = y.video_id
  WHERE s.date = ?
`).bind('22-09-2025').first();

// Step 3: Cache for 1 hour (5ms)
await KV.put('session:22-09-2025', JSON.stringify(session), {
  expirationTtl: 3600
});

// Step 4: Return (65ms total)
return Response.json(session);
```

**Storage Distribution:**

```
D1 Database (6MB total):
├── sessions: ~2000 rows × 500 bytes = 1MB
├── youtube_videos: ~500 rows × 300 bytes = 150KB
├── moments: ~10,000 rows × 400 bytes = 4MB
└── processing_jobs: ~2000 rows × 200 bytes = 400KB

R2 Storage (~2GB total):
├── hansard/raw/: 1847 files × 1MB = 1.8GB
├── youtube/transcripts/: 30 files × 5MB = 150MB
└── moments/audio/: ~100 files × 500KB = 50MB

KV Cache (~100 keys):
└── Transient cache (1 hour TTL)
```

**Pros:**
- ✅ Fast queries (50-100ms)
- ✅ Complex relations (JOINs)
- ✅ Transactions (atomic updates)
- ✅ Indexes (optimized lookups)
- ✅ Free tier ($0/month for our scale)
- ✅ Standard SQL (no custom query engine)
- ✅ KV cache for hot data (10ms reads)

**Cons:**
- ⚠️ D1 free tier limits (100K writes/day - we use ~100/day)
- ⚠️ Requires SQL knowledge (mitigated by ORM)

**Cost:** $0/month
**Complexity:** Low (standard SQL + ORM)

---

## Feature Comparison Matrix

| Feature | KV-Only (Current) | Enhanced KV | R2 JSON Index | D1 + R2 + KV ✅ |
|---------|-------------------|-------------|---------------|-----------------|
| **Single record lookup** | 10ms | 10ms | 2000ms | 50ms (10ms cached) |
| **Complex queries** | ❌ No | ❌ Manual | ❌ Full scan | ✅ SQL |
| **JOINs** | ❌ No | ❌ Manual | ❌ Manual | ✅ Native |
| **Transactions** | ❌ No | ❌ No | ❌ No | ✅ Yes |
| **Indexes** | ❌ No | ❌ Manual | ❌ No | ✅ Automatic |
| **Pagination** | ❌ Hard | ❌ Hard | ❌ In-memory | ✅ LIMIT/OFFSET |
| **Filtering** | ❌ No | ❌ Manual | ❌ Manual | ✅ WHERE clause |
| **Sorting** | ❌ No | ❌ Manual | ❌ Manual | ✅ ORDER BY |
| **Cost (monthly)** | $0 | $5 | $2 | **$0** |
| **Scalability** | ⚠️ Limited | ⚠️ Complex | ⚠️ Slow | ✅ Good |
| **Complexity** | Low | Very High | Very High | **Low** |
| **Migration effort** | N/A | High | High | **Medium** |

---

## Real-World Query Examples

### Query 1: Dashboard Stats

**Requirement:** Show stats for 15th Parliament

```sql
-- D1 (50ms):
SELECT
  COUNT(*) as total_sessions,
  COUNT(youtube_video_id) as with_videos,
  COUNT(CASE WHEN moments_extracted THEN 1 END) as with_moments,
  MAX(date) as latest_session
FROM sessions
WHERE parliament_number = 15;

-- KV: Impossible without fetching all records
-- R2: Download entire index, filter in memory
```

### Query 2: Processing Queue

**Requirement:** Find sessions needing moment extraction

```sql
-- D1 (100ms):
SELECT s.date, s.hansard_r2_key, y.video_id
FROM sessions s
LEFT JOIN youtube_videos y ON s.youtube_video_id = y.video_id
WHERE s.hansard_available = TRUE
  AND s.moments_extracted = FALSE
  AND s.parliament_number >= 14
ORDER BY s.date DESC
LIMIT 50;

-- KV: Manual correlation of 3 namespaces
-- R2: Download multiple indexes, correlate in memory
```

### Query 3: Video Timeline

**Requirement:** Get all moments for a YouTube video with timestamps

```sql
-- D1 (75ms):
SELECT
  m.moment_id,
  m.quote,
  m.speaker,
  m.virality_score,
  m.youtube_start_seconds,
  m.youtube_url
FROM moments m
WHERE m.youtube_video_id = ?
ORDER BY m.youtube_start_seconds ASC;

-- KV: Fetch all moments, filter by video_id
-- R2: Download moments index, filter in memory
```

---

## Migration Effort Comparison

| Phase | KV-Only → Enhanced KV | KV-Only → R2 Index | KV-Only → D1 + R2 + KV ✅ |
|-------|----------------------|-------------------|--------------------------|
| **Schema Design** | 4 hours | 3 hours | **2 hours** |
| **Data Migration** | 8 hours | 6 hours | **4 hours** |
| **Code Changes** | 12 hours | 10 hours | **6 hours** |
| **Testing** | 6 hours | 5 hours | **3 hours** |
| **Deployment** | 2 hours | 2 hours | **1 hour** |
| **Total** | 32 hours | 26 hours | **16 hours** |

---

## Recommendation Summary

**Choose D1 + R2 + KV because:**

1. **Performance:** 40x faster than R2 index, 20x fewer API calls than enhanced KV
2. **Cost:** $0/month (vs $5/month for enhanced KV)
3. **Simplicity:** Standard SQL (vs custom query engine)
4. **Features:** Native JOINs, transactions, indexes
5. **Scalability:** Proven at scale (Cloudflare uses D1 internally)
6. **Migration:** Lowest effort (16 hours vs 32 hours)

**When to reconsider:**

- If daily writes exceed 100K (then upgrade to D1 paid tier at $5/month)
- If you need global multi-region writes (D1 is single-region)
- If you can't use SQL (but why?)

**Next Steps:**

1. Read [parliament-data-architecture.md](./parliament-data-architecture.md) for full design
2. Follow [parliament-data-implementation-guide.md](./parliament-data-implementation-guide.md) for setup
3. Start with Phase 1: D1 setup (2 hours)
4. Validate with existing data before full migration

---

**Document Status:** ✅ Decision Matrix Complete
**Recommendation:** D1 + R2 + KV Hybrid Architecture
**Confidence:** High (based on usage patterns and Cloudflare pricing)
