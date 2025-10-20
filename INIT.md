# INIT.md - Capless AI Initialization Guide

**Last Updated:** 2025-10-20
**Status:** 🚧 Pre-Implementation (Documentation Complete, Code Pending)
**Read This First** before touching anything else in this repo.

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

## Tech Stack (Cloudflare Workers + Direct API Calls)

### Why This Stack?

We use **Cloudflare Workers** as the foundation because:
- **Zero cold starts** (instant response)
- **Global edge deployment** (low latency worldwide)
- **Static assets support** (frontend + backend in one deployment)
- **Durable execution** via Workflows (automatic retries)
- **Direct API integration** (call best-in-class AI services)

### Architecture Overview

```
┌─────────────────────────────────────────────────────────────┐
│                    CLOUDFLARE WORKFLOWS                     │
│                  (Orchestration + Retry Logic)              │
└─────────────────────────────────────────────────────────────┘
                              │
        ┌─────────────────────┼─────────────────────┐
        │                     │                     │
        ▼                     ▼                     ▼
┌───────────────┐   ┌───────────────┐   ┌───────────────┐
│ find-moment   │   │ write-script  │   │generate-audio │
│   Worker      │   │    Worker     │   │    Worker     │
│ → OpenAI API  │   │ → Claude API  │   │ → ElevenLabs  │
└───────────────┘   └───────────────┘   └───────────────┘
        │                     │                     │
        └─────────────────────┼─────────────────────┘
                              ▼
                      ┌───────────────┐
                      │ Upstash Redis │
                      │  (Job State)  │
                      └───────────────┘
                              │
                              ▼
                    ┌───────────────────┐
                    │  produce-video    │
                    │  Worker → Modal   │
                    └───────────────────┘
                              │
                              ▼
                      ┌───────────────┐
                      │ Cloudflare R2 │
                      │   (Storage)   │
                      └───────────────┘
                              │
                              ▼
                    ┌───────────────────┐
                    │  Main Worker      │
                    │  (Static Assets)  │
                    │  Frontend + API   │
                    └───────────────────┘
```

### Stack Components

| Layer | Technology | Purpose | Why We Chose It |
|-------|-----------|---------|-----------------|
| **Orchestration** | Cloudflare Workflows | Coordinate multi-step pipeline | Built-in retry logic, no external orchestrator needed |
| **Compute** | Cloudflare Workers | API + Frontend (static assets) | Zero cold starts, serves both API and UI in one deployment |
| **AI (Moments)** | OpenAI GPT-4o (direct API) | Extract viral moments | Best at analyzing nuance and virality potential |
| **AI (Scripts)** | Anthropic Claude 3.5 (direct API) | Generate persona scripts | Superior at creative writing and maintaining voice consistency |
| **Voice** | ElevenLabs API | Text-to-speech | Best quality TTS, voice cloning, persona-specific voices |
| **State** | Upstash Redis | Job queue and caching | Serverless Redis via REST API, perfect for edge |
| **Video** | Remotion (React) | Video composition | Code-based video generation (easy to version control) |
| **Video Compute** | Modal | Serverless GPU rendering | On-demand GPU with Python/FFmpeg support |
| **Storage** | Cloudflare R2 | Audio/video hosting | Zero egress fees (S3-compatible) |

### Cost Structure (at 100 videos/day)

```
OpenAI API (GPT-4o):      $150/month  (moment extraction)
Anthropic API (Claude):   $200/month  (script generation)
ElevenLabs TTS:           $99/month   (professional tier, 500K chars)
Modal (video rendering):  $50/month   (GPU compute)
Upstash Redis:            $10/month   (free tier covers most)
Cloudflare Workers:       $5/month    (free tier + overage)
R2 Storage:               $1/month    (storage + requests)
────────────────────────────────────────────────
TOTAL:                    ~$515/month = $0.17/video
```

**Why this is cost-effective:**
- R2 has zero egress fees (no bandwidth charges)
- Workers free tier covers 100K requests/day
- Upstash free tier gives 10K commands/day
- Modal only charges for actual GPU seconds used
- ElevenLabs professional tier includes voice cloning

### Cloudflare Workers Static Assets

**New in 2025:** Cloudflare Workers can now serve static frontend files directly, eliminating the need for separate Pages deployment.

