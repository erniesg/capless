# Capless - Implementation Guide

**4-Hour MVP → Production-Ready Platform**

This document provides a phase-by-phase TDD implementation checklist with actual tasks you can check off.

---

## Phase 0: Prerequisites (30 minutes)

### Setup Cloudflare Account
- [ ] Create Cloudflare account at dash.cloudflare.com
- [ ] Install Wrangler CLI: `npm install -g wrangler`
- [ ] Authenticate: `wrangler login`
- [ ] Verify auth: `wrangler whoami`

### Setup Upstash Redis
- [ ] Create account at console.upstash.com
- [ ] Create Redis database (free tier)
- [ ] Copy REST URL (looks like: `https://xxx.upstash.io`)
- [ ] Copy REST token (looks like: `AYN...`)
- [ ] Test connection with curl:
```bash
curl https://YOUR_UPSTASH_URL/get/test \
  -H "Authorization: Bearer YOUR_TOKEN"
```

### Setup R2 Storage
- [ ] Create R2 bucket: `wrangler r2 bucket create capless`
- [ ] Verify: `wrangler r2 bucket list`
- [ ] Enable public access (Cloudflare dashboard → R2 → capless → Settings → Public access)

### Setup API Keys
- [ ] Get OpenAI API key at platform.openai.com/api-keys
- [ ] Get Anthropic API key at console.anthropic.com
- [ ] Get ElevenLabs API key at elevenlabs.io/app/settings/api-keys
- [ ] Get Modal token at modal.com (for video rendering)

### Project Structure
- [ ] Create project directory: `mkdir capless && cd capless`
- [ ] Initialize npm: `npm init -y`
- [ ] Create folder structure:
```bash
mkdir -p src               # Main worker code
mkdir -p public/{js,css}   # Frontend static assets
mkdir scripts              # Local utilities
```

---

## Phase 1: Core AI Brain (Hour 1)

**Goal:** Build APIs that extract moments and generate scripts

### Test 1: Moment Extraction API

#### Setup
- [ ] Create `wrangler.toml` in project root:
```toml
name = "capless"
main = "src/index.js"
compatibility_date = "2025-01-20"

[assets]
directory = "./public"   # Frontend files
binding = "ASSETS"

[[r2_buckets]]
binding = "R2_BUCKET"
bucket_name = "capless"
```

- [ ] Create `package.json`:
```json
{
  "dependencies": {
    "@upstash/redis": "^1.28.0",
    "openai": "^4.28.0",
    "@anthropic-ai/sdk": "^0.18.0"
  }
}
```

- [ ] Install dependencies: `npm install`

- [ ] Add secrets:
```bash
wrangler secret put UPSTASH_REDIS_REST_URL
wrangler secret put UPSTASH_REDIS_REST_TOKEN
wrangler secret put OPENAI_API_KEY
wrangler secret put ANTHROPIC_API_KEY
wrangler secret put ELEVENLABS_API_KEY
```

#### Write Test
- [ ] Create test script `test.sh`:
```bash
#!/bin/bash
curl -X POST http://localhost:8787/api/find-moment \
  -H "Content-Type: application/json" \
  -d '{
    "transcript": "Mr Yip Hon Weng: To ask the Minister for Health what is the Governments assessment of the recent trends in Integrated Shield Plan premiums. Ms Rahayu Mahzam: The trends we observe are symptoms of a complex situation. These are consequences of what I would describe as a knot that insurers and policyholders find themselves caught in."
  }'
```

- [ ] Make executable: `chmod +x test.sh`

#### Implementation
- [ ] Create `src/index.js`:
```javascript
import { Redis } from '@upstash/redis/cloudflare';
import OpenAI from 'openai';

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    // Serve static assets for non-API routes
    if (!url.pathname.startsWith('/api/')) {
      return env.ASSETS.fetch(request);
    }

    // API route: /api/find-moment
    if (url.pathname === '/api/find-moment' && request.method === 'POST') {
      return handleFindMoment(request, env);
    }

    return new Response('Not found', { status: 404 });
  }
};

async function handleFindMoment(request, env) {
  const { transcript } = await request.json();

  if (!transcript || transcript.length < 100) {
    return new Response(
      JSON.stringify({ error: 'Transcript too short' }),
      { status: 400, headers: { 'Content-Type': 'application/json' } }
    );
  }

  // Initialize OpenAI
  const openai = new OpenAI({
    apiKey: env.OPENAI_API_KEY
  });

  // Initialize Redis
  const redis = new Redis({
    url: env.UPSTASH_REDIS_REST_URL,
    token: env.UPSTASH_REDIS_REST_TOKEN,
  });

  // Call OpenAI API
  const prompt = `You are a content strategist for viral social media.
