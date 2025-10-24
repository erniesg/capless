# Video Generator API Reference

Quick reference for the Video Generator Worker API.

## Base URL

```
Production: https://capless-video-generator.your-subdomain.workers.dev
Development: http://localhost:8787
```

## Endpoints

### 1. Health Check

**GET** `/health`

Check if the worker is running.

**Response:**
```json
{
  "status": "ok",
  "service": "video-generator"
}
```

---

### 2. Generate Video

**POST** `/api/video/generate`

Generate a video from a parliament moment.

**Request Body:**
```json
{
  "moment_id": "parliament-22-09-2025-moment-1",
  "persona": "gen_z",
  "session_id": "optional-session-id"
}
```

**Parameters:**
| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `moment_id` | string | Yes | Moment ID from moments worker |
| `persona` | string | Yes | One of: `gen_z`, `kopitiam_uncle`, `auntie`, `attenborough`, `ai_decide` |
| `session_id` | string | No | Optional session tracking ID |

**Response (202 Accepted):**
```json
{
  "job_id": "parliament-22-09-2025-moment-1-gen_z-1729761234567",
  "status": "processing",
  "estimated_time_seconds": 180,
  "poll_url": "/api/video/status/parliament-22-09-2025-moment-1-gen_z-1729761234567"
}
```

**Error Responses:**

**400 Bad Request** - Invalid request
```json
{
  "error": "Invalid request",
  "details": [
    {
      "code": "invalid_enum_value",
      "expected": ["gen_z", "kopitiam_uncle", "auntie", "attenborough", "ai_decide"],
      "received": "invalid_persona",
      "path": ["persona"]
    }
  ]
}
```

**404 Not Found** - Moment not found
```json
{
  "error": "Moment not found",
  "moment_id": "parliament-99-99-9999-moment-999"
}
```

---

### 3. Check Video Status

**GET** `/api/video/status/:job_id`

Get the status of a video generation job.

**Path Parameters:**
| Field | Type | Description |
|-------|------|-------------|
| `job_id` | string | Job ID from generate endpoint |

**Response (200 OK):**

**Processing:**
```json
{
  "job_id": "parliament-22-09-2025-moment-1-gen_z-1729761234567",
  "status": "processing",
  "request": {
    "moment_id": "parliament-22-09-2025-moment-1",
    "persona": "gen_z"
  },
  "moment": {
    "moment_id": "parliament-22-09-2025-moment-1",
    "quote": "We need to ensure that our policies...",
    "speaker": "Grace Fu",
    "timestamp_start": "00:12:34",
    "timestamp_end": "00:12:48",
    "virality_score": 8.5,
    "why_viral": "Strong stance on climate policy",
    "topic": "Climate Policy",
    "emotional_tone": "Determined, Urgent",
    "target_demographic": "Environmentally conscious youth",
    "transcript_id": "abc123xyz"
  },
  "selected_persona": "gen_z",
  "progress": "Generating script...",
  "created_at": "2025-10-24T07:20:34.567Z"
}
```

**Completed:**
```json
{
  "job_id": "parliament-22-09-2025-moment-1-gen_z-1729761234567",
  "status": "completed",
  "request": {
    "moment_id": "parliament-22-09-2025-moment-1",
    "persona": "gen_z"
  },
  "moment": { /* ... */ },
  "scripts": [
    {
      "persona": "gen_z",
      "script": "POV: When the government finally admits climate change is real but you've been screaming about it for years 🙄 It's giving 'too little too late' energy. The way that they suddenly care when the elections are coming up? Tell me you're performative without telling me you're performative. Grace Fu out here with the 'proactive' talk but where was this energy in 2020? We see you 👁️👄👁️",
      "hook": "POV: When the government finally admits climate change is real",
      "cta": "Time to hold them accountable 💚",
      "hashtags": ["#SgPolitics", "#ClimateAction", "#GenZ", "#Singapore"],
      "word_count": 127,
      "validation_score": 66.7
    }
  ],
  "selected_persona": "gen_z",
  "sora_generation_id": "sora-1729761567890",
  "video_url": "https://placeholder-video-url/sora-1729761567890.mp4",
  "youtube_link": "https://youtube.com/watch?v=abc123xyz",
  "youtube_timestamp": "00:12:34",
  "created_at": "2025-10-24T07:20:34.567Z",
  "completed_at": "2025-10-24T07:23:45.678Z"
}
```

**Failed:**
```json
{
  "job_id": "parliament-22-09-2025-moment-1-gen_z-1729761234567",
  "status": "failed",
  "error": "API key invalid or quota exceeded",
  "created_at": "2025-10-24T07:20:34.567Z",
  "completed_at": "2025-10-24T07:20:45.678Z"
}
```

**Error Responses:**

**404 Not Found** - Job not found
```json
{
  "error": "Job not found",
  "job_id": "invalid-job-id"
}
```

---

## Status Flow

