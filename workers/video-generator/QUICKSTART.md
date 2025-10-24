# Video Generator - Quick Start

5-minute deployment guide.

## Prerequisites

- ✅ Cloudflare account with Workers enabled
- ✅ Wrangler CLI installed (`npm install -g wrangler`)
- ✅ Anthropic API key
- ✅ OpenAI API key (for Sora access)
- ✅ R2 bucket `capless-preview` with moment data

## Deployment Steps

### 1. Navigate to Directory
```bash
cd /Users/erniesg/code/erniesg/capless/workers/video-generator
```

### 2. Install Dependencies
```bash
npm install
```

### 3. Create KV Namespace
```bash
# Production
wrangler kv:namespace create VIDEO_JOBS

# Preview (for development)
wrangler kv:namespace create VIDEO_JOBS --preview
```

**Copy the output IDs**, then edit `wrangler.toml`:

```toml
[[kv_namespaces]]
binding = "VIDEO_JOBS"
id = "paste-production-id-here"
preview_id = "paste-preview-id-here"
```

### 4. Set API Keys
```bash
wrangler secret put ANTHROPIC_API_KEY
# Paste your Anthropic API key when prompted

wrangler secret put OPENAI_API_KEY
# Paste your OpenAI API key when prompted
```

### 5. Deploy
```bash
npm run deploy
```

**Output:**
```
✨ Built successfully
✨ Published capless-video-generator (0.XX sec)
   https://capless-video-generator.your-subdomain.workers.dev
```

### 6. Test
```bash
# Copy your worker URL from step 5
WORKER_URL="https://capless-video-generator.your-subdomain.workers.dev"

# Health check
curl $WORKER_URL/health

# Generate video
curl -X POST "$WORKER_URL/api/video/generate" \
  -H "Content-Type: application/json" \
  -d '{
    "moment_id": "parliament-22-09-2025-moment-1",
    "persona": "gen_z"
  }'

# Get the job_id from response, then check status
curl "$WORKER_URL/api/video/status/YOUR-JOB-ID"
```

## Verification Checklist

- [ ] `npm install` completed without errors
- [ ] KV namespace created and IDs added to `wrangler.toml`
- [ ] API keys set with `wrangler secret put`
- [ ] R2 bucket exists: `wrangler r2 bucket list` shows `capless-preview`
- [ ] Moment file exists: `wrangler r2 object list capless-preview --prefix=moments/`
- [ ] Worker deployed successfully
- [ ] Health check returns `{"status":"ok"}`
- [ ] Video generation request returns job_id

## Common Issues

### "KV namespace not found"
```bash
# Make sure you uncommented the [[kv_namespaces]] block in wrangler.toml
# and added the IDs from step 3
```

### "Moment not found"
```bash
# Verify the moment file exists in R2
wrangler r2 object get capless-preview moments/parliament-22-09-2025.json --file=test.json
cat test.json | jq '.moments[0]'
```

### "Script generation failed"
```bash
# Verify Anthropic API key is set
wrangler secret list

# If not listed, re-run:
wrangler secret put ANTHROPIC_API_KEY
```

## Next Steps

1. ✅ Worker is deployed
2. **Test all personas**: See API.md for examples
3. **Integrate with frontend**: See DEPLOYMENT.md
4. **Monitor logs**: `wrangler tail`
5. **Set up custom domain**: Cloudflare dashboard → Workers → Routes

## File Reference

- **API.md** - Complete API reference with examples
- **README.md** - Full documentation and architecture
- **DEPLOYMENT.md** - Detailed deployment guide
- **SUMMARY.md** - Implementation overview

## Support

```bash
# View logs
wrangler tail

# Debug job
wrangler kv:key get "YOUR-JOB-ID" --binding=VIDEO_JOBS | jq

# List all jobs
wrangler kv:key list --binding=VIDEO_JOBS
```

---

**Total Time**: ~5 minutes
**Status**: Ready for production 🚀
