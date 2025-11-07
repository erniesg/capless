# Modal Authentication Issue - Investigation Results

## Issue Summary

**Original Problem:** The endpoint `https://erniesg--capless-api-transcribe.modal.run/` returns "modal-http: invalid function call" when called with Modal-Key and Modal-Secret headers.

**Root Cause Identified:** The endpoint URL has changed due to redeployment, and proper Proxy Auth Tokens need to be created and used.

## Current Status

### Deployment ✅ WORKING
- **App Name:** `capless-api`
- **Status:** Deployed successfully
- **Workspace:** `berlayar-ai`
- **Correct Endpoint URL:** `https://berlayar-ai--transcribe.modal.run`
- **Deployment Date:** 2025-10-30 15:19 +08

### Test Results
```bash
# Without authentication:
curl -X POST "https://berlayar-ai--transcribe.modal.run" \
  -H "Content-Type: application/json" \
  -d '{"session_date": "2024-10-15"}'

# Response: "modal-http: missing credentials for proxy authorization"
# ✅ This is CORRECT behavior - endpoint is properly secured
```

## What Changed

### Old URL (Referenced in Error)
- `https://erniesg--capless-api-transcribe.modal.run/`

### New URL (After Redeployment)
- `https://berlayar-ai--transcribe.modal.run`
- The workspace name changed from `erniesg` to `berlayar-ai`
- The label is now just `transcribe` (cleaner)

## How Modal Proxy Auth Works

### 1. Endpoint Protection
The function in `/Users/erniesg/code/erniesg/capless/modal/modal-capless-transcribe.py` uses:

```python
@app.function(image=image)
@modal.fastapi_endpoint(
    method="POST",
    label="transcribe",
    requires_proxy_auth=True,  # ← This requires authentication
)
```

### 2. Authentication Method
When `requires_proxy_auth=True` is set, all requests must include two HTTP headers:
- **Modal-Key:** The token ID (format: `wk-xxxxx` or `ak-xxxxx`)
- **Modal-Secret:** The token secret (format: `ws-xxxxx` or `as-xxxxx`)

### 3. Error Messages

| Error Message | Meaning | Solution |
|--------------|---------|----------|
| `missing credentials for proxy authorization` | No Modal-Key/Modal-Secret headers | Add authentication headers |
| `invalid credentials for proxy authorization` | Wrong token values | Check token values are correct |
| `modal-http: invalid function call` | Wrong endpoint URL or function doesn't exist | Use correct endpoint URL |

## How to Fix

### Step 1: Create Proxy Auth Token

**Option A: Web UI (Recommended)**
1. Go to https://modal.com
2. Log in to your `berlayar-ai` workspace
3. Navigate to **Settings** → **Proxy Auth Tokens** (or `/settings/tokens`)
4. Click **"Create Token"** or **"New Proxy Auth Token"**
5. Save both values:
   - **Modal-Key** (Token ID): `wk-xxxxxxxxxx`
   - **Modal-Secret** (Token Secret): `ws-xxxxxxxxxx`

**Option B: Check Existing Tokens**
1. Visit https://modal.com/settings/tokens
2. Look for existing Proxy Auth Tokens
3. If you already have tokens, you can reuse them

**Important Notes:**
- The token secret is only shown once when created
- Store it securely (e.g., in `.env.local` or password manager)
- Everyone in the workspace can create and manage proxy auth tokens
- Tokens work for all endpoints with `requires_proxy_auth=True` in that workspace

### Step 2: Store Credentials Securely

Add to `/Users/erniesg/code/erniesg/capless/.env.local`:

```bash
# Modal Proxy Auth Tokens (for transcription endpoint)
MODAL_KEY=wk-your-actual-key-here
MODAL_SECRET=ws-your-actual-secret-here
```

### Step 3: Test the Endpoint

```bash
# Load credentials from .env.local
source /Users/erniesg/code/erniesg/capless/.env.local

# Test with authentication
curl -X POST "https://berlayar-ai--transcribe.modal.run" \
  -H "Modal-Key: $MODAL_KEY" \
  -H "Modal-Secret: $MODAL_SECRET" \
  -H "Content-Type: application/json" \
  -d '{
    "session_date": "2024-10-15",
    "skip_audio_extraction": false
  }'
```