Analyze this Singapore Parliament transcript and identify the SINGLE most interesting, viral-worthy moment.

Look for:
- Bureaucratic jargon or doublespeak
- Contradictions or illogical reasoning
- Statements that affect everyday Singaporeans
- Moments that make people say "What does that even mean?!"

Return ONLY valid JSON (no markdown, no explanation):
{
  "quote": "exact quote from transcript",
  "speaker": "MP name",
  "timestamp_start": "00:14:32",
  "timestamp_end": "00:15:08",
  "topic": "Healthcare",
  "why_viral": "brief explanation"
}

Transcript:
${transcript}`;

  const completion = await openai.chat.completions.create({
    model: "gpt-4o",
    messages: [{ role: "user", content: prompt }],
    response_format: { type: "json_object" }
  });

  // Parse AI response
  let moment;
  try {
    moment = JSON.parse(completion.choices[0].message.content);
  } catch (e) {
    return new Response(
      JSON.stringify({ error: 'AI response parse error', details: e.message }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }

    // Create job in Redis
    const jobId = crypto.randomUUID();
    await redis.hset(`job:${jobId}`, {
      job_id: jobId,
      status: 'MOMENT_FOUND',
      moment_quote: moment.quote,
      moment_speaker: moment.speaker,
      moment_timestamp_start: moment.timestamp_start || '00:00:00',
      moment_timestamp_end: moment.timestamp_end || '00:00:30',
      moment_topic: moment.topic,
      moment_why_viral: moment.why_viral,
      created_at: new Date().toISOString(),
    });

    return new Response(JSON.stringify({ jobId, moment }), {
      headers: { 'Content-Type': 'application/json' }
    });
  }
};
```

#### Run Tests
- [ ] Add local secrets to `.dev.vars`:
```bash
UPSTASH_REDIS_REST_URL=your_url
UPSTASH_REDIS_REST_TOKEN=your_token
OPENAI_API_KEY=sk-...
ANTHROPIC_API_KEY=sk-ant-...
ELEVENLABS_API_KEY=...
```

- [ ] Start dev server: `wrangler dev`
- [ ] In another terminal, run test: `./test.sh`
- [ ] Verify response has `jobId` and `moment` with all fields
- [ ] Check Redis:
```bash
curl https://YOUR_UPSTASH_URL/keys/job* \
  -H "Authorization: Bearer YOUR_TOKEN"
```

#### Deploy
- [ ] Deploy to production: `wrangler deploy`
- [ ] Test production URL:
```bash
curl -X POST https://capless.YOUR_SUBDOMAIN.workers.dev/api/find-moment \
  -H "Content-Type: application/json" \
  -d '{"transcript": "..."}'
```

- [ ] Test frontend: Visit `https://capless.YOUR_SUBDOMAIN.workers.dev` in browser

---

### Test 2: Script Generation API

#### Setup
- [ ] `cd ../write-script`
- [ ] Copy `wrangler.toml` and update name: `capless-write-script`
- [ ] Copy `package.json` and run `npm install`

#### Write Test
- [ ] Create `test.sh`:
```bash
#!/bin/bash
curl -X POST http://localhost:8787/api/write-script \
  -H "Content-Type: application/json" \
  -d '{
    "jobId": "test-123",
    "moment": {
      "quote": "The trends we see are consequences of a knot that insurers find themselves caught in.",
      "speaker": "Ms Rahayu Mahzam",
      "topic": "Healthcare"
    },
    "persona": "gen_z"
  }'
```

- [ ] Make executable: `chmod +x test.sh`

#### Implementation
- [ ] Create `src/index.js`:
```javascript
import { Redis } from '@upstash/redis/cloudflare';

const PERSONA_PROMPTS = {
  gen_z: `You are an unhinged Gen Z TikToker who explains politics.

