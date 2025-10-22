# Capless Pipeline Implementation Guide

This guide explains how to connect the 5 workers together with confidence, based on what we've already validated.

## ✅ What We Know Works (192 Tests)

### High Confidence Components

**1. Data Processing Logic** (187 unit tests)
- ✅ Hansard parsing and transformation
- ✅ Video matching confidence scoring
- ✅ Moment detection algorithms
- ✅ Script generation with personas
- ✅ Job queue management

**2. HTTP Endpoints** (5 integration tests)
- ✅ Request validation
- ✅ Error handling
- ✅ Response formatting
- ✅ Worker runtime behavior

### What Needs Testing

**3. Service Bindings** ❌
- Worker-to-worker calls
- Data flow between workers
- Error propagation

**4. External APIs** ❌
- YouTube, OpenAI, Anthropic, ElevenLabs
- Currently mocked in tests

---

## 🔗 Pipeline Architecture

```
┌─────────────┐      ┌─────────────┐      ┌─────────────┐
│  Ingestion  │─────▶│    Video    │─────▶│   Moments   │
│   Worker    │      │   Matcher   │      │   Worker    │
└─────────────┘      └─────────────┘      └─────────────┘
                                                  │
                                                  ▼
┌─────────────┐      ┌─────────────┐      ┌─────────────┐
│    Video    │◀─────│    Asset    │◀─────│   Moments   │
│ Compositor  │      │  Generator  │      │   Worker    │
└─────────────┘      └─────────────┘      └─────────────┘
```

**Data Flow**:
1. **Ingestion**: Parliament Hansard → Processed Transcript
2. **Video Matcher**: Transcript + YouTube → Matched Videos
3. **Moments**: Videos + Transcript → Viral Moments
4. **Asset Generator**: Moments → Script + Audio + Thumbnails
5. **Video Compositor**: Assets → Final TikTok Video

---

## 📋 Implementation Strategy: Incremental Confidence Building

### Phase 1: Add Integration Tests for Each Worker ⚠️ (NEXT STEP)

**Goal**: Test all worker endpoints with mocked external APIs

#### Step 1.1: Video Matcher Integration Tests

```typescript
// tests/integration-vitest/video-matcher.test.ts

import { describe, it, expect } from "vitest";
import { fetchMock, SELF } from "cloudflare:test";

describe("Video Matcher Integration", () => {
  it("should match videos by sitting date", async () => {
    // Mock YouTube API response
    fetchMock
      .get("https://www.googleapis.com/youtube/v3")
      .intercept({ path: (p) => p.includes("/search") })
      .reply(200, JSON.stringify({
        items: [
          {
            id: { videoId: "abc123" },
            snippet: {
              title: "Parliament Session 2 July 2024",
              publishedAt: "2024-07-02T10:00:00Z",
            },
          },
        ],
      }));

    const response = await SELF.fetch("http://localhost/api/match", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        sittingDate: "02-07-2024",
        keywords: ["budget", "economy"],
      }),
    });

    expect(response.status).toBe(200);
    const data = await response.json();
    expect(data.matches).toBeDefined();
    expect(data.matches.length).toBeGreaterThan(0);
  });
});
```

**Confidence Gained**: ✅ Video Matcher HTTP endpoint works correctly

#### Step 1.2: Moments Worker Integration Tests

```typescript
// tests/integration-vitest/moments.test.ts

describe("Moments Worker Integration", () => {
  it("should detect viral moments from transcript", async () => {
    // Mock OpenAI API
    fetchMock
      .post("https://api.openai.com")
      .intercept({ path: (p) => p.includes("/chat/completions") })
      .reply(200, JSON.stringify({
        choices: [{
          message: {
            content: JSON.stringify({
              moments: [
                {
                  start_time: 0,
                  end_time: 30,
                  engagement_score: 9.5,
                  viral_potential: "high",
                },
              ],
            }),
          },
        }],
      }));

    const response = await SELF.fetch("http://localhost/api/detect-moments", {
      method: "POST",
      body: JSON.stringify({
        transcript: "PM Lee speaks about economy...",
        videoId: "abc123",
      }),
    });

    expect(response.status).toBe(200);
    const data = await response.json();
    expect(data.moments).toBeDefined();
  });
});
```