**Expected Success Response:**
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

## Verification Commands

### Check Current Modal Configuration
```bash
# Show current profile (should show: berlayar-ai)
modal profile current

# Show Modal configuration
modal config show

# List deployed apps
modal app list
```

### Check Deployment Details
```bash
# View app details
# Visit: https://modal.com/apps/berlayar-ai/main/deployed/capless-api
```

### Monitor Logs (After Testing)
```bash
# View recent logs
modal app logs capless-api
```

## Common Issues and Solutions

### Issue 1: "invalid function call"
**Cause:** Using wrong endpoint URL (old URL or incorrect workspace name)
**Solution:** Use the current endpoint: `https://berlayar-ai--transcribe.modal.run`

### Issue 2: "missing credentials for proxy authorization"
**Cause:** No Modal-Key/Modal-Secret headers in request
**Solution:** Add both headers with valid proxy auth token values

### Issue 3: "invalid credentials for proxy authorization"
**Cause:** Wrong token ID or secret
**Solution:**
1. Verify tokens at https://modal.com/settings/tokens
2. Create new token if needed
3. Ensure no extra spaces or characters in header values

### Issue 4: Endpoint URL keeps changing
**Cause:** The URL is constructed from: `{workspace}--{label}.modal.run`
**Solution:**
- The workspace is determined by your Modal account settings
- The label is set in code: `label="transcribe"`
- To keep URL stable, don't change workspace or label

## Integration with Cloudflare Workers

When integrating this Modal endpoint with Cloudflare Workers, you'll need to:

1. **Store credentials as Cloudflare Worker secrets:**
```bash
wrangler secret put MODAL_KEY
# Enter: wk-your-key

wrangler secret put MODAL_SECRET
# Enter: ws-your-secret
```

2. **Make authenticated requests from Worker:**
```typescript
const response = await fetch('https://berlayar-ai--transcribe.modal.run', {
  method: 'POST',
  headers: {
    'Modal-Key': env.MODAL_KEY,
    'Modal-Secret': env.MODAL_SECRET,
    'Content-Type': 'application/json',
  },
  body: JSON.stringify({
    session_date: '2024-10-15',
    skip_audio_extraction: false,
  }),
});
```

## Cost Estimate

- **GPU Time:** ~15 minutes per 4-hour parliament session
- **Cost:** $0.18 per session (T4 GPU @ $0.71/hour)
- **Modal Free Tier:** $30/month = 166 sessions
- **Processing 2 missing sessions:** $0.36 total (well within free tier)

## Next Steps

1. **Create Proxy Auth Token** (https://modal.com/settings/tokens)
2. **Add to .env.local** (keep it secure, don't commit to git)
3. **Test endpoint** with authentication
4. **Update any scripts/workers** with new endpoint URL and credentials
5. **Process the 2 missing sessions:**
   - 2024-10-15
   - 2024-10-16

## Key Takeaways

✅ **Deployment is working correctly** - app is live and healthy
✅ **Security is working as designed** - endpoint requires authentication
✅ **Solution is simple** - just need to create and use proxy auth tokens
✅ **URL structure is stable** - `{workspace}--{label}.modal.run`
✅ **Free tier is generous** - can process 166 sessions within $30 credit

## Reference Links

- **Modal Dashboard:** https://modal.com
- **Workspace Settings:** https://modal.com/settings/workspaces
- **Token Management:** https://modal.com/settings/tokens
- **Proxy Auth Docs:** https://modal.com/docs/guide/webhook-proxy-auth
- **App Deployment:** https://modal.com/apps/berlayar-ai/main/deployed/capless-api

## Environment Info

- **Modal Client Version:** 1.0.5
- **Python File:** `/Users/erniesg/code/erniesg/capless/modal/modal-capless-transcribe.py`
- **Workspace:** `berlayar-ai`
- **App ID:** `ap-cdCTJnacHUsPxZt75ybw5k`
- **Current Status:** Deployed (2025-10-30 15:19 +08)
