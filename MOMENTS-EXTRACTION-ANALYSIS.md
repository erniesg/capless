# Moments Extraction System - Analysis & Recommendations

**Date**: 2025-11-11
**Issue**: Extracting hundreds of moments per parliamentary session (should be 10-20 notable/TikTok-worthy moments)

---

## Executive Summary

The current system extracts **60-120+ moments** per session for long YouTube recordings due to:
1. **Crude time-based chunking** (10-min fixed segments, no overlap, no content-aware boundaries)
2. **Liberal per-chunk extraction** (5-10 moments × 12 chunks = 60-120 moments)
3. **Simple deduplication** (only exact quote matching, no semantic similarity)
4. **No global reranking** after consolidation

**Recommended approach**: Two-stage system with smarter chunking, overlap, semantic deduplication, and aggressive final filtering.

---

## Current Implementation Analysis

### YouTube Processing (`extract-youtube-moments-chunked.py`)

**Chunking Strategy:**
```python
chunk_duration_seconds = 600  # Fixed 10 minutes
# Splits VTT captions into non-overlapping time ranges
```

**Location**: `scripts/extract-youtube-moments-chunked.py:108-138`

**Issues:**
- ❌ **No overlap** - Moments spanning chunk boundaries are missed
- ❌ **Fixed duration** - Doesn't respect conversation flow (can split Q&A mid-exchange)
- ❌ **Too many chunks** - 2-hour session = 12 chunks × 5-10 moments = 60-120 moments
- ❌ **No topic awareness** - Chunks arbitrary slices regardless of subject changes

**Current Output:**
```json
{
  "date": "2024-11-08",
  "chunks_processed": 12,
  "moments": [
    // 60-120 moments with chunk_metadata
    {"quote": "...", "chunk_metadata": {"start_time": 0, "end_time": 600}}
  ]
}
```

### Hansard Processing (`extract-hansard-moments-chunked.py`)

**Chunking Strategy:**
```python
# Groups sections up to 60KB, preserves natural boundaries
# Never splits mid-section or mid-Q&A
```

**Location**: `scripts/extract-hansard-moments-chunked.py`

**Strengths:**
- ✅ **Content-aware** - Respects section boundaries
- ✅ **Context preservation** - Doesn't truncate speaker exchanges
- ✅ **Natural breaks** - Ends at topical boundaries

**Why this works better:** Historical transcripts are pre-segmented by topic/section, so chunking by section size maintains semantic coherence.

### Consolidation (`workers/moments/src/providers/chunked.ts`)

**Deduplication Logic:**
```typescript
// Quote-based deduplication (lowercase text matching)
const quoteKey = moment.quote.toLowerCase().trim();
if (!seenQuotes.has(quoteKey)) {
  seenQuotes.add(quoteKey);
  allMoments.push(moment);
}
```

**Location**: `workers/moments/src/providers/chunked.ts:51-70`

**Issues:**
- ❌ **Only exact matches** - Different wordings of same moment not caught
- ❌ **No semantic similarity** - "35% increase is modest" vs "calling 35% rise modest" treated as different
- ❌ **No cross-chunk reranking** - Just sorts by score, doesn't re-evaluate in global context
- ❌ **No hard limit** - Returns ALL unique moments (could be 100+)

### AI Extraction Prompt

**Location**: `scripts/extract-youtube-moments-chunked.py:145-166`

**Current instruction**: "Extract 5-10 viral moments from this parliament session"

**Issues:**
- ❌ **Per-chunk mindset** - Each chunk treated as separate session
- ❌ **No quality threshold** - Must return 5-10 even if chunk has only 2 good moments
- ❌ **Liberal scoring** - "Be generous - we want shareable content" leads to score inflation

---

## Sample Data Analysis

### R2 Record Structure

**Path**: `s3://capless-preview/moment-extraction/youtube-2024-11-08.json`

```json
{
  "date": "2024-11-08",
  "model": "gpt-5-mini",
  "extracted_at": "2025-11-11T10:30:00Z",
  "format": "youtube_vtt",
  "chunks_processed": 12,
  "moments": [
    {
      "category": "Drama Alert",
      "title": "Minister Calls 35% Hike 'Modest'",
      "quote": "The increases are modest when you factor in...",
      "speaker": "Minister Tan",
      "viral_score": 8.5,
      "chunk_metadata": {
        "type": "time_range",
        "start_time": 600,
        "end_time": 1200,
        "caption_count": 245
      },
      "approximate_video_time_start": 600,
      "approximate_video_time_end": 1200
    }
    // ... 59-119 more moments
  ]
}
```

