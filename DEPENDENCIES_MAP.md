# Capless Demo - Dependencies & Integration Map

## 🗺️ Dependency Graph

```
┌─────────────────────────────────────────────────────────────┐
│                  EXISTING INFRASTRUCTURE                     │
│  ✅ DEPLOYED & WORKING                                       │
└─────────────────────────────────────────────────────────────┘

┌───────────────┐  ┌───────────────┐  ┌───────────────┐
│ capless-      │  │ moments       │  │ video-        │
│ ingest        │  │               │  │ matcher       │
│               │  │               │  │               │
│ Fetches       │  │ Extracts      │  │ Matches       │
│ transcripts   │  │ viral moments │  │ YouTube       │
│               │  │               │  │ videos        │
└───────┬───────┘  └───────┬───────┘  └───────┬───────┘
        │                  │                  │
        │ R2: transcripts/ │ R2: moments/     │ R2: videos/
        │ Redis: 1h TTL    │ Redis: 24h TTL   │ Redis: 6h TTL
        │ Vectorize: ❌    │ Vectorize: ✅    │ Vectorize: ❌
        │                  │                  │
        └──────────────────┴──────────────────┘
                           │
                  ┌────────▼────────┐
                  │  SHARED DATA    │
                  │                 │
                  │ R2 Bucket:      │
                  │ capless-preview │
                  │                 │
                  │ - transcripts/  │
                  │ - moments/      │
                  │ - videos/       │
                  └─────────────────┘


┌─────────────────────────────────────────────────────────────┐
│                  NEW WORKERS (TO BUILD)                      │
│  ⚠️ REQUIRES IMPLEMENTATION                                  │
└─────────────────────────────────────────────────────────────┘

┌───────────────┐  ┌───────────────┐  ┌───────────────┐
│ VIDEO         │  │ RAG/CHAT      │  │ FRONTEND      │
│ GENERATOR     │  │               │  │               │
│               │  │               │  │               │
│ Generates     │  │ Chat with     │  │ User          │
│ TikTok videos │  │ session via   │  │ interface     │
│ with Sora     │  │ RAG           │  │               │
└───────┬───────┘  └───────┬───────┘  └───────┬───────┘
        │                  │                  │
        │                  │                  │
        │ DEPENDS ON:      │ DEPENDS ON:      │ DEPENDS ON:
        │ ✅ moments       │ ✅ moments       │ ⚠️ video-gen
        │ ✅ voice-dna     │ ✅ Vectorize     │ ⚠️ rag-chat
        │ ⚠️ Sora API      │ ⚠️ Redis         │
        │ ⚠️ Workflows     │                  │
        │                  │                  │
        └──────────────────┴──────────────────┘
```

## 🔗 Integration Points

### 1. Video Generator Worker

**CONSUMES**:
- `moments` worker → GET `/api/moments/:transcript_id` (R2 fallback)
- `Voice DNA` → script generation prompts (already in codebase)

**PRODUCES**:
- KV: `VIDEO_JOBS` → job status tracking
- R2: `videos/generated/:job_id.mp4` → generated videos
- API: `/api/video/generate` → accepts requests
- API: `/api/video/status/:job_id` → polling endpoint

**DEPENDENCIES**:
- ✅ Moments data (already in R2)
- ✅ Voice DNA system (already implemented)
- ⚠️ OpenAI Sora API (needs API key + integration)
- ⚠️ Cloudflare Workflows (needs setup)

**CAN BE DEVELOPED IN PARALLEL**: Yes (mock Sora responses)

---

### 2. RAG/Chat Worker

**CONSUMES**:
- `moments` worker → Vectorize index for semantic search
- R2: `moments/parliament-22-09-2024.json` → moment data

**PRODUCES**:
- API: `/api/chat` → chat endpoint with toolcalls
- API: `/api/moments/:transcript_id` → list moments (convenience)
- KV: `CONVERSATIONS` → conversation history (optional)

**DEPENDENCIES**:
- ✅ Vectorize index (already populated by moments worker)
- ✅ Moment embeddings (already generated)
- ⚠️ Redis (optional, can use KV instead)
- ⚠️ Anthropic Claude API (for chat)

**CAN BE DEVELOPED IN PARALLEL**: Yes (independent of video-gen)

---

### 3. Frontend Worker

**CONSUMES**:
- `video-generator` → `/api/video/generate` + `/api/video/status/:job_id`
- `rag-chat` → `/api/chat`

