# YouTube Transcript Backfill Status

**Date:** 2025-10-25
**Total Sessions:** 33 (14th + 15th Parliament)

## KV Sync Status
✅ **COMPLETE** - All 33 YouTube URLs synced to KV
- Key format: `youtube:{date}`
- Contains: video_id, title, is_interpretation, has_hansard

## Transcript Extraction Status (Partial)
❌ **INCOMPLETE** - Stopped due to scrape.do API rate limits

### Successful Extractions (4/33)
- 2024-08-06: x0u0TZctbGY ✅
- 2024-08-07: OEhSSf_PLf8 ✅
- 2024-09-09: iOw2HV1BwWo ✅
- 2024-11-11: U_gaEYygUJc ✅

### Failed - No Captions (2)
- 2024-10-15: C7TcWr0eUyE
- 2024-10-16: uPdNV-HD0B4

### Failed - API Rate Limit (27)
YouTube 401 Unauthorized errors due to scrape.do API exhaustion:
- 2024-09-10, 2024-10-14, 2024-11-12, 2024-11-13
- 2025-01-07, 2025-01-08, 2025-02-04, 2025-02-05
- 2025-02-18, 2025-02-26, 2025-02-27, 2025-02-28
- 2025-03-03, 2025-03-04, 2025-03-05, 2025-03-06, 2025-03-07, 2025-03-10
- 2025-04-08, 2025-05-09, 2025-09-05, 2025-09-22, 2025-09-23, 2025-09-24, 2025-09-25, 2025-09-26, 2025-10-15

## Next Steps
To complete the backfill when API quota is restored:
1. The extraction worker already checks R2 before processing
2. Re-run the backfill script - it will skip already-extracted transcripts
3. Worker will only process the 27 failed sessions

## Architecture Notes
- Parliament scraper worker has POST /sync-youtube-url endpoint
- Automatic YouTube integration checks KV for youtube:{date} keys
- Daily automation will trigger transcript extraction when new hansards detected