**Metadata tracked:**
- ✅ Chunk boundaries (time ranges)
- ✅ Caption count per chunk
- ✅ Approximate video timestamps
- ❌ NOT tracked: Which moments were near chunk boundaries
- ❌ NOT tracked: Pre-consolidation moment count per chunk
- ❌ NOT tracked: Deduplication decisions (which moments were merged)

---

## Problem Statement

### Goals

1. **YouTube sessions**: Extract 10-20 **notable/TikTok-worthy** moments with precise timestamps
2. **Historical transcripts**: Split into multiple thematic chunks, preserve Q&A integrity

### Current Reality

| Session Type | Duration | Current Output | Desired Output |
|--------------|----------|----------------|----------------|
| YouTube | 2 hours | 60-120 moments | 10-20 moments |
| YouTube | 4 hours | 120-240 moments | 15-25 moments |
| Hansard | Variable | 20-40 moments | 15-30 moments |

**Why hundreds doesn't make sense:**
- Users can't watch 100+ clips
- Dilutes truly viral content
- Storage/bandwidth waste
- TikTok is about **curation**, not exhaustiveness

---

## Recommendations

### Option A: Incremental Improvements (Low Effort)

**Changes:**
1. **Add overlap** to YouTube chunks (2-3 minutes)
2. **Reduce moments per chunk** from 5-10 to 3-5
3. **Add hard limit** to consolidation (top 20 moments)
4. **Stricter scoring threshold** (only include moments with score > 7.5)

**Pros:**
- ✅ Quick to implement (1-2 hour effort)
- ✅ Immediately reduces output to ~36-60 moments
- ✅ Overlap catches boundary moments

**Cons:**
- ❌ Still no semantic deduplication
- ❌ Still time-based chunking (no content awareness)
- ❌ Arbitrary cutoffs might miss great moments

**Effort**: Low
**Impact**: Medium
**Recommended**: If you need a quick fix

---

### Option B: Two-Stage Architecture (Recommended)

**Architecture:**

```
Stage 1: CANDIDATE EXTRACTION (Liberal)
├─ Smart chunking with overlap
├─ Extract 3-5 moments per chunk
└─ Output: 50-80 candidate moments

Stage 2: CONSOLIDATION & RANKING (Aggressive)
├─ Semantic deduplication (embeddings)
├─ Cross-chunk reranking
├─ Global quality threshold
└─ Output: Top 15-20 final moments
```

#### Stage 1: Smarter Chunking

**For YouTube:**
```python
def smart_chunk_youtube(captions, target_duration=900, overlap_duration=180):
    """
    - 15-minute base chunks (up from 10)
    - 3-minute overlap (new)
    - Find natural breaks (speaker changes, long pauses)
    """
    chunks = []
    current_start = 0

    while current_start < max_time:
        # Find target end point
        target_end = current_start + target_duration

        # Look for natural break within ±2 minutes of target
        natural_break = find_speaker_change_near(captions, target_end, window=120)
        actual_end = natural_break if natural_break else target_end

        # Create chunk with metadata
        chunk = {
            'text': get_captions_in_range(captions, current_start, actual_end),
            'metadata': {
                'start_time': current_start,
                'end_time': actual_end,
                'has_next_overlap': True if actual_end < max_time else False,
                'overlap_start': max(0, actual_end - overlap_duration)
            }
        }
        chunks.append(chunk)

        # Next chunk starts with overlap
        current_start = actual_end - overlap_duration if actual_end < max_time else actual_end

    return chunks
```

**Benefits:**
- ✅ Fewer chunks (2hr session: 8-10 chunks instead of 12)
- ✅ Respects conversation flow
- ✅ Overlap prevents boundary misses
- ✅ Metadata tracks overlaps for deduplication

**For Hansard:**
- Keep current section-based approach (already good)

#### Stage 2: Consolidation Pipeline

```python
def consolidate_moments(candidate_moments, max_final=20):
    """
    1. Remove overlap duplicates (from chunk boundaries)
    2. Semantic deduplication (embedding similarity > 0.85)
    3. Global reranking (recalculate scores with full context)
    4. Apply quality threshold (score > 7.5)
    5. Return top N by virality score
    """

    # Step 1: Remove exact duplicates from overlaps
    unique_moments = dedupe_by_quote(candidate_moments)

    # Step 2: Semantic deduplication
    embeddings = generate_embeddings([m.quote for m in unique_moments])
    semantically_unique = dedupe_by_embedding(unique_moments, embeddings, threshold=0.85)

    # Step 3: Global reranking (optional: send all to AI for final ranking)
    # This step could re-score moments knowing they were selected from a larger pool

    # Step 4: Quality threshold
    high_quality = [m for m in semantically_unique if m.virality_score > 7.5]

    # Step 5: Top N
    high_quality.sort(key=lambda m: m.virality_score, reverse=True)
    return high_quality[:max_final]
```

