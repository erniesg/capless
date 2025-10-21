# Asset Generator Worker - Deployment Guide

**Status:** ✅ Ready for Deployment
**Test Results:** 65/65 unit tests passing
**TypeScript:** ✅ No compilation errors

## Pre-Deployment Checklist

### 1. ElevenLabs Voice Setup

Before deploying, you MUST configure 4 voice IDs in ElevenLabs:

1. **Go to ElevenLabs Voice Lab**
   - URL: https://elevenlabs.io/voice-lab
   - Login with your account

2. **Create/Clone 4 Voices:**

   **Gen Z Voice**
   - Age: Young (18-25)
   - Gender: Female
   - Accent: American/International
   - Style: Energetic, casual, expressive
   - Voice Characteristics: High energy, varied pitch, fast-paced
   - Copy Voice ID → Will use for `ELEVENLABS_VOICE_GEN_Z`

   **Kopitiam Uncle Voice**
   - Age: Middle-aged (40-55)
   - Gender: Male
   - Accent: Singaporean
   - Style: Gruff, cynical, street-smart
   - Voice Characteristics: Lower pitch, steady rhythm, conversational
   - Copy Voice ID → Will use for `ELEVENLABS_VOICE_UNCLE`

   **Anxious Auntie Voice**
   - Age: Middle-aged (45-60)
   - Gender: Female
   - Accent: Singaporean
   - Style: Worried, concerned, animated
   - Voice Characteristics: Higher pitch, varied speed, emotional
   - Copy Voice ID → Will use for `ELEVENLABS_VOICE_AUNTIE`

   **Attenborough Observer Voice**
   - Age: Elderly (60+)
   - Gender: Male
   - Accent: British (RP)
   - Style: Documentary narrator, measured, authoritative
   - Voice Characteristics: Deep, steady, calm, precise
   - Copy Voice ID → Will use for `ELEVENLABS_VOICE_ATTENBOROUGH`

3. **Test Each Voice**
   - Use ElevenLabs playground to test sample scripts
   - Ensure each voice matches persona characteristics
   - Adjust stability/style settings if needed

### 2. Update wrangler.toml

Edit `/Users/erniesg/code/erniesg/capless/workers/asset-generator/wrangler.toml`:

```toml
# Paste your actual ElevenLabs voice IDs here:
ELEVENLABS_VOICE_GEN_Z = "voice_id_from_elevenlabs_1"
ELEVENLABS_VOICE_UNCLE = "voice_id_from_elevenlabs_2"
ELEVENLABS_VOICE_AUNTIE = "voice_id_from_elevenlabs_3"
ELEVENLABS_VOICE_ATTENBOROUGH = "voice_id_from_elevenlabs_4"
```

### 3. Set Environment Secrets

From the worker directory:

```bash
cd /Users/erniesg/code/erniesg/capless/workers/asset-generator

# Set OpenAI API Key
wrangler secret put OPENAI_API_KEY
# Paste your key: sk-...

# Set Anthropic API Key (for future judge enhancement)
wrangler secret put ANTHROPIC_API_KEY
# Paste your key: sk-ant-...

# Set ElevenLabs API Key
wrangler secret put ELEVENLABS_API_KEY
# Paste your key from ElevenLabs dashboard
```

### 4. Verify R2 Bucket Exists

```bash
# List R2 buckets
wrangler r2 bucket list

# If 'capless' bucket doesn't exist, create it:
wrangler r2 bucket create capless

# Enable public access for audio and thumbnails:
wrangler r2 bucket domain add capless --domain capless.r2.dev
```

### 5. Verify Service Bindings

Ensure the Moments worker is deployed first:

```bash
cd /Users/erniesg/code/erniesg/capless/workers/moments
wrangler deploy
```

The Asset Generator worker has a service binding to `capless-moments` configured in `wrangler.toml`.

## Deployment Steps

### Development Deployment

```bash
cd /Users/erniesg/code/erniesg/capless/workers/asset-generator

# Run locally for testing
npm run dev
# Server runs on http://localhost:8787

# Test endpoints:
curl http://localhost:8787/health
```

### Production Deployment

```bash
# Deploy to Cloudflare Workers
npm run deploy

# Output will show:
# ✨ Successfully published your Worker to...
# https://capless-asset-generator.<your-subdomain>.workers.dev
```

### Verify Deployment

```bash
# Test health endpoint
curl https://capless-asset-generator.<your-subdomain>.workers.dev/health

# Expected response:
{
  "status": "healthy",
  "service": "capless-asset-generator",
  "timestamp": "2025-10-21T...",
  "openai_available": true,
  "elevenlabs_available": true,
  "r2_available": true
}
```

## Post-Deployment Testing

### 1. Test Script Generation

```bash
curl -X POST https://capless-asset-generator.<subdomain>.workers.dev/api/assets/scripts \
  -H "Content-Type: application/json" \
  -d '{
    "moment_id": "test_moment_123",
    "personas": ["gen_z"],
    "platform": "tiktok"
  }'
```

