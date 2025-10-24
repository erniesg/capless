# Parliament Chat Worker

RAG-based chat interface for Singapore parliamentary session transcripts. Ask questions about what was discussed in Parliament and get AI-powered answers with citations.

## Features

- **Retrieval-Augmented Generation (RAG)**: Answers grounded in actual parliamentary transcripts
- **Vector Search**: Efficient semantic search using Cloudflare Vectorize
- **Multiple AI Providers**: Cloudflare Workers AI (primary) with OpenAI/Anthropic fallbacks
- **Source Citations**: Every answer includes references to specific transcript segments
- **Batch Processing**: Embed multiple sessions at once
- **Free Tier Friendly**: Uses Cloudflare Workers AI for embeddings (no API costs)

## Architecture

```
User Question
    ↓
Generate Question Embedding (Cloudflare AI / OpenAI)
    ↓
Vector Search in Vectorize (Top K similar chunks)
    ↓
Build Context from Retrieved Chunks
    ↓
Generate Answer with LLM (Claude / GPT-4)
    ↓
Return Answer + Citations
```

## Tech Stack

- **Cloudflare Workers**: Serverless compute platform
- **Cloudflare Vectorize**: Vector database for semantic search
- **Cloudflare R2**: Object storage for transcripts
- **Cloudflare Workers AI**: Embeddings generation (@cf/baai/bge-base-en-v1.5)
- **Cloudflare KV**: Metadata and status tracking
- **Anthropic Claude / OpenAI GPT**: Answer generation
- **TypeScript + Zod**: Type-safe schemas and validation

## Architecture Decisions

### Vector Database: Cloudflare Vectorize ✅

**Why Vectorize over Upstash Redis?**

1. **Native Integration**: Built for Cloudflare Workers, no external services
2. **Free Tier**: 5M vectors, 30M queries/month free
3. **Serverless**: No database to manage, automatic scaling
4. **Low Latency**: Co-located with Workers for sub-10ms queries
5. **Simple API**: Direct vector operations without Redis complexity

**Trade-offs:**
- Less flexible than Redis (no generic data structures)
- Newer product (less mature ecosystem)
- Locked into Cloudflare ecosystem

### Embedding Provider: Cloudflare Workers AI (Primary)

**Why Workers AI over OpenAI?**

1. **Zero Cost**: Free embeddings (10,000 requests/day)
2. **No API Keys**: Built-in AI binding
3. **Lower Latency**: Edge-optimized inference
4. **768-dim BGE Model**: Good balance of quality and performance

**OpenAI Fallback**: Available if Workers AI quota exceeded or higher quality needed (text-embedding-3-small, 1536-dim)

### LLM: Anthropic Claude (Primary)

**Why Claude over GPT-4?**

