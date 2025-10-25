# Capless Codebase Analysis - Executive Summary

## Quick Overview

**Capless** is a mature, production-ready Cloudflare Workers platform that transforms Singapore parliamentary proceedings into viral social media content.

### Current State: 60% Complete

- ✅ **Production Ready (3/5 core workers):**
  - capless-ingest: 59/59 tests passing
  - capless-moments: All tests passing  
  - capless-video-matcher: 35/39 tests passing (4 date parsing issues)

- 🚧 **In Development (2/5 core workers):**
  - asset-generator: ~80% complete (audio speed adjustment pending)
  - video-compositor: ~30% complete (Modal integration needed)

- 🧪 **Experimental (6 supporting workers):**
  - parliament-scraper, parliament-chat, video-generator, capless-demo, embedding-atlas

### Key Stats

| Metric | Count |
|--------|-------|
| Active Workers | 11 |
| Test Files | 19 |
| Core Workers | 5 |
| Production-Ready | 3 |
| Critical Issues (P0) | 2 |
| High Priority Issues (P1) | 5 |
| Medium Priority Issues (P2) | 8 |
| Low Priority Issues (P3) | 2 |

---

## Architecture at a Glance

```
Hansard JSON → Ingest → Moments → Video Matcher → Assets → Composition → Publishing
                (5s)       (10s)      (5s)          (20s)      (3min)       (live)
```

**5 Domain-Driven Workers** (not 10 atomic services):
1. **Ingestion** - Parse/normalize parliament transcripts
2. **Moments** - Extract viral quotes, generate embeddings
3. **Video Matcher** - Find YouTube videos, calculate confidence
4. **Assets** - Generate persona scripts, TTS, thumbnails
5. **Compositor** - Render videos, publish to social media

---

## YouTube Integration Status

### What's Done ✅

- **32 parliament sessions mapped** (2024-2025)
- **Static mapping file** with video IDs and URLs
- **YouTube Data API v3 integration** working
- **Confidence scoring** on video matches
- **Demo session available:** 2025-09-22 (video ID: n9ZyN-lwiXg)

### What's Missing ⚠️

- **Caption/Transcript extraction** (need YouTube captions API or yt-dlp)
- **Exact timestamp matching** (requires captions)
- **Chat URL linking** (TODO in parliament-chat worker)

---

## Critical Issues (Fix This Week)

### 1. Exposed API Keys in `.env.local` [P0 - SECURITY]
- **Location:** `.env.local` (checked into git!)
- **Risk:** OpenAI, Anthropic, YouTube keys exposed
- **Fix:** Rotate keys, move to `.gitignore`, use Cloudflare Secrets only

### 2. Video Matcher Date Parsing Failures [P0 - FUNCTIONALITY]
- **Issue:** 4/39 tests failing in `parseSittingDate()`
- **Impact:** Videos may not be matched for non-standard date formats
- **Fix:** Fix timezone handling in `src/timestamp.ts`

---

## High Priority Issues (1-2 Weeks)

### 3. YouTube Caption Extraction Not Implemented [P1]
- Current: Only uses metadata, not actual transcripts
- Need: YouTube captions API integration
- Impact: Can't match quotes to exact timestamps

### 4. Asset Generator Audio Speed Adjustment [P1]
- Issue: `TODO: Implement proper speed adjustment with FFmpeg`
- Impact: All persona audio at same speed
- Fix: Implement FFmpeg-based speed adjustment

### 5. Video Compositor Scheduled Publishing [P1]
- Issue: `TODO: Implement scheduled publishing with Queue or Durable Objects`
- Impact: Can't schedule video releases for optimal times
- Fix: Queue-based or Durable Objects alarm scheduling

### 6. Parliament Chat YouTube Linking [P1]
- Issue: `youtube_url: undefined` in chat responses
- Impact: Chat users can't jump to source video
- Fix: Look up YouTube match and calculate timestamp

### 7. Moments Trending Logic [P1]
- Issue: `TODO: Implement trending logic with time-based filtering`
- Impact: Trending endpoint always returns same moments
- Fix: Add time-decay scoring and engagement tracking

---

## Data Storage Architecture

