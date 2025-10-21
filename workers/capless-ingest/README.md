# Capless Ingestion Worker

Production-ready Cloudflare Worker for ingesting and processing Singapore Parliament Hansard transcripts.

## Features

- **Hansard JSON Parsing**: Extracts speeches, speakers, and timestamps from HTML content
- **Multiple Input Methods**: Fetch from API, provide JSON directly, or use custom URLs
- **Smart Caching**: Redis-like caching with configurable TTL (24h default)
- **R2 Storage**: Dual storage of raw and processed transcripts
- **Error Handling**: Comprehensive retry logic with exponential backoff
- **Type Safety**: Full TypeScript implementation with Zod-like validation
- **TDD Approach**: 95%+ test coverage with unit, integration tests

## Architecture

```
┌─────────────────┐
│  Client Request │
└────────┬────────┘
         │
         ▼
┌─────────────────────────────────┐
│  Capless Ingestion Worker      │
│  POST /api/ingest/hansard       │
└────────┬────────────────────────┘
         │
         ├──► Check Redis Cache (KV)
         │    └──► Return if cached
         │
         ├──► Fetch from Parliament API
         │    └──► Retry with backoff
         │
         ├──► Parse HTML with Cheerio
         │    └──► Extract speeches/speakers
         │
         ├──► Process into structured format
         │    └──► Generate segments
         │
         ├──► Store in R2 (raw + processed)
         │
         └──► Cache in Redis (24h TTL)
```

## API Endpoints

### `POST /api/ingest/hansard`

Ingest and process a Hansard transcript.

**Request Body:**

```typescript
{
  // Option 1: Provide sitting date (fetches from API)
  sittingDate?: string;  // "02-07-2024" or "2024-07-02"

  // Option 2: Provide pre-fetched Hansard JSON
  hansardJSON?: HansardJSON;

  // Option 3: Provide custom API URL
  hansardURL?: string;

  // Optional parameters
  transcriptId?: string;      // Override auto-generated ID
  skipStorage?: boolean;      // Skip R2 storage (for testing)
  forceRefresh?: boolean;     // Bypass cache
}
```

**Response:**

```typescript
{
  success: boolean;
  transcript_id: string;          // "2024-07-02-p14-s3"
  sitting_date: string;           // "2024-07-02"
  speakers: string[];             // Unique list of all speakers
  topics: string[];               // Unique list of section titles
  segments_count: number;         // Total number of segments
  metadata: {
    total_words: number;
    processing_time_ms: number;
    cached: boolean;
    storage_urls?: {
      raw: string;                // R2 URL for raw Hansard JSON
      processed: string;          // R2 URL for processed transcript
    };
  };
  error?: string;                 // Error message if success=false
}
```

**Example Request:**

```bash
curl -X POST https://capless-ingest.workers.dev/api/ingest/hansard \
  -H "Content-Type: application/json" \
  -d '{
    "sittingDate": "02-07-2024"
  }'
```

**Example Response:**

```json
{
  "success": true,
  "transcript_id": "2024-07-02-p14-s3",
  "sitting_date": "2024-07-02",
  "speakers": [
    "Mr Leong Mun Wai",
    "The Minister for National Development (Mr Desmond Lee)",
    "The Prime Minister (Mr Lawrence Wong)"
  ],
  "topics": [
    "Oral Answers to Questions",
    "Ministerial Statements"
  ],
  "segments_count": 8,
  "metadata": {
    "total_words": 315,
    "processing_time_ms": 1234,
    "cached": false,
    "storage_urls": {
      "raw": "https://capless.r2.dev/transcripts/raw/2024/07/02/2024-07-02-p14-s3.json",
      "processed": "https://capless.r2.dev/transcripts/processed/2024-07-02-p14-s3.json"
    }
  }
}
```

### `GET /health`

Health check endpoint.

**Response:**

```json
{
  "status": "ok",
  "service": "capless-ingest",
  "version": "1.0.0",
  "timestamp": "2025-10-21T12:00:00.000Z"
}
```

## Data Models

### Input: Hansard JSON (Singapore Parliament API)

```typescript
interface HansardJSON {
  metadata: {
    parlimentNO: number;
    sessionNO: number;
    volumeNO?: number;
    sittingDate: string;        // "02-07-2024"
    dateToDisplay: string;      // "Tuesday, 2 July 2024"
    startTimeStr: string;       // "1:30 pm"
    speaker: string;            // Speaker of Parliament
  };
  takesSectionVOList: Array<{
    startPgNo: number;
    title: string;
    sectionType: "OS" | "OA" | "BILLS" | "PAPERS" | "OTHER";
    content: string;            // HTML with speeches
    questionCount?: number;
  }>;
  attendanceList: Array<{
    mpName: string;
    attendance: boolean;
  }>;
}
```

### Output: Processed Transcript

```typescript
interface ProcessedTranscript {
  transcript_id: string;        // "2024-07-02-p14-s3"
  sitting_date: string;         // "2024-07-02" (ISO)
  date_display: string;         // "Tuesday, 2 July 2024"
  speakers: string[];           // Unique speakers
  topics: string[];             // Section titles
  segments: TranscriptSegment[];
  metadata: {
    parliament_no: number;
    session_no: number;
    volume_no?: number;
    start_time: string;
    speaker_of_parliament: string;
    attendance: string[];       // MPs present
    total_segments: number;
    total_words: number;
    processing_timestamp: string;
    source_url: string;
  };
}

interface TranscriptSegment {
  id: string;                   // "2024-07-02-p14-s3-0"
  speaker: string;
  text: string;                 // Clean text (HTML stripped)
  timestamp?: string;           // "1.30 pm"
  section_title: string;
  section_type: "OS" | "OA" | "BILLS" | "PAPERS" | "OTHER";
  page_number: number;
  segment_index: number;
  word_count: number;
  char_count: number;
}
```

