# Capless Demo - Build Guide

## 🎯 What We're Building

A working demo where users can:
1. **Select a parliamentary session** (22-09-2024)
2. **Generate TikTok reaction videos** with 4 personas OR let AI decide
3. **Chat with the session** using RAG to find viral moments
4. **View results** side-by-side: YouTube link + timestamp | Generated reaction video

## 📚 Documentation Index

### Start Here
- **[MVP_DEPLOYMENT.md](./MVP_DEPLOYMENT.md)** - Overall MVP plan, architecture, and timeline
- **[DEPENDENCIES_MAP.md](./DEPENDENCIES_MAP.md)** - Integration points and data flow

### Component Checklists
- **[VIDEO_GENERATION_CHECKLIST.md](./VIDEO_GENERATION_CHECKLIST.md)** - Build video generation worker
- **[RAG_CHAT_CHECKLIST.md](./RAG_CHAT_CHECKLIST.md)** - Build RAG/chat worker
- **[FRONTEND_CHECKLIST.md](./FRONTEND_CHECKLIST.md)** - Build frontend UI worker

## 🚀 Quick Start (2-Hour MVP)

### Prerequisites

**Data** (already exists):
- ✅ 50 moments extracted from 22-09-2024 session
- ✅ Vectorize index with embeddings
- ✅ Voice DNA persona prompts

**API Keys** (need to set):
```bash
# OpenAI (for Sora + embeddings)
export OPENAI_API_KEY="sk-..."

# Anthropic (for Claude chat)
export ANTHROPIC_API_KEY="sk-ant-..."

# Redis (optional, can use KV)
export UPSTASH_REDIS_REST_URL="https://..."
export UPSTASH_REDIS_REST_TOKEN="..."
```

---

### Step 1: Video Generation Worker (60 min)

```bash
# 1. Create worker
cd /Users/erniesg/code/erniesg/capless/workers
mkdir video-generator && cd video-generator
npm init -y

# 2. Install dependencies
npm install hono zod @cloudflare/workers-types

# 3. Copy Voice DNA system
cp ../asset-generator/src/personas/voice-dna.ts src/

# 4. Follow checklist
# See: VIDEO_GENERATION_CHECKLIST.md

# 5. Test locally
npx wrangler dev

# 6. Test endpoint
curl -X POST http://localhost:8787/api/video/generate \
  -H "Content-Type: application/json" \
  -d '{"moment_id": "moment-1761234936171-69xogjwb1", "persona": "gen_z"}'

# 7. Deploy
npx wrangler deploy
```

**Key Points**:
- Start with 1-2 personas (Gen Z + Uncle)
- Mock Sora responses for quick testing
- Focus on script generation quality

---

### Step 2: RAG/Chat Worker (60 min)

**Can be done in parallel with Step 1!**

```bash
# 1. Create worker
cd /Users/erniesg/code/erniesg/capless/workers
mkdir rag-chat && cd rag-chat
npm init -y

# 2. Install dependencies
npm install hono zod ai @ai-sdk/anthropic

# 3. Follow checklist
# See: RAG_CHAT_CHECKLIST.md

# 4. Test locally
npx wrangler dev

# 5. Test endpoint
curl -X POST http://localhost:8787/api/chat \
  -H "Content-Type: application/json" \
  -d '{"session_id": "parliament-22-09-2024", "message": "What is the most viral moment?"}'

# 6. Deploy
npx wrangler deploy
```

**Key Points**:
- Use existing Vectorize index (already has embeddings)
- Focus on toolcalls structure
- Keep conversation simple (stateless for MVP)

---

### Step 3: Frontend Worker (45 min)

**Wait for Steps 1 & 2 to deploy (or use mocks)**

```bash
# 1. Create worker with static assets
npm create cloudflare@latest capless-frontend
# Select: "Website or web app" → "Vanilla"

cd capless-frontend

# 2. Follow checklist
# See: FRONTEND_CHECKLIST.md

# 3. Update worker URLs in code
# VIDEO_WORKER_URL = "https://capless-video-generator.erniesg.workers.dev"
# CHAT_WORKER_URL = "https://capless-rag-chat.erniesg.workers.dev"

# 4. Test locally
npx wrangler dev

# 5. Deploy
npx wrangler deploy
```

**Key Points**:
- Use Workers Static Assets (NOT Pages)
- Hardcode session to 22-09-2024
- Simple polling for video status

---