**How it works:**
```toml
# wrangler.toml
name = "capless"
main = "src/index.js"
compatibility_date = "2025-01-20"

[assets]
directory = "./public"  # Your frontend files (HTML, CSS, JS)
binding = "ASSETS"      # Access via env.ASSETS.fetch(request)

[[r2_buckets]]
binding = "R2_BUCKET"
bucket_name = "capless"
```

**Single deployment handles:**
- Static frontend (HTML, CSS, JS, images)
- API routes (`/api/*`)
- Automatic caching of assets
- Global edge distribution

**No need for:**
- ❌ Separate Cloudflare Pages project
- ❌ CORS configuration between domains
- ❌ Multiple deployments

---

## The 4 AI Personas (Examples from Production)

Capless uses 4 distinct AI voices to reach different demographics. Here's what they sound like:

### 1. **StraightTok AI** (Gen Z, 18-28, TikTok/Instagram)

**Voice:** Unhinged, dramatic, heavy TikTok slang, emoji-heavy

**Example Output:**
> "Okay so the Minister just explained why your insurance is expensive and it's giving ✨ quantum physics ✨. She literally said everyone is stuck in a KNOT. The math ain't mathing! Bestie, I can't. This is not a knot, this is a full situationship with commitment issues. 💀 Justice for our wallets! #Capless"

**When to use:** Topics affecting young people directly (jobs, housing, cost of living)

---

### 2. **Kopitiam Uncle** (Cynical Singaporean, 35-55, WhatsApp/Facebook)

**Voice:** Singlish-heavy, street-smart, "wah lau" energy, rapid-fire

**Example Output:**
> "Wah lau eh! This Minister got style sia. She say the insurance market is like a 'knot' – everyone stuck together, cannot untie. Liddat also can ah? Talk until so atas but end of the day, our wallet still crying. You think insurance company will volunteer to lower price meh? In your dreams lah! KNN."

**When to use:** "Common sense" issues, everyday costs, calling out political jargon

---

### 3. **Anxious Auntie** (Kiasu worrier, 40-60, Family WhatsApp Groups)

**Voice:** Rapid-fire concerns, money-conscious, escalating panic, lots of "aiyoh!"

**Example Output:**
> "Aiyoh! You hear or not? The Minister say our insurance premium go up because of 'knot'! What knot?? My family four people, if everyone's insurance go up, that's more than $2000 a month! Then how?? So stress! Must tell everyone in the family group! Cannot lose out!"

**When to use:** Family welfare, healthcare costs, anything involving money or children

---

### 4. **Attenborough Observer** (Documentary narrator, 30-50, LinkedIn/Twitter)

**Voice:** Calm, observational, subtle irony, nature documentary style

**Example Output:**
> "Here, in the climate-controlled chamber of Singapore's Parliament, we observe a fascinating ritual. The Minister deploys what political scientists call the 'complexity defense.' She describes the situation as a 'knot' – an elegant metaphor that implies both interconnection and the impossibility of simple solutions. What we're witnessing is a classic political adaptation: when cornered by difficult questions, retreat into abstraction."

**When to use:** Complex topics needing deeper analysis, educated professional audiences

---

## Mental Models for Understanding Capless

### Mental Model 1: The Assembly Line

Think of Capless as a **video assembly line** with 5 stations:

```
Raw Transcript → Moment Extraction → Script Writing → Voice Generation → Video Assembly → Final TikTok
   (Input)          (Station 1)       (Station 2)       (Station 3)       (Station 4)      (Output)
```

Each "station" is a Cloudflare Worker. Cloudflare Workflows is the conveyor belt that moves jobs between stations.

### Mental Model 2: The Job Object

Everything centers around a **Job** stored in Redis:

```javascript
{
  job_id: "uuid-123",
  status: "MOMENT_FOUND" | "SCRIPTS_GENERATED" | "AUDIO_GENERATED" | "VIDEO_READY",

  // Moment data
  moment_quote: "...",
  moment_speaker: "Ms. Rahayu Mahzam",
  moment_topic: "Healthcare",

  // Scripts (4 personas)
  script_gen_z: "Okay so...",
  script_kopitiam_uncle: "Wah lau eh...",
  script_auntie: "Aiyoh!...",
  script_attenborough: "Here, in the chamber...",

  // Audio
  audio_url: "https://r2.../audio.mp3",
  audio_persona: "gen_z",

  // Video
  video_url: "https://r2.../final.mp4",

  created_at: "2025-10-20T12:00:00Z",
  updated_at: "2025-10-20T12:05:23Z"
}
```

Each worker **reads** from this job, does its work, then **updates** the job with new fields.