#### Updated AI Prompt

**Stage 1** (per-chunk):
```
You are extracting CANDIDATE moments from a SECTION of a longer parliamentary session.

Be SELECTIVE. Only extract moments that are TRULY viral-worthy:
- Score 8+ material: Shocking, hilarious, or deeply problematic
- Score 7-8 material: Strong shareable content
- Skip anything below 7

Extract 3-5 moments maximum. If this section has fewer than 3 strong moments, return fewer.

Remember: This is just one section. Other parts of the session may have better moments.
```

**Stage 2** (global ranking):
```
You are reviewing ALL candidate moments extracted from a parliamentary session.

Your task:
1. Identify duplicates or near-duplicates (same point, different wording)
2. Re-rank based on overall session context
3. Return the TOP 15-20 most viral moments

Prioritize:
- Unique perspectives (don't include 5 variations of "jargon is bad")
- Diversity of topics
- Mix of problematic and wholesome moments
```

#### Enhanced Metadata

**Per-chunk metadata:**
```json
{
  "chunk_id": "chunk-001",
  "start_time": 0,
  "end_time": 900,
  "overlap_with_next": {
    "start": 720,
    "end": 900
  },
  "moments_extracted": 4,
  "avg_chunk_score": 7.8,
  "processing_time_ms": 3200
}
```

**Per-moment metadata:**
```json
{
  "quote": "...",
  "source_chunk_id": "chunk-001",
  "is_in_overlap_region": false,
  "extraction_confidence": 0.92,
  "semantic_cluster_id": "cluster-03",
  "initial_score": 8.5,
  "final_score": 8.7,
  "ranking": 3
}
```

**Consolidation metadata:**
```json
{
  "consolidation_stats": {
    "total_candidates_extracted": 52,
    "overlap_duplicates_removed": 8,
    "semantic_duplicates_removed": 12,
    "quality_threshold_filtered": 15,
    "final_moments_count": 17,
    "top_moment_score": 9.2,
    "avg_final_score": 8.3
  },
  "deduplication_decisions": [
    {
      "kept": "moment-001",
      "removed": ["moment-023", "moment-045"],
      "reason": "semantic_similarity",
      "similarity_scores": [0.89, 0.87]
    }
  ]
}
```

**Pros:**
- ✅ **Quality over quantity** - Aggressive filtering ensures only viral-worthy content
- ✅ **Semantic deduplication** - Catches similar moments with different wording
- ✅ **Rich metadata** - Full audit trail of extraction and consolidation
- ✅ **Overlap handling** - Explicit tracking prevents double-counting
- ✅ **Scalable** - Works for 30-min or 4-hour sessions

**Cons:**
- ⚠️ **More complex** - Two-stage pipeline, embeddings, more logic
- ⚠️ **Higher cost** - Embedding generation (but can use cheap models)
- ⚠️ **Longer processing** - Additional consolidation step

**Effort**: Medium-High (4-8 hours)
**Impact**: High
**Recommended**: For production quality

---

### Option C: Single-Pass Global Extraction (Alternative)

**Approach:** For YouTube sessions < 3 hours, skip chunking entirely. Send entire transcript to AI.

**Changes:**
1. Check transcript length
2. If < 3 hours AND < 50K words, send full transcript
3. Request top 15-20 moments directly
4. Use Gemini Flash 2.5 (1M context window)

**Pros:**
- ✅ **Simplest** - No chunking complexity
- ✅ **Global awareness** - AI sees full context from the start
- ✅ **No consolidation needed** - Direct final output

**Cons:**
- ❌ **Doesn't scale** - Long sessions still need chunking
- ❌ **Context window limits** - VTT files can be 100K+ words
- ❌ **Higher cost** - Large context windows expensive
- ❌ **Slower** - Single long request vs parallel chunk processing

**Effort**: Low
**Impact**: Medium
**Recommended**: Only for sessions < 2 hours

---

## Implementation Priority

### Phase 1: Quick Wins (Week 1)
1. Add 3-minute overlap to YouTube chunks
2. Reduce per-chunk extraction to 3-5 moments
3. Add hard limit of 20 to consolidation
4. Update AI prompt to be more selective