Voice characteristics:
- Use TikTok slang: "it's giving", "bestie", "I can't", "the math ain't mathing", "delulu"
- Heavy emoji use (💀, 🤯, ✨, 😤)
- Dramatic reactions and hyperbole
- Call out absurdity directly
- End with relevant hashtags

Example phrases:
- "Okay so..." (opening)
- "Bestie, I can't"
- "This is giving [x] vibes"
- "Make it make sense!"
- "The way that..."
- "I'm deceased 💀"`,

  kopitiam_uncle: `You are a cynical but lovable Kopitiam Uncle commenting on Singapore politics.

Voice characteristics:
- Heavy Singlish: "lah", "leh", "lor", "meh"
- Mix English with Mandarin/Hokkien words
- Use "wah lau", "aiyah", "KNN", "liddat also can"
- Street-smart and direct
- Rapid pace with run-on sentences
- No-nonsense attitude

Example phrases:
- "Wah lau eh!"
- "Liddat also can ah?"
- "Talk until so nice but..."
- "You think I don't know ah?"`,

  auntie: `You are an anxious Singapore Auntie (kiasu mentality) worried about everything.

Voice characteristics:
- Use "aiyoh", "how?", "so stress!", "cannot like that lah"
- Rapid-fire worries and questions
- Focus on money, family, practical concerns
- Fear of losing out (kiasu)
- Escalating panic throughout
- Many exclamation marks and questions

Example phrases:
- "Aiyoh! You hear or not?"
- "Then how??"
- "My family how?"
- "Cannot lose out!"
- "Must plan ahead!"
- "So stress!!!"`,

  attenborough: `You are David Attenborough narrating a nature documentary, but about Singapore Parliament.

Voice characteristics:
- Calm, measured, observational tone
- Describe political behavior like animal behavior
- Use nature documentary phrases
- Subtle irony and humor
- Educational but entertaining
- Pace varies for dramatic effect

Example phrases:
- "Here, in the chamber..."
- "Observe the behavior..."
- "A curious display of..."
- "The [politician] senses..."
- "In nature, we see..."
- "A remarkable adaptation..."`
};

export default {
  async fetch(request, env) {
    if (request.method !== 'POST') {
      return new Response('Method not allowed', { status: 405 });
    }

    const { jobId, moment, persona } = await request.json();

    if (!jobId || !moment || !persona) {
      return new Response(
        JSON.stringify({ error: 'Missing required fields' }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      );
    }

    if (!PERSONA_PROMPTS[persona]) {
      return new Response(
        JSON.stringify({ error: 'Invalid persona' }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      );
    }

    const redis = new Redis({
      url: env.UPSTASH_REDIS_REST_URL,
      token: env.UPSTASH_REDIS_REST_TOKEN,
    });

    // Generate script
    const systemPrompt = PERSONA_PROMPTS[persona];
    const userPrompt = `Create a 30-45 second TikTok commentary script about this parliamentary moment:

Speaker: ${moment.speaker}
Quote: "${moment.quote}"
Topic: ${moment.topic}

Requirements:
- 100-150 words (30-45 seconds when spoken)
- Stay in character throughout
- Make it entertaining and viral-worthy
- Help people understand what this really means
- End with a punchy conclusion

Script:`;

    const response = await env.AI.run('@cf/meta/llama-3.1-8b-instruct', {
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt }
      ]
    });

    const script = response.response.trim();

    // Update Redis
    await redis.hset(`job:${jobId}`, {
      [`script_${persona}`]: script,
      [`script_${persona}_generated_at`]: new Date().toISOString(),
      status: 'SCRIPTS_GENERATED',
      updated_at: new Date().toISOString(),
    });

    return new Response(JSON.stringify({ script, persona }), {
      headers: { 'Content-Type': 'application/json' }
    });
  }
};
```

#### Run Tests
- [ ] Add `.dev.vars` with Redis credentials
- [ ] Start dev server: `wrangler dev`
- [ ] Test with each persona:
```bash
# Test Gen Z
./test.sh

# Test Kopitiam Uncle
curl -X POST http://localhost:8787/api/write-script \
  -H "Content-Type: application/json" \
  -d '{"jobId":"test-123","moment":{...},"persona":"kopitiam_uncle"}'

# Test Auntie
curl -X POST http://localhost:8787/api/write-script \
  -H "Content-Type: application/json" \
  -d '{"jobId":"test-123","moment":{...},"persona":"auntie"}'

# Test Attenborough
curl -X POST http://localhost:8787/api/write-script \
  -H "Content-Type: application/json" \
  -d '{"jobId":"test-123","moment":{...},"persona":"attenborough"}'
```