### Step 4: Integration Testing (15 min)

```bash
# 1. Test video generation flow
curl -X POST https://capless-video-generator.erniesg.workers.dev/api/video/generate \
  -H "Content-Type: application/json" \
  -d '{"moment_id": "moment-1761234936171-69xogjwb1", "persona": "gen_z"}'
# Expected: { "job_id": "...", "status": "processing" }

# 2. Test chat flow
curl -X POST https://capless-rag-chat.erniesg.workers.dev/api/chat \
  -H "Content-Type: application/json" \
  -d '{"session_id": "parliament-22-09-2024", "message": "What is the most viral moment?"}'
# Expected: { "message": "...", "toolcalls": [...] }

# 3. Test frontend
open https://capless.erniesg.workers.dev
# Manually test:
# - Select moment → persona → generate
# - Chat → ask question → get results
```

---

## 🎯 Success Criteria

### Minimum Viable Demo

**User Flow 1: Generate TikTok**
- [ ] User selects a moment from list
- [ ] User selects persona (or "AI Decide")
- [ ] User clicks "Generate Video"
- [ ] System polls status every 5 seconds
- [ ] Results display: YouTube link + generated video

**User Flow 2: Chat with Session**
- [ ] User types "What's the most viral moment?"
- [ ] System shows top 3 moments as cards
- [ ] User clicks "Generate Gen Z reaction"
- [ ] Video generation starts
- [ ] Results display in chat interface

### What Can Break (Acceptable for MVP)

- ⚠️ Sora API timeout → Mock response is fine
- ⚠️ Only 2 personas working → Start with Gen Z + Uncle
- ⚠️ YouTube link 404 → Just show timestamp
- ⚠️ No video embedding → Download link is fine
- ⚠️ Polling is slow → 10s intervals acceptable

---

## 🧪 Testing Strategy

### Unit Tests (Optional for MVP)

Focus on critical logic:
- Script generation validation (Voice DNA markers)
- AI judge selection logic
- Vectorize query results parsing

### Integration Tests (Required)

**Video Generation**:
```bash
# Test script generation
curl -X POST .../api/video/generate -d '{"moment_id": "...", "persona": "gen_z"}'

# Expected:
# - Returns job_id immediately (< 2s)
# - Polling returns "processing"
# - After ~2min, returns "completed" with video_url
```

**RAG/Chat**:
```bash
# Test search
curl -X POST .../api/chat -d '{"message": "COE minister"}'

# Expected:
# - Returns moments about Transport Minister
# - Includes toolcall results
# - Suggests generating video
```

### End-to-End (Required)

**Manual testing in browser**:
1. Visit frontend URL
2. Click "Generate TikTok" mode
3. Select top viral moment
4. Select "Let AI Decide"
5. Wait for result
6. Verify side-by-side display

---

## 🚨 Common Issues & Solutions

### Issue: "Vectorize index not found"
**Solution**: Verify moments worker has created index
```bash
npx wrangler vectorize list
# Should show: MOMENTS_INDEX
```

### Issue: "No moments found for session"
**Solution**: Check R2 bucket
```bash
npx wrangler r2 object list --bucket capless-preview --prefix moments/
# Should show: moments/parliament-22-09-2024.json
```

### Issue: "Sora API timeout"
**Solution**: Use mock response for MVP
```javascript
// Instead of calling Sora API:
return {
  video_url: "https://example.com/mock-video.mp4",
  status: "completed"
};
```

### Issue: "CORS error from frontend"
**Solution**: Add CORS headers to workers
```javascript
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};
```

### Issue: "Voice DNA validation failing"
**Solution**: Check marker detection
```javascript
const markers = voiceDNA.validation_markers.filter(m =>
  script.toLowerCase().includes(m.toLowerCase())
);
console.log('Markers found:', markers);
// Should find at least 2-3 markers for valid script
```

---

## 📊 Monitoring & Debugging

### Cloudflare Dashboard

**Workers Logs**:
```bash
# Real-time logs
npx wrangler tail

# Specific worker
npx wrangler tail --name capless-video-generator

# Filter for errors
npx wrangler tail | grep ERROR
```

**R2 Bucket**:
```bash
# List objects
npx wrangler r2 object list --bucket capless-preview

# Download moment data
npx wrangler r2 object get capless-preview/moments/parliament-22-09-2024.json > moments.json
```