1. **Better Instruction Following**: More reliable at citing sources
2. **Longer Context**: 200k tokens (though we don't need it here)
3. **Factual Accuracy**: Less prone to hallucination in RAG scenarios

**OpenAI Fallback**: GPT-4o-mini for cost-effective responses if Claude unavailable

## API Endpoints

### POST /chat

Ask questions about a parliamentary session.

**Request:**
```json
{
  "session_date": "22-09-2024",
  "question": "What did the minister say about COE allocation?",
  "max_results": 5
}
```

**Response:**
```json
{
  "answer": "The minister discussed Certificate of Entitlement (COE) allocation mechanisms...",
  "citations": [
    {
      "text": "Minister Chee Hong Tat: We are reviewing the COE allocation...",
      "speaker": "Minister Chee Hong Tat",
      "timestamp": "Transport Policy Discussion",
      "confidence": 0.89,
      "chunk_index": 12
    }
  ],
  "session_date": "22-09-2024",
  "model_used": "claude-3-5-sonnet-20241022"
}
```

**Example:**
```bash
curl -X POST https://parliament-chat.workers.dev/chat \
  -H "Content-Type: application/json" \
  -d '{
    "session_date": "22-09-2024",
    "question": "What was discussed about transport policy?",
    "max_results": 5
  }'
```

### POST /embed-session

Embed a session transcript into the vector database.

**Request:**
```json
{
  "session_date": "22-09-2024",
  "force": false
}
```

**Response:**
```json
{
  "message": "Session 22-09-2024 embedded successfully",
  "session_date": "22-09-2024",
  "chunk_count": 247,
  "segment_count": 89
}
```

**Example:**
```bash
curl -X POST https://parliament-chat.workers.dev/embed-session \
  -H "Content-Type: application/json" \
  -d '{"session_date": "22-09-2024"}'
```

### GET /session/:date/status

Check if a session is embedded and ready for chat.

**Response:**
```json
{
  "session_date": "22-09-2024",
  "is_embedded": true,
  "chunk_count": 247,
  "embedded_at": "2025-10-24T10:30:00.000Z"
}
```

**Example:**
```bash
curl https://parliament-chat.workers.dev/session/22-09-2024/status
```

### POST /bulk-embed

Embed multiple sessions at once (background job).

**Request:**
```json
{
  "start_date": "01-09-2024",
  "end_date": "30-09-2024",
  "limit": 10
}
```

**Response:**
```json
{
  "message": "Bulk embedding complete",
  "total_sessions": 10,
  "results": [
    {
      "session_date": "22-09-2024",
      "status": "embedded",
      "chunk_count": 247
    },
    {
      "session_date": "23-09-2024",
      "status": "already_embedded",
      "chunk_count": 198
    }
  ]
}
```

### GET /list-sessions

List available sessions in R2 storage.

**Example:**
```bash
curl https://parliament-chat.workers.dev/list-sessions?limit=10
```

### GET /health

Health check and binding status.

**Response:**
```json
{
  "status": "healthy",
  "service": "parliament-chat",
  "timestamp": "2025-10-24T10:30:00.000Z",
  "bindings": {
    "r2": true,
    "vectorize": true,
    "kv": true,
    "ai": true,
    "anthropic": true,
    "openai": false
  }
}
```

## Demo Questions (22-09-2024 Session)

Pre-embed the demo session:
```bash
curl -X POST https://parliament-chat.workers.dev/embed-session \
  -H "Content-Type: application/json" \
  -d '{"session_date": "22-09-2024"}'
```

Example questions to try:

```bash
# Question 1: COE Allocation
curl -X POST https://parliament-chat.workers.dev/chat \
  -H "Content-Type: application/json" \
  -d '{
    "session_date": "22-09-2024",
    "question": "What did the minister say about COE allocation mechanisms?"
  }'

# Question 2: PUB Document
curl -X POST https://parliament-chat.workers.dev/chat \
  -H "Content-Type: application/json" \
  -d '{
    "session_date": "22-09-2024",
    "question": "Summarize the discussion about the PUB document alteration issue"
  }'

# Question 3: Market Mechanisms
curl -X POST https://parliament-chat.workers.dev/chat \
  -H "Content-Type: application/json" \
  -d '{
    "session_date": "22-09-2024",
    "question": "Who spoke about market mechanisms and what did they say?"
  }'
```

## Setup Instructions

### Prerequisites

1. Cloudflare account with Workers, R2, Vectorize, and KV
2. API keys (at least one):
   - Anthropic API key (recommended)
   - OpenAI API key (fallback)

### 1. Create Cloudflare Resources

```bash
# Create Vectorize index
wrangler vectorize create parliament-chat --dimensions=768 --metric=cosine

# Create KV namespace
wrangler kv:namespace create "KV"
wrangler kv:namespace create "KV" --preview

# Update wrangler.toml with the KV namespace IDs
```

### 2. Set Environment Variables

```bash
# Copy example file
cp .dev.vars.example .dev.vars

# Add your API keys
echo "ANTHROPIC_API_KEY=sk-ant-..." >> .dev.vars
# OR
echo "OPENAI_API_KEY=sk-..." >> .dev.vars

# Deploy secrets to production
wrangler secret put ANTHROPIC_API_KEY
wrangler secret put OPENAI_API_KEY
```

### 3. Install Dependencies

```bash
npm install
```

### 4. Local Development

```bash
npm run dev
# Worker running at http://localhost:8788
```

### 5. Deploy to Production

```bash
npm run deploy
```

## Testing

Run unit tests:
```bash
npm test
```

Run tests in watch mode:
```bash
npm run test:watch
```

## Data Flow

### Embedding Pipeline

```
R2: hansard/raw/22-09-2024.json
    ↓
Load Hansard JSON
    ↓
Parse Transcript (extract sections, speakers)
    ↓
Chunk Transcript (500 tokens/chunk, 50 token overlap)
    ↓
Generate Embeddings (Cloudflare AI: 768-dim BGE)
    ↓
Store in Vectorize (with metadata: speaker, section, text)
    ↓
Mark as Embedded in KV
```

### Chat Pipeline

```
User Question: "What about COEs?"
    ↓
Embed Question (Cloudflare AI)
    ↓
Vector Search (Vectorize: top 5 chunks)
    ↓
Build Context (retrieved chunks + metadata)
    ↓
LLM Prompt (Claude: system + context + question)
    ↓
Generate Answer (Claude 3.5 Sonnet)
    ↓
Extract Citations (source chunks with confidence scores)
    ↓
Return Response
```

## Embedding Strategy

### Chunking Configuration

```typescript
{
  max_tokens: 500,        // ~2000 characters per chunk
  overlap_tokens: 50,     // 10% overlap for context preservation
  min_chunk_size: 100     // Filter out tiny chunks
}
```

### Metadata Stored

Each embedded chunk includes:
- `session_date`: Session identifier (DD-MM-YYYY)
- `speaker`: Name of MP/Minister speaking
- `text`: Full chunk text
- `chunk_index`: Position in transcript
- `section_title`: Hansard section heading
- `subsection_title`: Nested section heading
- `word_count`: Chunk size metric

### Vector Search

- **Metric**: Cosine similarity
- **Filter**: Session date (ensures answers from correct session)
- **Top K**: Configurable (default: 5 chunks)
- **Minimum Score**: 0.7 (configurable threshold)

## Performance

### Embedding

- **Single session**: ~30 seconds for 200 chunks
- **Batch processing**: ~5 minutes for 10 sessions
- **Workers AI quota**: 10,000 requests/day (free tier)

### Chat Queries

- **Vector search**: <10ms (Vectorize)
- **LLM generation**: 1-3 seconds (Claude/GPT-4)
- **Total latency**: ~2-4 seconds per query

### Costs (Production)

- **Workers**: Free tier (100k requests/day)
- **Vectorize**: Free tier (5M vectors, 30M queries/month)
- **R2**: Free tier (10GB storage)
- **KV**: Free tier (100k reads/day)
- **Workers AI**: Free tier (10k requests/day)
- **Claude API**: ~$0.003 per query (3M tokens input, 500 tokens output)

**Estimated cost**: ~$3-5/month for 1000 queries/day (Claude API only)

## Integration with Existing Workers

### Prerequisites

1. **Parliament Scraper** (`parliament-scraper` worker)
   - Must have scraped sessions to R2 (`hansard/raw/*.json`)
   - Run `/start` to scrape all historical sessions

2. **Moments Worker** (`capless-moments` worker)
   - Optional: Provides YouTube timestamps for citations
   - Can link chat responses to specific video moments

### Data Dependencies

```
parliament-scraper → R2 (hansard/raw/)
                        ↓
              parliament-chat (loads transcripts)
                        ↓
              Vectorize (stores embeddings)
                        ↓
              Chat API (serves answers)
```

## Future Enhancements

1. **YouTube Timestamp Integration**
   - Link citations to exact YouTube timestamps
   - Embed clickable video links in responses

2. **Multi-Session Search**
   - Search across all sessions
   - "What has been said about X over the years?"

3. **Trending Topics**
   - Track most-asked questions
   - Surface popular parliamentary discussions

4. **Export Capabilities**
   - Download chat transcripts
   - Share Q&A with citations

5. **Advanced Filters**
   - Filter by speaker, party, topic
   - Date range queries

6. **Streaming Responses**
   - Real-time answer generation
   - Progressive citation loading

## Troubleshooting

### Session Not Found

```json
{"error": "Session 22-09-2024 not found in R2 storage"}
```

**Solution**: Ensure parliament-scraper has fetched the session:
```bash
curl https://parliament-scraper.workers.dev/status
```

### Session Not Embedded

```json
{"error": "Session 22-09-2024 is not embedded yet"}
```

**Solution**: Embed the session first:
```bash
curl -X POST https://parliament-chat.workers.dev/embed-session \
  -d '{"session_date": "22-09-2024"}'
```

### No Embedding Provider Available

```
Error: No embedding provider available. Set AI binding or OPENAI_API_KEY.
```

**Solution**:
1. Ensure Workers AI binding is configured in wrangler.toml
2. OR set OPENAI_API_KEY secret: `wrangler secret put OPENAI_API_KEY`

### Vector Search Returns No Results

**Possible causes:**
1. Session not embedded
2. Question too different from transcript content
3. Vectorize index misconfigured (check dimensions: 768 for Workers AI, 1536 for OpenAI)

## License

MIT

## Contributing

See main repository CLAUDE.md for contribution guidelines.