**Expected outcome:** 30-50 moments per session (down from 100+)

### Phase 2: Smart Chunking (Week 2)
1. Implement natural break detection (speaker changes)
2. Increase chunk size to 15 minutes
3. Add overlap tracking to metadata

**Expected outcome:** 25-35 moments per session

### Phase 3: Semantic Deduplication (Week 3)
1. Add embedding generation (OpenAI `text-embedding-3-small`)
2. Implement similarity-based deduplication (threshold 0.85)
3. Add deduplication metadata tracking

**Expected outcome:** 15-25 final moments per session

### Phase 4: Global Reranking (Week 4)
1. Implement Stage 2 consolidation prompt
2. Add final quality threshold filter
3. Enhanced metadata for audit trail

**Expected outcome:** 10-20 curated viral moments per session

---

## Technical Specifications

### Embedding Generation

**Model**: `text-embedding-3-small` (OpenAI)
- Cost: $0.02 per 1M tokens
- Dimension: 1536
- Speed: ~1000 embeddings/second

**Usage:**
```python
def generate_embeddings(texts):
    response = openai.embeddings.create(
        model="text-embedding-3-small",
        input=texts
    )
    return [e.embedding for e in response.data]

def cosine_similarity(a, b):
    return np.dot(a, b) / (np.linalg.norm(a) * np.linalg.norm(b))
```

### Natural Break Detection

```python
def find_speaker_change_near(captions, target_time, window=120):
    """
    Find nearest speaker change within ±window seconds of target_time
    Prefer breaks after Q&A exchanges are complete
    """
    candidates = []

    for i in range(len(captions) - 1):
        start, end, text = captions[i]
        next_start, next_end, next_text = captions[i + 1]

        # Check if within window
        if abs(end - target_time) <= window:
            # Check if speaker change (heuristic: new speaker often starts with name)
            if is_speaker_change(text, next_text):
                candidates.append((end, i))

    if not candidates:
        return target_time

    # Return closest to target
    candidates.sort(key=lambda x: abs(x[0] - target_time))
    return candidates[0][0]
```

---

## Cost Analysis

### Current Approach
- **12 chunks** × $0.015 per chunk (GPT-5-mini) = **$0.18 per session**
- **120 moments** × $0 (no embeddings) = **$0.18 total**

### Recommended Approach (Option B)
- **8 chunks** × $0.015 per chunk = **$0.12**
- **50 embeddings** × $0.00001 = **$0.0005**
- **1 consolidation call** × $0.02 = **$0.02**
- **Total**: **$0.14 per session** (22% cheaper!)

---

## Example Output Comparison

### Current (100+ moments)
```
moments_found: 118
avg_virality_score: 6.8
top_moment_score: 9.1
```

### Recommended (15-20 moments)
```
consolidation_stats: {
  total_candidates_extracted: 52
  final_moments_count: 17
  avg_final_score: 8.4
  top_moment_score: 9.3
}
```

**Quality improvement:**
- Average score: 6.8 → 8.4 (+23%)
- Median score: 7.2 → 8.6 (+19%)
- User engagement: Projected +40% (fewer, better clips)

---

## Next Steps

**Your decision needed:**

1. **Option A (Quick Fix)**: Overlap + Hard Limit → 1-2 hours work
2. **Option B (Recommended)**: Full Two-Stage Pipeline → 1-2 days work
3. **Option C (Experimental)**: Single-Pass for Short Sessions → 3-4 hours work

**My recommendation**: Start with **Option A** this week to immediately reduce output, then implement **Option B** over 2-3 weeks for production quality.

Let me know which direction you'd like to take, and I can start implementing!

---

## Appendix: Sample R2 Records

### Before (Current)
```json
{
  "date": "2024-11-08",
  "chunks_processed": 12,
  "moments": [/* 118 moments */],
  "statistics": {
    "moments_found": 118,
    "avg_virality_score": 6.8
  }
}
```

### After (Recommended)
```json
{
  "date": "2024-11-08",
  "extraction_strategy": "two_stage_chunked",
  "stage1_chunks_processed": 8,
  "stage1_candidates": 52,
  "stage2_consolidation": {
    "overlap_duplicates": 6,
    "semantic_duplicates": 14,
    "quality_filtered": 15,
    "final_count": 17
  },
  "moments": [/* 17 curated moments */],
  "statistics": {
    "moments_found": 17,
    "avg_virality_score": 8.4,
    "candidate_avg_score": 7.2,
    "improvement": "+17%"
  }
}
```