- [ ] Verify each script matches persona voice
- [ ] Check Redis updated with all scripts

#### Deploy
- [ ] Deploy: `wrangler deploy`
- [ ] Test production endpoint

**✅ Checkpoint:** You now have working AI APIs that extract moments and generate persona scripts!

---

## Phase 2: Audio + UI (Hour 2)

**Goal:** Generate text-to-speech audio and build demo UI

### Test 3: Audio Generation API

#### Setup
- [ ] `cd ../generate-audio`
- [ ] Copy setup files, update name: `capless-generate-audio`
- [ ] Update `wrangler.toml` to include R2 binding:
```toml
[[r2_buckets]]
binding = "R2_BUCKET"
bucket_name = "capless"
```
- [ ] Run `npm install`

#### Write Test
- [ ] Create `test.sh`:
```bash
#!/bin/bash
curl -X POST http://localhost:8787/api/generate-audio \
  -H "Content-Type: application/json" \
  -d '{
    "jobId": "test-123",
    "script": "Okay so the Minister just explained why your insurance is expensive and its giving quantum physics. She literally said everyone is stuck in a KNOT. The math aint mathing!",
    "persona": "gen_z"
  }'
```

#### Implementation
- [ ] Create `src/index.js`:
```javascript
import { Redis } from '@upstash/redis/cloudflare';

const VOICE_CONFIG = {
  gen_z: { voice: 'en-US-female-2', speed: 1.2 },
  kopitiam_uncle: { voice: 'en-US-male-1', speed: 1.1 },
  auntie: { voice: 'en-US-female-1', speed: 1.15 },
  attenborough: { voice: 'en-GB-male-1', speed: 0.95 }
};

export default {
  async fetch(request, env) {
    if (request.method !== 'POST') {
      return new Response('Method not allowed', { status: 405 });
    }

    const { jobId, script, persona } = await request.json();

    if (!jobId || !script || !persona) {
      return new Response(
        JSON.stringify({ error: 'Missing required fields' }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      );
    }

    const redis = new Redis({
      url: env.UPSTASH_REDIS_REST_URL,
      token: env.UPSTASH_REDIS_REST_TOKEN,
    });

    const config = VOICE_CONFIG[persona] || VOICE_CONFIG.gen_z;

    // Generate audio with Deepgram Aura TTS
    const audioResponse = await env.AI.run('@cf/deepgram/aura', {
      text: script,
      voice: config.voice,
      speed: config.speed
    });

    // Upload to R2
    const audioKey = `audio/${jobId}_${persona}.mp3`;
    await env.R2_BUCKET.put(audioKey, audioResponse);

    // Get public URL (you'll need to configure this in R2 settings)
    const audioUrl = `https://pub-YOUR_R2_ID.r2.dev/${audioKey}`;

    // Update Redis
    await redis.hset(`job:${jobId}`, {
      audio_url: audioUrl,
      audio_persona: persona,
      audio_generated_at: new Date().toISOString(),
      status: 'AUDIO_GENERATED',
      updated_at: new Date().toISOString(),
    });

    return new Response(JSON.stringify({ audioUrl, persona }), {
      headers: { 'Content-Type': 'application/json' }
    });
  }
};
```

#### Run Tests
- [ ] Start dev server: `wrangler dev`
- [ ] Run test: `./test.sh`
- [ ] Verify response has `audioUrl`
- [ ] Check R2 bucket: `wrangler r2 object list capless --prefix audio/`
- [ ] Download audio: `wrangler r2 object get capless audio/test-123_gen_z.mp3 --file test.mp3`
- [ ] Play audio: `open test.mp3` (Mac) or equivalent
- [ ] Verify audio is clear and matches persona

#### Deploy
- [ ] Deploy: `wrangler deploy`
- [ ] Test production

---

### Test 4: Demo Frontend UI

#### Setup
- [ ] `cd ../../public`
- [ ] Create `index.html`
- [ ] Create `js/app.js`

#### Implementation
- [ ] Create `public/index.html`:
```html
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Capless - AI Parliament Commentary</title>
  <script src="https://cdn.tailwindcss.com"></script>