```
POST /api/video/generate
    ↓
status: "processing"
progress: "Generating script..."
    ↓
status: "processing"
progress: "Submitting to Sora API..."
    ↓
status: "processing"
progress: "Generating video (this may take 2-3 minutes)..."
    ↓
status: "completed"
video_url: "https://..."
```

---

## Personas

| Persona | Description | Best For |
|---------|-------------|----------|
| `gen_z` | Truth-Telling Jester | Calling out hypocrisy, absurdity |
| `kopitiam_uncle` | Seasoned Observer | Practical wisdom, life lessons |
| `auntie` | Concerned Protector | Kiasu energy, community worry |
| `attenborough` | Nature Narrator | Dramatic moments, power dynamics |
| `ai_decide` | Meta-Analyst | AI selects optimal persona |

---

## Example Usage

### JavaScript/TypeScript

```typescript
// Generate video
async function generateVideo(momentId: string, persona: string) {
  const response = await fetch('https://your-worker.workers.dev/api/video/generate', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ moment_id: momentId, persona })
  });

  if (!response.ok) {
    throw new Error(`HTTP ${response.status}: ${await response.text()}`);
  }

  return response.json();
}

// Poll for status
async function pollStatus(jobId: string): Promise<VideoJob> {
  while (true) {
    const response = await fetch(`https://your-worker.workers.dev/api/video/status/${jobId}`);
    const status = await response.json();

    if (status.status === 'completed') {
      return status;
    } else if (status.status === 'failed' || status.status === 'error') {
      throw new Error(status.error || 'Video generation failed');
    }

    // Wait 5 seconds before polling again
    await new Promise(resolve => setTimeout(resolve, 5000));
  }
}

// Usage
const { job_id } = await generateVideo('parliament-22-09-2025-moment-1', 'gen_z');
const result = await pollStatus(job_id);
console.log('Video ready!', result.video_url);
```

### cURL

```bash
# Generate video
curl -X POST https://your-worker.workers.dev/api/video/generate \
  -H "Content-Type: application/json" \
  -d '{
    "moment_id": "parliament-22-09-2025-moment-1",
    "persona": "gen_z"
  }'

# Check status
curl https://your-worker.workers.dev/api/video/status/JOB_ID | jq

# Poll until complete (bash)
JOB_ID="parliament-22-09-2025-moment-1-gen_z-1729761234567"
while true; do
  STATUS=$(curl -s "https://your-worker.workers.dev/api/video/status/$JOB_ID" | jq -r '.status')
  if [ "$STATUS" = "completed" ]; then
    echo "Video ready!"
    curl -s "https://your-worker.workers.dev/api/video/status/$JOB_ID" | jq
    break
  fi
  echo "Status: $STATUS. Waiting..."
  sleep 5
done
```

### Python

```python
import requests
import time

def generate_video(moment_id: str, persona: str) -> str:
    """Generate a video and return job ID."""
    response = requests.post(
        'https://your-worker.workers.dev/api/video/generate',
        json={'moment_id': moment_id, 'persona': persona}
    )
    response.raise_for_status()
    return response.json()['job_id']

def poll_status(job_id: str) -> dict:
    """Poll status until video is ready."""
    while True:
        response = requests.get(
            f'https://your-worker.workers.dev/api/video/status/{job_id}'
        )
        response.raise_for_status()
        data = response.json()

        if data['status'] == 'completed':
            return data
        elif data['status'] in ('failed', 'error'):
            raise Exception(data.get('error', 'Generation failed'))

        print(f"Status: {data.get('progress', 'processing')}...")
        time.sleep(5)

# Usage
job_id = generate_video('parliament-22-09-2025-moment-1', 'gen_z')
result = poll_status(job_id)
print(f"Video ready: {result['video_url']}")
```

---

## Rate Limits

- **Cloudflare Workers**: 100,000 requests/day (free tier)
- **Claude API**: Depends on your Anthropic plan
- **Sora API**: TBD (beta program)

## Cost Estimates

Per video generation:

- **Claude Script**: ~$0.003 (500 tokens @ $3/1M tokens)
- **Sora Video**: TBD (beta pricing not available)
- **Cloudflare Workers**: Free (under 100k requests/day)
- **R2 Storage**: ~$0.000001 (class B read)
- **KV Storage**: ~$0.0000005 (write + read)

**Total**: ~$0.003 + Sora cost per video

---

## Common Error Codes

| Code | Status | Meaning | Solution |
|------|--------|---------|----------|
| 400 | Bad Request | Invalid request format | Check request body schema |
| 404 | Not Found | Moment or job not found | Verify moment_id or job_id |
| 500 | Internal Server Error | Worker error | Check logs with `wrangler tail` |

---

## Support

- **Docs**: See README.md and DEPLOYMENT.md
- **Logs**: `wrangler tail`
- **Debug**: `wrangler kv:key get <job_id> --binding=VIDEO_JOBS`
