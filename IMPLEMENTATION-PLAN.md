# Hansard Extractor Enhancement - Implementation Plan

**Date:** 2025-11-13
**Status:** Ready to Execute

---

## Overview

Enhance hansard-extractor with complete metadata for:
1. Full transcript reconstruction (section_id, pages, context, HTML)
2. Parliament session tracking (date, session_id, parliament_number)
3. YouTube timestamp matching (separate worker)

---

## Changes Made

### ✅ 1. Enhanced TypeScript Interfaces

**File:** `workers/hansard-extractor/src/lib/extraction.ts`

**New interfaces:**
```typescript
interface HansardLocation {
  section_id: number;
  section_title: string;
  section_type: string;
  start_page?: number;
  end_page?: number;
  question_number?: string;
  section_content_html?: string;
}

interface QuoteContext {
  text_before: string;
  text_after: string;
  paragraph_index?: number;
  character_offset?: number;
}
```

**Enhanced Moment interface:**
```typescript
interface Moment {
  // Existing fields (unchanged)
  summary: string;
  highlights: Highlight[];
  speakers: string[];
  why_viral: string;
  viral_score: number;
  title: string;

  // NEW: Enhanced metadata
  hansard_location?: HansardLocation;
  quote_context?: QuoteContext;
  date?: string;
  session_id?: string;
  parliament_number?: number;

  // YouTube (populated by separate worker)
  youtube?: {
    video_id?: string;
    timestamp_seconds?: number;
    shareable_url?: string;
    match_confidence?: number;
    match_method?: string;
  };
}
```

### ✅ 2. Enhanced Chunking

**File:** `workers/hansard-extractor/src/lib/chunking.ts`

**Captures from Parliament API:**
- Page numbers (startPgNo, endPgNo)
- Question numbers (questionNo)
- Original HTML content for each section

**ChunkMetadata now includes:**
```typescript
{
  section_page_ranges: [{
    section_id: number;
    start_page?: number;
    end_page?: number;
    question_no?: string;
  }];
  section_html: string[];  // Original HTML
}
```

### ✅ 3. Enhanced Extraction

**File:** `workers/hansard-extractor/src/lib/extraction.ts`

**New function:** `extractQuoteContext(quote, fullText)`
- Captures ±500 chars around quote
- Records character offset

**Moment enrichment:**
- Populates `hansard_location` from chunk metadata
- Extracts `quote_context` from chunk text
- Adds `date`, `session_id`, `parliament_number`

### ✅ 4. Session Metadata

**File:** `workers/hansard-extractor/src/index.ts`

**Extract from API metadata (not hardcoded dates):**
```typescript
const parliamentNumber = hansardData.metadata?.parlimentNO || 0;  // From API
const sessionNumber = hansardData.metadata?.sessionNO;
const sittingNumber = hansardData.metadata?.sittingNO;
```

**Note:** Parliament API has typo: `parlimentNO` (not `parliamentNO`)

---

## Queue Resumability & Path Management

### ✅ Queue Extracts ALL Sessions Fresh

**workers/hansard-extractor/src/index.ts:125-132**
```typescript
// Check if already processed (ONLY check new path - we're re-extracting ALL sessions)
const newPath = await env.CAPLESS_R2.get(`hansard/moments/${date}.json`);

if (newPath) {
  console.log(`⏭️  Skipping ${date} (already exists in new path)`);
  message.ack();
  continue;
}
```

**What this means:**
- ✅ Extracts ALL 1,726 sessions with NEW enhanced format
- ✅ Old 595 extractions (`moment-extraction/hansard-*.json`) kept for reference
- ✅ New extractions saved to `hansard/moments/*.json`
- ✅ Resume from failures - just requeue and it skips completed NEW extractions
- ✅ Idempotent - can run multiple times safely

### Storage Path Strategy

**Current state:**
- Old extractions: `moment-extraction/hansard-{DD-MM-YYYY}.json` (595 files)
- New path: `hansard/moments/{DD-MM-YYYY}.json` (empty, worker writes here)

**Decision: Keep old extractions in place, generate ALL 1,726 sessions fresh**

**Strategy:**
- Old extractions stay at `moment-extraction/hansard-*.json` (595 files - reference only)
- New extractions go to `hansard/moments/*.json` (ALL 1,726 files with enhanced metadata)
- Worker ONLY checks new path, so it extracts ALL sessions fresh
- Separate paths = old for reference, new for production use

**No archiving needed** - just deploy and extract ALL 1,726 sessions

---

## YouTube Timestamp Matching (Separate Worker)

### Design: New Worker `youtube-moment-matcher`

**Purpose:** Link extracted moments to YouTube timestamps

**Input:** Moment extraction files with YouTube transcripts available

**Output:** Same files but with `youtube` field populated