### R2 Structure (`capless/` bucket)
```
transcripts/raw/       - Original Hansard JSON
transcripts/processed/ - Normalized transcripts
moments/               - Extracted moments with scores
audio/                 - TTS audio files (per persona)
thumbnails/            - Persona-branded images
videos/renders/        - Rendered video files
videos/published/      - Platform-specific versions
```

### Caching Strategy
- **Redis:** Transcripts (1h), Moments (1h), Video matches (1h)
- **Vectorize:** 1536-dim embeddings for semantic search

---

## What Works Well ✅

1. **Type Safety** - TypeScript + Zod validation throughout
2. **Testing** - 19 test files with good coverage (mostly)
3. **Architecture** - Domain-driven design, not over-atomized
4. **API Design** - Consistent request/response patterns
5. **Documentation** - ARCHITECTURE.md is excellent

---

## What Needs Improvement ⚠️

1. **Error Handling** - Inconsistent across workers
2. **Logging** - No structured logging/observability
3. **Configuration** - Some hardcoded values instead of env vars
4. **Caching** - Inconsistent Redis usage
5. **Testing** - Uneven coverage across workers

---

## Recommended Action Items

### This Week (P0)
- [ ] Rotate all exposed API keys
- [ ] Add `.env.local` to `.gitignore`
- [ ] Fix date parsing in video-matcher (4 failing tests)

### Next 2 Weeks (P1)
- [ ] Implement YouTube caption extraction
- [ ] Complete asset-generator (audio speed adjustment)
- [ ] Add scheduled publishing to video-compositor
- [ ] Link YouTube URLs in parliament-chat
- [ ] Implement trending logic in moments worker

### Next Month (P2)
- [ ] Create shared error handler middleware
- [ ] Add structured logging (JSON format)
- [ ] Standardize Redis usage across workers
- [ ] Create `@capless/types` shared package
- [ ] Add API documentation (OpenAPI specs)

### Long-term (P3)
- [ ] Performance optimization and benchmarking
- [ ] Multi-region deployment
- [ ] Analytics dashboard
- [ ] A/B testing framework

---

## Data Models Quick Reference

### Transcript
```
transcript_id: "2024-07-02-sitting-1"
segments: [ {speaker, text, timestamp, section, ...} ]
metadata: { parliament_no, session_no, total_words, ... }
```

### Moment
```
moment_id: string
quote: "..." (15-300 chars)
virality_score: 0-10
embedding: number[] (1536 dims)
transcript_id: string
```

### Video Match
```
video_id: "n9ZyN-lwiXg"
video_url: "https://www.youtube.com/watch?v=..."
confidence_score: 0-10
match_criteria: ["date_match", "title_keywords", ...]
```

---

## Test Coverage Summary

| Worker | Status | Notes |
|--------|--------|-------|
| capless-ingest | ✅ 59/59 | Complete |
| capless-moments | ✅ All | Complete |
| capless-video-matcher | ⚠️ 35/39 | 4 date parsing failures |
| asset-generator | 🚧 Partial | Generator tests only |
| video-compositor | 🚧 Partial | Unit tests, no integration |
| parliament-chat | 🧪 Basic | Needs more coverage |
| parliament-scraper | ❌ None | No tests |
| video-generator | 🧪 Partial | Incomplete |
| capless-demo | ❌ None | No tests |

---

## Questions Answered

### "Can we get YouTube Parliament videos and match by date?"
✅ **YES** - 32 parliament sessions mapped, static file exists, worker integration ready

### "Do we have methods to extract transcripts?"
⚠️ **Partially** - Hansard transcripts available; YouTube captions NOT yet extracted

### "Can we associate with the right session?"
✅ **YES** - Date-based matching working, confidence scoring implemented

### "Do we have a demo for 2025-09-22?"
✅ **YES** - YouTube video exists: https://www.youtube.com/watch?v=n9ZyN-lwiXg

---

## Next Steps

1. **Security:** Rotate exposed API keys immediately
2. **Bug Fix:** Fix 4 failing date parsing tests
3. **Feature:** Implement YouTube caption extraction
4. **Completion:** Finish asset-generator and video-compositor
5. **Polish:** Add observability and error handling

---

**Full Analysis:** See `CODEBASE_ANALYSIS.md` for comprehensive technical debt, data structures, and recommendations.

**Report Generated:** 2025-10-25  
**Analysis Scope:** All 11 workers, 19 test suites, complete architecture review
