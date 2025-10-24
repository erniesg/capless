# Capless Demo - MVP Deployment Plan

## 🎯 Goal
Build a working demo where users can:
1. Select a parliamentary session (22-09-2024)
2. Generate TikTok reaction videos (4 personas OR let AI decide)
3. Chat with session using RAG to find viral moments
4. View results: YouTube link + timestamp alongside generated reaction video

## 📊 MVP Scope
- **Single session**: 22-09-2024 (50 moments already extracted)
- **All 4 personas**: Gen Z, Kopitiam Uncle, Anxious Auntie, David Attenborough
- **Two modes**: "Generate TikTok" OR "Chat with Session"
- **Toolcall-based UI**: Dynamic interface generation
- **No YouTube embedding yet**: Just show link + timestamp

## 🏗️ Architecture

```
┌─────────────────────────────────────────────────────────────┐
│  FRONTEND (Cloudflare Workers Static Assets)                │
│  - Session selector (hardcoded: 22-09-2024)                 │
│  - Mode selector: [Generate TikTok] [Chat with Session]     │
│  - Toolcall-based dynamic UI rendering                      │
└───────────────────┬─────────────────────────────────────────┘
                    │
        ┌───────────┴───────────┐
        │                       │
┌───────▼──────────┐    ┌──────▼────────────┐
│ VIDEO GENERATION │    │   RAG/CHAT        │
│ WORKER           │    │   WORKER          │
│                  │    │                   │
│ - Persona select │    │ - Query session   │
│ - AI judging     │    │ - Recommend viral │
│ - Sora API       │    │ - Trigger video   │
│ - Workflows      │    │ - Redis vector    │
└──────┬───────────┘    └──────┬────────────┘
       │                       │
       └───────────┬───────────┘
                   │
       ┌───────────▼───────────┐
       │  EXISTING WORKERS     │
       │                       │
       │ - capless-ingest      │
       │ - moments             │
       │ - video-matcher       │
       └───────────────────────┘
```

## 🚀 MVP Critical Path (2 hours)

### Hour 1: Core Video Generation (Without Sora)
- [ ] Video generation worker scaffolding
- [ ] Script generation for 1-2 personas (Gen Z + Uncle)
- [ ] Mock video response (test without Sora)
- [ ] Test with 22-09-2024 moment data

### Hour 2: Frontend + Integration
- [ ] Workers static assets setup
- [ ] Basic UI: session selector + mode toggle
- [ ] Connect to video generation worker
- [ ] Display mock results side-by-side

## 📦 Deployment Order

**Phase 1: Backend** (parallel development)
1. Video generation worker
2. RAG/chat worker

**Phase 2: Frontend** (depends on Phase 1 APIs)
1. Static assets worker
2. UI components
3. Toolcall integration

**Phase 3: Integration** (sequential)
1. Wire up frontend → backend
2. End-to-end testing
3. Deploy all workers

## 🔗 Dependencies

### Video Generation Worker DEPENDS ON:
- ✅ Moments worker (already deployed)
- ✅ Voice DNA system (already implemented)
- ⚠️ Sora API integration (can mock for MVP)

### RAG/Chat Worker DEPENDS ON:
- ✅ Moments worker (already deployed)
- ✅ Vectorize embeddings (already in moments worker)
- ⚠️ Redis for caching (optional for MVP)

### Frontend DEPENDS ON:
- ⚠️ Video generation worker API
- ⚠️ RAG/chat worker API

## 🧪 Critical Tests (Minimal for Speed)

### Video Generation
- [ ] Generate script for Gen Z persona (1 moment)
- [ ] Generate script for Kopitiam Uncle (1 moment)
- [ ] AI judge picks best persona (2 scripts)
- [ ] Sora API call succeeds (or mock)
- [ ] Workflow creates job_id for polling

### RAG/Chat
- [ ] Query "which moment is most viral?" returns top moment
- [ ] Query "what did minister say about COE?" returns relevant moments
- [ ] Can trigger video generation from chat

### Frontend
- [ ] Page loads with session selector
- [ ] Mode toggle works (Generate vs Chat)
- [ ] Persona selector works (or "AI Decide")
- [ ] Results display correctly

## ⚡ Shortcuts for MVP

1. **Hardcode session**: Only 22-09-2024, skip date picker
2. **Mock Sora for now**: Return fake video URL, test integration later
3. **Skip YouTube fetching**: Use test data, don't call video-matcher yet
4. **Simple Redis**: Just cache, skip vector search for now
5. **No auth**: Public demo, add auth later

## 🎬 Post-MVP Enhancements

### Week 2
- [ ] Real Sora API integration
- [ ] YouTube video embedding (not just link)
- [ ] Multiple sessions support
- [ ] Redis vector search for RAG

### Week 3
- [ ] YouTube metadata ingestion (standalone)
- [ ] Advanced toolcalls (progressive disclosure)
- [ ] Analytics and monitoring
- [ ] Cost optimization

## 💰 Cost Estimates (MVP)

**Cloudflare Workers**: Free tier (100k requests/day)
**Sora API**: ~$0.20 per 15s video
**Claude Haiku**: ~$0.003 per request
**Redis**: ~$10/month (Upstash free tier)

**Total for 100 demos**: ~$25
