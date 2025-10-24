# Video Generator Worker - Deployment Guide

## Pre-Deployment Checklist

### 1. Create KV Namespace

```bash
# Navigate to worker directory
cd /Users/erniesg/code/erniesg/capless/workers/video-generator

# Create production KV namespace
wrangler kv:namespace create VIDEO_JOBS

# Output will look like:
# [[kv_namespaces]]
# binding = "VIDEO_JOBS"
# id = "abc123def456"

# Create preview KV namespace for development
wrangler kv:namespace create VIDEO_JOBS --preview

# Output will look like:
# [[kv_namespaces]]
# binding = "VIDEO_JOBS"
# preview_id = "xyz789uvw012"
```

### 2. Update wrangler.toml

Uncomment and update the KV namespace configuration in `wrangler.toml`:

```toml
[[kv_namespaces]]
binding = "VIDEO_JOBS"
id = "your-production-kv-id-here"
preview_id = "your-preview-kv-id-here"
```

### 3. Set API Keys

```bash
# Set Anthropic API key (for Claude script generation)
wrangler secret put ANTHROPIC_API_KEY
# When prompted, paste your Anthropic API key

# Set OpenAI API key (for Sora video generation)
wrangler secret put OPENAI_API_KEY
# When prompted, paste your OpenAI API key
```

### 4. Verify R2 Bucket

Ensure the R2 bucket exists and contains moment data:

```bash
# List R2 buckets
wrangler r2 bucket list

# Should show: capless-preview

# List contents (check for moments/)
wrangler r2 object list capless-preview --prefix=moments/
```

### 5. Test Locally (Optional)

```bash
# Start local development server
npm run dev

# In another terminal, test the health endpoint
curl http://localhost:8787/health

# Expected response:
# {"status":"ok","service":"video-generator"}
```

## Deployment Steps

### 1. Install Dependencies

```bash
npm install
```

### 2. Build Check

```bash
# Verify TypeScript compiles
npx tsc --noEmit

# Should output nothing (success)
```

### 3. Deploy to Cloudflare

```bash
# Deploy to production
npm run deploy

# Or use wrangler directly
wrangler deploy
```

Expected output:
```
Uploaded video-generator (X.XX sec)
Published capless-video-generator (X.XX sec)
  https://capless-video-generator.your-subdomain.workers.dev
```

### 4. Verify Deployment

```bash
# Get your worker URL from the deploy output, then:
curl https://capless-video-generator.your-subdomain.workers.dev/health

# Expected response:
# {"status":"ok","service":"video-generator"}
```

## Testing with Real Moment (22-09-2025)

### 1. Verify Moment Data Exists

```bash
# Check if moment file exists in R2
wrangler r2 object get capless-preview moments/parliament-22-09-2025.json --file=test-moment.json

# View the file
cat test-moment.json | jq '.moments[0]'
```

### 2. Generate Video

```bash
# Replace with your actual worker URL
WORKER_URL="https://capless-video-generator.your-subdomain.workers.dev"

# Generate video with Gen Z persona
curl -X POST "${WORKER_URL}/api/video/generate" \
  -H "Content-Type: application/json" \
  -d '{
    "moment_id": "parliament-22-09-2025-moment-1",
    "persona": "gen_z"
  }'

# Expected response (202 Accepted):
# {
#   "job_id": "parliament-22-09-2025-moment-1-gen_z-1729761234567",
#   "status": "processing",
#   "estimated_time_seconds": 180,
#   "poll_url": "/api/video/status/parliament-22-09-2025-moment-1-gen_z-1729761234567"
# }
```

### 3. Poll for Status

```bash
# Copy the job_id from the response above
JOB_ID="parliament-22-09-2025-moment-1-gen_z-1729761234567"

# Check status (may need to wait 2-3 minutes)
curl "${WORKER_URL}/api/video/status/${JOB_ID}" | jq

# Status will progress through:
# 1. "processing" with progress: "Generating script..."
# 2. "processing" with progress: "Submitting to Sora API..."
# 3. "processing" with progress: "Generating video (this may take 2-3 minutes)..."
# 4. "completed" with video_url and metadata
```

### 4. Test All Personas