### Mental Model 3: The Persona Switcher

Personas are **not separate AI models**. They're **prompt engineering patterns**.

The same AI model (Claude 3.5) generates all 4 persona scripts by switching system prompts:

```javascript
const PERSONA_PROMPTS = {
  gen_z: "You are an unhinged Gen Z TikToker...",
  kopitiam_uncle: "You are a cynical Kopitiam Uncle...",
  // etc.
}

// Same model, different prompt
const script = await AI.run(model, {
  system: PERSONA_PROMPTS[persona],
  user: "Create commentary about: " + moment
});
```

This is **cheaper** (one model) and **more consistent** (same underlying intelligence).

### Mental Model 4: The Demo vs Production Split

**MVP Demo (4 hours):**
- Manual transcript input
- All 4 scripts generated
- Audio generated for winner
- **Video is pre-rendered** (manual Python script)
- Simple UI shows the pipeline

**Production (8 weeks):**
- Automated Hansard scraping
- Scheduled daily jobs (7am/7pm)
- **Video auto-rendered** via Modal
- Multi-platform publishing
- Analytics dashboard

**Current Status:** We're at Pre-Implementation (documentation done, no code yet).

---

## Current Repo State

```
capless/
├── .claude/              # Claude Code config (ignore)
├── INIT.md              # ← YOU ARE HERE (start here)
├── README.md            # Quick overview
├── IMPLEMENTATION.md    # Phase-by-phase TDD checklist
├── PERSONAS.md         # Detailed persona voice guides
└── (no code yet)       # Workers, frontend, scripts all pending
```

**What exists:**
- ✅ Complete architecture documentation
- ✅ Detailed implementation checklist
- ✅ Persona voice guides with examples
- ✅ Tech stack decisions

**What doesn't exist yet:**
- ❌ Cloudflare Workers code
- ❌ Frontend UI code
- ❌ Video composition scripts
- ❌ Test files
- ❌ Deployment configs

---

## Development Principles

### 1. Test-Driven Development (TDD)

**Every feature follows this cycle:**

```bash
1. Write failing test
2. Run test (watch it fail)
3. Write minimal code to pass
4. Run test (watch it pass)
5. Refactor
6. Repeat
```

**Why TDD for this project?**
- AI outputs are unpredictable → tests catch regressions
- Multiple workers need integration testing
- Video generation is expensive → mock during testing
- Personas must stay consistent → voice tests validate quality

### 2. Commit Early, Commit Often

```bash
# After each test file
git add tests/test_moment_extraction.js && git commit -m "test: add moment extraction tests"

# After making test pass
git add workers/find-moment/src/index.js && git commit -m "feat: implement moment extraction worker"

# After refactoring
git commit -am "refactor: extract prompt templates to config"
```

**Why?** This project has many moving parts. Small commits make debugging easier when (not if) something breaks.

### 3. Configuration-Driven Everything

**Bad (hardcoded):**
```javascript
const voice = await AI.run('@cf/deepgram/aura', {
  text: script,
  voice: 'en-US-female-2',
  speed: 1.2
});
```

**Good (config-driven):**
```javascript
// config/voices.js
export const VOICE_CONFIG = {
  gen_z: { voice: 'en-US-female-2', speed: 1.2 },
  kopitiam_uncle: { voice: 'en-US-male-1', speed: 1.1 },
  // ...
};

// In worker
const config = VOICE_CONFIG[persona];
const voice = await AI.run('@cf/deepgram/aura', {
  text: script,
  ...config
});
```

**Why?** Easy to tune voices, swap AI models, adjust prompts without code changes.

### 4. Fail Gracefully with Fallbacks

**Every external call should have a fallback:**

```javascript
// Good pattern
try {
  const result = await AI.run('@cf/openai/gpt-4o', prompt);
  return result;
} catch (error) {
  console.error('Primary AI failed, trying backup:', error);
  try {
    const backup = await AI.run('@cf/google/gemini-pro', prompt);
    return backup;
  } catch (backupError) {
    // Return cached result or friendly error
    return getCachedResult() || { error: 'AI temporarily unavailable' };
  }
}
```

**Why?** AI APIs go down. We need the pipeline to keep running.

### 5. Mock Expensive Operations in Tests

**Real video rendering takes 30-60 seconds.** Don't do this in tests.

```javascript
// Good test pattern
if (process.env.NODE_ENV === 'test') {
  // Return mock video URL
  return 'https://mock.r2.dev/test-video.mp4';
} else {
  // Actually render video
  return await renderVideo(job);
}
```

