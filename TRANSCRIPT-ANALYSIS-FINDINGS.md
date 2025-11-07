# Transcript Structure Analysis & Chunking Strategy

**Date**: November 4, 2025
**Purpose**: Determine proper chunking strategy for moment extraction to avoid splitting conversations

## Executive Summary

**CRITICAL FINDINGS**:
- ✅ Recent transcripts (2024+) have **natural section boundaries** that MUST be preserved
- ⚠️ Simple 200K truncation would **cut conversations mid-way** - user's concern was valid!
- ✅ Old transcripts (pre-2024) mostly fit within 200K limit - minimal chunking needed
- ✅ "Cleaned" versions are optimal - only 6.8% HTML overhead, preserves all structure

---

## Detailed Findings

### 1. Recent Hansard Transcripts (2024+)

**Format**: `NEW_STRUCTURED_FORMAT` with `takesSectionVOList`

**Sample Analysis** (`01-03-2024`):
- **Total sections**: 37
- **Total text content**: 507,504 characters
- **Exceeds 200K limit by**: 307,504 chars (154% over limit!)
- **HTML overhead**: 6.8% (worth stripping but not dramatic)

**Section Size Distribution**:
```
- Small sections:    613 - 6,915 chars (Questions, Statements)
- Medium sections:  63,214 - 74,775 chars (Ministry debates)
- HUGE sections:   121,375 - 184,898 chars (MTI, MCI debates!)
```

**Critical Discovery**: Section 11 (Ministry of Trade and Industry) alone is **184,898 characters** - nearly the entire 200K limit!

**Natural Boundaries**: Each section has:
- Clear `title` and `sectionType` (OA, OS, WA, WS, etc.)
- Complete thematic units (questions, debates, statements)
- HTML `content` field that can be stripped to plain text

### 2. Old Hansard Transcripts (1960s-1980s)

**Format**: `OLD_HTML_FORMAT` with `fullText` field

**Sample Analysis** (`01-03-1985`):
- **Total text**: 151,115 characters
- **Fits within 200K**: ✅ No chunking required!
- **Natural boundaries**: 272 double newlines, 146 speaker patterns
- **Structure**: Simple column-based format with speaker labels

**Sample Content**:
```
Parliament No: 6
Session No: 1
...
Mr SPEAKER (Dr Yeoh Ghim Seng (Joo Chiat)).
Encik Abbas Abu Amin, P.P.A. (Pasir Panjang).
Mr Abdullah Tarmugi (Siglap).
```

### 3. YouTube VTT Transcripts

**Sample Analysis** (`2024-08-06.vtt`):
- **Total length**: 3,059,669 characters
- **Total lines**: 76,385
- **Timestamp entries**: 19,095 (one every ~10 seconds)
- **Natural boundaries**: Every caption has start/end timestamps

**Exceeds 200K by**: 2,859,669 characters (1430% over limit!)

**VTT Structure**:
```
00:00:15.679 --> 00:00:18.029
this is the media Corp broadcast Circuit

00:00:18.039 --> 00:00:45.670
of parliament track one English
```

**Critical**: VTT files are MUCH larger than Hansard text due to redundant formatting and timing data.

---

## Chunking Strategy Recommendations

### For Recent Hansard (2024+): Section-Based Chunking

**Strategy**:
1. ✅ **Split by `takesSectionVOList`** - each section is a natural unit
2. ✅ **Strip HTML tags** - reduces by ~7%, improves token efficiency
3. ⚠️ **Handle large sections** - some exceed 180K chars:
   - Option A: Extract moments from large sections individually
   - Option B: Further split by paragraph boundaries if needed
4. ✅ **Preserve section metadata** - title, type, speaker for context

**Implementation**:
```python
for section in data['takesSectionVOList']:
    title = section['title']
    section_type = section['sectionType']
    content_html = section['content']

    # Strip HTML
    content_text = strip_html_tags(content_html)

    # If section > 200K, split by paragraphs
    if len(content_text) > 200000:
        chunks = split_by_paragraphs(content_text, max_size=180000)
        for chunk in chunks:
            extract_moments(chunk, context={
                'title': title,
                'type': section_type,
                'is_chunk': True
            })
    else:
        extract_moments(content_text, context={
            'title': title,
            'type': section_type
        })
```

### For Old Hansard (Pre-2024): Minimal Chunking

**Strategy**:
1. ✅ **Most fit within 200K** - process as-is
2. ✅ **For rare large sessions** - split by double-newline boundaries
3. ✅ **Preserve speaker patterns** - avoid splitting "Name: text"

**Implementation**:
```python
full_text = data['cleanedContent']['fullText']

if len(full_text) <= 200000:
    extract_moments(full_text)  # Simple case - most sessions
else:
    # Split by paragraph boundaries
    chunks = split_by_double_newlines(full_text, max_size=180000, overlap=1000)
    for chunk in chunks:
        extract_moments(chunk)
```

