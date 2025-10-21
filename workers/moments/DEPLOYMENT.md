# Deployment Guide - Capless Moments Worker

Step-by-step guide to deploying the Moments Worker to Cloudflare.

## Prerequisites

- Node.js 18+ installed
- Cloudflare account with Workers plan
- Wrangler CLI installed (`npm install -g wrangler`)
- OpenAI API key

## Step 1: Initial Setup

```bash
# Navigate to worker directory
cd /Users/erniesg/code/erniesg/capless/workers/moments

# Install dependencies
npm install

# Login to Cloudflare
wrangler login
```

## Step 2: Create Infrastructure

### Create R2 Bucket

```bash
# Create production bucket
wrangler r2 bucket create capless

# Create preview bucket (for testing)
wrangler r2 bucket create capless-preview
```

### Create Vectorize Index

```bash
# Create vector index for semantic search
wrangler vectorize create capless-moments \
  --dimensions=1536 \
  --metric=cosine \
  --description="Viral moment embeddings for Capless"
```

### Setup Redis (Optional but Recommended)

For caching, create an Upstash Redis instance:

1. Go to https://console.upstash.com
2. Create a new Redis database
3. Select region: Singapore (closest to Cloudflare)
4. Copy the REST URL and token

## Step 3: Configure Secrets

```bash
# Required: OpenAI API key
wrangler secret put OPENAI_API_KEY
# Paste your OpenAI API key when prompted

# Optional: Redis credentials
wrangler secret put UPSTASH_REDIS_REST_URL
# Paste Redis URL (e.g., https://xxx.upstash.io)

wrangler secret put UPSTASH_REDIS_REST_TOKEN
# Paste Redis token
```

## Step 4: Verify Configuration

Check `wrangler.toml`:

```toml
name = "capless-moments"
main = "src/index.ts"
compatibility_date = "2025-01-20"
node_compat = true

# Verify bindings
[[r2_buckets]]
binding = "R2"
bucket_name = "capless"
preview_bucket_name = "capless-preview"

[[vectorize]]
binding = "VECTORIZE"
index_name = "capless-moments"

# Verify environment variables
[vars]
ENVIRONMENT = "production"
OPENAI_MODEL = "gpt-4o"
OPENAI_EMBEDDING_MODEL = "text-embedding-3-small"
MAX_MOMENTS_PER_TRANSCRIPT = 20
MIN_VIRALITY_SCORE = 5.0
```

## Step 5: Upload Sample Data

Upload the sample transcript to R2 for testing:

```bash
# Upload sample transcript
wrangler r2 object put capless/transcripts/processed/transcript-2025-01-15-healthcare.json \
  --file=./examples/sample-transcript.json \
  --content-type=application/json
```

## Step 6: Run Tests

Before deploying, verify everything works:

```bash
# Run unit tests
npm test

# Type check
npm run type-check

# Lint
npm run lint
```

## Step 7: Deploy to Production

```bash
# Deploy the worker
npm run deploy

# Or with wrangler directly
wrangler deploy
```

Expected output:
```
✔ Built successfully!
✔ Successfully published your script to
  https://capless-moments.<your-subdomain>.workers.dev
```

## Step 8: Verify Deployment

### Test Health Endpoint

```bash
curl https://capless-moments.<your-subdomain>.workers.dev/health
```

Expected response:
```json
{
  "status": "healthy",
  "service": "capless-moments",
  "timestamp": "2025-01-21T10:30:00Z"
}
```

### Test Moment Extraction

```bash
curl -X POST https://capless-moments.<your-subdomain>.workers.dev/api/moments/extract \
  -H "Content-Type: application/json" \
  -d '{
    "transcript_id": "transcript-2025-01-15-healthcare",
    "criteria": {
      "min_score": 5.0,
      "max_results": 10
    }
  }'
```

## Step 9: Custom Domain (Optional)

### Add Custom Domain

```bash
# Add route to your domain
wrangler route add "moments.capless.ai/*" --zone-id=<your-zone-id>
```

Or via Cloudflare Dashboard:
1. Go to Workers & Pages
2. Select `capless-moments`
3. Settings → Triggers → Custom Domains
4. Add `moments.capless.ai`

