# INIT.md - Capless AI Initialization Guide

**Last Updated:** 2025-10-21
**Status:** 3/5 Workers Built (60% Complete) | 98/98 Tests Passing
**Read This First** before touching anything else in this repo.

---

## ⚠️ Documentation Policy

**DO NOT CREATE NEW MARKDOWN FILES.**

We have exactly **4 core MDs** - that's it:
1. README.md - Quick start & status
2. ARCHITECTURE.md - Complete technical specs (5 workers, ADRs, deployment)
3. PERSONAS.md - Voice DNA system
4. MOMENT_TAXONOMY_SIMPLE.md - Extraction strategy (13 categories + wildcard)

**Also useful:**
- `MOMENT_CATEGORIES_V2.md` - Voting UI categories aligned with personas (deprecated by taxonomy)

**Historical/deprecated docs** exist but should not be updated:
- INIT.md (this file - outdated architecture references)
- IMPLEMENTATION.md (tactical guide for old architecture)

**If you need to document something:** Update one of these files.
**Why?** Sprawl makes information impossible to find.

---

## What Is Capless?

**One-liner:** AI-powered TikTok content that makes Singapore Parliament understandable.

**The Problem:**
Parliamentary proceedings are dense, filled with bureaucratic jargon, and completely inaccessible to 90% of Singaporeans. Young people especially have zero engagement with politics because it's boring and incomprehensible.

**The Solution:**
Capless uses AI to:
1. Extract viral moments from Hansard transcripts
2. Generate commentary scripts in 4 different personas
3. Create TikTok-ready videos (9:16, 30-45s) with voiceover and captions
4. Publish daily automated political commentary that's entertaining AND educational

**The Vision:**
Make civic engagement accessible through entertainment. Political literacy shouldn't require a law degree.

---

## Architecture Overview

### 5-Worker Production Pipeline (v3.0)

```
Parliamentary Proceedings (Hansard JSON)
          ↓
    [Ingestion Worker] ✅ BUILT
    Parse transcript, extract metadata
          ↓
    ┌─────┴─────┬
    ↓           ↓
[Video Matcher] [Moments Worker] ✅ BUILT
YouTube         Viral moment
matching        extraction +
                embeddings
    ↓           ↓
    └─────┬─────┘
          ↓
  [Asset Generator] 🚧 TO BUILD
  Scripts (4 personas) + Audio + Thumbnails
          ↓
  [Video Compositor] 🚧 TO BUILD
  Modal rendering + Publishing + Storage
```

**Key Principle:** Services are grouped by **domain boundaries** and **operational coupling**, not arbitrary atomization. Each worker is independently deployable.