**KV Namespace**:
```bash
# List keys
npx wrangler kv:key list --namespace-id VIDEO_JOBS

# Get job status
npx wrangler kv:key get "job:123" --namespace-id VIDEO_JOBS
```

### Debugging Tips

**Video Generation Issues**:
```javascript
// Add logging at each step
console.log('1. Fetching moment from R2...');
console.log('2. Generating script for persona:', persona);
console.log('3. Script generated:', script.substring(0, 100));
console.log('4. Calling Sora API...');
console.log('5. Job created:', job_id);
```

**RAG/Chat Issues**:
```javascript
// Log toolcall execution
console.log('Query:', query);
console.log('Embedding generated:', embedding.slice(0, 5));
console.log('Vectorize results:', results.length);
console.log('Moments found:', moments.map(m => m.moment_id));
```

---

## 🎬 Post-MVP Enhancements

### Week 2 (After Demo)

**Real Sora Integration**:
- [ ] Remove mock responses
- [ ] Implement webhook handler
- [ ] Store videos in R2
- [ ] Add progress updates

**YouTube Integration**:
- [ ] Fetch video metadata from video-matcher worker
- [ ] Embed YouTube player (iframe)
- [ ] Sync playback with timestamp

**Enhanced Chat**:
- [ ] Multi-turn conversation context
- [ ] Conversation history in KV
- [ ] Advanced toolcalls (progressive disclosure)

### Week 3 (Polish)

**Production Readiness**:
- [ ] Error tracking (Sentry)
- [ ] Analytics (Cloudflare Analytics)
- [ ] Rate limiting
- [ ] Authentication (optional)
- [ ] Cost monitoring

**YouTube Metadata Ingestion**:
- [ ] Standalone worker to fetch all English sessions
- [ ] Associate videos with dates
- [ ] Store in R2 with metadata

---

## 💰 Cost Estimates

### Development (Testing)
- Cloudflare Workers: Free (100k requests/day)
- Sora API: ~$0.20 per video × 10 tests = $2
- Claude API: ~$0.003 per request × 100 tests = $0.30

**Total testing cost**: ~$2.50

### Demo Day (100 Users)
- Video generations: 50 videos × $0.20 = $10
- Chat queries: 200 queries × $0.003 = $0.60
- Cloudflare: Free tier

**Total demo cost**: ~$11

### Production (Monthly)
- 1,000 videos/month: $200
- 10,000 chat queries: $30
- Cloudflare Workers: $5 (paid tier for analytics)

**Total monthly**: ~$235

---

## 📞 Support & Resources

### Cloudflare Docs
- Workers: https://developers.cloudflare.com/workers/
- Static Assets: https://developers.cloudflare.com/workers/static-assets/
- Vectorize: https://developers.cloudflare.com/vectorize/
- R2: https://developers.cloudflare.com/r2/
- Workflows: https://developers.cloudflare.com/workflows/

### Sora API
- Documentation: https://platform.openai.com/docs/guides/video-generation
- Pricing: https://openai.com/pricing

### Vercel AI SDK (Toolcalls)
- Documentation: https://sdk.vercel.ai/docs
- Examples: https://github.com/vercel/ai-sdk-examples

---

## ✅ Pre-flight Checklist

Before starting development, verify:

**Data**:
- [ ] Moments exist in R2: `moments/parliament-22-09-2024.json`
- [ ] Vectorize index ready: `MOMENTS_INDEX`
- [ ] Voice DNA available: `workers/asset-generator/src/personas/voice-dna.ts`

**Access**:
- [ ] Cloudflare account with Workers access
- [ ] R2 bucket `capless-preview` accessible
- [ ] OpenAI API key with Sora access
- [ ] Anthropic API key

**Tools**:
- [ ] Node.js >= 18
- [ ] Wrangler CLI installed: `npm install -g wrangler`
- [ ] Logged into Cloudflare: `wrangler login`

**Knowledge**:
- [ ] Read MVP_DEPLOYMENT.md
- [ ] Read DEPENDENCIES_MAP.md
- [ ] Understand existing workers (capless-ingest, moments, video-matcher)

---

## 🎯 Next Steps

1. **Read the docs** (this + 4 checklists) - 30 minutes
2. **Set up API keys** - 15 minutes
3. **Start development** - 4-5 hours
4. **Test & deploy** - 1 hour
5. **Demo!** 🎉

**Total time to working demo**: ~6 hours

**With parallel development**: ~4 hours

---

Good luck! 🚀