```bash
# Test each persona
for persona in gen_z kopitiam_uncle auntie attenborough; do
  echo "Testing persona: $persona"
  curl -X POST "${WORKER_URL}/api/video/generate" \
    -H "Content-Type: application/json" \
    -d "{\"moment_id\": \"parliament-22-09-2025-moment-1\", \"persona\": \"${persona}\"}" \
    | jq
  echo "---"
done

# Test AI judge
curl -X POST "${WORKER_URL}/api/video/generate" \
  -H "Content-Type: application/json" \
  -d '{
    "moment_id": "parliament-22-09-2025-moment-1",
    "persona": "ai_decide"
  }' | jq
```

## Monitoring & Debugging

### View Worker Logs

```bash
# Stream live logs
wrangler tail

# Filter for errors
wrangler tail --status error
```

### Check KV Storage

```bash
# List all job IDs
wrangler kv:key list --binding=VIDEO_JOBS

# Get specific job data
wrangler kv:key get "parliament-22-09-2025-moment-1-gen_z-1729761234567" --binding=VIDEO_JOBS | jq
```

### Debug Failed Jobs

If a job status shows `failed` or `error`:

1. Check worker logs: `wrangler tail`
2. Inspect job data: `wrangler kv:key get <job_id> --binding=VIDEO_JOBS`
3. Verify API keys are set: Check Cloudflare dashboard > Workers > Settings > Variables
4. Check API quotas: Anthropic and OpenAI dashboards

## Common Issues

### Issue: "Moment not found"

**Cause**: Moment file doesn't exist in R2 or moment_id format is wrong

**Solution**:
```bash
# Check R2 contents
wrangler r2 object list capless-preview --prefix=moments/

# Verify moment_id format: parliament-DD-MM-YYYY-moment-N
```

### Issue: Script generation fails

**Cause**: ANTHROPIC_API_KEY not set or invalid

**Solution**:
```bash
# Verify secret is set
wrangler secret list

# Re-set if needed
wrangler secret put ANTHROPIC_API_KEY
```

### Issue: Video generation fails

**Cause**: OPENAI_API_KEY not set, Sora API not available, or quota exceeded

**Solution**:
1. Verify OpenAI API key is valid
2. Check Sora API access (currently in limited beta)
3. Review OpenAI usage limits

**Note**: Currently using placeholder video URLs since Sora API is in limited beta. Update `src/index.ts` when Sora access is available.

### Issue: KV write failures

**Cause**: KV namespace not created or binding incorrect

**Solution**:
```bash
# Verify KV namespace exists
wrangler kv:namespace list

# Check wrangler.toml has correct binding and IDs
cat wrangler.toml
```

## Post-Deployment

### 1. Integration with Frontend

Update your frontend to call the video generator:

```javascript
// Generate video
const response = await fetch('https://capless-video-generator.your-subdomain.workers.dev/api/video/generate', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    moment_id: 'parliament-22-09-2025-moment-1',
    persona: 'gen_z'
  })
});

const { job_id, poll_url } = await response.json();

// Poll for completion
const pollStatus = async () => {
  const statusRes = await fetch(`https://capless-video-generator.your-subdomain.workers.dev${poll_url}`);
  const status = await statusRes.json();

  if (status.status === 'completed') {
    console.log('Video ready!', status.video_url);
  } else if (status.status === 'processing') {
    setTimeout(pollStatus, 5000); // Poll every 5 seconds
  }
};

pollStatus();
```

### 2. Set Up Custom Domain (Optional)

```bash
# Add custom route in Cloudflare dashboard
# Or via wrangler.toml:

[routes]
pattern = "api.capless.sg/video/*"
zone_name = "capless.sg"
```

### 3. Monitor Usage

- Track API costs (Anthropic Claude + OpenAI Sora)
- Monitor Worker invocations in Cloudflare dashboard
- Set up alerts for errors or high usage

## Rollback

If you need to rollback to a previous version:

```bash
# List deployments
wrangler deployments list

# Rollback to specific deployment
wrangler rollback --deployment-id <deployment-id>
```

## Next Steps

1. ✅ Deploy worker
2. ✅ Test with real parliament moment from 22-09-2025
3. 🔄 Integrate with frontend
4. 🔄 Set up monitoring and alerts
5. 🔄 Enable Sora API when access granted
6. 🔄 Implement caching for repeated generations
7. 🔄 Add analytics and usage tracking

## Support

For issues:
1. Check logs: `wrangler tail`
2. Review this guide
3. Check Cloudflare Workers documentation
4. Open issue in capless repository
