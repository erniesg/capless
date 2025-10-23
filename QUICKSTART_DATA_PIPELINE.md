# Capless Data Pipeline - Quick Start Guide

Get the core data pipeline running: **Hansard → YouTube Matching → Moment Detection**

This validates the most critical part before worrying about video generation.

---

## 🎯 What You're Testing

```
┌─────────────┐      ┌─────────────┐      ┌─────────────┐
│  Hansard    │─────▶│   YouTube   │─────▶│   Moments   │
│  Ingestion  │      │   Matching  │      │  Detection  │
└─────────────┘      └─────────────┘      └─────────────┘
     ✅                    ✅                    ✅
Parliament API        YouTube API         OpenAI API
(Public, no key)    (Free API key)     (Paid API key)
```

**What This Validates**:
1. ✅ Can fetch real Parliament transcripts
2. ✅ Can match them to YouTube videos
3. ✅ Can extract viral moments with LLM
4. ✅ Batch processing of multiple dates

---

## 📋 Prerequisites

### 1. YouTube API Key (FREE)

**Get it here**: https://console.cloud.google.com/apis/credentials

**Steps**:
1. Create a Google Cloud project (or use existing)
2. Enable **YouTube Data API v3**
3. Create **API Key** credential
4. Copy the key

**Quota**: 10,000 units/day (enough for ~100 searches)

### 2. OpenAI API Key (PAID - ~$5 for testing)

**Get it here**: https://platform.openai.com/api-keys

**Cost**: ~$0.01-0.05 per moment detection

### 3. Optional: Upstash Redis (FREE tier)

**Get it here**: https://upstash.com/

**Why**: Caching to avoid re-fetching same data
**Free tier**: 10,000 commands/day

---

## 🚀 Quick Start: Local Testing (NO DEPLOYMENT)

### Step 1: Set Environment Variables

```bash
# YouTube API (required)
export YOUTUBE_API_KEY='your-youtube-key-here'

# OpenAI API (required for moment detection)
export OPENAI_API_KEY='your-openai-key-here'

# Upstash Redis (optional, for caching)
export UPSTASH_REDIS_REST_URL='your-upstash-url'
export UPSTASH_REDIS_REST_TOKEN='your-upstash-token'
```

### Step 2: Run Live Pipeline Test

```bash
chmod +x scripts/test-live-pipeline.sh
./scripts/test-live-pipeline.sh
```

**What this does**:
1. Starts 3 workers locally (no deployment!)
2. Fetches real Parliament Hansard for 3 recent dates
3. Searches YouTube for matching videos
4. Detects viral moments with OpenAI
5. Shows results in terminal

**Expected output**:
```
✅ Ingestion successful!
   Transcript ID: 2024-07-02-sitting-1
   Segments: 245
   Speakers: PM Lee, Leader of Opposition, Minister for Finance

✅ Video matching successful!
   Matched Videos: 5
   Top Match:
     Title: Parliament Session 2 July 2024 - Budget Debate
     URL: https://youtube.com/watch?v=abc123
     Confidence: 8.5

✅ Moment detection successful!
   Detected Moments: 3
     [120s - 150s] Score: 9.2 | PM Lee's fiery response on economy
     [450s - 480s] Score: 8.7 | Opposition challenges budget allocations
     [890s - 920s] Score: 8.1 | Minister's viral quote on healthcare
```

---

## 🧪 Manual Testing (Step by Step)

If the automated script fails, test each component individually:

### Test 1: Ingestion Worker

```bash
# Terminal 1: Start worker
cd workers/capless-ingest
npx wrangler dev --port 8787

# Terminal 2: Test it
curl -X POST http://localhost:8787/api/ingest/hansard \
  -H "Content-Type: application/json" \
  -d '{
    "sittingDate": "02-07-2024",
    "skipStorage": true
  }' | jq '.'

# Expected: JSON with transcript_id, segments, speakers
```

### Test 2: Video Matcher

```bash
# Terminal 1: Start worker (keep ingestion running too!)
cd workers/video-matcher
npx wrangler dev --port 8788 --var YOUTUBE_API_KEY:"$YOUTUBE_API_KEY"

# Terminal 2: Test it
curl -X POST http://localhost:8788/api/match \
  -H "Content-Type: application/json" \
  -d '{
    "sittingDate": "02-07-2024",
    "keywords": ["Singapore", "Parliament", "Budget"],
    "maxResults": 5
  }' | jq '.'

# Expected: JSON with matches array, video titles, confidence scores
```