---

## How to Start Development

### Prerequisites Checklist

Before writing any code, set up these accounts:

- [ ] **Cloudflare Account** (dash.cloudflare.com)
  - Install Wrangler CLI: `npm install -g wrangler`
  - Login: `wrangler login`
  - Verify: `wrangler whoami`

- [ ] **Upstash Redis** (console.upstash.com)
  - Create free database
  - Copy REST URL and token
  - Test connection with curl

- [ ] **R2 Bucket** (via Cloudflare)
  - Create bucket: `wrangler r2 bucket create capless`
  - Enable public access for video hosting

- [ ] **API Keys** (optional for MVP, required for production)
  - OpenAI API key (for GPT-4o)
  - Anthropic API key (for Claude 3.5)
  - Google AI API key (for Gemini backup)

### Development Roadmap

**Phase 0: Prerequisites (30 min)**
- Set up all accounts above
- Install Wrangler and verify auth
- Create project structure

**Phase 1: Core AI Brain (Hour 1)**
- Implement `find-moment` worker (moment extraction)
- Implement `write-script` worker (persona scripts)
- Write tests for both
- Deploy to Cloudflare

**Phase 2: Audio + UI (Hour 2)**
- Implement `generate-audio` worker (TTS)
- Build demo frontend UI
- Test end-to-end flow
- Deploy to Cloudflare Pages

**Phase 3: Video Composition (Hour 3)**
- Write Python video composition script
- Test with sample data
- Generate pre-rendered demo video
- Upload to R2

**Phase 4: Integration & Demo (Hour 4)**
- Connect all components
- Pre-generate demo content
- Prepare pitch deck
- Test on mobile devices

**✅ MVP Complete** = 4 hours

**Post-MVP (8 weeks):**
- Automated Hansard scraping
- Scheduled daily jobs
- Video auto-rendering on Lambda
- Multi-platform publishing
- Analytics dashboard

---

## Example Production Output (What Success Looks Like)

Here's a real example from the production system:

### Input: Raw Hansard Transcript
```
Mr Yip Hon Weng (Yio Chu Kang): To ask the Minister for Health what is
the Government's assessment of the recent trends in Integrated Shield Plan premiums.

Ms Rahayu Mahzam (Minister of State for Health): The trends we observe in
the IP market are symptoms of a complex situation. Escalating healthcare costs,
rising premiums, and tightening claims management practices – these are all
consequences of what I would describe as a knot that insurers, healthcare
providers, and policyholders find themselves caught in.
```

### Step 1: AI Extracts Viral Moment
```json
{
  "quote": "These are all consequences of what I would describe as a knot that insurers, healthcare providers, and policyholders find themselves caught in.",
  "speaker": "Ms Rahayu Mahzam",
  "topic": "Healthcare",
  "why_viral": "Uses confusing metaphor ('knot') to explain rising costs without offering solution"
}
```

### Step 2: AI Generates 4 Persona Scripts

**Gen Z StraightTok AI:**
> "Okay so the Minister just explained why your insurance is expensive and it's giving quantum physics. She literally said everyone is stuck in a KNOT. Ma'am, this is not a knot, this is a full situationship with commitment issues. 💀 The math ain't mathing. Bestie, I can't. Justice for our wallets! #Capless"

**Kopitiam Uncle:**
> "Wah lau eh! This Minister got style sia. She say the insurance market is like a 'knot' – everyone stuck together, cannot untie. Liddat also can ah? Talk until so atas but end of the day, our wallet still crying. You think insurance company will volunteer to lower price meh? In your dreams lah! KNN."

**Anxious Auntie:**
> "Aiyoh! You hear or not? The Minister say our insurance premium go up because of 'knot'! What knot?? My family four people, if everyone's insurance go up, that's more than $2000 a month! Then how?? Cannot like that lah! Must share with everyone in the family group! So stress!"

**Attenborough Observer:**
> "Here, in the climate-controlled chamber of Singapore's Parliament, we observe a fascinating ritual. The Minister, when confronted about rising insurance premiums, deploys what political scientists call the 'complexity defense.' What we're witnessing is a classic political adaptation: when cornered by difficult questions, retreat into abstraction."

### Step 3: System Selects Winner (Gen Z) + Generates Audio
- AI judges which script has highest viral potential
- Winner: Gen Z (score: 9.8/10)
- Generates TTS audio with young female voice, 1.2x speed

