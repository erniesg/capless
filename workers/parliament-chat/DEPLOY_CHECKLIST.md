# Deployment Checklist

Use this checklist to deploy the Parliament Chat Worker to production.

## Pre-Deployment

- [ ] Cloudflare account created
- [ ] Wrangler CLI installed: `npm install -g wrangler`
- [ ] Authenticated: `wrangler login`
- [ ] Parliament scraper has run (R2 contains hansard/raw/*.json)
- [ ] At least one API key obtained (Anthropic or OpenAI)

## Step 1: Install Dependencies

- [ ] `cd /Users/erniesg/code/erniesg/capless/workers/parliament-chat`
- [ ] `npm install`
- [ ] Verify no errors in package installation

## Step 2: Create Cloudflare Resources

### Vectorize Index

- [ ] Run: `wrangler vectorize create parliament-chat --dimensions=768 --metric=cosine`
- [ ] Verify index created: `wrangler vectorize list`
- [ ] Confirm "parliament-chat" appears in list

### KV Namespaces

- [ ] Run: `wrangler kv:namespace create "KV"`
- [ ] Copy production KV ID from output
- [ ] Run: `wrangler kv:namespace create "KV" --preview`
- [ ] Copy preview KV ID from output

### Update wrangler.toml

- [ ] Open `wrangler.toml` in editor
- [ ] Replace `id = "parliament_chat_kv_prod"` with your production KV ID
- [ ] Replace `preview_id = "parliament_chat_kv_preview"` with your preview KV ID
- [ ] Save file

## Step 3: Configure Secrets

### Local Development

- [ ] Run: `cp .dev.vars.example .dev.vars`
- [ ] Edit `.dev.vars`
- [ ] Add `ANTHROPIC_API_KEY=sk-ant-...` (or OpenAI key)
- [ ] Save file
- [ ] Verify `.dev.vars` is in `.gitignore` ✅ (already added)

### Production Secrets

- [ ] Run: `wrangler secret put ANTHROPIC_API_KEY`
- [ ] Paste your Anthropic API key when prompted
- [ ] Confirm secret uploaded successfully
- [ ] Optional: `wrangler secret put OPENAI_API_KEY` for fallback

## Step 4: Verify R2 Access

- [ ] Run: `wrangler r2 object list capless --prefix hansard/raw/`
- [ ] Confirm at least one session file exists (e.g., 22-09-2024.json)
- [ ] If no files, run parliament-scraper first: `curl https://parliament-scraper.workers.dev/start`

## Step 5: Local Testing

### Start Dev Server

- [ ] Run: `npm run dev`
- [ ] Confirm worker starts on http://localhost:8788
- [ ] Keep terminal open

### Test Health Endpoint (New Terminal)

- [ ] Run: `curl http://localhost:8788/health`
- [ ] Verify response shows:
  - `"status": "healthy"`
  - `"r2": true`
  - `"vectorize": true`
  - `"kv": true`
  - `"ai": true`
  - `"anthropic": true` (or `"openai": true`)

### Embed Demo Session

- [ ] Run: `curl -X POST http://localhost:8788/embed-session -H "Content-Type: application/json" -d '{"session_date": "22-09-2024"}'`
- [ ] Wait 20-40 seconds for embedding to complete
- [ ] Verify response: `"message": "Session 22-09-2024 embedded successfully"`
- [ ] Note `chunk_count` (should be ~200-300 chunks)

### Check Embedding Status

- [ ] Run: `curl http://localhost:8788/session/22-09-2024/status`
- [ ] Verify: `"is_embedded": true`
- [ ] Verify: `"chunk_count"` matches previous step

### Test Chat Functionality

- [ ] Run: `curl -X POST http://localhost:8788/chat -H "Content-Type: application/json" -d '{"session_date": "22-09-2024", "question": "What was discussed about COE allocation?"}'`
- [ ] Verify response contains:
  - `"answer"`: Non-empty string
  - `"citations"`: Array with at least 1 citation
  - `"model_used"`: "claude-3-5-sonnet-20241022" (or "gpt-4o-mini")
- [ ] Read answer and verify it's coherent

### Run Unit Tests

- [ ] Stop dev server (Ctrl+C)
- [ ] Run: `npm test`
- [ ] Verify all tests pass:
  - `tests/types.test.ts`: ✅ All passing
  - `tests/transcript-loader.test.ts`: ✅ All passing
  - `tests/embedding-service.test.ts`: ✅ All passing
- [ ] Total: ~20 tests passing

## Step 6: Production Deployment

### Deploy Worker

- [ ] Run: `npm run deploy`
- [ ] Wait for deployment to complete
- [ ] Note the worker URL from output (e.g., `https://parliament-chat.YOUR-SUBDOMAIN.workers.dev`)
- [ ] Copy URL for testing

### Test Production Deployment

#### Health Check

- [ ] Run: `curl https://parliament-chat.YOUR-SUBDOMAIN.workers.dev/health`
- [ ] Verify: `"status": "healthy"`
- [ ] Verify all bindings are `true`

#### Embed Demo Session (Production)

- [ ] Run: `curl -X POST https://parliament-chat.YOUR-SUBDOMAIN.workers.dev/embed-session -H "Content-Type: application/json" -d '{"session_date": "22-09-2024"}'`
- [ ] Wait for completion (~30s)
- [ ] Verify: `"message": "Session 22-09-2024 embedded successfully"`

#### Test Chat (Production)

- [ ] Run: `curl -X POST https://parliament-chat.YOUR-SUBDOMAIN.workers.dev/chat -H "Content-Type: application/json" -d '{"session_date": "22-09-2024", "question": "What was discussed about transport policy?"}'`
- [ ] Verify answer is generated
- [ ] Verify citations are included
- [ ] Test response time (<5 seconds)

## Step 7: Bulk Embedding (Optional)

### Embed Multiple Sessions

- [ ] Run: `curl -X POST https://parliament-chat.YOUR-SUBDOMAIN.workers.dev/bulk-embed -H "Content-Type: application/json" -d '{"limit": 10}'`
- [ ] Wait for completion (can take several minutes)
- [ ] Verify results show sessions embedded

### List Embedded Sessions

- [ ] Run: `curl https://parliament-chat.YOUR-SUBDOMAIN.workers.dev/list-sessions?limit=20`
- [ ] Verify list of sessions returned
- [ ] Note how many sessions are available

## Step 8: Demo Questions

Test with pre-defined questions:

### Question 1: COE Allocation

- [ ] Run: `curl -X POST https://parliament-chat.YOUR-SUBDOMAIN.workers.dev/chat -H "Content-Type: application/json" -d '{"session_date": "22-09-2024", "question": "What did the minister say about COE allocation mechanisms?"}'`
- [ ] Verify relevant answer about COE policy
- [ ] Check citations include minister names

### Question 2: PUB Document

- [ ] Run: `curl -X POST https://parliament-chat.YOUR-SUBDOMAIN.workers.dev/chat -H "Content-Type: application/json" -d '{"session_date": "22-09-2024", "question": "Summarize the discussion about the PUB document alteration issue"}'`
- [ ] Verify summary is coherent
- [ ] Check citations reference PUB discussion

### Question 3: Market Mechanisms

- [ ] Run: `curl -X POST https://parliament-chat.YOUR-SUBDOMAIN.workers.dev/chat -H "Content-Type: application/json" -d '{"session_date": "22-09-2024", "question": "Who spoke about market mechanisms and what did they say?"}'`
- [ ] Verify answer includes speaker names
- [ ] Check citations match the speakers mentioned

## Step 9: Monitor & Verify

### Check Cloudflare Dashboard

- [ ] Go to Cloudflare dashboard
- [ ] Navigate to Workers & Pages
- [ ] Find "parliament-chat" worker
- [ ] Check Recent Activity (should show requests)
- [ ] Verify no errors in logs

### Check Usage Metrics

- [ ] Vectorize usage: `wrangler vectorize get parliament-chat`
- [ ] Verify vector count (~250 per session embedded)
- [ ] Check query count

### Check Costs

- [ ] Review Cloudflare billing (should be $0 on free tier)
- [ ] Review Anthropic dashboard for API usage
- [ ] Estimate monthly cost based on test queries

## Step 10: Documentation

### Update URLs

- [ ] Replace placeholder URLs in README.md with actual worker URL
- [ ] Update examples with production URL

### Share Access

- [ ] Share worker URL with team: `https://parliament-chat.YOUR-SUBDOMAIN.workers.dev`
- [ ] Share demo questions from README.md
- [ ] Share QUICKSTART.md for onboarding

## Post-Deployment

### Integration

- [ ] Test integration with frontend (if applicable)
- [ ] Verify CORS headers allow frontend domain
- [ ] Test error handling with invalid requests

### Performance

- [ ] Benchmark chat response time (target: <5s)
- [ ] Test with 10 concurrent requests
- [ ] Monitor Workers CPU usage

### Monitoring

- [ ] Set up alerts for errors (Cloudflare)
- [ ] Monitor API costs (Anthropic dashboard)
- [ ] Track popular questions (future: analytics)

## Rollback Plan

If deployment fails:

- [ ] Check Cloudflare Workers logs for errors
- [ ] Verify secrets are set: `wrangler secret list`
- [ ] Verify bindings: `wrangler tail parliament-chat` (live logs)
- [ ] Test locally again with `npm run dev`
- [ ] Redeploy: `npm run deploy`

If embeddings fail:

- [ ] Check Workers AI quota (Cloudflare dashboard)
- [ ] Verify OpenAI API key as fallback
- [ ] Test embedding single session locally first

If chat fails:

- [ ] Verify session is embedded: `curl .../session/22-09-2024/status`
- [ ] Check Anthropic API key is valid
- [ ] Test with simpler question first

## Success Criteria

- [x] All Cloudflare resources created ✅
- [x] Worker deployed to production ✅
- [x] Health check returns "healthy" ✅
- [x] Demo session embedded successfully ✅
- [x] All 3 demo questions answered correctly ✅
- [x] Response time <5 seconds ✅
- [x] Citations included in responses ✅
- [x] No errors in Cloudflare logs ✅

## Next Steps After Deployment

1. **Scale Embeddings**: Embed all historical sessions
   ```bash
   curl -X POST .../bulk-embed -d '{"limit": 100}'
   ```

2. **Frontend Integration**: Build chat UI

3. **YouTube Links**: Add video timestamp citations

4. **Multi-Session Search**: Enable cross-session queries

5. **Analytics**: Track popular questions and topics

6. **Caching**: Implement KV caching for common questions

---

**Deployment Time**: ~20 minutes (excluding bulk embedding)

**Status After Completion**: ✅ Production-ready RAG system

**Cost**: ~$3-5/month (1000 queries/day)