**Expected:** Returns Gen Z script with Voice DNA markers

### 2. Test Audio Generation

```bash
curl -X POST https://capless-asset-generator.<subdomain>.workers.dev/api/assets/audio \
  -H "Content-Type: application/json" \
  -d '{
    "script": "Test script for audio generation",
    "persona": "gen_z",
    "speed": 1.0
  }'
```

**Expected:** Returns audio_url pointing to R2 bucket

### 3. Test Full Pipeline

```bash
curl -X POST https://capless-asset-generator.<subdomain>.workers.dev/api/assets/full \
  -H "Content-Type: application/json" \
  -d '{
    "moment_id": "test_moment_123",
    "platform": "tiktok",
    "auto_select": true
  }'
```

**Expected:** Returns complete asset package with script, audio, thumbnail, and judge metadata

## Integration Testing

### Run Integration Tests

From the project root:

```bash
cd /Users/erniesg/code/erniesg/capless
npm test tests/integration/asset-generator.spec.ts
```

**Expected Results:**
- ✅ All script generation tests pass
- ✅ All Voice DNA validation tests pass
- ✅ All audio generation tests pass
- ✅ All thumbnail generation tests pass
- ✅ Complete pipeline test passes in <30s

## Monitoring & Debugging

### View Logs

```bash
# Tail production logs
wrangler tail

# Filter by error level
wrangler tail --status error
```

### Common Issues

**Issue: "Voice ID not configured"**
- Solution: Check wrangler.toml has correct ELEVENLABS_VOICE_* values
- Verify voice IDs copied from ElevenLabs

**Issue: "ElevenLabs API error: Unauthorized"**
- Solution: Run `wrangler secret put ELEVENLABS_API_KEY` again
- Verify API key is active in ElevenLabs dashboard

**Issue: "Moment not found"**
- Solution: Ensure Moments worker is deployed and accessible
- Check service binding in wrangler.toml points to correct service

**Issue: "R2 storage error"**
- Solution: Verify R2 bucket exists and has public access
- Check bucket binding in wrangler.toml

**Issue: Scripts fail Voice DNA validation**
- Solution: Increase temperature in ScriptGenerator (currently 0.9)
- Check Voice DNA prompts are complete in voice-dna.ts

## Performance Benchmarks

After deployment, verify performance meets targets:

| Endpoint | Target | Command |
|----------|--------|---------|
| `/api/assets/scripts` | <15s | `time curl -X POST .../api/assets/scripts -d {...}` |
| `/api/assets/audio` | <8s | `time curl -X POST .../api/assets/audio -d {...}` |
| `/api/assets/thumbnail` | <5s | `time curl -X POST .../api/assets/thumbnail -d {...}` |
| `/api/assets/full` | <30s | `time curl -X POST .../api/assets/full -d {...}` |

## Cost Monitoring

### Enable Cost Tracking

1. **Go to Cloudflare Dashboard**
   - Workers & Pages → Analytics
   - Enable detailed analytics

2. **Monitor API Usage**
   - OpenAI: https://platform.openai.com/usage
   - ElevenLabs: https://elevenlabs.io/app/speech-synthesis
   - Track requests/day and costs

3. **Set Budget Alerts**
   - OpenAI: Set spending limits in account settings
   - ElevenLabs: Monitor character usage
   - Cloudflare: Set up billing alerts

### Expected Costs (100 videos/day)

- OpenAI GPT-4o: ~$90/month
- ElevenLabs TTS: ~$150/month
- Cloudflare Workers: ~$5/month
- R2 Storage: ~$1/month
- **Total: ~$246/month**

## Rollback Procedure

If deployment fails or causes issues:

```bash
# List recent deployments
wrangler deployments list

# Rollback to previous version
wrangler rollback --deployment-id <previous-deployment-id>
```

## Next Steps

After successful deployment:

1. ✅ Deploy Video Compositor Worker (Worker 5/5)
2. ✅ Run end-to-end integration tests
3. ✅ Set up monitoring dashboards
4. ✅ Configure alerting for errors
5. ✅ Create production runbook

## Support

- **Documentation:** `/Users/erniesg/code/erniesg/capless/workers/asset-generator/README.md`
- **Architecture:** `/Users/erniesg/code/erniesg/capless/ARCHITECTURE.md`
- **Personas:** `/Users/erniesg/code/erniesg/capless/PERSONAS.md`
- **Integration Tests:** `/Users/erniesg/code/erniesg/capless/tests/integration/asset-generator.spec.ts`

---

**Deployment Checklist:**
- [ ] ElevenLabs voices created and IDs copied
- [ ] Voice IDs added to wrangler.toml
- [ ] API keys set via wrangler secret put
- [ ] R2 bucket exists and is accessible
- [ ] Moments worker deployed
- [ ] Health endpoint returns "healthy"
- [ ] Integration tests passing
- [ ] Performance benchmarks met
- [ ] Cost monitoring enabled

**Status:** Ready for production deployment! 🚀