### Step 4: Renders TikTok Video
- 9:16 vertical format (1080x1920)
- Parliament clip as background (8 seconds)
- AI voiceover plays over clip
- Word-by-word captions appear synced to audio
- Persona emoji in corner (📱 for Gen Z)
- Progress bar at bottom
- Final duration: 38 seconds

### Step 5: Publishes to R2 + Frontend
- Uploads to R2: `finals/job-123_gen-z.mp4`
- Updates job status: `VIDEO_READY`
- Available at public URL
- Frontend displays video player

**This entire pipeline runs in ~45 seconds** (including video rendering).

---

## Common Questions

### Q: Why not use a single AI model for everything?

**A:** Different models excel at different tasks:
- GPT-4o is best at **analyzing** nuance and virality
- Claude 3.5 is best at **creative writing** and voice consistency
- ElevenLabs is best at **natural-sounding** TTS with voice cloning

Using the right tool for each job produces better output.

### Q: Why Cloudflare Workers instead of traditional backend?

**A:** Three reasons:
1. **Zero cold starts** – Workers respond instantly (no Lambda cold start delays)
2. **Global edge deployment** – Workers run in 200+ cities, closer to users
3. **Integrated frontend hosting** – Static assets served from same deployment

For video rendering, we use Modal (needs GPU), but the API layer is Workers.

### Q: How do you maintain persona consistency?

**A:** Three mechanisms:
1. **System prompts** define voice characteristics
2. **Few-shot examples** in prompts show style
3. **Validation tests** check output matches persona checklist

Example validation test:
```javascript
test('Gen Z script includes TikTok slang', () => {
  const script = generateScript(moment, 'gen_z');
  expect(script).toMatch(/\b(bestie|it's giving|I can't|deceased)\b/);
  expect(script).toMatch(/[💀🤯✨😤]/); // Contains emojis
});
```

### Q: What if the AI generates offensive content?

**A:** Multi-layer filtering:
1. **System prompt** explicitly forbids profanity and offensive content
2. **Post-generation filter** checks for banned words
3. **Human review** before publishing (in production, sample 10% of outputs)
4. **User reporting** allows community flagging

Code pattern:
```javascript
const BANNED_WORDS = ['list', 'of', 'words'];

function validateScript(script) {
  const hasBannedWords = BANNED_WORDS.some(word =>
    script.toLowerCase().includes(word)
  );

  if (hasBannedWords) {
    return { valid: false, reason: 'Contains inappropriate language' };
  }

  return { valid: true };
}
```

### Q: How much does it cost to run?

**A:** At 100 videos/day:
- **MVP (manual):** ~$0.03/video = $90/month
- **Production (automated):** ~$0.23/video = $700/month

Main costs:
- AI inference (70% of cost)
- Video rendering (20%)
- Storage and bandwidth (10%)

**Revenue model** (future):
- Sponsored content partnerships with brands
- Premium tier for custom personas
- White-label for other countries' parliaments

---

## What to Read Next

Depending on your role:

**If you're implementing the MVP:**
1. Read `IMPLEMENTATION.md` (phase-by-phase checklist)
2. Start with Phase 0 (prerequisites)
3. Follow TDD: write tests first, then implement
4. Deploy everything to a single Worker (static assets + API)

**If you're designing personas:**
1. Read `PERSONAS.md` (detailed voice guides)
2. Study the examples in this file
3. Test scripts by reading aloud

**If you're planning architecture:**
1. You're already done! This file has everything.
2. Review the Mental Models section
3. Check Cloudflare Workers static assets docs

**If you're demoing to investors:**
1. Read the "Example Production Output" section
2. Use the one-liner: "AI-powered TikTok content that makes Singapore Parliament understandable"
3. Show a pre-rendered video (most impactful)

---

## Final Mental Model: The Capless Philosophy

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
- ✅ The tech stack and why each piece was chosen
- ✅ How the personas work (with real examples)
- ✅ Mental models for the system architecture
- ✅ Development principles (TDD, config-driven, fail gracefully)
- ✅ Current repo state (docs done, code pending)
- ✅ What success looks like (example production output)

**Next step:**
Open `IMPLEMENTATION.md` and start Phase 0 (Prerequisites).

**Good luck building! 🚀**

---

**Questions?** Check the Common Questions section above.
**Stuck?** Re-read the relevant Mental Model.
**Need inspiration?** Review the Example Production Output.

**Remember:** Start small (MVP = 4 hours), iterate fast, test everything.