**Confidence Gained**: ✅ Moments Worker HTTP endpoint works

#### Step 1.3: Asset Generator Integration Tests

```typescript
// tests/integration-vitest/asset-generator.test.ts

describe("Asset Generator Integration", () => {
  it("should generate script, audio, and thumbnails", async () => {
    // Mock multiple APIs (OpenAI, ElevenLabs)
    // ... mock setup ...

    const response = await SELF.fetch("http://localhost/api/generate-assets", {
      method: "POST",
      body: JSON.stringify({
        moment: {
          start_time: 0,
          end_time: 30,
          transcript: "The economy is doing well",
        },
        persona: "gen_z",
      }),
    });

    expect(response.status).toBe(200);
    const data = await response.json();
    expect(data.script).toBeDefined();
    expect(data.audio_url).toBeDefined();
    expect(data.thumbnail_url).toBeDefined();
  });
});
```

**Confidence Gained**: ✅ Asset Generator HTTP endpoint works

#### Step 1.4: Video Compositor Integration Tests

```typescript
// tests/integration-vitest/video-compositor.test.ts

describe("Video Compositor Integration", () => {
  it("should queue video composition job", async () => {
    const response = await SELF.fetch("http://localhost/api/compose", {
      method: "POST",
      body: JSON.stringify({
        assets: {
          video_url: "https://r2.example.com/video.mp4",
          audio_url: "https://r2.example.com/audio.mp3",
          captions: [{ text: "Hello", start: 0, end: 2 }],
        },
        platform: "tiktok",
      }),
    });

    expect(response.status).toBe(200);
    const data = await response.json();
    expect(data.job_id).toBeDefined();
    expect(data.status).toBe("queued");
  });
});
```

**Confidence Gained**: ✅ Video Compositor HTTP endpoint works

---

### Phase 2: Add Service Binding Tests ⚠️ (AFTER PHASE 1)

**Goal**: Test worker-to-worker communication

```typescript
// tests/integration-vitest/service-bindings.test.ts

describe("Service Binding Tests", () => {
  it("should call Asset Generator → Moments service binding", async () => {
    // Configure MOMENTS service binding in vitest.config.ts
    const response = await env.MOMENTS.fetch("http://localhost/api/detect-moments", {
      method: "POST",
      body: JSON.stringify({ /* ... */ }),
    });

    expect(response.status).toBe(200);
  });
});
```

**How to configure service bindings in tests**:

```typescript
// vitest.config.ts
export default defineWorkersConfig({
  test: {
    poolOptions: {
      workers: {
        wrangler: {
          configPath: "./workers/asset-generator/wrangler.toml",
        },
        miniflare: {
          serviceBindings: {
            MOMENTS: async (request) => {
              // Mock the MOMENTS worker response
              return new Response(JSON.stringify({
                moments: [/* ... */],
              }));
            },
          },
        },
      },
    },
  },
});
```

**Confidence Gained**: ✅ Workers can communicate with each other

---

### Phase 3: Manual End-to-End Testing 🎯 (DEPLOY TIME)

**Goal**: Verify entire pipeline with real APIs in staging

#### Setup Required:

1. **Create Cloudflare Resources**:
   ```bash
   # Create R2 bucket
   wrangler r2 bucket create capless-staging

   # Create KV namespace
   wrangler kv:namespace create "REDIS" --preview
   ```

2. **Set API Keys**:
   ```bash
   cd workers/video-matcher
   wrangler secret put YOUTUBE_API_KEY --env staging
   wrangler secret put UPSTASH_REDIS_REST_URL --env staging
   wrangler secret put UPSTASH_REDIS_REST_TOKEN --env staging

   cd ../moments
   wrangler secret put OPENAI_API_KEY --env staging
   wrangler secret put ANTHROPIC_API_KEY --env staging

   cd ../asset-generator
   wrangler secret put OPENAI_API_KEY --env staging
   wrangler secret put ANTHROPIC_API_KEY --env staging
   wrangler secret put ELEVENLABS_API_KEY --env staging

   cd ../video-compositor
   wrangler secret put MODAL_API_KEY --env staging
   ```

3. **Deploy to Staging**:
   ```bash
   ./scripts/deploy-all-staging.sh
   ```