**PRODUCES**:
- Static HTML/CSS/JS → user interface
- Polling logic → checks video status

**DEPENDENCIES**:
- ⚠️ Video generator API must be available (or mock)
- ⚠️ RAG/chat API must be available (or mock)

**CAN BE DEVELOPED IN PARALLEL**: Yes (with mocked API responses)

---

## 🚦 Parallel Development Strategy

### Phase 1: Backend Workers (Parallel)

**Team A: Video Generation** (2 hours)
```bash
# Start immediately
cd workers/video-generator
npm init -y
# Focus on script generation first
# Mock Sora responses for testing
```

**Team B: RAG/Chat** (2 hours)
```bash
# Start immediately
cd workers/rag-chat
npm init -y
# Use existing Vectorize index
# Focus on toolcalls structure
```

**Coordination Point**:
- Share TypeScript types for moments data
- Agree on API response formats
- Both use same R2 bucket structure

---

### Phase 2: Frontend (Depends on Phase 1 APIs)

**Wait for**: Backend APIs to be deployed (or use mocks)

**Development** (2 hours):
```bash
cd workers/capless-frontend
npm create cloudflare@latest
# Use mock API responses initially
# Switch to real APIs when ready
```

**Integration Points**:
- Video generation: POST `/api/video/generate` + polling
- Chat: POST `/api/chat` + toolcall rendering

---

### Phase 3: Integration & Testing (Sequential)

1. Deploy video-generator
2. Deploy rag-chat
3. Update frontend with production URLs
4. Deploy frontend
5. End-to-end testing

---

## 📊 Data Flow Diagram

```
USER INPUT
    │
    ├─── MODE: Generate TikTok
    │    │
    │    ├─ 1. SELECT MOMENT (frontend)
    │    │      ↓
    │    │   GET /api/moments/parliament-22-09-2024 (rag-chat OR R2 direct)
    │    │      ↓
    │    ├─ 2. SELECT PERSONA (frontend)
    │    │      ↓
    │    ├─ 3. POST /api/video/generate (video-generator)
    │    │      ├─ Fetch moment from R2
    │    │      ├─ Generate script(s) using Voice DNA
    │    │      ├─ If ai_decide: Judge with Claude
    │    │      ├─ Call Sora API (async)
    │    │      └─ Return job_id
    │    │      ↓
    │    ├─ 4. POLL STATUS (frontend)
    │    │      ↓
    │    │   GET /api/video/status/:job_id
    │    │      ├─ Check KV for status
    │    │      └─ Return: processing | completed | failed
    │    │      ↓
    │    └─ 5. DISPLAY RESULTS (frontend)
    │         ├─ YouTube link + timestamp
    │         └─ Generated video URL
    │
    └─── MODE: Chat with Session
         │
         ├─ 1. USER TYPES QUERY (frontend)
         │      ↓
         ├─ 2. POST /api/chat (rag-chat)
         │      ├─ Generate query embedding
         │      ├─ Search Vectorize index
         │      ├─ Execute toolcalls:
         │      │   ├─ search_moments
         │      │   ├─ get_most_viral
         │      │   └─ generate_video (calls video-gen)
         │      └─ Return: message + toolcalls + suggestions
         │      ↓
         └─ 3. RENDER RESPONSE (frontend)
              ├─ Display message
              ├─ Show moment cards
              ├─ Render suggestions as buttons
              └─ If video generated: poll status
```

---

## 🔑 Shared Resources

### R2 Bucket Structure
```
capless-preview/
├── hansard/
│   └── raw/                    # From parliament-scraper
│       └── 22-09-2024.json
├── transcripts/
│   └── processed/              # From capless-ingest
│       └── parliament-22-09-2024.json
├── moments/                    # From moments worker
│   └── parliament-22-09-2024.json
└── videos/
    └── generated/              # From video-generator (NEW)
        └── job-1234567890.mp4
```

### Vectorize Index
```
MOMENTS_INDEX
├── Vectors: embeddings generated by moments worker
├── Metadata: moment_id, quote, speaker, virality_score, topic
└── Used by: rag-chat worker for semantic search
```

### KV Namespaces
```
VIDEO_JOBS (video-generator)
├── Key: job:{job_id}
└── Value: { status, request, scripts, video_url, ... }

CONVERSATIONS (rag-chat, optional)
├── Key: conv:{conversation_id}
└── Value: { messages[], created_at, updated_at }
```

---

## ✅ Integration Checklist

