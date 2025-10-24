# Parliament Chat Worker - Setup Guide

Step-by-step guide to deploy the Parliament Chat Worker.

## Prerequisites Checklist

- [ ] Cloudflare account with Workers enabled
- [ ] Wrangler CLI installed (`npm install -g wrangler`)
- [ ] Authenticated with Cloudflare (`wrangler login`)
- [ ] At least one API key (Anthropic or OpenAI)
- [ ] Existing R2 bucket with Hansard data (from parliament-scraper)

## Step 1: Create Cloudflare Resources

### Create Vectorize Index

```bash
# Create index with 768 dimensions (for Cloudflare Workers AI)
wrangler vectorize create parliament-chat \
  --dimensions=768 \
  --metric=cosine

# Note: If using OpenAI embeddings exclusively, use --dimensions=1536
```

Expected output:
```
✅ Successfully created index 'parliament-chat'
```

### Create KV Namespaces

```bash
# Production namespace
wrangler kv:namespace create "KV"

# Preview namespace (for local dev)
wrangler kv:namespace create "KV" --preview
```

Expected output:
```
🌀 Creating namespace with title "parliament-chat-KV"
✨ Success!
Add the following to your wrangler.toml:
{ binding = "KV", id = "abc123..." }

🌀 Creating namespace with title "parliament-chat-KV-preview"
✨ Success!
Add the following to your wrangler.toml:
{ binding = "KV", preview_id = "def456..." }
```

### Update wrangler.toml

Replace the KV namespace IDs in `wrangler.toml`:

```toml
[[kv_namespaces]]
binding = "KV"
id = "abc123..."              # ← Replace with your production ID
preview_id = "def456..."      # ← Replace with your preview ID
```

## Step 2: Configure Environment Variables

### Local Development (.dev.vars)

```bash
# Copy example file
cp .dev.vars.example .dev.vars

# Edit .dev.vars and add your API keys
# Choose at least one:

# Option A: Anthropic Claude (recommended)
ANTHROPIC_API_KEY=sk-ant-api03-...

# Option B: OpenAI GPT-4 (alternative)
OPENAI_API_KEY=sk-...

# Note: You can set both for redundancy
```

### Production Secrets

Deploy secrets to Cloudflare:

```bash
# Anthropic (recommended)
wrangler secret put ANTHROPIC_API_KEY
# Paste your key when prompted

# OR OpenAI (alternative)
wrangler secret put OPENAI_API_KEY
# Paste your key when prompted
```

## Step 3: Install Dependencies

```bash
npm install
```

Expected packages:
- TypeScript
- Wrangler (Cloudflare Workers CLI)
- Vitest (testing framework)
- Zod (schema validation)
- AI SDK (Anthropic/OpenAI)

## Step 4: Verify R2 Bucket Access

Check that you have Hansard data in R2:

```bash
# List objects in R2 bucket
wrangler r2 object list capless --prefix hansard/raw/
```

Expected output:
```
hansard/raw/22-09-2024.json
hansard/raw/23-09-2024.json
...
```

If no files found, run the parliament-scraper worker first:
```bash
curl https://parliament-scraper.workers.dev/start
```

## Step 5: Local Development

### Start Development Server

```bash
npm run dev
```

Expected output:
```
⎔ Starting local server...
[wrangler:inf] Ready on http://localhost:8788
```

### Test Health Endpoint

```bash
curl http://localhost:8788/health
```

Expected response:
```json
{
  "status": "healthy",
  "service": "parliament-chat",
  "bindings": {
    "r2": true,
    "vectorize": true,
    "kv": true,
    "ai": true,
    "anthropic": true,
    "openai": false
  }
}
```

## Step 6: Embed Demo Session

### Embed 22-09-2024 Session

```bash
curl -X POST http://localhost:8788/embed-session \
  -H "Content-Type: application/json" \
  -d '{"session_date": "22-09-2024"}'
```

Expected response (takes 20-40 seconds):
```json
{
  "message": "Session 22-09-2024 embedded successfully",
  "session_date": "22-09-2024",
  "chunk_count": 247,
  "segment_count": 89
}
```

### Verify Embedding Status

```bash
curl http://localhost:8788/session/22-09-2024/status
```

Expected response:
```json
{
  "session_date": "22-09-2024",
  "is_embedded": true,
  "chunk_count": 247,
  "embedded_at": "2025-10-24T10:30:00.000Z"
}
```

## Step 7: Test Chat Functionality

### Demo Question 1: COE Policy

```bash
curl -X POST http://localhost:8788/chat \
  -H "Content-Type: application/json" \
  -d '{
    "session_date": "22-09-2024",
    "question": "What did the minister say about COE allocation?"
  }'
```

Expected response structure:
```json
{
  "answer": "The minister discussed...",
  "citations": [
    {
      "text": "Minister Chee Hong Tat: ...",
      "speaker": "Minister Chee Hong Tat",
      "confidence": 0.89,
      "chunk_index": 12
    }
  ],
  "session_date": "22-09-2024",
  "model_used": "claude-3-5-sonnet-20241022"
}
```