</head>
<body class="bg-gray-900 text-white min-h-screen p-8">
  <div class="max-w-4xl mx-auto">
    <header class="mb-12">
      <h1 class="text-5xl font-bold mb-4">🎙️ Capless</h1>
      <p class="text-xl text-gray-400">AI covers Singapore Parliament in language you can understand</p>
    </header>

    <div class="space-y-6">
      <button id="produceBtn"
              class="w-full bg-blue-600 hover:bg-blue-700 text-white font-bold py-4 px-8 rounded-lg text-xl transition-colors">
        🚀 Produce Today's Take
      </button>

      <div id="loading" class="hidden text-center">
        <div class="animate-spin rounded-full h-16 w-16 border-b-2 border-white mx-auto"></div>
        <p class="mt-4 text-gray-400" id="loadingText">Starting...</p>
      </div>

      <div id="output" class="space-y-6"></div>
    </div>
  </div>

  <script src="js/app.js"></script>
</body>
</html>
```

- [ ] Create `public/js/app.js`:
```javascript
// Configuration
const API_BASE = 'https://capless-find-moment.YOUR_SUBDOMAIN.workers.dev'; // Update this
const SAMPLE_TRANSCRIPT = `Mr Yip Hon Weng (Yio Chu Kang): To ask the Minister for Health what is the Government's assessment of the recent trends in Integrated Shield Plan premiums.

Ms Rahayu Mahzam (Minister of State for Health): The trends we observe in the IP market are symptoms of a complex situation. Escalating healthcare costs, rising premiums, and tightening claims management practices – these are all consequences of what I would describe as a knot that insurers, healthcare providers, and policyholders find themselves caught in. More regulation would not loosen this knot; it might make it worse.`;

const personas = ['gen_z', 'kopitiam_uncle', 'auntie'];
let currentJobId = null;

document.getElementById('produceBtn').addEventListener('click', async () => {
  const output = document.getElementById('output');
  const loading = document.getElementById('loading');
  const loadingText = document.getElementById('loadingText');
  const produceBtn = document.getElementById('produceBtn');

  // Reset
  output.innerHTML = '';
  loading.classList.remove('hidden');
  produceBtn.disabled = true;

  try {
    // Step 1: Find moment
    loadingText.textContent = '🔍 Finding viral moment...';
    const momentRes = await fetch(`${API_BASE}/api/find-moment`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ transcript: SAMPLE_TRANSCRIPT })
    });

    if (!momentRes.ok) throw new Error('Moment extraction failed');
    const { jobId, moment } = await momentRes.json();
    currentJobId = jobId;

    output.innerHTML = `
      <div class="bg-gray-800 p-6 rounded-lg border border-gray-700">
        <h2 class="text-2xl font-bold mb-4">📊 Viral Moment Found</h2>
        <p class="text-gray-400 mb-2"><strong>Speaker:</strong> ${moment.speaker}</p>
        <p class="text-gray-400 mb-2"><strong>Topic:</strong> ${moment.topic}</p>
        <blockquote class="border-l-4 border-blue-500 pl-4 py-2 italic text-lg">
          "${moment.quote}"
        </blockquote>
        <p class="text-gray-400 mt-4 text-sm"><strong>Why it's viral:</strong> ${moment.why_viral}</p>
      </div>
    `;

    // Step 2: Generate scripts
    loadingText.textContent = '✍️ Writing scripts for all personas...';
    const scripts = {};

    for (const persona of personas) {
      const scriptRes = await fetch(`${API_BASE.replace('find-moment', 'write-script')}/api/write-script`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ jobId, moment, persona })
      });

      if (!scriptRes.ok) throw new Error(`Script generation failed for ${persona}`);
      const { script } = await scriptRes.json();
      scripts[persona] = script;

      const personaNames = {
        'gen_z': '📱 StraightTok AI (Gen Z)',
        'kopitiam_uncle': '☕️ Kopitiam Uncle',
        'auntie': '😰 Anxious Auntie'
      };

      output.innerHTML += `
        <div class="bg-gray-800 p-6 rounded-lg border border-gray-700">
          <h3 class="text-xl font-bold mb-3">${personaNames[persona]}</h3>
          <p class="text-gray-300 whitespace-pre-wrap">${script}</p>
        </div>
      `;
    }

    // Step 3: Generate audio for Gen Z (winner)
    loadingText.textContent = '🎙️ Generating voiceover...';
    const audioRes = await fetch(`${API_BASE.replace('find-moment', 'generate-audio')}/api/generate-audio`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ jobId, script: scripts['gen_z'], persona: 'gen_z' })
    });

    if (!audioRes.ok) throw new Error('Audio generation failed');
    const { audioUrl } = await audioRes.json();

    output.innerHTML += `
      <div class="bg-gray-800 p-6 rounded-lg border border-gray-700">
        <h3 class="text-xl font-bold mb-3">🔊 Generated Voiceover</h3>
        <p class="text-gray-400 mb-4">Persona: StraightTok AI (Gen Z)</p>
        <audio controls class="w-full">
          <source src="${audioUrl}" type="audio/mpeg">
          Your browser does not support the audio element.
        </audio>
      </div>
    `;

    // Step 4: Show "video production" message
    output.innerHTML += `
      <div class="bg-yellow-900 border border-yellow-700 p-6 rounded-lg">
        <h3 class="text-xl font-bold mb-3">⚙️ Video Production</h3>
        <p class="text-yellow-200 mb-2">
          For the MVP, video composition is done locally with Python + MoviePy.
        </p>
        <p class="text-yellow-200 mb-4">
          In production, this will be automated via AWS Lambda or Modal.
        </p>
        <button onclick="showPrerenderedVideo()" class="bg-yellow-600 hover:bg-yellow-700 px-6 py-3 rounded-lg">
          📺 Show Pre-Rendered Demo Video
        </button>
      </div>
    `;

  } catch (error) {
    output.innerHTML = `
      <div class="bg-red-900 border border-red-700 p-6 rounded-lg">
        <h3 class="text-xl font-bold mb-2">❌ Error</h3>
        <p class="text-red-200">${error.message}</p>
      </div>
    `;
  } finally {
    loading.classList.add('hidden');
    produceBtn.disabled = false;
  }
});