### Test 3: Moments Worker

```bash
# Terminal 1: Start worker
cd workers/moments
npx wrangler dev --port 8789 --var OPENAI_API_KEY:"$OPENAI_API_KEY"

# Terminal 2: Test it (use real transcript + video from previous steps)
curl -X POST http://localhost:8789/api/detect-moments \
  -H "Content-Type: application/json" \
  -d '{
    "videoId": "abc123",
    "transcriptId": "2024-07-02-sitting-1",
    "maxMoments": 3
  }' | jq '.'

# Expected: JSON with moments array, timestamps, engagement scores
```

---

## 📦 Batch Processing: Multiple Dates

### Quick Batch Test

```bash
# Create batch input file
cat > batch-dates.json << EOF
{
  "dates": [
    "02-07-2024",
    "03-07-2024",
    "08-07-2024",
    "09-07-2024",
    "10-07-2024"
  ],
  "maxResults": 5
}
EOF

# Run batch ingestion (with worker running on port 8787)
curl -X POST http://localhost:8787/api/ingest/batch \
  -H "Content-Type: application/json" \
  -d @batch-dates.json | jq '.'
```

### Full Batch Pipeline Script

```bash
#!/bin/bash

# Process a list of parliament dates through full pipeline

DATES=(
  "02-07-2024"
  "03-07-2024"
  "08-07-2024"
  "09-07-2024"
  "10-07-2024"
  "15-07-2024"
  "16-07-2024"
  "17-07-2024"
)

for date in "${DATES[@]}"; do
  echo "Processing: $date"

  # 1. Ingest Hansard
  TRANSCRIPT=$(curl -s -X POST http://localhost:8787/api/ingest/hansard \
    -H "Content-Type: application/json" \
    -d "{\"sittingDate\": \"$date\", \"skipStorage\": true}")

  TRANSCRIPT_ID=$(echo "$TRANSCRIPT" | jq -r '.transcript_id')

  if [ "$TRANSCRIPT_ID" = "null" ]; then
    echo "  ❌ Ingestion failed"
    continue
  fi

  echo "  ✅ Ingested: $TRANSCRIPT_ID"

  # 2. Match videos
  MATCHES=$(curl -s -X POST http://localhost:8788/api/match \
    -H "Content-Type: application/json" \
    -d "{
      \"sittingDate\": \"$date\",
      \"keywords\": [\"Singapore\", \"Parliament\"],
      \"maxResults\": 3
    }")

  VIDEO_COUNT=$(echo "$MATCHES" | jq -r '.matches | length')
  echo "  ✅ Matched: $VIDEO_COUNT videos"

  # 3. Detect moments for each video
  echo "$MATCHES" | jq -r '.matches[] | .video_id' | while read -r video_id; do
    MOMENTS=$(curl -s -X POST http://localhost:8789/api/detect-moments \
      -H "Content-Type: application/json" \
      -d "{
        \"videoId\": \"$video_id\",
        \"transcriptId\": \"$TRANSCRIPT_ID\",
        \"maxMoments\": 3
      }")

    MOMENT_COUNT=$(echo "$MOMENTS" | jq -r '.moments | length')
    echo "    ✅ $video_id: $MOMENT_COUNT moments"

    # Save results
    mkdir -p output/$date
    echo "$MOMENTS" > "output/$date/${video_id}_moments.json"
  done

  echo ""
done

echo "Results saved to: output/"
```

---

## ☁️ Deploy to Cloudflare (When Ready)

### Option 1: Local Testing Only (Current)

**Pros**:
- ✅ No deployment needed
- ✅ Fast iteration
- ✅ Easy debugging

**Cons**:
- ⚠️ Must keep terminals open
- ⚠️ No persistence (R2 storage)
- ⚠️ No caching (Redis)

### Option 2: Deploy Data Pipeline Workers

**When**: After local testing works

**Steps**:

```bash
# 1. Set secrets for each worker
cd workers/video-matcher
wrangler secret put YOUTUBE_API_KEY
wrangler secret put UPSTASH_REDIS_REST_URL
wrangler secret put UPSTASH_REDIS_REST_TOKEN

cd ../moments
wrangler secret put OPENAI_API_KEY

# 2. Create R2 bucket
wrangler r2 bucket create capless

# 3. Deploy workers
cd ../capless-ingest
wrangler deploy

cd ../video-matcher
wrangler deploy

cd ../moments
wrangler deploy

# 4. Test deployed workers
curl https://capless-ingest.YOUR-SUBDOMAIN.workers.dev/health
curl https://capless-video-matcher.YOUR-SUBDOMAIN.workers.dev/health
curl https://capless-moments.YOUR-SUBDOMAIN.workers.dev/health
```

---

## 🎯 Success Criteria

After running the pipeline, you should have:

1. **Hansard Transcripts** ✅
   - Parsed segments with speakers
   - Timestamp ranges
   - Section titles (Oral Answers, Bills, etc.)

2. **Matched YouTube Videos** ✅
   - Video IDs and URLs
   - Confidence scores (0-10)
   - Title and description match

3. **Viral Moments** ✅
   - Timestamp ranges (start/end)
   - Engagement scores (0-10)
   - Moment summaries
   - Viral potential ratings

4. **Batch Processing** ✅
   - Multiple dates processed
   - Results saved per date
   - Error handling for missing data

---

## 🐛 Troubleshooting

### YouTube API Quota Exceeded

**Error**: `quotaExceeded`

**Solution**:
- Wait 24 hours for quota reset
- Or reduce `maxResults` in search
- Or create multiple API keys

### OpenAI Rate Limit

**Error**: `rate_limit_exceeded`

**Solution**:
- Add delays between requests
- Upgrade OpenAI tier
- Use Anthropic as fallback

### Parliament API Timeout

**Error**: `fetch failed` or timeout

**Solution**:
- Check date format (DD-MM-YYYY)
- Verify parliament was sitting on that date
- Check https://sprs.parl.gov.sg/ manually

### Worker Won't Start

**Error**: `Address already in use`

**Solution**:
```bash
# Kill existing workers
lsof -ti:8787 | xargs kill
lsof -ti:8788 | xargs kill
lsof -ti:8789 | xargs kill
```

---

## 📊 Expected Costs

### Per Parliament Date (Full Pipeline):

| Service | Cost | Notes |
|---------|------|-------|
| Parliament API | FREE | Public API |
| YouTube API | FREE | 10k units/day quota |
| OpenAI (GPT-4) | $0.01-0.05 | Per moment detection |
| Upstash Redis | FREE | Free tier sufficient |
| Cloudflare Workers | FREE | 100k req/day free |
| Cloudflare R2 | ~$0.00001 | Per stored file |

**Total per date**: ~$0.05-0.15 (mostly OpenAI)

**For 100 dates**: ~$5-15

---

## 🎬 Next Steps After Data Pipeline Works

Once you have:
- ✅ Hansard transcripts
- ✅ Matched YouTube videos
- ✅ Viral moments extracted

Then move to:

1. **Asset Generation** (Relatively easy as you said)
   - Script writing with personas → OpenAI/Anthropic
   - Voice generation → ElevenLabs API
   - Video generation → Sora 2 / Runway

2. **Video Composition** (Last step)
   - Combine clips + audio + captions
   - Render final video
   - Publish to TikTok

---

## 🚀 Get Started Now

```bash
# 1. Set API keys
export YOUTUBE_API_KEY='your-key'
export OPENAI_API_KEY='your-key'

# 2. Run live test
chmod +x scripts/test-live-pipeline.sh
./scripts/test-live-pipeline.sh

# 3. Check results
cat /tmp/ingestion-worker.log
cat /tmp/video-matcher.log
cat /tmp/moments-worker.log
```

**Questions? Issues?** Check worker logs and troubleshooting section above.

---

## 📚 Additional Resources

- **YouTube API Docs**: https://developers.google.com/youtube/v3
- **OpenAI API Docs**: https://platform.openai.com/docs
- **Singapore Parliament API**: https://sprs.parl.gov.sg/
- **Cloudflare Workers**: https://developers.cloudflare.com/workers/
- **Upstash Redis**: https://docs.upstash.com/redis

**Worker Documentation**:
- `workers/capless-ingest/README.md`
- `workers/video-matcher/README.md`
- `workers/moments/README.md`