### Demo Question 2: PUB Document

```bash
curl -X POST http://localhost:8788/chat \
  -H "Content-Type: application/json" \
  -d '{
    "session_date": "22-09-2024",
    "question": "Summarize the PUB document alteration discussion"
  }'
```

### Demo Question 3: Market Mechanisms

```bash
curl -X POST http://localhost:8788/chat \
  -H "Content-Type: application/json" \
  -d '{
    "session_date": "22-09-2024",
    "question": "Who spoke about market mechanisms?"
  }'
```

## Step 8: Run Tests

```bash
npm test
```

Expected output:
```
✓ tests/types.test.ts (10 tests)
✓ tests/transcript-loader.test.ts (8 tests)
✓ tests/embedding-service.test.ts (2 tests)

Test Files  3 passed (3)
Tests  20 passed (20)
```

## Step 9: Deploy to Production

### Deploy Worker

```bash
npm run deploy
```

Expected output:
```
Total Upload: 150.00 KiB
Uploaded parliament-chat (1.23 sec)
Published parliament-chat (0.45 sec)
  https://parliament-chat.your-subdomain.workers.dev
```

### Test Production Deployment

```bash
# Health check
curl https://parliament-chat.your-subdomain.workers.dev/health

# Embed demo session
curl -X POST https://parliament-chat.your-subdomain.workers.dev/embed-session \
  -H "Content-Type: application/json" \
  -d '{"session_date": "22-09-2024"}'

# Test chat
curl -X POST https://parliament-chat.your-subdomain.workers.dev/chat \
  -H "Content-Type: application/json" \
  -d '{
    "session_date": "22-09-2024",
    "question": "What was discussed about transport?"
  }'
```

## Step 10: Bulk Embed Historical Sessions

### Embed Multiple Sessions

```bash
# Embed last 10 sessions
curl -X POST https://parliament-chat.your-subdomain.workers.dev/bulk-embed \
  -H "Content-Type: application/json" \
  -d '{"limit": 10}'
```

### Embed Date Range

```bash
# Embed September 2024 sessions
curl -X POST https://parliament-chat.your-subdomain.workers.dev/bulk-embed \
  -H "Content-Type: application/json" \
  -d '{
    "start_date": "01-09-2024",
    "end_date": "30-09-2024",
    "limit": 50
  }'
```

## Troubleshooting

### Error: "No embedding provider available"

**Cause**: Missing API keys

**Solution**:
1. Check .dev.vars has ANTHROPIC_API_KEY or OPENAI_API_KEY
2. For production, run: `wrangler secret put ANTHROPIC_API_KEY`

### Error: "Session not found in R2"

**Cause**: Hansard data missing

**Solution**:
1. Run parliament-scraper: `curl https://parliament-scraper.workers.dev/start`
2. Wait for scraping to complete
3. Verify: `wrangler r2 object list capless --prefix hansard/raw/`

### Error: "Vectorize index not found"

**Cause**: Index not created or wrong name

**Solution**:
1. Check wrangler.toml has correct index name
2. Verify index exists: `wrangler vectorize list`
3. Create if missing: `wrangler vectorize create parliament-chat --dimensions=768`

### Error: Embedding takes too long / times out

**Cause**: Workers AI quota exceeded or large session

**Solution**:
1. Check Workers AI quota in Cloudflare dashboard
2. Add OPENAI_API_KEY as fallback
3. Process in smaller batches (reduce limit parameter)

### Tests Failing

**Cause**: Missing dependencies or configuration

**Solution**:
1. Run `npm install` again
2. Check Node.js version (requires 18+)
3. Verify wrangler.toml configuration

## Next Steps

1. **Integrate with Frontend**: Build UI for chat interface
2. **Add YouTube Links**: Connect citations to video timestamps
3. **Multi-Session Search**: Enable cross-session queries
4. **Monitor Usage**: Track API costs and quotas
5. **Scale Embeddings**: Embed all 1,725 historical sessions

## Resource Limits

### Free Tier Limits

- **Workers**: 100,000 requests/day
- **Vectorize**: 5M vectors, 30M queries/month
- **Workers AI**: 10,000 requests/day
- **R2**: 10GB storage, Class A: 1M/month, Class B: 10M/month
- **KV**: 100,000 reads/day, 1,000 writes/day

### Estimated Usage (1000 chats/day)

- **Workers**: ~3,000 requests/day (chat + status checks)
- **Vectorize**: ~30,000 queries/month
- **Workers AI**: ~1,000 embedding requests/day (if re-embedding)
- **Claude API**: ~1,000 requests/day (~$3-5/month)

**Total Cost**: ~$3-5/month (Claude API only, all Cloudflare services on free tier)

## Support

- **Cloudflare Docs**: https://developers.cloudflare.com/
- **Vectorize Docs**: https://developers.cloudflare.com/vectorize/
- **Workers AI Docs**: https://developers.cloudflare.com/workers-ai/
- **Discord**: https://discord.gg/cloudflaredev