window.showPrerenderedVideo = function() {
  const output = document.getElementById('output');
  output.innerHTML += `
    <div class="bg-gray-800 p-6 rounded-lg border border-gray-700">
      <h3 class="text-xl font-bold mb-4">✅ Final TikTok Video</h3>
      <video controls class="w-full rounded-lg" style="max-height: 600px;">
        <source src="demo-video.mp4" type="video/mp4">
        Your browser does not support the video element.
      </video>
      <div class="mt-4 flex gap-4">
        <button class="bg-blue-600 hover:bg-blue-700 px-6 py-3 rounded-lg flex-1">
          📤 Share to TikTok
        </button>
        <button class="bg-purple-600 hover:bg-purple-700 px-6 py-3 rounded-lg flex-1">
          📤 Share to Instagram
        </button>
      </div>
    </div>
  `;
};
```

#### Run Tests
- [ ] Start local server: `npx serve .`
- [ ] Open `http://localhost:3000`
- [ ] Click "Produce Today's Take"
- [ ] Verify: Moment displays correctly
- [ ] Verify: 3 scripts generate in different styles
- [ ] Verify: Audio player works and audio plays
- [ ] Test on mobile device (responsive design)

#### Deploy
- [ ] Deploy to Cloudflare Pages: `wrangler pages deploy . --project-name=capless`
- [ ] Get URL: `https://capless.pages.dev`
- [ ] Update `API_BASE` in `app.js` with your worker URLs
- [ ] Redeploy
- [ ] Test production site

**✅ Checkpoint:** You have a working demo UI that shows the full pipeline!

---

## Phase 3: Video Composition (Hour 3)

**Goal:** Create TikTok-ready video with Python

### Manual Prep (Do First!)
- [ ] Find Singapore Parliament video on YouTube
- [ ] Download the video segment with timestamps from your moment
- [ ] Use online tool to convert to 9:16 vertical format (crop center)
- [ ] Trim to exactly the quote duration (8-12 seconds)
- [ ] Upload to R2: `wrangler r2 object put capless clips/moment-001.mp4 --file=./video-clip.mp4`
- [ ] Get public URL and save it

