# Parliament Hansard Scraper

Automated scraper for Singapore Parliament Hansard reports using Cloudflare Queues.

## Features

- **Date Range**: Scrapes from 22-04-1955 (first parliament) to present day
- **Rate Limiting**: Built-in with Cloudflare Queues (10 dates/batch, 100ms between requests)
- **Resumable**: Skips dates already in R2
- **Retry Logic**: 3 automatic retries, dead letter queue for failures
- **Raw Storage**: Saves unprocessed JSON responses for later parsing

## Architecture

```
HTTP /start → Producer → Queue (10 dates/batch) → Consumer → Fetch Hansard → Save to R2
                                    ↓
                            Dead Letter Queue (failures after 3 retries)
```

## API Endpoints

### Start Scraping
```bash
GET http://localhost:8787/start
```
Enqueues all dates from 1955 to present. Skips dates already in R2.

**Response:**
```json
{
  "message": "Scraping started",
  "total_dates": 25550,
  "enqueued": 25540,
  "skipped": 10,
  "start_date": "22-04-1955",
  "end_date": "2025-10-23"
}
```

### Check Status
```bash
GET http://localhost:8787/status
```
Shows scraping progress.

**Response:**
```json
{
  "total_dates": 25550,
  "scraped": 1250,
  "remaining": 24300,
  "progress": "4.89%"
}
```

### Health Check
```bash
GET http://localhost:8787/health
```

## Storage Structure

R2 bucket: `capless-preview`
```
hansard/
  raw/
    22-04-1955.json
    23-04-1955.json
    ...
    23-10-2025.json
```

Each file contains the raw JSON response from:
```
https://sprs.parl.gov.sg/search/getHansardReport/?sittingDate=DD-MM-YYYY
```

## Local Development

1. **Install dependencies:**
```bash
npm install
```

2. **Create queue (first time only):**
```bash
npx wrangler queues create parliament-dates-queue
npx wrangler queues create parliament-dates-dlq
```

3. **Run locally:**
```bash
npm run dev
```

4. **Test scraping:**
```bash
# Start scraping
curl http://localhost:8787/start

# Check progress
curl http://localhost:8787/status
```

## Deployment

```bash
# Deploy to Cloudflare Workers
npm run deploy

# Start scraping (production)
curl https://capless-parliament-scraper.YOUR_SUBDOMAIN.workers.dev/start
```

## Rate Limiting

- **Batch size**: 10 dates processed together
- **Batch timeout**: 60 seconds
- **Inter-request delay**: 100ms between Parliament API calls
- **Max retries**: 3 attempts per date
- **Effective rate**: ~100 dates/minute = ~18 days/hour = ~430 days/day

**Estimated time to scrape all dates (1955-2025):**
- Total dates: ~25,550
- At 430 dates/day: **~60 days** to complete full scrape

## Monitoring

View queue status in Cloudflare dashboard:
- https://dash.cloudflare.com → Workers & Pages → Queues → parliament-dates-queue

Check R2 storage:
- https://dash.cloudflare.com → R2 → capless-preview → hansard/raw/

## Error Handling

- **HTTP errors**: Retry up to 3 times
- **Network timeouts**: Automatic retry via queue
- **Max retries exceeded**: Moved to dead letter queue
- **Already scraped**: Skipped (idempotent)

## Next Steps

After scraping completes:
1. Parse raw Hansard JSON into structured format
2. Extract YouTube URLs from Hansard metadata
3. Download video subtitles
4. Convert to ProcessedTranscript format
5. Extract viral moments with Claude/Gemini
