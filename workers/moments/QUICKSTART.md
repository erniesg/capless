# Quick Start Guide - Capless Moments Worker

Get the Moments Worker running in 5 minutes.

## Prerequisites

- Node.js 18+
- OpenAI API key ([Get one here](https://platform.openai.com/api-keys))
- Cloudflare account (free tier is fine)

## 1. Install Dependencies

```bash
cd workers/moments
npm install
```

## 2. Set Up Local Development

Create a `.dev.vars` file for local secrets:

```bash
cat > .dev.vars << 'EOF'
OPENAI_API_KEY=sk-your-openai-key-here
UPSTASH_REDIS_REST_URL=https://your-redis.upstash.io
UPSTASH_REDIS_REST_TOKEN=your-redis-token
EOF
```

Replace with your actual keys.

## 3. Run Tests

```bash
# Run all tests
npm test

# Watch mode (runs tests on file changes)
npm run test:watch

# Generate coverage report
npm run test:coverage
```

All tests should pass ✅

## 4. Start Local Development Server

```bash
npm run dev
```

The worker will be available at `http://localhost:8788`

## 5. Test with Sample Data

### Health Check

```bash
curl http://localhost:8788/health
```

Should return:
```json
{
  "status": "healthy",
  "service": "capless-moments",
  "timestamp": "2025-01-21T10:30:00Z"
}
```

### Upload Sample Transcript (using wrangler)

First, create the R2 bucket:

```bash
wrangler r2 bucket create capless-preview
```

Upload the sample:

```bash
wrangler r2 object put capless-preview/transcripts/processed/transcript-2025-01-15-healthcare.json \
  --file=./examples/sample-transcript.json \
  --content-type=application/json
```

### Extract Moments

```bash
curl -X POST http://localhost:8788/api/moments/extract \
  -H "Content-Type: application/json" \
  -d '{
    "transcript_id": "transcript-2025-01-15-healthcare",
    "criteria": {
      "min_score": 5.0,
      "max_results": 10
    }
  }' | jq
```

You should see moments extracted! Example response:

```json
{
  "transcript_id": "transcript-2025-01-15-healthcare",
  "moments": [
    {
      "moment_id": "moment-...",
      "quote": "The premium increases will be offset by the enhanced subsidy calibration mechanism...",
      "speaker": "Minister Ong Boon Huat",
      "virality_score": 9.2,
      "why_viral": "Peak bureaucratic doublespeak...",
      "topic": "Healthcare",
      "emotional_tone": "defensive",
      "target_demographic": "working class"
    }
  ],
  "top_moment": {...},
  "statistics": {
    "total_segments_analyzed": 12,
    "moments_found": 4,
    "avg_virality_score": 8.55
  }
}
```

## 6. Deploy to Cloudflare (Optional)

Follow the [Deployment Guide](./DEPLOYMENT.md) for production deployment.

Quick version:

```bash
# Login to Cloudflare
wrangler login

# Create production bucket
wrangler r2 bucket create capless

# Set secrets
wrangler secret put OPENAI_API_KEY

# Deploy
npm run deploy
```

## Understanding the Output

### Viral Moment Structure

```typescript
{
  moment_id: string;           // Unique identifier
  quote: string;               // The viral quote (15-300 chars)
  speaker: string;             // Who said it
  virality_score: number;      // 0-10 (higher = more viral)
  why_viral: string;           // AI explanation
  topic: string;               // Healthcare, Housing, etc.
  emotional_tone: string;      // defensive, evasive, etc.
  target_demographic: string;  // Gen Z, working class, etc.
  context_before: string;      // Previous exchange
  context_after: string;       // Next exchange
}
```

### Virality Score Breakdown

- **9-10**: Extremely viral (bureaucratic jargon + contradiction + high emotion)
- **7-8**: Very shareable (strong jargon or contradiction)
- **5-6**: Moderately viral (quotable, affects everyday life)
- **3-4**: Somewhat interesting
- **0-2**: Not viral

## Common Issues

### "R2 bucket not found"

Create the preview bucket:
```bash
wrangler r2 bucket create capless-preview
```

### "OpenAI API key not set"

Make sure `.dev.vars` exists with your API key:
```bash
echo "OPENAI_API_KEY=sk-your-key" > .dev.vars
```

### Tests failing

Make sure you have the latest dependencies:
```bash
rm -rf node_modules package-lock.json
npm install
```

## Next Steps

1. **Customize Scoring**: Edit `src/scorer.ts` to adjust virality weights
2. **Tune Prompts**: Modify `src/extractor.ts` for better moment detection
3. **Add Features**: Implement trending moments, real-time extraction
4. **Integrate**: Connect with other Capless workers

## Example Workflow

```bash
# 1. Add a new transcript to R2
wrangler r2 object put capless-preview/transcripts/processed/my-transcript.json \
  --file=my-transcript.json

# 2. Extract moments
curl -X POST http://localhost:8788/api/moments/extract \
  -H "Content-Type: application/json" \
  -d '{"transcript_id": "my-transcript"}' | jq

# 3. Analyze specific moment
curl -X POST http://localhost:8788/api/moments/analyze \
  -H "Content-Type: application/json" \
  -d '{
    "moment_text": "Your quote here",
    "context": "Optional context"
  }' | jq

# 4. Search similar moments
curl "http://localhost:8788/api/moments/search?q=healthcare%20jargon&limit=5" | jq
```

## Development Tips

### Watch Mode for TDD

```bash
# Terminal 1: Run tests in watch mode
npm run test:watch

# Terminal 2: Make changes to code
# Tests automatically re-run
```

### Debug Logs

Add console.log in your code:

```typescript
console.log('Extracting moments:', transcript.transcript_id);
```

View logs:
```bash
# In dev mode, logs appear in terminal
npm run dev
```

### Type Checking

```bash
# Check types without building
npm run type-check
```

## Resources

- [Main README](./README.md) - Full documentation
- [Deployment Guide](./DEPLOYMENT.md) - Production setup
- [Sample Transcript](./examples/sample-transcript.json) - Example input
- [Sample Output](./examples/sample-output.json) - Example output

## Getting Help

If you run into issues:

1. Check the logs: Look for error messages
2. Verify your setup: API keys, buckets, etc.
3. Run tests: `npm test` to verify everything works
4. Check examples: Compare your data with samples

Happy moment extracting! 🎯