### Before Starting Development

**Data Verification**:
- [ ] Confirm moments for 22-09-2024 exist in R2
- [ ] Verify Vectorize index has embeddings
- [ ] Check voice-dna.ts is available in asset-generator worker

**API Keys**:
- [ ] OpenAI API key (for Sora + embeddings)
- [ ] Anthropic API key (for Claude Haiku + chat)
- [ ] Upstash Redis credentials (optional)

**Cloudflare Setup**:
- [ ] R2 bucket `capless-preview` accessible
- [ ] Vectorize index `MOMENTS_INDEX` ready
- [ ] KV namespaces created

---

### During Development

**Video Generator → RAG/Chat Communication**:
- [ ] Share TypeScript types for `Moment` interface
- [ ] Agree on video job status schema
- [ ] Document API contracts

**Backend → Frontend Communication**:
- [ ] Video generator exposes CORS headers
- [ ] RAG/chat exposes CORS headers
- [ ] Frontend knows production URLs

---

### Integration Testing

**Backend Integration**:
- [ ] Video generator can fetch moments from R2
- [ ] RAG/chat can query Vectorize index
- [ ] RAG/chat can trigger video generation

**Frontend Integration**:
- [ ] Frontend can call video-generator API
- [ ] Frontend can call rag-chat API
- [ ] Polling works across workers
- [ ] Results display correctly

**End-to-End**:
- [ ] Full generate flow: select → generate → poll → display
- [ ] Full chat flow: query → moments → suggest → generate → display
- [ ] Error handling: failed generation, no moments found, etc.

---

## 🚨 Critical Blockers

### MUST HAVE (P0)

1. **Moments data in R2** (22-09-2024)
   - ✅ Already exists (50 moments extracted)

2. **Voice DNA system** (persona prompts)
   - ✅ Already implemented in `workers/asset-generator/src/personas/voice-dna.ts`

3. **Vectorize index** (for chat/RAG)
   - ✅ Already populated by moments worker

4. **OpenAI API key** (Sora + embeddings)
   - ⚠️ Need to obtain and set in secrets

5. **Anthropic API key** (Claude for chat)
   - ⚠️ Need to obtain and set in secrets

### NICE TO HAVE (P1)

1. **YouTube video metadata**
   - ⚠️ Can skip for MVP (just show link + timestamp)

2. **Redis for caching**
   - ⚠️ Can use KV instead for MVP

3. **Cloudflare Workflows**
   - ⚠️ Can use simple async + webhooks for MVP

---

## 📞 Integration Points Summary

| From | To | Endpoint | Data | Dependency |
|------|----|----|------|-----------|
| Frontend | Video-Gen | POST /api/video/generate | { moment_id, persona } | API must be deployed |
| Frontend | Video-Gen | GET /api/video/status/:job_id | - | API must be deployed |
| Frontend | RAG/Chat | POST /api/chat | { message, session_id } | API must be deployed |
| Video-Gen | R2 | GET moments/parliament-22-09-2024.json | - | ✅ Data exists |
| Video-Gen | Sora API | POST /v1/video/generations | { prompt, duration } | ⚠️ API key needed |
| RAG/Chat | Vectorize | query(embedding, topK) | - | ✅ Index ready |
| RAG/Chat | Video-Gen | POST /api/video/generate | { moment_id, persona } | Video-Gen must be deployed |

---

## ⏱️ Estimated Timeline

| Phase | Duration | Can Parallelize? |
|-------|----------|------------------|
| Video Generator (basic) | 2h | ✅ Yes |
| RAG/Chat (basic) | 2h | ✅ Yes (with Video-Gen) |
| Frontend (basic) | 2h | ⚠️ After APIs ready (or use mocks) |
| Integration | 1h | ❌ No (sequential) |
| Testing | 1h | ❌ No (sequential) |

**Total with parallel development**: ~4-5 hours
**Total sequential**: ~8 hours

---

## 🎯 MVP Success Criteria

1. **User can generate a video**:
   - Select moment
   - Choose persona (or AI decide)
   - Get video URL after polling

2. **User can chat with session**:
   - Ask natural language question
   - Get relevant moments
   - Can trigger video from chat

3. **Results display**:
   - YouTube link + timestamp
   - Generated video (or download link)
   - Script preview

**Out of scope for MVP**:
- Multi-session support
- YouTube video embedding
- Advanced toolcalls
- Conversation history
- Real-time updates (WebSocket)
