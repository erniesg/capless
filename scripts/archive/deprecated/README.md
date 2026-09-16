# Deprecated Scripts

These scripts have been superseded by newer versions and are kept here for historical reference.

## Archived Scripts

### YouTube Extraction (Obsolete)
- **extract-youtube-moments.py** - Basic extraction without chunking
  - **Superseded by**: `extract-youtube-moments-v2.py`
  - **Reason**: No chunking, limited to small transcripts

- **extract-youtube-moments-chunked.py** - Early chunking implementation
  - **Superseded by**: `extract-youtube-moments-v2.py`
  - **Reason**: Basic overlap, missing deduplication logic

### Hansard Extraction (Obsolete)
- **extract-hansard-moments.py** - Basic extraction without chunking
  - **Superseded by**: `extract-hansard-moments-recent.py`
  - **Reason**: No chunking, limited to small transcripts

- **extract-hansard-moments-chunked.py** - Early section-based chunking
  - **Superseded by**: `extract-hansard-moments-recent.py`
  - **Reason**: Missing rich metadata, inefficient rate limiting

- **extract-hansard-moments-recent.py.bak** - Original production version
  - **Superseded by**: Upgraded `extract-hansard-moments-recent.py`
  - **Reason**: Missing rich metadata (chunk_id, section_titles), 120s rate limit (60x slower)

## Current Production Scripts

### YouTube
- `scripts/extract-youtube-moments-v2.py` - Production YouTube extraction
  - Time-based chunking (2h chunks, 20min overlap)
  - Rich metadata tracking
  - Deduplication logic

### Hansard
- `scripts/extract-hansard-moments-recent.py` - Production Hansard extraction
  - Section-aware chunking
  - Rich metadata (chunk_id, section_titles, section_types)
  - Proper rate limiting (2s vs 120s)
  - Uses shared `scripts/lib/` library

## Consolidated Libraries

All shared functions have been extracted to:
- `scripts/lib/extraction_common.py` - Credentials, R2 ops, extraction logic
- `scripts/lib/chunking.py` - Section-based and time-based chunking strategies

This reduces code duplication by ~50% and ensures consistency across pipelines.
