# Video Generation Worker - Implementation Checklist

## 🎯 Objective
Build a Cloudflare Worker that generates 15-second TikTok reaction videos using Sora API, supporting all 4 personas with optional AI judging.

## 📋 Core Requirements
- Accept `moment_id` + `persona` (gen_z | kopitiam_uncle | auntie | attenborough | ai_decide)
- Generate scripts for ALL 4 personas using Voice DNA system
- If "ai_decide", use Claude to judge and pick best persona
- Call Sora API for 15s video generation
- Use Cloudflare Workflows for async processing (Sora webhook)
- Return `job_id` for polling status

---

## 🏗️ Setup & Scaffolding

### Worker Structure
- [ ] Create `workers/video-generator/` directory
- [ ] Initialize `wrangler.toml` with bindings:
  - [ ] R2 bucket: `capless-preview` (read moments)
  - [ ] KV namespace: `VIDEO_JOBS` (job status tracking)
  - [ ] Workflows binding: `VIDEO_WORKFLOW`
  - [ ] Secrets: `OPENAI_API_KEY`, `ANTHROPIC_API_KEY`
- [ ] Setup TypeScript config matching existing workers
- [ ] Install dependencies: `hono`, `zod`, `@cloudflare/workers-types`

**Critical Test**:
```bash
npx wrangler dev
curl http://localhost:8787/health
# Expected: { "status": "healthy" }
```

---

## 📝 Script Generation

### Voice DNA Integration
- [ ] Copy `workers/asset-generator/src/personas/voice-dna.ts` to this worker
- [ ] Create `ScriptGenerator` class with methods:
  - [ ] `generateScript(moment, persona)` - returns script + metadata
  - [ ] `generateAllScripts(moment)` - returns 4 scripts (all personas)
  - [ ] `judgeScripts(scripts[])` - uses Claude to pick best

### Script Generation Prompt
```typescript
const SCRIPT_PROMPT = `
Given this parliamentary moment, generate a 100-150 word TikTok script.

MOMENT:
Quote: "${moment.quote}"
Speaker: "${moment.speaker}"
Why viral: "${moment.why_viral}"
Topic: "${moment.topic}"

${voiceDNA.system_prompt}

Output format:
{
  "script": "...",
  "hook": "First 3 seconds hook",
  "cta": "Call to action",
  "hashtags": ["#tag1", "#tag2"]
}
`;
```

**Critical Tests**:
- [ ] Generate Gen Z script for moment-1761234936171-69xogjwb1
  - [ ] Contains validation markers (bestie, it's giving, i can't)
  - [ ] Word count 100-150
  - [ ] Has hook + CTA
- [ ] Generate Kopitiam Uncle script for same moment
  - [ ] Contains Singlish (lah, leh, wah lau)
  - [ ] Includes specific examples/prices
- [ ] Generate scripts for all 4 personas
  - [ ] Returns array of 4 distinct scripts
  - [ ] Each passes voice DNA validation

---

## 🤖 AI Judging

### Judge Selection Logic
- [ ] Create `PersonaJudge` class
- [ ] Prompt structure:
```typescript
const JUDGE_PROMPT = `
You are judging which persona will make this moment most viral on TikTok.

MOMENT: "${moment.quote}" (${moment.why_viral})

SCRIPTS:
1. Gen Z: ${scripts.gen_z}
2. Kopitiam Uncle: ${scripts.kopitiam_uncle}
3. Anxious Auntie: ${scripts.auntie}
4. David Attenborough: ${scripts.attenborough}

Analyze:
- Authenticity to persona
- Hook strength (first 3 seconds)
- Emotional resonance
- Shareability

Output JSON:
{
  "winner": "gen_z",
  "reasoning": "...",
  "virality_score": 8.5
}
`;
```

**Critical Test**:
- [ ] Judge 4 scripts for moment-1761234936171-69xogjwb1
  - [ ] Returns valid persona (one of the 4)
  - [ ] Includes reasoning
  - [ ] Virality score 1-10

---

## 🎥 Sora API Integration

### Sora Video Generation
- [ ] Create `SoraClient` class
- [ ] Implement POST to `https://api.openai.com/v1/video/generations`
- [ ] Request body:
```typescript
{
  model: "sora-2", // or sora-2-pro for quality
  prompt: `Generate a vertical TikTok video with:
    - Visual style: [persona-specific]
    - Text overlay: script snippets
    - Duration: 15 seconds
    - Audio: ${persona} voice reading: "${script}"`,
  size: "1080x1920", // vertical
  duration: 15
}
```
- [ ] Handle async response:
  - [ ] Store `generation_id` in KV
  - [ ] Set up webhook handler for `video.completed`
  - [ ] Download video to R2 when ready

**Critical Tests**:
- [ ] Mock Sora API response
  - [ ] Returns `generation_id`
  - [ ] Webhook handler processes `video.completed`
- [ ] Real Sora API call (1 test only, costs $0.20)
  - [ ] Video generates successfully
  - [ ] Duration ~15 seconds
  - [ ] Includes audio

---

## 🔄 Cloudflare Workflows

### Workflow Setup
- [ ] Create workflow handler in `wrangler.toml`:
```toml
[[workflows]]
name = "video-generation-workflow"
script_name = "video-generator"
```

### Workflow Steps
1. **Generate Scripts** (30s timeout)
   - [ ] Fetch moment from R2
   - [ ] Generate 1 or 4 scripts depending on mode
   - [ ] If ai_decide, run judge
