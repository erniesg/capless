# Modal Whisper Transcription Deployment Guide

## Prerequisites

You need your Cloudflare R2 credentials for Modal to access the R2 bucket.

## Step 1: Get R2 Credentials

Find your R2 access keys from Cloudflare dashboard or extract from existing config:

```bash
# Check if you have them in environment
env | grep -E "R2|AWS" | grep -E "ACCESS|SECRET"
```

Or create new R2 API tokens:
1. Go to Cloudflare Dashboard → R2 → Manage R2 API Tokens
2. Create API token with "Object Read & Write" permissions
3. Save the Access Key ID and Secret Access Key

## Step 2: Install Modal

```bash
pip install modal
```

## Step 3: Set up Modal Account

```bash
modal setup
```

This will:
- Create a Modal account (or log you in)
- Generate authentication tokens
- Set up your local environment

## Step 4: Create Modal Secrets for R2 Access

```bash
# Create Modal secret with your R2 credentials
modal secret create r2-credentials \
  AWS_ACCESS_KEY_ID="<your-r2-access-key-id>" \
  AWS_SECRET_ACCESS_KEY="<your-r2-secret-access-key>"
```

**Example:**
```bash
modal secret create r2-credentials \
  AWS_ACCESS_KEY_ID="abc123def456" \
  AWS_SECRET_ACCESS_KEY="xyz789secret"
```

## Step 5: Deploy to Modal

```bash
# Deploy the transcription app
modal deploy /tmp/modal-capless-transcribe.py
```

This will:
- Build the Docker image with ffmpeg and faster-whisper
- Deploy the functions to Modal's infrastructure
- Create a web endpoint at: `https://[workspace]--capless-api-transcribe.modal.run`

The deployment takes ~2-3 minutes on first run.

## Step 6: Create Modal Proxy Auth Token

For endpoint security, create a Proxy Auth Token:

1. Go to Modal dashboard: https://modal.com
2. Navigate to Settings → Proxy Auth Tokens
3. Click "Create Token"
4. Save the `Modal-Key` and `Modal-Secret` values

**Example token values:**
```
Modal-Key: ak-abc123def456
Modal-Secret: as-xyz789secret
```

## Step 7: Test the Endpoint

After deployment, Modal will show your endpoint URL. Test it:

```bash
# Get your workspace name from Modal
WORKSPACE=$(modal profile current | grep workspace | awk '{print $2}')

# Test endpoint (replace with your actual auth tokens)
curl -X POST "https://${WORKSPACE}--capless-api-transcribe.modal.run" \
  -H "Modal-Key: <your-modal-key>" \
  -H "Modal-Secret: <your-modal-secret>" \
  -H "Content-Type: application/json" \
  -d '{
    "session_date": "2024-10-15",
    "skip_audio_extraction": false
  }'
```

**Expected response:**
```json
{
  "session_date": "2024-10-15",
  "status": "success",
  "steps": {
    "audio_extraction": {
      "session_date": "2024-10-15",
      "audio_r2_key": "youtube/audio/2024-10-15.mp3",
      "audio_size_mb": 112.5,
      "duration_minutes": 240.2
    },
    "transcription": {
      "session_date": "2024-10-15",
      "transcript_r2_key": "youtube/transcripts-whisper/2024-10-15.vtt",
      "json_r2_key": "youtube/transcripts-whisper/2024-10-15.json",
      "segment_count": 1842,
      "word_count": 28451,
      "duration_minutes": 240.2,
      "language": "en"
    }
  }
}
```

## Step 8: Process Missing Sessions

Process the 2 sessions without English captions:

```bash
# Session 1: 2024-10-15
curl -X POST "https://${WORKSPACE}--capless-api-transcribe.modal.run" \
  -H "Modal-Key: <your-modal-key>" \
  -H "Modal-Secret: <your-modal-secret>" \
  -H "Content-Type: application/json" \
  -d '{"session_date": "2024-10-15"}'

# Session 2: 2024-10-16
curl -X POST "https://${WORKSPACE}--capless-api-transcribe.modal.run" \
  -H "Modal-Key: <your-modal-key>" \
  -H "Modal-Secret: <your-modal-secret>" \
  -H "Content-Type: application/json" \
  -d '{"session_date": "2024-10-16"}'
```

Each session takes ~15-20 minutes to process on GPU.

## Cost Estimate

