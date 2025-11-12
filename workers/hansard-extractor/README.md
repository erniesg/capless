# Hansard Extractor Worker

Cloudflare Worker for extracting viral moments from historical Singapore Parliament (Hansard) sessions.

## Features

- ✅ **Full TypeScript** - No Python, no containers
- ✅ **Queue-based** - Process 1700+ sessions asynchronously
- ✅ **Checkpointing** - Resume from failures with Durable Objects
- ✅ **R2 Storage** - Automatically saves results
- ✅ **Consolidation** - Semantic dedup + global reranking
- ✅ **Rate limiting** - Handles OpenAI rate limits gracefully

## Architecture

```
Queue → Worker → R2
  ↓       ↓
  └─── Durable Object (checkpoint)
```

## Setup

### 1. Install dependencies
```bash
npm install
```

### 2. Create Queue
```bash
wrangler queues create hansard-extraction-queue
wrangler queues create hansard-extraction-dlq  # Dead letter queue
```

### 3. Set secrets
```bash
wrangler secret put OPENAI_API_KEY
# Paste your OpenAI API key
```

### 4. Deploy
```bash
npm run deploy
```

## Usage

### Extract single date
```bash
curl -X POST https://hansard-extractor.YOUR_SUBDOMAIN.workers.dev/extract \
  -H "Content-Type: application/json" \
  -d '{"date": "2025-09-22"}'
```

### Extract all historical sessions
```bash
curl -X POST https://hansard-extractor.YOUR_SUBDOMAIN.workers.dev/extract-all \
  -H "Content-Type: application/json" \
  -d '{
    "start_date": "2024-01-01",
    "end_date": "2025-09-22"
  }'
```

Or with specific dates:
```bash
curl -X POST https://hansard-extractor.YOUR_SUBDOMAIN.workers.dev/extract-all \
  -H "Content-Type: application/json" \
  -d '{
    "dates": ["2025-09-22", "2025-09-23", "2025-09-24"]
  }'
```

### Check status
```bash
curl https://hansard-extractor.YOUR_SUBDOMAIN.workers.dev/status
```

## Monitoring

### Watch logs in real-time
```bash
npm run tail
```

### Check queue status
```bash
wrangler queues list
```

## Output Format

Results are saved to R2 at: `hansard/moments/{date}.json`

```json
{
  "date": "2025-09-22",
  "model": "gpt-5-mini",
  "extracted_at": "2025-11-12T00:00:00.000Z",
  "format": "NEW_STRUCTURED_FORMAT_V2_WITH_CONSOLIDATION",
  "chunks_processed": 11,
  "consolidation_stats": {
    "total_candidates_extracted": 72,
    "semantic_duplicates_removed": 1,
    "final_moments_count": 71,
    "avg_initial_score": 8.12,
    "avg_final_score": 8.06
  },
  "moments": [...]
}
```

## Cost Estimate

### Cloudflare (FREE)
- Workers: 100,000 requests/day free ✅
- Queue: 1M operations/month free ✅
- R2 Storage: 10 GB free ✅
- Durable Objects: 1M reads/month free ✅

### OpenAI API (~$35-40)
- 1700 sessions × 12 API calls = 20,400 requests
- ~232M tokens total
- Estimated: $35-40

**Total: ~$35-40 for all historical data**

## Development

### Local development
```bash
npm run dev
```

### Type checking
```bash
npm run type-check
```

## Rate Limits

The worker respects OpenAI rate limits:
- 500 RPM (requests per minute)
- 5M TPD (tokens per day)

With 1700 sessions:
- Sequential processing: 4-5 days
- With rate limiting: ~10-47 days (depending on token usage)

## Troubleshooting

### Queue not processing
```bash
# Check queue status
wrangler queues list

# Check dead letter queue
wrangler queues consumer list hansard-extraction-dlq
```

### Check failed sessions
```bash
curl https://hansard-extractor.YOUR_SUBDOMAIN.workers.dev/status
```

### Retry failed session
```bash
curl -X POST https://hansard-extractor.YOUR_SUBDOMAIN.workers.dev/extract \
  -H "Content-Type: application/json" \
  -d '{"date": "YYYY-MM-DD"}'
```
