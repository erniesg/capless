# Video Generator Worker

Cloudflare Worker for generating viral TikTok videos from Singapore Parliament moments using AI personas.

## Overview

This worker is part of the **capless** video generation pipeline (Worker 5/5). It takes curated parliament moments and generates complete TikTok-ready videos using:

1. **Script Generation** - Claude AI generates persona-specific scripts
2. **Video Generation** - OpenAI Sora creates video from scripts
3. **Multi-Persona Support** - 4 distinct AI personas + AI judge

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                    Video Generator Worker                   │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  POST /api/video/generate                                   │
│    ├─ Fetch moment from R2                                  │
│    ├─ Determine persona (direct or AI judge)                │
│    ├─ Generate script with Claude (script-generator.ts)     │
│    ├─ Submit to Sora API for video generation               │
│    └─ Track job status in KV                                │
│                                                             │
│  GET /api/video/status/:job_id                              │
│    └─ Return job status and progress                        │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

## Personas

### 1. Gen Z (The Truth-Telling Jester)
- **Style**: Calling out hypocrisy with humor
- **Markers**: "It's giving...", "The way that...", "Tell me you X"
- **Best for**: Absurdity, gaslighting, system failures

### 2. Kopitiam Uncle (The Seasoned Observer)
- **Style**: Practical wisdom from experience
- **Markers**: "Wah...", "Aiyo...", "You know ah..."
- **Best for**: Life lessons, "seen it before" moments

### 3. Anxious Auntie (The Concerned Protector)
- **Style**: Community protection via worry
- **Markers**: "Aiyah...", "Cannot like that!", "Must..."
- **Best for**: Kiasu energy, protective instincts

### 4. Attenborough (Nature Documentary Narrator)
- **Style**: Political theater as animal behavior
- **Markers**: "Observe...", "Here in the halls of power..."
- **Best for**: Dramatic moments, power dynamics

### 5. AI Decide (Meta-Analyst)
- Analyzes moment and selects optimal persona
- Provides reasoning for choice

## API Endpoints

### POST /api/video/generate

Generate a video from a parliament moment.

**Request:**
```json
{
  "moment_id": "parliament-22-09-2025-moment-1",
  "persona": "gen_z",
  "session_id": "optional-session-id"
}
```

**Personas:** `gen_z` | `kopitiam_uncle` | `auntie` | `attenborough` | `ai_decide`

**Response (202 Accepted):**
```json
{
  "job_id": "parliament-22-09-2025-moment-1-gen_z-1729761234567",
  "status": "processing",
  "estimated_time_seconds": 180,
  "poll_url": "/api/video/status/parliament-22-09-2025-moment-1-gen_z-1729761234567"
}
```

### GET /api/video/status/:job_id

Check video generation status.

**Response (200 OK):**
```json
{
  "job_id": "parliament-22-09-2025-moment-1-gen_z-1729761234567",
  "status": "processing",
  "request": {
    "moment_id": "parliament-22-09-2025-moment-1",
    "persona": "gen_z"
  },
  "moment": {
    "quote": "We need to ensure...",
    "speaker": "Grace Fu",
    "topic": "Climate Policy"
  },
  "scripts": [{
    "persona": "gen_z",
    "script": "POV: When the government finally admits...",
    "hook": "POV: When the government...",
    "cta": "Time to hold them accountable 💚",
    "hashtags": ["#SgPolitics", "#ClimateAction"],
    "word_count": 127,
    "validation_score": 66.7
  }],
  "sora_generation_id": "sora-abc123",
  "video_url": "https://...",
  "youtube_link": "https://youtube.com/watch?v=abc123xyz",
  "youtube_timestamp": "00:12:34",
  "progress": "Generating video (this may take 2-3 minutes)...",
  "created_at": "2025-10-24T07:20:34.567Z",
  "completed_at": "2025-10-24T07:23:45.678Z"
}
```

**Status Values:**
- `processing` - Video generation in progress
- `completed` - Video ready
- `failed` - Generation failed
- `error` - Unexpected error

## Setup

### 1. Install Dependencies

```bash
npm install
```

### 2. Create KV Namespace

```bash
wrangler kv:namespace create VIDEO_JOBS
wrangler kv:namespace create VIDEO_JOBS --preview
```

Update `wrangler.toml` with the namespace IDs.

