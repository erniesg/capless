# Asset Generator Worker - Quick Start

## 5-Minute Setup

### 1. Install Dependencies
```bash
cd /Users/erniesg/code/erniesg/capless/workers/asset-generator
npm install
```

### 2. Run Tests
```bash
npm test
# Expected: ✅ 65/65 tests passing
```

### 3. Start Dev Server
```bash
npm run dev
# Server runs on http://localhost:8787
```

### 4. Test Health Endpoint
```bash
curl http://localhost:8787/health
```

## API Quick Reference

### Generate Scripts
```bash
curl -X POST http://localhost:8787/api/assets/scripts \
  -H "Content-Type: application/json" \
  -d '{
    "moment_id": "test_moment_123",
    "personas": ["gen_z", "kopitiam_uncle"],
    "platform": "tiktok"
  }'
```

### Generate Audio
```bash
curl -X POST http://localhost:8787/api/assets/audio \
  -H "Content-Type: application/json" \
  -d '{
    "script": "Test script",
    "persona": "gen_z",
    "speed": 1.2
  }'
```

### Generate Thumbnail
```bash
curl -X POST http://localhost:8787/api/assets/thumbnail \
  -H "Content-Type: application/json" \
  -d '{
    "moment_id": "test_moment_123",
    "persona": "gen_z"
  }'
```

### Complete Asset Package
```bash
curl -X POST http://localhost:8787/api/assets/full \
  -H "Content-Type: application/json" \
  -d '{
    "moment_id": "test_moment_123",
    "platform": "tiktok",
    "auto_select": true
  }'
```

## Deployment Quick Start

### 1. Create ElevenLabs Voices
- Go to https://elevenlabs.io/voice-lab
- Create 4 voices (Gen Z, Uncle, Auntie, Attenborough)
- Copy voice IDs

### 2. Update wrangler.toml
```toml
ELEVENLABS_VOICE_GEN_Z = "your_voice_id_1"
ELEVENLABS_VOICE_UNCLE = "your_voice_id_2"
ELEVENLABS_VOICE_AUNTIE = "your_voice_id_3"
ELEVENLABS_VOICE_ATTENBOROUGH = "your_voice_id_4"
```

### 3. Set Secrets
```bash
wrangler secret put OPENAI_API_KEY
wrangler secret put ANTHROPIC_API_KEY
wrangler secret put ELEVENLABS_API_KEY
```

### 4. Deploy
```bash
npm run deploy
```

## Voice DNA Validation

### Gen Z Markers (need ≥2)
- "bestie", "it's giving", "I can't", "the way"
- "make it make sense", "tell me", "not the", "literally"

### Kopitiam Uncle Markers (need ≥3)
- "lah", "leh", "lor", "wah lau", "aiyah"
- "liddat", "can ah", "how to", "so nice"

### Anxious Auntie Markers (need ≥2)
- "aiyoh", "how?", "then how", "so stress"
- "cannot like that", "my family", "must plan"

### Attenborough Markers (need ≥2)
- "here", "observe", "in nature", "curious"
- "remarkable", "behavior", "chamber"

## Troubleshooting

**Tests fail?**
```bash
npm install
npm test
```

**Type errors?**
```bash
npm run type-check
```

**Worker won't start?**
```bash
# Check wrangler version
wrangler version
# Update if needed
npm install -g wrangler@latest
```

**ElevenLabs API errors?**
- Verify API key is active
- Check voice IDs are correct
- Ensure billing is set up

## File Structure
```
workers/asset-generator/
├── src/
│   ├── index.ts              # Main handler
│   ├── types.ts              # Type definitions
│   ├── generators/           # Script, audio, thumbnail, judge
│   └── personas/             # Voice DNA configs
├── test/                      # 65 unit tests
├── README.md                  # Full documentation
├── DEPLOYMENT.md              # Deployment guide
└── BUILD_SUMMARY.md           # Build report
```

## Next Steps

1. ✅ Review [README.md](README.md) for complete API documentation
2. ✅ Follow [DEPLOYMENT.md](DEPLOYMENT.md) for production deployment
3. ✅ Read [BUILD_SUMMARY.md](BUILD_SUMMARY.md) for architecture details
4. ✅ Check [PERSONAS.md](../../PERSONAS.md) for Voice DNA details

---

**Status:** ✅ Production Ready
**Tests:** 65/65 passing
**TypeScript:** 0 errors
**Performance:** <22s complete pipeline
