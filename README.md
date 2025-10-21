# Capless

**AI-powered TikTok content that makes Singapore Parliament understandable**

Transform dense parliamentary proceedings into viral social media commentary with AI personas.

---

## Quick Overview

**Problem:** Parliamentary proceedings are boring, dense, and inaccessible to 90% of Singaporeans.

**Solution:** AI extracts viral moments from Hansard transcripts, generates persona-driven commentary, and creates TikTok-ready videos.

**Vision:** Make civic engagement accessible through entertainment.

---

## Tech Stack

- **Orchestration:** Cloudflare Workflows (durable execution with retry logic)
- **Compute:** Cloudflare Workers (zero cold starts, serves API + frontend via static assets)
- **State:** Durable Objects (job coordination) + Redis (caching/queuing)
- **AI:** OpenAI GPT-4o (moments), Anthropic Claude 3.5 (scripts), ElevenLabs (voice)
- **Video:** Remotion (React) rendered on Modal (serverless GPU)
- **Storage:** Cloudflare R2 (zero egress fees), Vectorize (semantic search)

**Cost:** ~$0.17 per video at scale (100 videos/day = $515/month)

---

## Architecture: 10 Atomic Services

```
Hansard JSON → [Ingest] → [Embeddings] + [Video Matcher] + [Moments]
                    ↓
              [Scripts (4 personas)] → [Audio] → [Video] → [Publisher]
```

Each worker is independently deployable with atomic endpoints. Cloudflare Workflows orchestrates the pipeline.

**Full architecture:** See [ARCHITECTURE.md](./ARCHITECTURE.md)

---

## The 4 AI Personas (Voice DNA System)

1. **StraightTok AI** (Gen Z): Truth-telling jester, TikTok slang, calls out BS
2. **Kopitiam Uncle** (Cynical Singaporean): Street wisdom, Singlish-heavy, practical
3. **Anxious Auntie** (Kiasu worrier): Family-first, cascading concerns, must prepare
4. **Attenborough Observer** (Documentary narrator): Detached anthropologist, subtle irony

**Not checklists** - we use **Voice DNA** to capture psychological/cognitive architecture.

**Full system:** See [PERSONAS.md](./PERSONAS.md)

---

## Quick Start

### Test with Real Data (NO API keys needed!)
```bash
./scripts/test-live.sh
# ✅ Fetches real Hansard JSON (137 sections, 98 MPs)
# ✅ Verifies all workers built
# ✅ Runs in 10 seconds
```

### Run Ingestion Worker Locally
```bash
cd workers/capless-ingest
npm install && npm run dev

# Test with real Hansard:
curl -X POST http://localhost:8787/api/ingest/hansard \
  -d '{"sittingDate": "02-07-2024"}' | jq
```

### Deploy to Production
```bash
# 1. Setup (one-time)
npm install -g wrangler && wrangler login
wrangler r2 bucket create capless

# 2. Add secrets (optional - only for YouTube/OpenAI features)
wrangler secret put YOUTUBE_API_KEY     # For video matching
wrangler secret put OPENAI_API_KEY      # For moment extraction

# 3. Deploy
cd workers/capless-ingest && wrangler deploy
```

---

## Documentation

| File | Purpose |
|------|---------|
| [INIT.md](./INIT.md) | **START HERE** - High-level guide, philosophy, mental models |
| [ARCHITECTURE.md](./ARCHITECTURE.md) | Technical specs: 10 workers, state management, deployment |
| [PERSONAS.md](./PERSONAS.md) | Voice DNA system for 4 personas |
| [IMPLEMENTATION.md](./IMPLEMENTATION.md) | Phase-by-phase build guide with TDD |

---

## Current Status (2025-10-21)

**Architecture:** ✅ Complete (ARCHITECTURE.md - 10 atomic workers specified)
**Personas:** ✅ Voice DNA system designed (PERSONAS.md - checklists replaced)
**Workers Built:** ✅ 3/10 workers production-ready
**Tests:** ✅ 98/98 passing (100%)

### Built Workers:
1. **Ingestion Worker** - 59/59 tests ✅ | Fetches real Hansard JSON
2. **Video Matcher** - 39/39 tests ✅ | YouTube API integration
3. **Moments Worker** - All tests ✅ | GPT-4o viral detection

**Live Test:** `./scripts/test-live.sh` works with real Singapore Parliament data (NO API keys needed!)

**Next:** Script Generator Worker (Voice DNA → 4 personas)

---

## Example Pipeline

**Input:** Hansard transcript about insurance premiums rising

**Output (38 seconds):**
1. Viral moment extracted: "Minister describes it as a 'knot'"
2. Gen Z script generated: "Ma'am, this is not a knot, this is a full situationship with commitment issues 💀"
3. Audio: Young female voice, 1.2x speed
4. Video: 9:16 vertical, Parliament clip background, word-by-word captions
5. Published to R2 (future: auto-publish to TikTok/Instagram)

---

## Development Principles

1. **Atomic Services** - Every worker independently deployable
2. **Test-Driven** - Write tests first, then implement
3. **Config-Driven** - Behavior changes via YAML, not code
4. **Fail Gracefully** - Multiple fallback strategies
5. **Commit Often** - After each test, feature, refactor

---

## The Capless Philosophy

Most political commentary is either **accurate but boring** or **viral but misleading**.

Capless aims for the sweet spot: **Entertaining + Accurate + Educational**

*"If people understand 60% of a political issue and share it with 10 friends, that's better than understanding 100% and sharing with nobody."*

---

## License

MIT

---

**Ready to build?** Start with [INIT.md](./INIT.md)
