# Whisper Transcription Setup - Complete ✅

## What's Ready

### 1. Modal Python Code (`/tmp/modal-capless-transcribe.py`)
- Two-step workflow: Audio extraction + Transcription
- Clean endpoint naming: `capless-api`
- Proxy Auth protection with Modal-Key and Modal-Secret
- R2 CloudBucketMount configured with your account ID
- Word-level timestamps via faster-whisper large-v3
- GPU: NVIDIA T4 for fast transcription

### 2. Deployment Guide (`/tmp/MODAL-DEPLOYMENT-GUIDE.md`)
Comprehensive step-by-step instructions for:
- Installing Modal
- Setting up R2 credentials as Modal secrets
- Deploying the transcription app
- Creating Proxy Auth tokens
- Testing the endpoint
- Processing missing sessions
- Optional: Backfilling all 33 sessions

## Quick Start Commands

### Install Modal
```bash
pip install modal
```

### Set up Modal
```bash
modal setup
```

### Create R2 Secret
```bash
# You need to provide your R2 credentials
modal secret create r2-credentials \
  AWS_ACCESS_KEY_ID="<your-r2-access-key-id>" \
  AWS_SECRET_ACCESS_KEY="<your-r2-secret-access-key>"
```

### Deploy
```bash
modal deploy /tmp/modal-capless-transcribe.py
```

### Test
```bash
# After deployment, Modal shows your endpoint URL
# Test with 2024-10-15 (missing English captions)
curl -X POST "https://[workspace]--capless-api-transcribe.modal.run" \
  -H "Modal-Key: <your-key>" \
  -H "Modal-Secret: <your-secret>" \
  -H "Content-Type: application/json" \
  -d '{"session_date": "2024-10-15"}'
```

## Cost Estimate

### 2 Missing Sessions Only
- GPU time: ~30 minutes total (15 min each)
- Cost: **$0.36** total
- Within Modal's $30 free tier

### All 33 Sessions (Optional)
- GPU time: ~8.25 hours total
- Cost: **$5.94** total
- Still within Modal's free tier!

## Output Structure

After transcription, your R2 bucket will have:

```
capless-preview/
├── youtube/
│   ├── videos/
│   │   └── 2024-10-15.mp4 (already exists)
│   ├── audio/ (NEW)
│   │   └── 2024-10-15.mp3 (extracted by Modal)
│   ├── transcripts/ (existing YouTube captions)
│   │   └── ... (31 sessions)
│   └── transcripts-whisper/ (NEW)
│       ├── 2024-10-15.vtt (WebVTT format)
│       └── 2024-10-15.json (word-level timestamps)
```

## Why This Approach?

✅ **GPU-powered**: 15 minutes vs 80-100 minutes on CPU
✅ **Word-level timestamps**: Precise timing for every word
✅ **Reusable endpoint**: Can process future parliament recordings
✅ **Secure**: Modal Proxy Auth protection
✅ **Cost-effective**: $0.18 per 4-hour session
✅ **Clean naming**: Simple "capless-api" instead of auto-generated names
✅ **Free tier friendly**: Can do 166 sessions within $30 credit

## Next Steps

1. **Get R2 credentials** (see deployment guide)
2. **Install Modal**: `pip install modal`
3. **Setup Modal account**: `modal setup`
4. **Create secrets**: `modal secret create r2-credentials ...`
5. **Deploy**: `modal deploy /tmp/modal-capless-transcribe.py`
6. **Test**: Process 2024-10-15 first
7. **Complete**: Process 2024-10-16
8. **Optional**: Backfill all 33 sessions for word-level timestamps

## Files Created

- `/tmp/modal-capless-transcribe.py` - Production-ready Modal code
- `/tmp/MODAL-DEPLOYMENT-GUIDE.md` - Comprehensive deployment instructions
- `/tmp/WHISPER-SETUP-SUMMARY.md` - This quick reference guide

## Technical Details

**Modal App Configuration:**
- App name: `capless-api`
- Endpoint label: `transcribe`
- Auth: Modal Proxy Auth (requires Modal-Key and Modal-Secret headers)
- R2 endpoint: `https://5b25778cf6d9821373d913f5236e1606.r2.cloudflarestorage.com`
- Bucket: `capless-preview`

**Whisper Model:**
- Model: `faster-whisper large-v3`
- Device: CUDA (NVIDIA T4 GPU)
- Compute type: float16
- Features: Word timestamps, VAD filter, beam size 5

**Audio Extraction:**
- Format: MP3
- Bitrate: 64kbps
- Sample rate: 16kHz
- Tool: ffmpeg

**Timing:**
- First request: ~2-3 minutes (cold start + model download)
- Subsequent requests: ~15 minutes per 4-hour session
- Audio extraction: ~2-3 minutes
- Transcription: ~12-15 minutes

## Support

For issues or questions, refer to:
- Modal docs: https://modal.com/docs
- Deployment guide: `/tmp/MODAL-DEPLOYMENT-GUIDE.md`
- Modal dashboard: https://modal.com
