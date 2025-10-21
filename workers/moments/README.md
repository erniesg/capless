# Capless Moments Worker

AI-powered viral moment extraction from Singapore parliamentary transcripts using OpenAI GPT-4o.

## Overview

The Moments Worker identifies quotable, viral-worthy moments from Hansard transcripts by analyzing:

- **Bureaucratic jargon** and doublespeak
- **Contradictions** and illogical reasoning
- **Everyday impact** on Singaporeans
- **Quotability** and shareability
- **Emotional intensity** of exchanges

## Features

- **GPT-4o Analysis**: Nuanced understanding of political discourse and virality
- **Virality Scoring**: Multi-factor algorithm (0-10 scale)
- **Context Extraction**: Captures before/after segments for understanding
- **Semantic Embeddings**: OpenAI embeddings for similarity search
- **Batch Processing**: Process multiple transcripts asynchronously
- **Caching**: Redis-backed caching for frequently accessed moments
- **Vector Search**: Cloudflare Vectorize for semantic moment discovery

## Architecture

```
Input (Transcript) → OpenAI GPT-4o → Moment Analysis → Virality Scoring
                                                          ↓
                                              Context + Embeddings
                                                          ↓
                                          R2 Storage + Vectorize Index
```

## API Endpoints

### 1. Extract Moments

```http
POST /api/moments/extract
Content-Type: application/json

{
  "transcript_id": "transcript-2025-01-15-healthcare",
  "criteria": {
    "min_score": 5.0,
    "max_results": 20,
    "topics": ["Healthcare", "Housing"],
    "speakers": ["Minister Tan"]
  }
}
```

**Response:**
```json
{
  "transcript_id": "transcript-2025-01-15-healthcare",
  "moments": [...],
  "top_moment": {...},
  "statistics": {
    "total_segments_analyzed": 12,
    "moments_found": 4,
    "avg_virality_score": 8.55
  },
  "processed_at": "2025-01-21T10:30:00Z",
  "model_used": "gpt-4o"
}
```

### 2. Analyze Single Moment

```http
POST /api/moments/analyze
Content-Type: application/json

{
  "moment_text": "The increase is modest when you factor in the comprehensive package.",
  "context": "Discussion about premium increases",
  "speaker": "Minister Tan"
}
```

**Response:**
```json
{
  "virality_score": 8.5,
  "topics": ["Healthcare", "Insurance"],
  "emotions": ["defensive", "evasive"],
  "controversy_level": 7
}
```

### 3. Batch Extract

```http
POST /api/moments/batch
Content-Type: application/json

{
  "transcript_ids": [
    "transcript-001",
    "transcript-002",
    "transcript-003"
  ],
  "criteria": {
    "min_score": 7.0
  }
}
```

**Response:**
```json
{
  "job_id": "batch-1737000000",
  "successful": 3,
  "failed": 0,
  "results": [...],
  "errors": []
}
```

### 4. Semantic Search

```http
GET /api/moments/search?q=healthcare%20jargon&limit=10
```

**Response:**
```json
{
  "query": "healthcare jargon",
  "results": [
    {
      "moment_id": "moment-abc123",
      "score": 0.92,
      "speaker": "Minister Ong",
      "quote": "...",
      "virality_score": 9.2
    }
  ]
}
```

### 5. Trending Moments

```http
GET /api/moments/trending?timeframe=7d&limit=10&min_score=7.0
```

## Virality Scoring Algorithm

The final virality score (0-10) combines multiple factors:

```typescript
score =
  (AI base score × 0.4) +           // 40% weight
  (jargon density × 2.0) +          // 20% weight
  (contradiction ? 2.0 : 0) +       // +2 points
  (quotability × 1.0) +             // +1 point
  (everyday impact ? 1.5 : 0) +     // +1.5 points
  (emotional intensity × 3.0)       // 30% weight

// Capped at 10.0
```

### Scoring Factors

**1. Jargon Density (0-2 points)**
- Detects bureaucratic terms: "actuarial", "framework", "optimization", "inter-generational"
- Higher density = higher virality

