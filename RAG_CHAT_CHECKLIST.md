# RAG/Chat Worker - Implementation Checklist

## 🎯 Objective
Build a Cloudflare Worker that enables natural language chat with parliamentary sessions, recommends viral moments, and can trigger video generation.

## 📋 Core Requirements
- Accept natural language queries about sessions
- Use Redis vector search OR Cloudflare Vectorize for semantic search
- Can recommend "most viral" moments
- Can trigger video generation from chat interface
- Toolcall-based responses for dynamic UI

---

## 🏗️ Setup & Scaffolding

### Worker Structure
- [ ] Create `workers/rag-chat/` directory
- [ ] Initialize `wrangler.toml` with bindings:
  - [ ] R2 bucket: `capless-preview` (read transcripts + moments)
  - [ ] Vectorize index: `MOMENTS_INDEX` (semantic search)
  - [ ] Redis: `UPSTASH_REDIS_REST_URL` + `UPSTASH_REDIS_REST_TOKEN`
  - [ ] Secrets: `ANTHROPIC_API_KEY`, `OPENAI_API_KEY`
- [ ] Install dependencies: `hono`, `zod`, `ai` (Vercel AI SDK for toolcalls)

**Critical Test**:
```bash
npx wrangler dev
curl http://localhost:8787/health
# Expected: { "status": "healthy", "vectorize_connected": true }
```

---

## 🔍 Vector Search Integration

### Option A: Cloudflare Vectorize (RECOMMENDED)
- [ ] Use existing Vectorize index from moments worker
- [ ] moments worker already creates embeddings: `workers/moments/src/index.ts:207-226`
- [ ] Query interface:
```typescript
async function searchMoments(query: string, limit: number = 10) {
  // Generate embedding for query
  const embedding = await generateEmbedding(query);

  // Search Vectorize
  const results = await env.VECTORIZE.query(embedding, {
    topK: limit,
    returnMetadata: true,
  });

  return results.matches.map(match => ({
    moment_id: match.id,
    score: match.score,
    quote: match.metadata.quote,
    speaker: match.metadata.speaker,
    virality_score: match.metadata.virality_score,
  }));
}
```

### Option B: Redis Vector Search (Alternative)
- [ ] Use Redis FT.CREATE for index
- [ ] Store embeddings with HSET
- [ ] Query with FT.SEARCH
- [ ] **Skip for MVP** (Vectorize is simpler)

**Critical Tests**:
- [ ] Query "which minister spoke about COE?"
  - [ ] Returns relevant moments (Transport Minister)
  - [ ] Similarity score > 0.7
- [ ] Query "most viral moment"
  - [ ] Returns top moment by virality_score
  - [ ] Includes quote + context

---

## 💬 Chat Interface with Toolcalls

### Toolcall Structure
Using Vercel AI SDK for structured toolcalls:

```typescript
import { generateText, tool } from 'ai';

const tools = {
  search_moments: tool({
    description: 'Search for moments in the session by keyword or topic',
    parameters: z.object({
      query: z.string().describe('Natural language query'),
      limit: z.number().default(5),
    }),
    execute: async ({ query, limit }) => {
      return await searchMoments(query, limit);
    },
  }),

  get_most_viral: tool({
    description: 'Get the most viral moments from the session',
    parameters: z.object({
      limit: z.number().default(3),
      topic: z.string().optional().describe('Filter by topic'),
    }),
    execute: async ({ limit, topic }) => {
      // Query moments sorted by virality_score
      const moments = await getMomentsByVirality(limit, topic);
      return moments;
    },
  }),

  generate_video: tool({
    description: 'Generate a TikTok reaction video for a moment',
    parameters: z.object({
      moment_id: z.string(),
      persona: z.enum(['gen_z', 'kopitiam_uncle', 'auntie', 'attenborough', 'ai_decide']),
    }),
    execute: async ({ moment_id, persona }) => {
      // Call video generation worker
      const response = await fetch('https://capless-video-generator.erniesg.workers.dev/api/video/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ moment_id, persona }),
      });
      return await response.json();
    },
  }),
};
```

### System Prompt
```typescript
const SYSTEM_PROMPT = `
You are a helpful assistant that helps users explore Singapore Parliament sessions.

Available data for this session (22-09-2024):
- 50 viral moments extracted from debate
- Topics: COE policy, Gaza/Palestine, PWM wages, climate, elderly welfare
- Speakers: Ministers, Opposition MPs, NTUC leaders

When users ask questions:
1. Use search_moments for specific topics/speakers
2. Use get_most_viral when they want recommendations
3. Suggest generate_video when they find an interesting moment

Be conversational, informative, and proactive in suggesting video generation.
`;
```

**Critical Tests**:
- [ ] User: "Which minister spoke about COE policy?"
  - [ ] Uses `search_moments` tool
  - [ ] Returns Transport Minister quotes
  - [ ] Suggests generating video
- [ ] User: "What's the most viral moment?"
  - [ ] Uses `get_most_viral` tool
  - [ ] Returns top 3 moments
  - [ ] Offers to generate video
