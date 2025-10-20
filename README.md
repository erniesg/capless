# Capless

**AI-powered TikTok content that makes Singapore Parliament understandable**

Transform dense parliamentary proceedings into viral social media commentary with AI personas.

---

## Quick Start

```bash
# Clone and setup
git clone <repo>
cd capless
npm install

# Setup Cloudflare
npm install -g wrangler
wrangler login

# Create Upstash Redis (free tier)
# Visit: console.upstash.com
# Copy REST URL and token

# Get API keys
# - OpenAI: platform.openai.com/api-keys
# - Anthropic: console.anthropic.com
# - ElevenLabs: elevenlabs.io/app/settings/api-keys

# Configure secrets
wrangler secret put UPSTASH_REDIS_REST_URL
wrangler secret put UPSTASH_REDIS_REST_TOKEN
wrangler secret put OPENAI_API_KEY
wrangler secret put ANTHROPIC_API_KEY
wrangler secret put ELEVENLABS_API_KEY

# Create R2 bucket
wrangler r2 bucket create capless

# Deploy (single command deploys API + Frontend)
wrangler deploy
```

---

## Tech Stack

- **Orchestration:** Cloudflare Workflows (durable execution)
- **Compute:** Cloudflare Workers (API + Frontend via static assets)
- **AI (Moments):** OpenAI GPT-4o (direct API)
- **AI (Scripts):** Anthropic Claude 3.5 (direct API)
- **Voice:** ElevenLabs TTS (professional tier, voice cloning)
- **State:** Upstash Redis via REST API
- **Video:** Remotion (React) rendered on Modal (serverless GPU)
- **Storage:** Cloudflare R2 (zero egress fees)

**Cost:** ~$0.17 per video at 100 videos/day = $515/month

---

## Project Structure

```
capless/
├── src/                  # Main Cloudflare Worker
│   └── index.js          # API routes + static asset serving
├── public/               # Frontend (static assets)
│   ├── index.html
│   └── js/app.js
├── scripts/              # Local utilities
│   └── video_composer_tiktok.py
├── wrangler.toml         # Worker config (includes static assets)
├── INIT.md              # Start here - comprehensive guide
├── IMPLEMENTATION.md     # Phased TDD implementation guide
└── PERSONAS.md          # Persona definitions and examples
```

---

## The 4 AI Personas

### 1. **The StraightTok AI** (Gen Z)
Heavy TikTok slang, dramatic reactions, emoji-heavy
**Target:** 18-28 year olds on TikTok

### 2. **The Kopitiam Uncle** (Cynical Singaporean)
Singlish-heavy, street-smart, "wah lau" energy
**Target:** 30-50 year olds, WhatsApp viral content

### 3. **The Anxious Auntie** (Kiasu worrier)
Rapid-fire concerns, money-conscious, "aiyoh!"
**Target:** 35-55 year olds, family WhatsApp groups

### 4. **The Attenborough Observer** (Documentary narrator)
Calm, observational, subtle irony about political theater
**Target:** Educated viewers, LinkedIn/Twitter crowd

---

## How It Works (Cloudflare Workflows Orchestration)

```
Cloudflare Workflow coordinates the entire pipeline:

Step 1: Extract Moment
  Transcript → OpenAI GPT-4o → Viral moment JSON

Step 2: Generate Scripts (parallel)
  Moment → Anthropic Claude → 4 persona scripts

Step 3: Judge Scripts
  All scripts → OpenAI → Pick winner (highest viral score)

Step 4: Generate Voice
  Winning script → ElevenLabs → Persona-specific MP3

Step 5: Render Video
  Remotion (React) → Parliament clip + Audio + Captions
  → TikTok-ready MP4 (9:16, 30-45s)

Step 6: Publish
  Upload to R2 → (Future: Auto-publish to TikTok)
```

---

## MVP Demo (4 Hours)

**What Works:**
- ✅ AI extracts viral moments from transcripts
- ✅ Generates scripts in 4 persona voices
- ✅ Creates professional text-to-speech audio
- ✅ Simple UI to demo the pipeline
- ✅ Pre-rendered TikTok video showcase

**What's Manual (for now):**
- Video composition (local Python script)
- Hansard scraping (use sample transcripts)
- TikTok upload (manual via app)

---

## Post-MVP Roadmap

**Week 1-2:** Automated Hansard ingestion + vector search
**Week 3:** Scheduled daily content generation (7am/7pm)
**Week 4-5:** WebSocket collaborative script editing
**Week 6+:** Multi-platform (Instagram Reels, YouTube Shorts)

---

## Cost Estimates

**At 100 videos/day:**
- OpenAI API (GPT-4o): $150/month
- Anthropic API (Claude): $200/month
- ElevenLabs TTS: $99/month
- Modal (video rendering): $50/month
- Upstash Redis: $10/month
- Cloudflare Workers: $5/month
- R2 Storage: $1/month
- **Total: ~$515/month = $0.17 per video**

---

## Why Capless?

**Problem:** Parliamentary proceedings are dense, boring, and inaccessible to most Singaporeans.

**Solution:** AI breaks down complex politics into entertaining, understandable TikTok content.

**Vision:** Make civic engagement accessible through entertainment. Political literacy shouldn't require a law degree.

---

## Development

See `IMPLEMENTATION.md` for the complete phased TDD checklist.

---

## License

MIT