### 3. Set Secrets

```bash
wrangler secret put ANTHROPIC_API_KEY
wrangler secret put OPENAI_API_KEY
```

### 4. Deploy

```bash
npm run deploy
```

## Development

### Local Development

```bash
npm run dev
```

This starts the worker locally with hot reload.

### Testing

**Manual Test (requires ANTHROPIC_API_KEY):**
```bash
export ANTHROPIC_API_KEY=your-key-here
npm test
```

**Unit Tests (Vitest):**
```bash
npm run test:vitest
```

### Test Script Generation

```bash
export ANTHROPIC_API_KEY=your-key-here
npx tsx test-manual.ts
```

## Project Structure

```
video-generator/
├── src/
│   ├── index.ts              # Main Hono app with API endpoints
│   ├── types.ts              # TypeScript type definitions
│   ├── voice-dna.ts          # Voice DNA configs for all personas
│   ├── script-generator.ts   # Claude-based script generation
│   └── index.test.ts         # Vitest integration tests
├── test-manual.ts            # Manual testing script
├── wrangler.toml             # Cloudflare Worker configuration
├── package.json              # Dependencies and scripts
├── vitest.config.ts          # Vitest configuration
└── README.md                 # This file
```

## Integration with Capless Pipeline

This worker is the final step in the capless video generation pipeline:

1. **Ingest Worker** - Downloads YouTube transcripts
2. **Transcription Worker** - Generates timestamped transcripts
3. **Moments Worker** - Identifies viral moments
4. **Asset Generator Worker** - Generates thumbnails and metadata
5. **Video Generator Worker** (this) - Generates complete videos

### Data Flow

```
R2: moments/parliament-22-09-2025.json
    ↓
Video Generator Worker
    ↓
1. Fetch moment
2. Generate script (Claude)
3. Generate video (Sora)
    ↓
KV: Job status tracking
    ↓
Output: Video URL + metadata
```

## Voice DNA System

Each persona has a comprehensive "Voice DNA" that defines:

- **Archetype** - Core identity
- **Driving Force** - What motivates them
- **Worldview** - How they see the world
- **System Prompt** - Claude generation instructions
- **Example Phrases** - Signature language patterns
- **Validation Markers** - Keywords to check authenticity

See `src/voice-dna.ts` for full definitions.

## Sora Integration

Videos are generated using OpenAI's Sora API:

- **Format**: 1080x1920 (TikTok vertical)
- **Duration**: 10-15 seconds
- **Style**: Modern, dynamic, attention-grabbing
- **Processing Time**: ~2-3 minutes

The prompt combines:
1. Moment context (speaker, quote, topic)
2. Persona archetype and style
3. Generated script
4. Visual direction

## Error Handling

The worker handles errors gracefully:

- **Invalid request** - Returns 400 with validation errors
- **Moment not found** - Returns 404
- **API failures** - Catches and logs errors, updates job status
- **Job tracking** - All states stored in KV for debugging

## Performance

- **Script generation**: ~2-3 seconds (Claude API)
- **Video generation**: ~2-3 minutes (Sora API)
- **Total time**: ~3 minutes per video

The worker uses async job processing so requests return immediately with a job ID for polling.

## Future Enhancements

- [ ] Batch video generation
- [ ] Custom voice cloning integration
- [ ] A/B testing different personas
- [ ] Video thumbnail generation
- [ ] Auto-posting to TikTok
- [ ] Analytics tracking
- [ ] Cost optimization (caching, reuse)

## Troubleshooting

### "Moment not found" errors

Check that:
1. Moment ID format is correct: `parliament-DD-MM-YYYY-moment-N`
2. Corresponding JSON file exists in R2: `moments/parliament-DD-MM-YYYY.json`
3. R2 bucket binding is correct in `wrangler.toml`

### Script generation fails

Check that:
1. `ANTHROPIC_API_KEY` secret is set correctly
2. Claude API quota is not exceeded
3. Moment data is complete (all required fields)

### Video generation fails

Check that:
1. `OPENAI_API_KEY` secret is set correctly
2. Sora API access is enabled
3. Quota and rate limits are not exceeded

### Job status not updating

Check that:
1. KV namespace is created and bound correctly
2. Worker has write permissions to KV
3. Job ID is correct

## License

MIT

## Support

For issues or questions, please open an issue in the main capless repository.