4. **Test End-to-End**:
   ```bash
   # Trigger full pipeline
   curl -X POST https://capless-ingest-staging.workers.dev/api/ingest/hansard \
     -H "Content-Type: application/json" \
     -d '{"sittingDate": "02-07-2024"}'
   ```

**Confidence Gained**: ✅ Full pipeline works with real APIs

---

## 🎯 Recommended Next Steps

### Option A: **Add More Integration Tests** (Recommended)

**Why**: Get confidence in ALL worker endpoints before connecting them

**Steps**:
1. Add integration tests for remaining 4 workers (video-matcher, moments, asset-generator, video-compositor)
2. Add service binding tests
3. Run full test suite: `npm run test:all`

**Outcome**:
- ~220+ tests total
- High confidence in all worker endpoints
- Can connect workers with assurance

### Option B: **Deploy to Staging and Manual Test** (Faster but riskier)

**Why**: Want to see it work end-to-end quickly

**Steps**:
1. Get API keys for all services
2. Deploy to staging environment
3. Test manually with real Parliament data
4. Fix issues as they arise

**Outcome**:
- See full pipeline working
- Identify integration issues quickly
- Higher risk of production bugs

### Option C: **Hybrid Approach** (Balanced)

**Why**: Best of both worlds

**Steps**:
1. Add integration tests for 1-2 critical workers (e.g., video-matcher, asset-generator)
2. Deploy to staging with those workers
3. Test pipeline incrementally
4. Add more tests as you find issues

**Outcome**:
- Progressive confidence building
- Catch issues early with tests
- See results quickly with manual testing

---

## 💡 My Recommendation

**Go with Option C (Hybrid)**:

1. **This Week**: Add integration tests for Video Matcher + Asset Generator (2 most complex)
2. **Next Week**: Deploy to staging, test Ingestion → Video Matcher → Moments flow
3. **Following Week**: Add remaining integration tests based on what broke in staging

This gives you:
- ✅ Tests for critical components
- ✅ Early visibility into real integration issues
- ✅ Ability to course-correct based on real data
- ✅ Progressive confidence building

---

## 📊 Current vs Target Test Coverage

```
Current:  192 tests (187 unit + 5 integration)
Phase 1:  ~230 tests (+38 integration tests for remaining workers)
Phase 2:  ~240 tests (+10 service binding tests)
Target:   ~250 tests (full pipeline coverage)
```

**Current Confidence**: 80% (logic works, endpoints partially tested)
**Target Confidence**: 95% (all endpoints + service bindings tested)

---

## 🚀 Getting Started

### Quick Win: Add Video Matcher Integration Tests

```bash
# 1. Create test file
touch tests/integration-vitest/video-matcher.test.ts

# 2. Follow pattern from ingestion.test.ts:
#    - Mock external APIs with fetchMock
#    - Test HTTP endpoints
#    - Validate responses

# 3. Run tests
npm run test:integration

# 4. Commit when passing
git add .
git commit -m "test: add Video Matcher integration tests"
```

### Need Help?

Each worker has documentation:
- `workers/video-matcher/README.md` - API endpoints
- `workers/moments/README.md` - Moment detection logic
- `workers/asset-generator/README.md` - Asset generation flow
- `workers/video-compositor/README.md` - Video composition

---

## Questions to Ask Yourself

1. **How much confidence do I need before deploying?**
   - High (95%+) → Add all integration tests first
   - Medium (80%+) → Hybrid approach
   - Just want to see it work → Deploy to staging now

2. **How much time do I have?**
   - 1-2 weeks → Add integration tests incrementally
   - A few days → Deploy and test manually
   - Today → Deploy and fix issues live

3. **What's the risk tolerance?**
   - Production system → Need 95%+ test coverage
   - Side project → 80% is fine, learn from staging
   - Prototype → Just deploy and iterate

---

## Conclusion

**You're in a great position**:
- ✅ 192 tests passing gives solid foundation
- ✅ Logic correctness is validated
- ⚠️ Need to add worker endpoint tests for remaining 4 workers
- ⚠️ Need to test service bindings between workers
- ❌ Real API integration not tested yet (but logic is sound)

**Bottom line**: You can start connecting workers NOW with reasonable confidence. The logic works. You just need to test the HTTP endpoints and service bindings to be certain about the integration layer.

**Want me to help you add integration tests for Video Matcher next?** 🚀