**Modal GPU Costs:**
- GPU: NVIDIA T4 = $0.000198/second = $0.71/hour
- 4-hour parliament session transcription: ~15 minutes = **$0.18 per session**
- 2 missing sessions: 2 × $0.18 = **$0.36 total**

**Modal Free Tier:**
- $30/month free credits for new users
- You can transcribe 166 sessions within the free tier!

## Optional: Backfill All 33 Sessions

If you want word-level timestamps for all sessions:

```bash
# Create backfill script
cat > /tmp/backfill-whisper-transcripts.sh << 'EOF'
#!/bin/bash

WORKSPACE=$(modal profile current | grep workspace | awk '{print $2}')
ENDPOINT="https://${WORKSPACE}--capless-api-transcribe.modal.run"

dates=(
  "2024-08-06" "2024-08-07" "2024-09-09" "2024-09-10"
  "2024-10-14" "2024-10-15" "2024-10-16" "2024-11-11"
  "2024-11-12" "2024-11-13" "2025-01-07" "2025-01-08"
  "2025-02-04" "2025-02-05" "2025-02-18" "2025-02-26"
  "2025-02-27" "2025-02-28" "2025-03-03" "2025-03-04"
  "2025-03-05" "2025-03-06" "2025-03-07" "2025-03-10"
  "2025-03-11" "2025-03-12" "2025-03-13" "2025-03-14"
  "2025-09-15" "2025-09-16" "2025-09-17" "2025-10-14"
  "2025-10-15"
)

for date in "${dates[@]}"; do
  echo "Processing $date..."
  curl -X POST "$ENDPOINT" \
    -H "Modal-Key: <your-modal-key>" \
    -H "Modal-Secret: <your-modal-secret>" \
    -H "Content-Type: application/json" \
    -d "{\"session_date\":\"$date\"}"
  echo ""
  sleep 5  # Small delay between sessions
done

echo "Backfill complete!"
EOF

chmod +x /tmp/backfill-whisper-transcripts.sh
/tmp/backfill-whisper-transcripts.sh
```

**Total cost for 33 sessions:** 33 × $0.18 = **$5.94** (or free with Modal credits)

## Monitoring

Monitor your Modal deployments:

```bash
# List all Modal apps
modal app list

# View logs for transcription
modal app logs capless-api

# Check usage and costs
modal profile current
```

## Troubleshooting

### Error: "Secret r2-credentials not found"

Create the secret:
```bash
modal secret create r2-credentials \
  AWS_ACCESS_KEY_ID="<key>" \
  AWS_SECRET_ACCESS_KEY="<secret>"
```

### Error: "Video not found in R2"

Ensure the video exists in R2 at the expected path:
```bash
npx wrangler r2 object list capless-preview --prefix youtube/videos/
```

### Error: "401 Unauthorized"

Check your Modal Proxy Auth tokens are correct and included in headers.

### Transcription taking too long

This is normal on first request (~2-3 minutes) as Modal cold-starts the GPU container and downloads the Whisper model. Subsequent requests are much faster (~15 minutes per 4-hour session).

## Next Steps

After deployment:
1. Test with one session first (2024-10-15)
2. If successful, process the second session (2024-10-16)
3. Optionally backfill all 33 sessions for word-level timestamps
4. Integrate with Cloudflare Worker for automated processing

## Storage Structure After Transcription

```
R2: capless-preview/
├── youtube/
│   ├── videos/
│   │   ├── 2024-10-15.mp4
│   │   └── 2024-10-16.mp4
│   ├── audio/  ← NEW: extracted audio files
│   │   ├── 2024-10-15.mp3
│   │   └── 2024-10-16.mp3
│   ├── transcripts/  ← existing YouTube captions
│   │   └── ...
│   └── transcripts-whisper/  ← NEW: Whisper transcriptions
│       ├── 2024-10-15.vtt  (WebVTT format)
│       ├── 2024-10-15.json (word-level timestamps)
│       ├── 2024-10-16.vtt
│       └── 2024-10-16.json
```

## Summary

This deployment gives you:
- Reusable GPU-powered transcription endpoint
- Word-level timestamps for precise video alignment
- Secure authentication with Modal Proxy Auth
- Cost-effective processing (~$0.18 per 4-hour session)
- Scalable to future parliament recordings

**Estimated deployment time:** 10-15 minutes
**Estimated transcription time:** 15-20 minutes per 4-hour session