**Process:**
```
1. List all moment extractions
2. For each extraction:
   a. Check if YouTube transcript exists for this date
   b. If YES:
      - Load YouTube transcript (VTT → processed segments)
      - For each moment:
        * Match quote to transcript segments (fuzzy text matching)
        * Calculate timestamp
        * Generate shareable URL
      - Add `youtube` metadata to moment
      - Re-upload extraction file
   c. If NO:
      - Skip (no YouTube video for this session)
```

### Matching Algorithm

```typescript
// workers/youtube-moment-matcher/src/matcher.ts

async function matchMomentToYouTube(
  moment: Moment,
  transcriptSegments: TranscriptSegment[]
): YouTubeMatch | null {

  const quote = moment.highlights[0]?.quote || '';
  const speaker = moment.speakers[0] || '';

  // Normalize quote for matching
  const normalizedQuote = quote.toLowerCase()
    .replace(/[^\w\s]/g, '')
    .split(/\s+/)
    .filter(w => w.length > 3);

  let bestMatch = { index: -1, confidence: 0 };

  // Search transcript segments
  for (let i = 0; i < transcriptSegments.length; i++) {
    const segment = transcriptSegments[i];

    // Speaker bonus
    const speakerMatch = segment.speaker?.toLowerCase()
      .includes(speaker.toLowerCase().split(' ')[0]);

    // Text similarity
    const segmentWords = segment.text.toLowerCase()
      .replace(/[^\w\s]/g, '')
      .split(/\s+/);

    const matchingWords = normalizedQuote.filter(w =>
      segmentWords.includes(w)
    );

    const similarity = matchingWords.length / normalizedQuote.length;
    const confidence = similarity * (speakerMatch ? 1.2 : 1.0);

    if (confidence > bestMatch.confidence) {
      bestMatch = { index: i, confidence };
    }
  }

  // Require 60% match
  if (bestMatch.confidence < 0.6) {
    return null;
  }

  const matchedSegment = transcriptSegments[bestMatch.index];

  return {
    video_id: matchedSegment.video_id,
    timestamp_seconds: matchedSegment.start_seconds,
    shareable_url: `https://youtube.com/watch?v=${matchedSegment.video_id}&t=${matchedSegment.start_seconds}s`,
    match_confidence: bestMatch.confidence,
    match_method: 'fuzzy_text_matching'
  };
}
```

### Worker Structure

```
workers/youtube-moment-matcher/
├── src/
│   ├── index.ts           # Main worker (Queue consumer)
│   ├── matcher.ts         # Matching algorithm
│   └── transcript.ts      # VTT parsing utilities
├── wrangler.toml
└── package.json
```

### Deployment

```bash
cd workers/youtube-moment-matcher
npm install
wrangler deploy
```

### Usage

```bash
# Manual trigger for specific date
curl -X POST https://youtube-moment-matcher.erniesg.workers.dev/match \
  -d '{"date": "2024-08-06"}'

# Batch process all sessions with YouTube
curl -X POST https://youtube-moment-matcher.erniesg.workers.dev/match-all
```

---

## Execution Steps

### Step 1: Test Enhanced Extractor Locally (30min)

```bash
cd workers/hansard-extractor
npm run type-check  # Verify TypeScript compiles
npx tsx test-local.ts 2024-08-06
```

**Expected output:**
```json
{
  "date": "06-08-2024",
  "moments": [{
    "quote": "...",
    "hansard_location": {
      "section_id": 12,
      "section_title": "...",
      "start_page": 45,
      "end_page": 52
    },
    "quote_context": {
      "text_before": "...",
      "text_after": "..."
    },
    "date": "06-08-2024",
    "session_id": "parliament-2024-08-06",
    "parliament_number": 14
  }]
}
```

### Step 2: Deploy Enhanced Worker (30min)

```bash
cd workers/hansard-extractor

# Set OpenAI API key
wrangler secret put OPENAI_API_KEY

# Create queues
wrangler queues create hansard-extraction-queue
wrangler queues create hansard-extraction-dlq

# Deploy
npm run deploy
```

### Step 3: Extract ALL 1,726 Sessions (processing time varies)

```bash
# Option 1: Queue ALL dates at once (worker skips if new path exists)
# You'll need to generate list of all 1,726 dates from R2
curl -X POST https://hansard-extractor.erniesg.workers.dev/extract-all \
  -H "Content-Type: application/json" \
  -d '{
    "dates": [/* all 1,726 dates from hansard/cleaned/ in R2 */]
  }'

# Option 2: Test with a few dates first
curl -X POST https://hansard-extractor.erniesg.workers.dev/extract-all \
  -H "Content-Type: application/json" \
  -d '{
    "dates": ["06-08-2024", "07-08-2024", "22-09-2025"]
  }'