### For YouTube VTT: Time-Based Chunking

**Strategy**:
1. ✅ **Parse VTT to extract text + timestamps**
2. ✅ **Chunk by time ranges** (e.g., 30-minute segments)
3. ✅ **Preserve timestamp alignment** for precise moment location
4. ⚠️ **Handle multi-hour sessions** - 19K timestamp entries!

**Implementation**:
```python
captions = parse_vtt(vtt_file)  # [{start_time, end_time, text}, ...]

# Chunk by 30-minute segments
chunk_duration = 1800  # 30 minutes in seconds
chunks = group_captions_by_time(captions, chunk_duration)

for chunk in chunks:
    chunk_text = ' '.join([c['text'] for c in chunk])
    start_time = chunk[0]['start_time']
    end_time = chunk[-1]['end_time']

    moments = extract_moments(chunk_text)

    # Map moments back to exact timestamps
    for moment in moments:
        moment['video_timestamp'] = find_timestamp_for_quote(
            moment['quote'],
            chunk
        )
```

---

## Cleaned vs Raw Transcripts

**Analysis**: Checked `hansard/cleaned/` and `hansard/raw/`

**Finding**: **ALWAYS use cleaned versions**

**Reasons**:
1. ✅ Cleaned has better structure (JSON with fields vs raw HTML)
2. ✅ Removes redundant formatting (6.8% overhead reduction)
3. ✅ Preserves all content - no information loss
4. ✅ Easier to parse programmatically

---

## Impact on Current Simple Extraction Scripts

**Current Approach** (`scripts/extract-youtube-moments.py`, `scripts/extract-hansard-moments.py`):
```python
# WRONG - Simple truncation
transcript_text = data['content'][:200000]  # Cuts mid-conversation!
```

**Problems**:
- ❌ Blindly truncates at 200K characters
- ❌ Splits sections mid-way (e.g., cuts Ministry of Trade debate in half)
- ❌ Loses context and completeness
- ❌ May split speaker turns or questions/answers

**What User Was Concerned About**: "for the chunking did we take mind to split at section boundaries or sth so we dun end up chunking an ongoing convo into two?"

**User was 100% RIGHT** - we were indeed cutting conversations!

---

## Updated Extraction Strategy

### Priority 1: Fix Recent Hansard (2024+)
- Implement section-based chunking
- Process each section independently or combine small adjacent sections
- Strip HTML for token efficiency

### Priority 2: Keep Old Hansard Simple
- Most sessions < 200K - process as-is
- For rare large ones, split by paragraph boundaries

### Priority 3: Implement YouTube Time-Based Chunking
- Parse VTT properly (not just strip timestamps)
- Chunk by time ranges (30-min segments)
- Map extracted moments back to exact video timestamps

### Priority 4: Test & Validate
- Sample from different years (1960s, 1980s, 2024)
- Verify moments aren't cut mid-sentence
- Check token usage per chunk
- Validate rate limits work with new strategy

---

## Estimated Time Impact

**Old Simple Approach** (truncation):
- 1726 Hansard sessions × 25s = ~12 hours

**New Section-Based Approach**:
- Recent sessions (2024+): ~37 sections/session → ~37 API calls/session
- Old sessions (pre-2024): 1 API call/session (fits in 200K)
- **Total API calls**: Approximately 5,000-10,000 (need to survey all years)
- **Estimated time**: 35-70 hours (with 25s delays for 3 RPM limit)
- **Rate limit considerations**: May need to batch or use paid tier

**Recommendation**:
1. Start with small subset (10-20 recent sessions) to validate approach
2. Then run full backfill over multiple days if needed
3. Consider using `gpt-4o-mini` which has higher rate limits

---

## Next Steps

1. ✅ **COMPLETED**: Examined transcript structure from different years
2. ✅ **COMPLETED**: Identified section boundaries and chunking needs
3. ⏭️ **NEXT**: Update extraction scripts to use section-based chunking
4. ⏭️ **THEN**: Test on 3-5 sample sessions (recent + old + YouTube)
5. ⏭️ **FINALLY**: Run full extraction with correct chunking strategy

---

## Summary

**User Concern**: "did we take mind to split at section boundaries or sth so we dun end up chunking an ongoing convo into two?"

**Answer**: No, we were using simple truncation which DOES cut conversations mid-way. User was absolutely right to pause and question the approach!

**Solution**: Implement section-aware chunking for recent transcripts, preserve natural boundaries, and ensure complete context for moment extraction.

**Recommendation**: Always use cleaned transcripts, implement section-based chunking for 2024+ data, keep simple approach for older data that fits within limits.