**2. Contradiction Detection (+2 points)**
- Identifies contradictory statements: "modest" vs "35% increase"
- Pattern matching for logical inconsistencies

**3. Quotability (0-1 point)**
- Optimal: 15-40 words
- Shareable length for TikTok/Instagram

**4. Everyday Impact (+1.5 points)**
- Topics: Healthcare, Housing, Transport, Education, Cost of Living
- Directly affects Singaporean lives

**5. Emotional Intensity (0-3 points)**
- High emotion: defensive, evasive, angry, frustrated
- Medium emotion: concerned, worried, skeptical
- Low emotion: neutral, calm

## Setup & Deployment

### Prerequisites

```bash
# Install dependencies
npm install

# Login to Cloudflare
wrangler login

# Create R2 bucket
wrangler r2 bucket create capless

# Create Vectorize index
wrangler vectorize create capless-moments --dimensions=1536 --metric=cosine
```

### Set Secrets

```bash
# OpenAI API key (required)
wrangler secret put OPENAI_API_KEY

# Upstash Redis (optional, for caching)
wrangler secret put UPSTASH_REDIS_REST_URL
wrangler secret put UPSTASH_REDIS_REST_TOKEN
```

### Development

```bash
# Run locally
npm run dev

# Test
npm run test

# Watch mode
npm run test:watch

# Coverage
npm run test:coverage
```

### Deploy

```bash
# Deploy to production
npm run deploy

# Or with wrangler directly
wrangler deploy
```

## Data Models

### Viral Moment

```typescript
{
  moment_id: string;
  quote: string;              // 15-300 characters
  speaker: string;
  timestamp_start?: string;
  timestamp_end?: string;

  // Context
  context_before: string;     // Previous 1-2 segments
  context_after: string;      // Next 1-2 segments

  // Analysis
  virality_score: number;     // 0-10
  why_viral: string;
  topic: string;
  emotional_tone: string;
  target_demographic: string;

  // Technical
  embedding?: number[];       // 1536 dimensions
  section_title?: string;
  transcript_id: string;
  segment_ids: string[];
  created_at: string;
}
```

### Extraction Criteria

```typescript
{
  min_score?: number;        // Default: 5.0
  max_results?: number;      // Default: 20
  topics?: string[];         // Filter by topics
  speakers?: string[];       // Filter by speakers
  require_jargon?: boolean;  // Only jargon-heavy moments
  require_contradiction?: boolean;
}
```

## AI Prompt Engineering

The worker uses a carefully crafted prompt that instructs GPT-4o to:

1. **Identify viral patterns**: Jargon, contradictions, relatable issues
2. **Score generously**: We want shareable content (7-9 range is common)
3. **Extract metadata**: Speaker, topic, emotion, demographics
4. **Return structured JSON**: Consistent, parseable output

### Prompt Template

```
You are a content strategist for viral social media analyzing Singapore Parliament.

Look for moments that are:
- Bureaucratic doublespeak or dense jargon
- Contradictions or illogical reasoning
- Statements affecting everyday Singaporeans
- Memorable soundbites
- Moments that make people say "What?!"

Return JSON array sorted by virality score.
```

See `src/extractor.ts` for the full prompt.

## Example Usage

### 1. Extract Moments from Transcript

```typescript
// Fetch transcript from R2
const transcript = await storage.getTranscript('transcript-001');

// Extract moments
const result = await extractor.extractMoments(transcript, {
  min_score: 7.0,
  max_results: 10,
});

// Get top moment
const topMoment = result.top_moment;
console.log(`"${topMoment.quote}" - ${topMoment.speaker}`);
console.log(`Virality: ${topMoment.virality_score}/10`);
```

### 2. Search Similar Moments

```typescript
// Semantic search for related moments
const results = await env.VECTORIZE.query(queryEmbedding, {
  topK: 10,
  filter: {
    topic: 'Healthcare',
    virality_score: { $gte: 7.0 },
  },
});
```