# Monitor progress
curl https://hansard-extractor.erniesg.workers.dev/status

# Expected: 1,726 sessions extracted to hansard/moments/*.json
# Old 595 extractions remain at moment-extraction/hansard-*.json for reference
```

### Step 4: Build YouTube Matcher Worker (4-6 hours)

```bash
# Create new worker
cd workers
mkdir youtube-moment-matcher
cd youtube-moment-matcher

# Scaffold
npm init -y
npm install --save-dev wrangler typescript @cloudflare/workers-types

# Copy starter template
# ... implement matcher.ts ...

# Deploy
wrangler deploy
```

### Step 5: Match YouTube Timestamps (1-2 hours)

```bash
# Process all 23 sessions with YouTube videos
curl -X POST https://youtube-moment-matcher.erniesg.workers.dev/match-all

# Check results
aws s3 cp s3://capless-preview/moment-extraction/hansard-06-08-2024.json - | \
  jq '.moments[0].youtube'
```

---

## Expected Final Format

```json
{
  "date": "06-08-2024",
  "session_id": "parliament-2024-08-06",
  "parliament_number": 14,
  "model": "gpt-5-mini",
  "extracted_at": "2025-11-13T...",
  "format": "ENHANCED_V2_WITH_RECONSTRUCTION",
  "moments": [{
    // AI-extracted content
    "summary": "Louis Ng highlights food security...",
    "title": "At the Mercy of Global Trade Winds",
    "highlights": [{
      "quote": "Food does not come naturally to Singapore...",
      "speaker": "Mr Louis Ng Kok Kwang"
    }],
    "viral_score": 10,
    "why_viral": "Poetic, shareable framing...",

    // Hansard reconstruction metadata
    "hansard_location": {
      "section_id": 12,
      "section_title": "Good Samaritan Food Donation Bill",
      "section_type": "BP",
      "start_page": 45,
      "end_page": 52,
      "section_content_html": "<p>...</p>"
    },
    "quote_context": {
      "text_before": "Mr Speaker, I rise to speak...",
      "text_after": "At the mercy of global trade...",
      "character_offset": 12345
    },

    // Session metadata
    "date": "06-08-2024",
    "session_id": "parliament-2024-08-06",
    "parliament_number": 14,

    // YouTube linking (from separate worker)
    "youtube": {
      "video_id": "abc123",
      "timestamp_seconds": 5383,
      "shareable_url": "https://youtube.com/watch?v=abc123&t=5383s",
      "match_confidence": 0.92,
      "match_method": "fuzzy_text_matching"
    }
  }]
}
```

---

## Rollback Plan

If issues arise:

1. **Revert code changes:**
   ```bash
   git checkout main workers/hansard-extractor/
   npm run deploy
   ```

2. **Restore old extractions:**
   ```bash
   # Copy from archive back to main folder
   python3 scripts/restore-old-extractions.py
   ```

3. **Redeploy previous version:**
   ```bash
   wrangler deployments list --name hansard-extractor
   wrangler rollback --deployment-id <previous-deployment-id>
   ```

---

## Success Criteria

✅ **Schema Enhancement:**
- [ ] TypeScript compiles without errors
- [ ] Local test produces enhanced format
- [ ] All required fields populated

✅ **Old Extractions (Reference):**
- [x] 595 files kept at `moment-extraction/hansard-*.json`
- [x] Accessible for comparison and reference
- [x] Worker ignores old path

✅ **New Extractions (ALL 1,726 Sessions):**
- [ ] 1,726 sessions extracted to `hansard/moments/*.json`
- [ ] All have hansard_location metadata (section_id, pages, HTML)
- [ ] All have quote_context (±500 chars around quote)
- [ ] All have session metadata (parliament_number, session_id, date)

✅ **YouTube Matching:**
- [ ] Matcher worker deployed
- [ ] 23 sessions matched to YouTube
- [ ] Shareable URLs generated
- [ ] Match confidence > 0.6 average

---

**Status:** ✅ Step 1 COMPLETE - Ready for deployment
**Next Action:** Deploy worker and queue ALL 1,726 dates

## Completed Changes

✅ **Enhanced TypeScript Interfaces** (src/lib/extraction.ts)
✅ **Enhanced Chunking with R2 Integration** (src/lib/chunking.ts)
✅ **Session Metadata Extraction** (src/index.ts)
✅ **R2-based Hansard Fetching** (reads from `hansard/cleaned/{date}.json`)
✅ **TypeScript Compilation** (no errors)
✅ **Local R2 Fetch Test** (verified metadata structure)

**Verified Output:**
```
Parliament Number: 14 (from API metadata.parlimentNO)
Section page ranges: Captured correctly
Section HTML: Preserved
Enhanced metadata: All fields working
```
