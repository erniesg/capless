# Parliament Moments Extraction - Usage Guide

## Quick Start

### Automated Pipeline (Recommended)
Process any parliament session by date with full automation:

```bash
./scripts/process-parliament-session.sh DD-MM-YYYY [YOUTUBE_URL]
```

**Examples:**
```bash
# With YouTube URL
./scripts/process-parliament-session.sh 22-09-2024 https://www.youtube.com/watch?v=...

# Auto-search for video (will prompt if not found)
./scripts/process-parliament-session.sh 22-09-2024
```

**What it does:**
1. ✅ Fetches Hansard report from Parliament API
2. ✅ Downloads YouTube subtitles (auto or manual URL)
3. ✅ Converts to ProcessedTranscript format with timestamps
4. ✅ Extracts viral moments with Claude Haiku 4.5
5. ✅ Saves results to `test-outputs/DD-MM-YYYY/`

---

## Outputs

### Moment Format
Each extracted moment includes:
```json
{
  "moment_id": "moment-xxx",
  "quote": "The exact quote (15-300 chars)",
  "speaker": "Minister Name",
  "timestamp_start": "01:23:45",
  "timestamp_end": "01:23:50",
  "virality_score": 9.5,
  "why_viral": "Explanation of viral potential",
  "topic": "Housing / Healthcare / etc",
  "emotional_tone": "defensive / evasive / compassionate / inspiring",
  "target_demographic": "Gen Z / working class / families",
  "segment_ids": ["seg-001", "seg-002"]
}
```

### Statistics
- Total segments analyzed
- Moments found
- Average virality score
- Topic distribution
- Speaker distribution
- Emotional tone breakdown

---

## Moment Types

### Problematic Moments (Score 7-10)
- Bureaucratic doublespeak
- Contradictions or illogical reasoning
- Defensive/evasive responses
- Out-of-touch statements

### Wholesome Moments (Score 7-10)
- Compassionate responses showing empathy
- Bold policy commitments with timelines
- Ministers acknowledging mistakes
- Direct, honest answers
- Cross-party collaboration

---

## API Endpoints

### Extract Moments
```bash
POST http://localhost:8789/api/moments/extract
Content-Type: application/json

{
  "transcript_id": "parliament-22-09-2024",
  "criteria": {
    "min_score": 5.0,
    "max_results": 20,
    "topics": ["Housing", "Healthcare"],  // optional
    "speakers": ["Minister Lee"]          // optional
  }
}
```

### Search Moments (Semantic)
```bash
GET http://localhost:8789/api/moments/search?q=housing+affordability&limit=10
```

### Upload Test Transcript
```bash
POST http://localhost:8789/api/test/upload-transcript
Content-Type: application/json

[ProcessedTranscript JSON]
```

---

## Manual Workflow

If you have a video file and want manual control:

### Step 1: Extract subtitles from video
```bash
# From YouTube
yt-dlp --write-auto-sub --sub-lang en --skip-download \
  --output "output/parliament-DD-MM-YYYY" \
  "YOUTUBE_URL"

# From local video file
ffmpeg -i parliament.mp4 -map 0:s:0 output/parliament.srt
```

### Step 2: Convert to ProcessedTranscript
```bash
python3 scripts/convert-youtube-to-processed.py \
  input.json3 \
  output/processed-transcript-DD-MM-YYYY.json \
  parliament-DD-MM-YYYY \
  "DD-MM-YYYY" \
  "Session Title"
```

### Step 3: Start moments worker
```bash
cd workers/moments
npx wrangler dev
```

### Step 4: Upload & extract
```bash
# Upload
curl -X POST http://localhost:8789/api/test/upload-transcript \
  -H "Content-Type: application/json" \
  -d @output/processed-transcript-DD-MM-YYYY.json

# Extract
curl -X POST http://localhost:8789/api/moments/extract \
  -H "Content-Type: application/json" \
  -d '{"transcript_id": "parliament-DD-MM-YYYY"}' \
  | jq '.' > test-outputs/DD-MM-YYYY/moments.json
```

---

## Performance

- **Speed**: ~313 segments/second
- **Cost**: ~$0.01 per 7-hour session (Claude Haiku 4.5)
- **Context**: Handles up to 8,724 segments in 200K window

---

## Troubleshooting

### Worker not starting
```bash
# Kill existing processes
pkill -f "wrangler dev"

# Restart
cd workers/moments && npx wrangler dev
```

### YouTube subtitles unavailable
- Check if video has auto-generated captions
- Try manual transcription service
- Place transcript manually in `output/`

### API key errors
Check `.dev.vars` in `workers/moments/`:
```
ANTHROPIC_API_KEY=your_key_here
OPENAI_API_KEY=your_key_here
```

---

## Test Artifacts

All test outputs are saved but not committed (in `.gitignore`):
```
test-outputs/
├── 2024-09-26/
│   ├── moments-extraction.json
│   └── full-extraction.json
└── DD-MM-YYYY/
    └── moments-extraction.json
```

---

## Next Steps

1. **Re-enable embeddings** for semantic search
2. **Test Vectorize** for moment similarity
3. **Add Gemini 2.5 Flash** fallback (1M context)
4. **Batch processing** for multiple dates