### 3. Batch Processing

```typescript
// Process multiple transcripts
const transcripts = ['transcript-001', 'transcript-002', 'transcript-003'];

const results = await Promise.allSettled(
  transcripts.map(id => extractor.extractMoments(id))
);
```

## Performance & Caching

### Caching Strategy

1. **Redis Cache**: Extraction results cached for 1 hour
2. **R2 Storage**: Permanent storage of all moments
3. **Vectorize Index**: Semantic search capability

### Cost Optimization

**Per transcript (typical):**
- GPT-4o call: ~2000 tokens = $0.02
- Embeddings (4 moments): ~400 tokens = $0.0001
- R2 storage: negligible
- Vectorize: included

**Total: ~$0.02 per transcript**

At 100 transcripts/day: **$2/day = $60/month**

## Testing

The worker includes comprehensive tests:

### Test Coverage

- ✅ Moment extraction from transcript
- ✅ Context extraction (before/after)
- ✅ Virality score calculation
- ✅ Jargon detection
- ✅ Contradiction detection
- ✅ Quotability scoring
- ✅ Filtering by criteria
- ✅ Statistics calculation
- ✅ Embedding generation
- ✅ Edge cases (start/end of transcript)

```bash
# Run tests
npm test

# Watch mode during development
npm run test:watch

# Generate coverage report
npm run test:coverage
```

## Tuning Virality Scores

To adjust scoring behavior, modify `src/scorer.ts`:

### Increase Jargon Sensitivity

```typescript
// Add more jargon terms
const JARGON_TERMS = [
  ...existing,
  'paradigm', 'synergize', 'holistic'
];
```

### Adjust Score Weights

```typescript
// More weight to AI score, less to jargon
score += analysis.ai_score * 0.6;  // Was 0.4
score += jargonScore * 1.0;        // Was 2.0
```

### Modify Quotability Range

```typescript
// Prefer shorter quotes (TikTok)
if (wordCount >= 10 && wordCount <= 25) return 1.0;
```

## Integration with Other Workers

### 1. Ingestion Worker

```typescript
// After processing transcript
const moments = await env.MOMENTS.fetch('/api/moments/extract', {
  method: 'POST',
  body: JSON.stringify({ transcript_id })
});
```

### 2. Script Generator Worker

```typescript
// Generate script for top moment
const script = await env.SCRIPTS.fetch('/api/scripts/generate', {
  method: 'POST',
  body: JSON.stringify({
    moment_id: moments.top_moment.moment_id,
    persona: 'gen_z'
  })
});
```

### 3. Analytics Worker

```typescript
// Track moment engagement
await env.ANALYTICS.fetch('/api/analytics/track', {
  method: 'POST',
  body: JSON.stringify({
    event: 'moment_viewed',
    properties: {
      moment_id: moment.moment_id,
      virality_score: moment.virality_score
    }
  })
});
```

## Monitoring

Key metrics to track:

- **Extraction success rate**: % of successful extractions
- **Moments per transcript**: Average number found
- **Virality score distribution**: Are scores too high/low?
- **API latency**: Time to extract moments
- **Cache hit rate**: % of cached responses
- **OpenAI costs**: Daily API spend

## Troubleshooting

### No moments found

- Check `min_score` - may be too high
- Verify transcript has substantive exchanges
- Review AI prompt for your use case

### Scores too high/low

- Adjust weights in `scorer.ts`
- Modify AI prompt instructions
- Add/remove jargon terms

### Rate limits

- Implement exponential backoff
- Use batch processing with delays
- Cache aggressively

## Future Enhancements

- [ ] Multi-model support (Claude, Gemini)
- [ ] Fine-tuned model on Singaporean context
- [ ] Real-time moment extraction via webhooks
- [ ] A/B testing of scoring algorithms
- [ ] Sentiment analysis integration
- [ ] Auto-tagging with topics/themes
- [ ] Trending moments dashboard

## License

MIT

## Support

For issues or questions, see the main [Capless documentation](../../README.md).