### Test 5: Video Composition Script

#### Setup
- [ ] `cd ../../scripts`
- [ ] Create Python virtual environment:
```bash
python3 -m venv venv
source venv/bin/activate  # On Windows: venv\Scripts\activate
```

- [ ] Install dependencies:
```bash
pip install moviepy pillow numpy requests
```

- [ ] Create `requirements.txt`:
```
moviepy==1.0.3
pillow==10.2.0
numpy==1.26.4
requests==2.31.0
```

#### Write Test
- [ ] Create test data file `test_data.json`:
```json
{
  "jobId": "test-001",
  "videoUrl": "https://pub-YOUR_ID.r2.dev/clips/moment-001.mp4",
  "audioUrl": "https://pub-YOUR_ID.r2.dev/audio/test-001_gen_z.mp3",
  "script": "Okay so the Minister just explained why your insurance is expensive and it's giving quantum physics. She literally said everyone is stuck in a KNOT. The math ain't mathing!",
  "persona": "gen_z",
  "quote": "These are consequences of what I describe as a knot."
}
```

#### Implementation
- [ ] Create `video_composer_tiktok.py` (see complete implementation in repo)
- [ ] Key functions to implement:
  - `download_asset(url, local_path)` - Download from R2
  - `crop_to_vertical(video, width, height)` - Crop to 9:16
  - `create_tiktok_caption(text, ...)` - Animated text overlays
  - `generate_word_by_word_captions(script, duration)` - Synced captions
  - `create_progress_bar(width, height, duration)` - Progress indicator
  - `compose_tiktok_video(...)` - Main composition function

#### Run Tests
- [ ] Test with sample data:
```bash
python video_composer_tiktok.py test_data.json
```

- [ ] Verify output video exists: `ls /tmp/test-001_tiktok.mp4`
- [ ] Play video: `open /tmp/test-001_tiktok.mp4`
- [ ] Check quality:
  - [ ] Video is 1080x1920 (9:16 aspect ratio)
  - [ ] Duration is 30-45 seconds
  - [ ] Captions are readable on mobile
  - [ ] Audio is clear and synced
  - [ ] Persona emoji is visible
  - [ ] Progress bar animates smoothly
  - [ ] File size < 100MB

- [ ] Upload to R2:
```bash
wrangler r2 object put capless finals/test-001_tiktok.mp4 --file=/tmp/test-001_tiktok.mp4
```

**✅ Checkpoint:** You can now produce TikTok-ready videos locally!

---

## Phase 4: Integration & Demo (Hour 4)

**Goal:** Connect everything and prepare killer demo

### Test 6: End-to-End Pipeline

#### Pre-generate Demo Content
- [ ] Find 1 great Hansard transcript moment (10-15 lines)
- [ ] Run through entire pipeline:
```bash
# 1. Extract moment
curl -X POST https://capless-find-moment.YOUR.workers.dev/api/find-moment \
  -H "Content-Type: application/json" \
  -d @transcript.json > moment.json

# 2. Generate all scripts
for persona in gen_z kopitiam_uncle auntie; do
  curl -X POST https://capless-write-script.YOUR.workers.dev/api/write-script \
    -H "Content-Type: application/json" \
    -d "{\"jobId\":\"demo-001\",\"moment\":$(cat moment.json),\"persona\":\"$persona\"}"
done

# 3. Generate audio
curl -X POST https://capless-generate-audio.YOUR.workers.dev/api/generate-audio \
  -H "Content-Type: application/json" \
  -d @audio_request.json > audio.json

# 4. Compose video
python video_composer_tiktok.py demo_data.json

# 5. Upload to R2
wrangler r2 object put capless finals/demo-001.mp4 --file=/tmp/demo-001_tiktok.mp4
```

- [ ] Save all outputs (moment JSON, scripts, audio URL, video URL)
- [ ] Add demo video to frontend: Copy to `public/demo-video.mp4`

#### Test Complete Flow
- [ ] Open production site
- [ ] Run through demo with pre-generated content
- [ ] Verify all steps display correctly
- [ ] Test on mobile device (iPhone + Android)
- [ ] Test in different browsers (Chrome, Safari, Firefox)
- [ ] Verify video plays on mobile
- [ ] Check load times (should be < 3 seconds per API call)

### Demo Preparation