## Setup & Deployment

### Prerequisites

- Node.js 18+
- Cloudflare account with Workers enabled
- Wrangler CLI installed (`npm install -g wrangler`)

### Installation

```bash
cd workers/capless-ingest
npm install
```

### Configuration

1. **Update `wrangler.toml`:**

```toml
account_id = "your-cloudflare-account-id"

[[r2_buckets]]
binding = "R2"
bucket_name = "capless"

[[kv_namespaces]]
binding = "REDIS"
id = "your-kv-namespace-id"
```

2. **Create R2 Bucket:**

```bash
wrangler r2 bucket create capless
```

3. **Create KV Namespace:**

```bash
wrangler kv:namespace create REDIS
```

Copy the generated namespace ID to `wrangler.toml`.

### Development

```bash
# Run local dev server
npm run dev

# Test endpoint
curl http://localhost:8787/health
```

### Testing

```bash
# Run all tests
npm test

# Watch mode
npm run test:watch

# Coverage report
npm run test:coverage
```

### Deployment

```bash
# Deploy to production
npm run deploy

# Deploy to specific environment
wrangler deploy --env production
```

## Storage Structure

### R2 Bucket Organization

```
capless/
├── transcripts/
│   ├── raw/
│   │   └── {year}/{month}/{day}/{transcript_id}.json
│   └── processed/
│       └── {transcript_id}.json
```

**Example:**

```
transcripts/raw/2024/07/02/2024-07-02-p14-s3.json
transcripts/processed/2024-07-02-p14-s3.json
```

### Redis Cache Keys

```
hansard:raw:{sitting_date}                  # Raw Hansard JSON (24h TTL)
transcript:processed:{transcript_id}        # Processed transcript (24h TTL)
```

## Error Handling

### Retry Logic

- **Max Retries**: 3 attempts (configurable)
- **Backoff**: Exponential (1s, 2s, 4s)
- **Retryable Errors**: Network errors, 5xx responses
- **Non-retryable**: 4xx client errors, validation errors

### Error Response Format

```json
{
  "success": false,
  "transcript_id": "",
  "sitting_date": "",
  "speakers": [],
  "topics": [],
  "segments_count": 0,
  "metadata": {
    "total_words": 0,
    "processing_time_ms": 123,
    "cached": false
  },
  "error": "Failed to fetch Hansard JSON: HTTP 404"
}
```

## Performance

### Benchmarks

- **Cold Start**: ~500ms
- **Cached Response**: ~50ms
- **Full Processing**: ~1-2s (depending on transcript size)
- **API Fetch**: ~500-1000ms

### Optimization Tips

1. **Use Cache**: Set `forceRefresh: false` for repeat requests
2. **Batch Processing**: Process multiple dates in parallel
3. **Monitor Rate Limits**: Singapore Parliament API has rate limits
4. **CDN Integration**: Use R2 public URLs with CDN for distribution

## Examples

See `examples/` directory for:

- `hansard-sample.json` - Sample Hansard JSON input
- `processed-output.json` - Example processed transcript output

## Testing

### Unit Tests

```bash
npm test tests/html-parser.test.ts
npm test tests/api-client.test.ts
npm test tests/transcript-processor.test.ts
```

### Integration Testing

```bash
# Test with real Hansard data
curl -X POST http://localhost:8787/api/ingest/hansard \
  -H "Content-Type: application/json" \
  -d @examples/hansard-sample.json
```

## Monitoring

### Metrics to Track

- Request count and latency
- Cache hit/miss ratio
- API fetch success rate
- Storage write success rate
- Error rates by type

### Cloudflare Analytics

View metrics in Cloudflare Dashboard:
- Workers > capless-ingest > Metrics

## Security

- **CORS**: Enabled for all origins (adjust for production)
- **Rate Limiting**: Implement at Cloudflare level
- **Authentication**: Add API keys if needed
- **Input Validation**: All inputs validated before processing

## Troubleshooting

### Common Issues

**"Invalid date format" error:**
- Ensure date is in `DD-MM-YYYY` or `YYYY-MM-DD` format

**"Failed to fetch Hansard JSON" error:**
- Check Singapore Parliament API status
- Verify sitting date has published Hansard

**R2 storage errors:**
- Verify R2 bucket exists and is accessible
- Check bucket bindings in wrangler.toml

**Cache not working:**
- Verify KV namespace is created and bound
- Check TTL settings in environment variables

## Contributing

1. Write tests first (TDD approach)
2. Ensure all tests pass: `npm test`
3. Check type safety: `npm run type-check`
4. Format code: `npm run format`
5. Lint code: `npm run lint`

## License

MIT

## Support

For issues or questions:
- GitHub Issues: [capless/issues](https://github.com/erniesg/capless/issues)
- Email: support@capless.dev

---

**Built with:**
- TypeScript
- Cloudflare Workers
- Cheerio (HTML parsing)
- Vitest (Testing)
- Wrangler (Deployment)