## Monitoring & Observability

### View Logs

```bash
# Tail production logs
wrangler tail

# Filter errors only
wrangler tail --status error
```

### Analytics

Check Cloudflare Dashboard for:
- Request count
- Error rate
- P50/P95/P99 latency
- CPU time usage

### Set Up Alerts

Configure alerts in Cloudflare Dashboard:
1. Go to Notifications
2. Create alert for:
   - High error rate (>5%)
   - High latency (>2000ms p95)
   - High request volume

## Cost Estimation

**Free Tier:**
- 100,000 requests/day
- 10ms CPU time per request

**Expected Usage:**
- 100 transcripts/day
- ~2-3 seconds per extraction
- Well within free tier limits

**OpenAI Costs:**
- GPT-4o: ~$0.02 per transcript
- Embeddings: ~$0.0001 per moment
- **Total: ~$2-3/day for 100 transcripts**

## Scaling Considerations

### If you exceed 100 transcripts/day:

1. **Enable Caching**:
   - Set up Redis (already configured)
   - Increase cache TTL for popular transcripts

2. **Batch Processing**:
   - Use `/api/moments/batch` endpoint
   - Process during off-peak hours

3. **Optimize Prompts**:
   - Reduce token usage
   - Use GPT-3.5-turbo for simpler transcripts

## Troubleshooting

### Error: "R2 bucket not found"

```bash
# Verify bucket exists
wrangler r2 bucket list

# If missing, create it
wrangler r2 bucket create capless
```

### Error: "Vectorize index not found"

```bash
# Verify index exists
wrangler vectorize list

# If missing, create it
wrangler vectorize create capless-moments --dimensions=1536 --metric=cosine
```

### Error: "OpenAI API key not set"

```bash
# Set the secret
wrangler secret put OPENAI_API_KEY
```

### High Latency

Check:
1. OpenAI API response time (usually 2-4 seconds)
2. R2 read latency (should be <100ms)
3. Vectorize upsert time (should be <500ms)

If slow:
- Enable Redis caching
- Reduce embedding dimensions
- Use GPT-3.5-turbo as fallback

### Rate Limits

If you hit OpenAI rate limits:
1. Request limit increase from OpenAI
2. Implement exponential backoff
3. Use batch processing with delays

## Rolling Back

If deployment has issues:

```bash
# List deployments
wrangler deployments list

# Rollback to previous version
wrangler rollback --message "Rolling back due to issue"
```

## Production Checklist

Before going live:

- [ ] All secrets configured
- [ ] R2 bucket created and accessible
- [ ] Vectorize index created
- [ ] Sample data uploaded for testing
- [ ] All tests passing
- [ ] Health endpoint responds
- [ ] Extraction endpoint works
- [ ] Caching enabled (Redis)
- [ ] Monitoring/alerts configured
- [ ] Custom domain set up (optional)
- [ ] Documentation reviewed
- [ ] Team notified of deployment

## Environment Variables

Update `wrangler.toml` for different environments:

```toml
# Production
[env.production]
vars = { ENVIRONMENT = "production", OPENAI_MODEL = "gpt-4o" }

# Staging
[env.staging]
vars = { ENVIRONMENT = "staging", OPENAI_MODEL = "gpt-3.5-turbo" }
```

Deploy to specific environment:
```bash
wrangler deploy --env staging
```

## Next Steps

After successful deployment:

1. **Integrate with Ingestion Worker**: Update ingestion worker to call moments API
2. **Set Up Webhooks**: For real-time moment extraction
3. **Create Dashboard**: Monitor extraction metrics
4. **Tune Scoring**: Adjust virality algorithm based on real data
5. **A/B Test Prompts**: Experiment with different AI prompts

## Support

For issues:
1. Check logs: `wrangler tail`
2. Review errors in Cloudflare Dashboard
3. Test locally: `npm run dev`
4. See main docs: `README.md`

## Additional Resources

- [Cloudflare Workers Docs](https://developers.cloudflare.com/workers/)
- [R2 Documentation](https://developers.cloudflare.com/r2/)
- [Vectorize Documentation](https://developers.cloudflare.com/vectorize/)
- [OpenAI API Reference](https://platform.openai.com/docs/api-reference)