- [ ] User: "Generate a Gen Z reaction to the COE moment"
  - [ ] Uses `generate_video` tool
  - [ ] Returns job_id
  - [ ] Provides polling URL

---

## 🌐 API Endpoints

### POST /api/chat
```typescript
Request:
{
  session_id: "parliament-22-09-2024",
  message: "Which minister spoke about COE?",
  conversation_id?: "conv-123" // for multi-turn
}

Response:
{
  conversation_id: "conv-123",
  message: "Transport Minister spoke extensively about COE policy...",
  toolcalls: [
    {
      tool: "search_moments",
      arguments: { query: "COE minister", limit: 5 },
      result: [
        {
          moment_id: "moment-1761235148185-v2u78ypyb",
          quote: "It is challenging for the government to allocate COEs...",
          speaker: "Transport Minister",
          virality_score: 10
        }
      ]
    }
  ],
  suggestions: [
    {
      type: "action",
      label: "Generate Gen Z reaction",
      action: {
        tool: "generate_video",
        arguments: {
          moment_id: "moment-1761235148185-v2u78ypyb",
          persona: "gen_z"
        }
      }
    }
  ]
}
```

### GET /api/chat/history/:conversation_id
```typescript
Response:
{
  conversation_id: "conv-123",
  messages: [
    { role: "user", content: "Which minister spoke about COE?" },
    { role: "assistant", content: "...", toolcalls: [...] },
    { role: "user", content: "Generate a video" },
    { role: "assistant", content: "...", toolcalls: [...] }
  ]
}
```

**Critical Tests**:
- [ ] POST /api/chat with simple query
  - [ ] Returns relevant answer
  - [ ] Includes toolcall results
  - [ ] Provides suggestions
- [ ] Multi-turn conversation
  - [ ] Follow-up question uses context
  - [ ] Can reference previous toolcalls
- [ ] Video generation from chat
  - [ ] Assistant suggests video
  - [ ] User confirms
  - [ ] Returns job_id

---

## 📊 Moment Ranking & Filtering

### Virality-Based Ranking
```typescript
async function getMomentsByVirality(
  limit: number,
  topic?: string,
  minScore: number = 7.0
) {
  // Get moments from R2
  const momentsKey = 'moments/parliament-22-09-2024.json';
  const object = await env.R2.get(momentsKey);
  const data = await object.json();

  let moments = data.moments;

  // Filter by topic if provided
  if (topic) {
    moments = moments.filter(m =>
      m.topic.toLowerCase().includes(topic.toLowerCase())
    );
  }

  // Filter by minimum virality score
  moments = moments.filter(m => m.virality_score >= minScore);

  // Sort by virality_score descending
  moments.sort((a, b) => b.virality_score - a.virality_score);

  return moments.slice(0, limit);
}
```

### Topic-Based Filtering
- [ ] Extract unique topics from moments
- [ ] Allow filtering by topic
- [ ] Support fuzzy matching (e.g., "COE" matches "COE policy and fairness")

**Critical Tests**:
- [ ] Get top 3 viral moments
  - [ ] Returns moments with scores 10, 10, 10
  - [ ] Sorted by virality_score
- [ ] Filter by topic "COE"
  - [ ] Returns only COE-related moments
  - [ ] Still sorted by virality
- [ ] Minimum score threshold
  - [ ] minScore=9.0 returns fewer moments
  - [ ] All returned moments >= 9.0

---

## 🧠 Conversation Context Management

### Conversation Storage (Redis/KV)
- [ ] Store conversation history in KV
- [ ] Key: `conv:{conversation_id}`
- [ ] TTL: 1 hour (conversation expires)
- [ ] Value:
```typescript
{
  conversation_id: string;
  session_id: string;
  messages: Array<{
    role: 'user' | 'assistant';
    content: string;
    toolcalls?: any[];
    timestamp: string;
  }>;
  created_at: string;
  updated_at: string;
}
```

**Critical Test**:
- [ ] Multi-turn conversation
  - [ ] User: "What did the minister say about COE?"
  - [ ] Assistant: "Transport Minister said..."
  - [ ] User: "Generate a video" (references previous context)
  - [ ] Assistant knows which moment to generate

---

## 🎯 Proactive Suggestions

### Suggestion Engine
When assistant returns moments, proactively suggest actions:

```typescript
function generateSuggestions(moments: Moment[], query: string) {
  const suggestions = [];

  // Suggest video generation for top viral moment
  if (moments.length > 0 && moments[0].virality_score >= 8.0) {
    suggestions.push({
      type: 'action',
      label: `Generate ${moments[0].target_demographic} reaction`,
      icon: '🎥',
      action: {
        tool: 'generate_video',
        arguments: {
          moment_id: moments[0].moment_id,
          persona: inferPersona(moments[0].target_demographic),
        },
      },
    });
  }

  // Suggest related topics
  const topics = [...new Set(moments.map(m => m.topic))];
  if (topics.length > 1) {
    suggestions.push({
      type: 'explore',
      label: 'Explore related topics',
      topics: topics.slice(0, 3),
    });
  }

  return suggestions;
}

function inferPersona(demographic: string): Persona {
  if (demographic.includes('Gen Z') || demographic.includes('youth')) {
    return 'gen_z';
  }
  if (demographic.includes('working class') || demographic.includes('workers')) {
    return 'kopitiam_uncle';
  }
  if (demographic.includes('families') || demographic.includes('parents')) {
    return 'auntie';
  }
  return 'attenborough'; // default educated/professional audience
}
```

**Critical Test**:
- [ ] Query returns viral moment (score >= 8)
  - [ ] Suggestion includes "Generate video"
  - [ ] Persona inferred from target_demographic
- [ ] Multiple topics in results
  - [ ] Suggestion includes "Explore" for related topics

---

## 🧪 Integration Tests

### End-to-End Chat Flow
- [ ] User asks "What's the most viral moment?"
  - [ ] Assistant uses `get_most_viral`
  - [ ] Returns top 3 moments
  - [ ] Suggests generating video
- [ ] User says "Generate Gen Z reaction"
  - [ ] Assistant uses `generate_video`
  - [ ] Returns job_id
  - [ ] Provides status polling URL
- [ ] User asks "What did minister say about climate?"
  - [ ] Assistant uses `search_moments`
  - [ ] Returns climate-related moments
  - [ ] Suggests related topics

### Error Handling
- [ ] Invalid session_id → 404
- [ ] Empty query → 400
- [ ] No moments found → Helpful message
- [ ] Video generation fails → Retry suggestion

---

## 🚀 Deployment

### Pre-deployment
- [ ] Verify Vectorize index exists: `MOMENTS_INDEX`
- [ ] Set secrets:
  - [ ] `ANTHROPIC_API_KEY`
  - [ ] `OPENAI_API_KEY`
  - [ ] `UPSTASH_REDIS_REST_URL`
  - [ ] `UPSTASH_REDIS_REST_TOKEN`

### Deployment Steps
```bash
cd workers/rag-chat
npx wrangler deploy
npx wrangler tail # Monitor logs
```

**Post-deployment Test**:
```bash
curl -X POST https://capless-rag-chat.erniesg.workers.dev/api/chat \
  -H "Content-Type: application/json" \
  -d '{
    "session_id": "parliament-22-09-2024",
    "message": "What is the most viral moment?"
  }'

# Expected: { "message": "...", "toolcalls": [...], "suggestions": [...] }
```

---

## 📊 Monitoring & Observability

### Metrics to Track
- [ ] Queries per session
- [ ] Tool usage distribution (search vs viral vs video)
- [ ] Average response time
- [ ] Vector search accuracy (user feedback)
- [ ] Video generation conversion rate (from chat)

### Logging
- [ ] Log queries + toolcalls
- [ ] Log conversation flows
- [ ] Log video generation triggers from chat

---

## ⏱️ Time Estimates

| Task | Time | Priority |
|------|------|----------|
| Worker scaffolding | 15min | P0 |
| Vectorize integration | 30min | P0 |
| Toolcalls setup (AI SDK) | 45min | P0 |
| Chat endpoint | 30min | P0 |
| Moment ranking | 20min | P0 |
| Conversation context | 30min | P1 |
| Suggestions engine | 30min | P1 |
| Tests | 30min | P0 |

**Total MVP (P0 only)**: ~2.5 hours
**Full implementation**: ~3.5 hours

---

## 🔗 Integration with Video Generation

### Video Generation Trigger Flow
```typescript
// User: "Generate a Gen Z reaction to the COE moment"

// 1. Parse intent
const intent = await detectIntent(message);
if (intent.action === 'generate_video') {
  // 2. Extract parameters
  const { moment_id, persona } = intent.parameters;

  // 3. Call video generation worker
  const response = await fetch(VIDEO_GEN_URL, {
    method: 'POST',
    body: JSON.stringify({ moment_id, persona }),
  });

  const { job_id } = await response.json();

  // 4. Store job_id in conversation
  conversation.jobs.push({ job_id, moment_id, persona });

  // 5. Return to user
  return {
    message: `Generating your ${persona} reaction video! 🎬`,
    job_id,
    poll_url: `/api/video/status/${job_id}`,
    estimated_time: '~2 minutes',
  };
}
```

**Critical Test**:
- [ ] Chat triggers video generation
  - [ ] Job created successfully
  - [ ] User gets job_id + poll URL
  - [ ] Conversation stores job for later reference

---

## 🎭 MVP Simplifications

For quick demo, we can:
1. **Skip multi-turn context** - each query is independent
2. **Hardcode session** - only 22-09-2024
3. **Simple keyword search** - use Vectorize similarity, not Redis
4. **No conversation history** - stateless queries
5. **Basic suggestions** - just "Generate video" for top moment

This reduces MVP to ~1.5 hours.