**Why 5 workers (not 10)?** See [ARCHITECTURE.md](./ARCHITECTURE.md#adr-001) for evidence-based consolidation rationale.

**For detailed technical specs:** See [ARCHITECTURE.md](./ARCHITECTURE.md)

---

## Tech Stack

| Layer | Technology | Why |
|-------|-----------|-----|
| **Orchestration** | Cloudflare Workflows | Built-in retry logic, durable execution |
| **Compute** | Cloudflare Workers | Zero cold starts, serves API + frontend |
| **State** | Durable Objects + Redis | Job coordination + caching |
| **AI (Moments)** | OpenAI GPT-4o | Best at analyzing nuance and virality |
| **AI (Scripts)** | Anthropic Claude 3.5 | Superior creative writing |
| **Voice** | ElevenLabs | Best quality TTS, voice cloning |
| **Video** | Remotion + Modal | React-based composition, serverless GPU |
| **Storage** | Cloudflare R2 | Zero egress fees, S3-compatible |
| **Search** | Vectorize/Pinecone | Semantic search across content |

**Cost:** ~$2,182/month at 100 videos/day = $0.73/video (see [ARCHITECTURE.md](./ARCHITECTURE.md#6-cost-analysis))

**For full stack details:** See [ARCHITECTURE.md](./ARCHITECTURE.md)

---

## The 4 AI Personas

We use a **Voice DNA system** (not checklists) to create authentic voices:

### 1. **StraightTok AI** (Gen Z, 18-28, TikTok/Instagram)
- **Archetype:** Truth-Telling Jester
- **Worldview:** Systems are broken, but we can laugh while fixing them
- **Voice:** Unhinged, dramatic, heavy TikTok slang, emoji-heavy

**Example:**
> "Okay so the Minister just explained why your insurance is expensive and it's giving ✨ quantum physics ✨. She literally said everyone is stuck in a KNOT. Ma'am, this is not a knot, this is a full situationship with commitment issues. 💀"

### 2. **Kopitiam Uncle** (Cynical Singaporean, 35-55, WhatsApp/Facebook)
- **Archetype:** Cynical Sage
- **Worldview:** I've seen it all before, different packaging same nonsense
- **Voice:** Singlish-heavy, street-smart, rapid-fire

**Example:**
> "Wah lau eh! Talk until so atas but end of the day, our wallet still crying. You think insurance company will volunteer to lower price meh? In your dreams lah! KNN."

### 3. **Anxious Auntie** (Kiasu worrier, 40-60, Family WhatsApp)
- **Archetype:** Vigilant Guardian
- **Worldview:** The world is full of dangers we must prepare for
- **Voice:** Rapid-fire concerns, money-conscious, escalating panic

**Example:**
> "Aiyoh! My family four people, if everyone's insurance go up, that's more than $2000 a month! Then how?? So stress! Must tell everyone in the family group! Cannot lose out!"

### 4. **Attenborough Observer** (Documentary narrator, 30-50, LinkedIn/Twitter)
- **Archetype:** Detached Anthropologist
- **Worldview:** Politics is human nature performing on a stage
- **Voice:** Calm, observational, subtle irony

**Example:**
> "Here, in the climate-controlled chamber of Singapore's Parliament, we observe a fascinating ritual. The Minister deploys what political scientists call the 'complexity defense.' What we're witnessing is a classic political adaptation: when cornered by difficult questions, retreat into abstraction."

**For detailed Voice DNA specs:** See [PERSONAS.md](./PERSONAS.md)

---

## Development Principles

### 1. Atomic Services
Every worker must:
- Have standalone endpoints
- Be independently deployable
- Handle its own errors
- Be testable in isolation

### 2. Test-Driven Development (TDD)
```bash
1. Write failing test
2. Run test (watch it fail)
3. Write minimal code to pass
4. Run test (watch it pass)
5. Refactor
6. Repeat
```

### 3. Commit Early, Commit Often
```bash
# After each test file
git add tests/test_ingestion.ts && git commit -m "test: add ingestion worker tests"

# After making test pass
git add workers/ingest/src/index.ts && git commit -m "feat: implement Hansard JSON ingestion"

# After refactoring
git commit -am "refactor: extract prompt templates to config"
```

### 4. Configuration-Driven Everything
```javascript
// Bad (hardcoded)
const voice = await AI.run('@cf/deepgram/aura', {
  text: script,
  voice: 'en-US-female-2'
});

// Good (config-driven)
const config = VOICE_CONFIG[persona];
const voice = await AI.run('@cf/deepgram/aura', {
  text: script,
  ...config
});
```

### 5. Fail Gracefully with Fallbacks
```javascript
try {
  return await AI.run('@cf/openai/gpt-4o', prompt);
} catch (error) {
  console.error('Primary AI failed, trying backup');
  return await AI.run('@cf/google/gemini-pro', prompt);
}
```

---

## Current Repo State

```
capless/
├── INIT.md              # ← YOU ARE HERE (start here)
├── ARCHITECTURE.md      # Detailed technical specs (10 workers, state, deployment)
├── PERSONAS.md          # Voice DNA system for 4 personas
├── IMPLEMENTATION.md    # Phase-by-phase build guide
├── README.md            # Quick overview
└── (no code yet)        # Workers, frontend, scripts all pending
```

**What exists:**
- ✅ Complete architecture specification (ARCHITECTURE.md)
- ✅ Detailed persona Voice DNA system (PERSONAS.md)
- ✅ Implementation roadmap (IMPLEMENTATION.md)
- ✅ Tech stack decisions finalized

**What doesn't exist yet:**
- ❌ Cloudflare Workers code
- ❌ Frontend UI code
- ❌ Video composition scripts
- ❌ Test files
- ❌ Deployment configs

---

## Quick Start

### Prerequisites
- Cloudflare account (dash.cloudflare.com)
- Upstash Redis account (console.upstash.com)
- API keys: OpenAI, Anthropic, ElevenLabs
- Modal account for video rendering (modal.com)

### Install Tools
```bash
# Cloudflare CLI
npm install -g wrangler
wrangler login

# Verify
wrangler whoami
```

### Setup Infrastructure
```bash
# Create R2 bucket
wrangler r2 bucket create capless

# Setup secrets
wrangler secret put UPSTASH_REDIS_REST_URL
wrangler secret put UPSTASH_REDIS_REST_TOKEN
wrangler secret put OPENAI_API_KEY
wrangler secret put ANTHROPIC_API_KEY
wrangler secret put ELEVENLABS_API_KEY
```

---

## Example Production Output

### Input: Raw Hansard Transcript
```
Mr Yip Hon Weng: To ask the Minister for Health what is the Government's
assessment of the recent trends in Integrated Shield Plan premiums.

Ms Rahayu Mahzam (Minister of State for Health): The trends we observe
are symptoms of a complex situation. Escalating healthcare costs, rising
premiums, and tightening claims management practices – these are all
consequences of what I would describe as a knot that insurers, healthcare
providers, and policyholders find themselves caught in.
```

### Pipeline Processing

**Step 1:** Ingestion Worker
- Parses Hansard JSON
- Extracts speakers, topics, timestamps
- Generates embeddings for semantic search
- Stores in R2 and vector database

**Step 2:** Video Matcher Worker (if YouTube video exists)
- Matches transcript with parliamentary video
- Extracts timestamp for this exchange
- Identifies video segment for quote

**Step 3:** Moment Extractor Worker
```json
{
  "quote": "consequences of what I would describe as a knot...",
  "speaker": "Ms. Rahayu Mahzam",
  "topic": "Healthcare",
  "timestamp_start": "00:14:32",
  "timestamp_end": "00:15:08",
  "why_viral": "Uses confusing metaphor ('knot') to explain rising costs without offering solution",
  "virality_score": 8.7
}
```

**Step 4:** Script Generator Worker (4 personas in parallel)
- Generates Gen Z, Kopitiam Uncle, Auntie, Attenborough scripts
- Each uses Voice DNA system for authenticity
- Returns scripts with engagement predictions

**Step 5:** Audio Generator Worker
- Winner: Gen Z (score: 9.2/10)
- Generates TTS with young female voice, 1.2x speed
- Uploads to R2

**Step 6:** Video Compositor Worker (Modal + Remotion)
- 9:16 vertical format (1080x1920)
- Parliament clip as background (8 seconds)
- AI voiceover synced to video
- Word-by-word captions
- Persona emoji in corner
- Progress bar at bottom
- Duration: 38 seconds

**Step 7:** Publisher Worker
- Uploads to R2: `finals/job-123_gen-z.mp4`
- Updates job status: `VIDEO_READY`
- (Future) Auto-publishes to TikTok, Instagram, YouTube

**Full pipeline runs in ~45 seconds** (most of that is video rendering).

---

## Mental Models for Understanding Capless

### Mental Model 1: The Assembly Line

Think of Capless as a **video assembly line** with 7 stations:

```
Raw Hansard → Ingestion → Moment Extraction → Script Writing →
Voice Generation → Video Assembly → Publication
```

Each "station" is a Cloudflare Worker. Cloudflare Workflows is the conveyor belt.

### Mental Model 2: The Job Object

Everything centers around a **Job** managed by Durable Objects:

```javascript
{
  job_id: "uuid-123",
  status: "MOMENT_FOUND" | "SCRIPTS_GENERATED" | "VIDEO_READY",

  // Inputs
  transcript_id: "...",
  hansard_url: "...",
  youtube_url: "...",

  // Outputs
  moments: [...],
  scripts: {...},
  audio_url: "...",
  video_url: "...",

  // Metadata
  created_at: "2025-10-21T12:00:00Z",
  updated_at: "2025-10-21T12:05:23Z"
}
```

Each worker **reads** from this job, does its work, then **updates** the job.

### Mental Model 3: The Persona Switcher

Personas are **not separate AI models**. They're **Voice DNA activation patterns**.

The same AI model (Claude 3.5) generates all 4 persona scripts by using different Voice DNA prompts:

```javascript
const VOICE_DNA = {
  gen_z: {
    archetype: "Truth-Telling Jester",
    worldview: "Systems are broken, laugh while fixing",
    cognitive_style: "Instant pattern recognition, spots hypocrisy",
    // ... full DNA
  },
  // ... other personas
}

// Same model, different Voice DNA activation
const script = await AI.run(model, {
  system: activateVoiceDNA(VOICE_DNA[persona]),
  user: "Create commentary about: " + moment
});
```

This is **cheaper** (one model) and **more consistent** (same intelligence).

---

## Implementation Roadmap

### Phase 0: Infrastructure Setup
- Set up Cloudflare, Upstash, Modal accounts
- Create R2 buckets, Redis database
- Get all API keys
- Install Wrangler CLI

### Phase 1: Core Processing Workers
- Ingestion Worker (Hansard → structured data)
- Moment Extractor Worker (find viral quotes)
- Script Generator Worker (Voice DNA → personas)
- Audio Generator Worker (TTS)

### Phase 2: Intelligence Layer
- Embeddings Worker (semantic search)
- Video Matcher Worker (YouTube integration)
- Analytics Worker (metrics tracking)

### Phase 3: Video Production
- Video Compositor Worker (Modal + Remotion)
- Storage Manager Worker (R2 organization)

### Phase 4: Publishing & Orchestration
- Publisher Worker (multi-platform)
- Cloudflare Workflows integration
- Durable Objects for job coordination

**For detailed phase-by-phase checklist:** See [IMPLEMENTATION.md](./IMPLEMENTATION.md)

---

## Common Questions

### Q: Why atomic services instead of a monolith?
**A:** Independent deployment, fault isolation, easier testing, services can be composed differently for new use cases.

### Q: Why Durable Objects AND Redis?
**A:** Durable Objects for stateful job coordination and WebSocket connections. Redis for high-performance caching and queuing. See [ARCHITECTURE.md](./ARCHITECTURE.md#state-management) for details.

### Q: Why Modal for video rendering?
**A:** On-demand GPU access, serverless pricing, Python/FFmpeg ecosystem, automatic scaling. Remotion (React) gives us version-controlled video templates.

### Q: How do you maintain persona consistency?
**A:** Voice DNA system defines psychological/cognitive architecture. AI embodies the DNA rather than hitting checkboxes. See [PERSONAS.md](./PERSONAS.md) for full system.

### Q: How much does it cost to run?
**A:** At 100 videos/day:
- AI inference: $350/month (70% of cost)
- Video rendering: $50/month (20%)
- Storage/bandwidth: $15/month (10%)
- **Total: ~$515/month = $0.17/video**

See [ARCHITECTURE.md](./ARCHITECTURE.md#cost-structure) for breakdown.

---

## What to Read Next

**If you're implementing the system:**
1. Read [ARCHITECTURE.md](./ARCHITECTURE.md) for technical specs
2. Read [IMPLEMENTATION.md](./IMPLEMENTATION.md) for build guide
3. Start with Phase 0 (infrastructure setup)

**If you're designing personas:**
1. Read [PERSONAS.md](./PERSONAS.md) for Voice DNA system
2. Study the examples and cognitive architectures
3. Test scripts by reading aloud

**If you're planning deployment:**
1. Review [ARCHITECTURE.md](./ARCHITECTURE.md#deployment-architecture)
2. Check service inventory and endpoints
3. Plan monitoring and observability

---

## The Capless Philosophy

**Most political commentary is one of two extremes:**

1. **Academic/Boring:** Accurate but inaccessible (think policy papers)
2. **Viral/Shallow:** Entertaining but misleading (think clickbait)

**Capless aims for the sweet spot:**

```
           Entertaining
                 │
                 │    🎯 CAPLESS
                 │   (Both!)
                 │
─────────────────┼─────────────────
                 │
                 │
           Accurate
```

**How we achieve both:**
- **Entertaining:** Personas, TikTok format, humor
- **Accurate:** Uses original Hansard quotes, shows source
- **Educational:** Explains jargon in plain language
- **Viral:** Optimized for sharing (relatability > correctness)

**The guiding principle:**
*"If people understand 60% of a political issue and share it with 10 friends, that's better than understanding 100% and sharing with nobody."*

---

## You're Ready to Build

You now understand:
- ✅ What Capless is and why it matters
- ✅ The atomic services architecture
- ✅ How the personas work (Voice DNA system)
- ✅ Development principles and workflow
- ✅ What's built and what's pending

**Next step:**
Open [IMPLEMENTATION.md](./IMPLEMENTATION.md) and start Phase 0.

**Good luck building! 🚀**

---

**Questions?** Check the Common Questions section above.
**Need technical details?** See [ARCHITECTURE.md](./ARCHITECTURE.md).
**Understanding personas?** See [PERSONAS.md](./PERSONAS.md).

**Remember:** Start with atomic services, test everything, commit often.