2. **Call Sora** (5min timeout)
   - [ ] Submit video generation request
   - [ ] Store job_id in KV
   - [ ] Return to client immediately
3. **Wait for Webhook** (async)
   - [ ] Receive `video.completed` event
   - [ ] Download video from Sora
   - [ ] Upload to R2
   - [ ] Update KV status

**Critical Tests**:
- [ ] Workflow executes end-to-end
  - [ ] Client gets job_id immediately
  - [ ] Polling endpoint returns "processing"
  - [ ] After webhook, status becomes "completed"
- [ ] Workflow handles failures
  - [ ] Sora timeout → status "failed"
  - [ ] Script generation error → status "error"

---

## 🌐 API Endpoints

### POST /api/video/generate
```typescript
Request:
{
  moment_id: "moment-1761234936171-69xogjwb1",
  persona: "gen_z" | "kopitiam_uncle" | "auntie" | "attenborough" | "ai_decide",
  session_id?: "parliament-22-09-2024" // optional, for context
}

Response:
{
  job_id: "job-1234567890",
  status: "processing",
  estimated_time_seconds: 180,
  poll_url: "/api/video/status/job-1234567890"
}
```

### GET /api/video/status/:job_id
```typescript
Response (processing):
{
  job_id: "job-1234567890",
  status: "processing",
  progress: "generating_script",
  created_at: "2025-10-24T10:00:00Z"
}

Response (completed):
{
  job_id: "job-1234567890",
  status: "completed",
  result: {
    video_url: "https://r2.../videos/job-1234567890.mp4",
    script: "...",
    persona: "gen_z",
    moment: { quote: "...", speaker: "..." },
    youtube_link: "https://youtube.com/watch?v=...",
    timestamp: "01:29:46"
  }
}
```

**Critical Tests**:
- [ ] POST /api/video/generate with persona="gen_z"
  - [ ] Returns job_id immediately (< 1s)
  - [ ] Status code 202
- [ ] GET /api/video/status/:job_id
  - [ ] Returns "processing" initially
  - [ ] Returns "completed" after workflow finishes
- [ ] POST with persona="ai_decide"
  - [ ] Generates 4 scripts
  - [ ] Judge picks best
  - [ ] Returns winner in result

---

## 📦 Data Models

### TypeScript Types
```typescript
type Persona = 'gen_z' | 'kopitiam_uncle' | 'auntie' | 'attenborough' | 'ai_decide';

interface VideoGenerationRequest {
  moment_id: string;
  persona: Persona;
  session_id?: string;
}

interface GeneratedScript {
  persona: Persona;
  script: string;
  hook: string;
  cta: string;
  hashtags: string[];
  word_count: number;
  validation_score: number; // Voice DNA validation
}

interface VideoJob {
  job_id: string;
  status: 'processing' | 'completed' | 'failed' | 'error';
  request: VideoGenerationRequest;
  scripts?: GeneratedScript[];
  selected_persona?: Persona;
  judge_reasoning?: string;
  sora_generation_id?: string;
  video_url?: string;
  created_at: string;
  completed_at?: string;
  error?: string;
}
```

---

## 🧪 Integration Tests

### End-to-End Flow
- [ ] Full workflow with real moment
  - [ ] Generate with persona="gen_z"
  - [ ] Poll status every 5s
  - [ ] Verify completed result has video_url
- [ ] AI decide flow
  - [ ] Generate with persona="ai_decide"
  - [ ] Verify 4 scripts generated
  - [ ] Verify judge selected winner
- [ ] Error handling
  - [ ] Invalid moment_id → 404
  - [ ] Missing persona → 400
  - [ ] Sora timeout → "failed" status

---

## 🚀 Deployment

### Pre-deployment
- [ ] Set secrets in Cloudflare dashboard:
  - [ ] `OPENAI_API_KEY`
  - [ ] `ANTHROPIC_API_KEY`
- [ ] Create KV namespace: `VIDEO_JOBS`
- [ ] Verify R2 bucket access: `capless-preview`
- [ ] Set up webhook URL for Sora

### Deployment Steps
```bash
cd workers/video-generator
npx wrangler deploy
npx wrangler tail # Monitor logs
```

**Post-deployment Test**:
```bash
curl -X POST https://capless-video-generator.erniesg.workers.dev/api/video/generate \
  -H "Content-Type: application/json" \
  -d '{"moment_id": "moment-1761234936171-69xogjwb1", "persona": "gen_z"}'

# Expected: { "job_id": "...", "status": "processing" }
```

---

## 📊 Monitoring & Observability

### Metrics to Track
- [ ] Video generation success rate
- [ ] Average time from request to completion
- [ ] Sora API errors
- [ ] Persona distribution (which personas are most popular)
- [ ] Cost per video (Sora + Claude)

### Logging
- [ ] Log script generation (persona, word count, validation score)
- [ ] Log judge decisions (winner, reasoning)
- [ ] Log Sora API calls (generation_id, status)
- [ ] Log errors with context

---

## ⏱️ Time Estimates

| Task | Time | Priority |
|------|------|----------|
| Worker scaffolding | 15min | P0 |
| Script generation (1 persona) | 30min | P0 |
| Script generation (all 4) | 30min | P0 |
| AI judge | 20min | P1 |
| Sora mock | 15min | P0 |
| Sora real | 45min | P1 |
| Workflows | 45min | P1 |
| API endpoints | 30min | P0 |
| Tests | 30min | P0 |

**Total MVP (P0 only)**: ~2.5 hours
**Full implementation**: ~4 hours