#### Create Backup Plan
- [ ] Take screenshots of each stage
- [ ] Download all generated assets locally
- [ ] Create PowerPoint slides showing:
  1. Problem statement
  2. Architecture diagram
  3. Live demo OR screenshots if live fails
  4. Sample outputs
  5. Roadmap

#### Prepare 3-Minute Pitch
- [ ] Write script:
  - [ ] Hook (15s): "Parliament is boring. We make it viral."
  - [ ] Problem (30s): Complex politics → inaccessible to young people
  - [ ] Solution (45s): AI personas explain in TikTok format
  - [ ] Demo (60s): Show live or video of pipeline
  - [ ] Vision (30s): Daily automated content, multi-platform

- [ ] Rehearse 3 times
- [ ] Time yourself (must be under 3 minutes)

#### Technical Readiness Checklist
- [ ] All Workers deployed and responding
- [ ] Redis has test data for fallback
- [ ] R2 has all demo assets
- [ ] Frontend is live and accessible
- [ ] Mobile view tested
- [ ] Demo video plays smoothly
- [ ] Backup slides ready

**✅ MVP COMPLETE!** You're demo-ready. 🚀

---

## Post-Hackathon: Phase 5-8

### Phase 5: Automated Hansard Ingestion (Week 1-2)

- [ ] Build web scraper for Parliament website
- [ ] Create cron trigger (daily 6am SGT)
- [ ] Store raw transcripts in R2
- [ ] Extract multiple moments per transcript
- [ ] Generate embeddings with Workers AI
- [ ] Setup vector search in Upstash Redis
- [ ] Test semantic search ("find cost of living moments")

### Phase 6: Scheduled Content Production (Week 3)

- [ ] Create 7am/7pm cron triggers
- [ ] Build content selector (picks best unused moments)
- [ ] Implement "Judge LLM" to rate scripts
- [ ] Automate video composition (AWS Lambda/Modal)
- [ ] Setup production queue
- [ ] Test end-to-end automated flow

### Phase 7: Live Collaboration (Week 4-5)

- [ ] Implement Durable Objects for WebSocket
- [ ] Build real-time editor UI
- [ ] Add AI suggestion system
- [ ] Enable multi-user collaboration
- [ ] Add supplementary context loading
- [ ] Test with multiple users

### Phase 8: Multi-Platform & Analytics (Week 6+)

- [ ] Adapt for Instagram Reels (4:5 aspect ratio)
- [ ] Adapt for YouTube Shorts (same as TikTok)
- [ ] Adapt for Twitter/X video
- [ ] Setup TikTok API integration
- [ ] Build analytics dashboard
- [ ] A/B test different personas
- [ ] Optimize based on engagement data

---

## Success Criteria

### MVP Demo (4 Hours)
- [x] Extract viral moment from transcript
- [x] Generate 3+ persona scripts
- [x] Create TTS audio
- [x] Produce 1 TikTok video
- [x] Working demo UI
- [x] 3-minute pitch ready

### Production Launch (8 Weeks)
- [ ] 100% automated pipeline
- [ ] Daily content at 7am/7pm
- [ ] Multi-platform publishing
- [ ] >60% completion rate on TikTok
- [ ] >5% share rate
- [ ] Growing follower base

---

## Troubleshooting

### Workers AI Issues
- **Rate limiting:** Use free 10K neurons wisely. Cache responses in Redis.
- **Timeout:** Increase timeout in wrangler.toml: `[limits] cpu_ms = 30000`

### Redis Connection Issues
- **CORS errors:** Check Upstash allows requests from your domain
- **Auth failures:** Verify REST URL and token are correct
- **Slow responses:** Use pipelining for multiple operations

### R2 Upload Issues
- **Access denied:** Check bucket permissions in dashboard
- **Public access:** Must enable in R2 settings for videos to play
- **Size limits:** Keep videos under 100MB for fast uploads

### Video Composition Issues
- **MoviePy crashes:** Reduce video resolution or duration
- **Audio out of sync:** Check audio duration matches video
- **Captions not visible:** Increase font size and stroke width
- **File too large:** Lower bitrate in `write_videofile(bitrate='5000k')`

---

**Status:** Ready for implementation
**Time Estimate:** 4 hours MVP → 8 weeks production
**Good luck building! 🚀**
