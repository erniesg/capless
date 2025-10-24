# Frontend Worker - Implementation Checklist

## 🎯 Objective
Build a Cloudflare Workers Static Assets frontend for the Capless demo with toolcall-based dynamic UI generation.

## 📋 Core Requirements
- Cloudflare Workers Static Assets (NOT Pages)
- Session selector (hardcoded to 22-09-2024 for MVP)
- Two modes: "Generate TikTok" OR "Chat with Session"
- Persona selector (4 options + "AI Decide")
- Side-by-side display: YouTube link + timestamp | Generated reaction video
- Toolcall-based dynamic UI rendering

---

## 🏗️ Setup & Scaffolding

### Workers Static Assets Setup
Follow: https://developers.cloudflare.com/workers/static-assets/

- [ ] Create `workers/capless-frontend/` directory
- [ ] Initialize project:
```bash
npm create cloudflare@latest capless-frontend
# Select: "Website or web app"
# Framework: "Vanilla" (or React if preferred)
```

- [ ] Update `wrangler.toml`:
```toml
name = "capless-frontend"
main = "src/index.ts"
compatibility_date = "2024-10-01"

# Static assets configuration
[assets]
directory = "./public"
binding = "ASSETS"

# Environment variables
[vars]
VIDEO_WORKER_URL = "https://capless-video-generator.erniesg.workers.dev"
CHAT_WORKER_URL = "https://capless-rag-chat.erniesg.workers.dev"
SESSION_ID = "parliament-22-09-2024"
```

**Critical Test**:
```bash
npx wrangler dev
# Open http://localhost:8787
# Expected: Page loads with UI
```

---

## 🎨 UI Components

### Landing Page (`public/index.html`)
```html
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Capless - Parliament TikToks</title>
  <link rel="stylesheet" href="/styles.css">
</head>
<body>
  <div id="app">
    <!-- Session Header -->
    <header>
      <h1>🏛️ Capless Demo</h1>
      <div class="session-info">
        <span class="badge">Session: 22 Sep 2024</span>
        <span class="badge">50 Viral Moments</span>
      </div>
    </header>

    <!-- Mode Selector -->
    <div class="mode-selector">
      <button class="mode-btn active" data-mode="generate">
        🎥 Generate TikTok
      </button>
      <button class="mode-btn" data-mode="chat">
        💬 Chat with Session
      </button>
    </div>

    <!-- Dynamic Content Area -->
    <div id="content">
      <!-- Will be populated by JavaScript -->
    </div>
  </div>

  <script type="module" src="/app.js"></script>
</body>
</html>
```

### Generate TikTok Mode (`components/generate.js`)
```javascript
export function renderGenerateMode() {
  return `
    <div class="generate-container">
      <!-- Moments List -->
      <div class="moments-list">
        <h2>Select a Moment</h2>
        <div id="moments"></div>
      </div>

      <!-- Persona Selector -->
      <div class="persona-selector">
        <h3>Choose Persona</h3>
        <div class="persona-grid">
          <button class="persona-btn" data-persona="gen_z">
            😤 Gen Z
          </button>
          <button class="persona-btn" data-persona="kopitiam_uncle">
            ☕ Kopitiam Uncle
          </button>
          <button class="persona-btn" data-persona="auntie">
            😰 Anxious Auntie
          </button>
          <button class="persona-btn" data-persona="attenborough">
            🎬 Attenborough
          </button>
          <button class="persona-btn ai-decide" data-persona="ai_decide">
            🤖 Let AI Decide
          </button>
        </div>
      </div>

      <!-- Generate Button -->
      <button id="generate-btn" class="primary-btn" disabled>
        Generate Video
      </button>

      <!-- Results -->
      <div id="results" style="display:none;">
        <!-- Populated after generation -->
      </div>
    </div>
  `;
}
```

### Chat Mode (`components/chat.js`)
```javascript
export function renderChatMode() {
  return `
    <div class="chat-container">
      <!-- Chat History -->
      <div class="chat-messages" id="chat-messages">
        <div class="message assistant">
          <p>👋 Hi! Ask me about the session or say "What's the most viral moment?"</p>
        </div>
      </div>

      <!-- Suggestions (dynamic) -->
      <div class="suggestions" id="suggestions"></div>

      <!-- Input -->
      <div class="chat-input">
        <input
          type="text"
          id="chat-input"
          placeholder="Ask about the session..."
          onkeypress="if(event.key === 'Enter') sendMessage()"
        />
        <button onclick="sendMessage()">Send</button>
      </div>
    </div>
  `;
}
```

**Critical Tests**:
- [ ] Mode toggle switches between views
  - [ ] "Generate TikTok" shows moments list + persona selector
  - [ ] "Chat" shows chat interface
- [ ] UI is responsive
  - [ ] Works on mobile (vertical layout)
  - [ ] Works on desktop (side-by-side)

---

## 🎬 Video Generation Flow

### Frontend Logic (`app.js`)
```javascript
let selectedMoment = null;
let selectedPersona = null;

// 1. Load moments
async function loadMoments() {
  const response = await fetch(`${CHAT_WORKER_URL}/api/moments/parliament-22-09-2024`);
  const moments = await response.json();

  renderMoments(moments.slice(0, 10)); // Top 10 for MVP
}

// 2. Select moment
function onMomentClick(moment) {
  selectedMoment = moment;
  document.querySelectorAll('.moment-card').forEach(el =>
    el.classList.remove('selected')
  );
  event.target.closest('.moment-card').classList.add('selected');
  updateGenerateButton();
}

// 3. Select persona
function onPersonaClick(persona) {
  selectedPersona = persona;
  document.querySelectorAll('.persona-btn').forEach(el =>
    el.classList.remove('selected')
  );
  event.target.classList.add('selected');
  updateGenerateButton();
}

// 4. Generate video
async function generateVideo() {
  const generateBtn = document.getElementById('generate-btn');
  generateBtn.disabled = true;
  generateBtn.textContent = 'Generating...';

  const response = await fetch(`${VIDEO_WORKER_URL}/api/video/generate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      moment_id: selectedMoment.moment_id,
      persona: selectedPersona,
    }),
  });

  const { job_id, poll_url } = await response.json();

  // Poll for status
  pollVideoStatus(job_id, poll_url);
}

// 5. Poll status
async function pollVideoStatus(job_id, poll_url) {
  const interval = setInterval(async () => {
    const response = await fetch(poll_url);
    const { status, result } = await response.json();

    if (status === 'completed') {
      clearInterval(interval);
      showResults(result);
    } else if (status === 'failed') {
      clearInterval(interval);
      showError('Video generation failed');
    }
  }, 5000); // Poll every 5 seconds
}

// 6. Display results
function showResults(result) {
  const resultsDiv = document.getElementById('results');
  resultsDiv.innerHTML = `
    <div class="results-grid">
      <!-- Left: YouTube -->
      <div class="youtube-panel">
        <h3>Original Moment</h3>
        <a href="${result.youtube_link}" target="_blank" class="youtube-link">
          🎥 Watch on YouTube @ ${result.timestamp}
        </a>
        <div class="moment-quote">
          <blockquote>"${result.moment.quote}"</blockquote>
          <cite>— ${result.moment.speaker}</cite>
        </div>
      </div>

      <!-- Right: Generated Video -->
      <div class="video-panel">
        <h3>${getPersonaName(result.persona)} Reaction</h3>
        <video controls src="${result.video_url}" class="generated-video"></video>
        <div class="script-preview">
          <details>
            <summary>View Script</summary>
            <p>${result.script}</p>
          </details>
        </div>
        <button onclick="downloadVideo('${result.video_url}')">
          ⬇️ Download
        </button>
      </div>
    </div>
  `;
  resultsDiv.style.display = 'block';
}
```

**Critical Tests**:
- [ ] Select moment → persona → generate
  - [ ] Generate button enables only when both selected
  - [ ] Clicking generate disables button
  - [ ] Polling starts automatically
- [ ] Results display correctly
  - [ ] YouTube link shows timestamp
  - [ ] Video player works
  - [ ] Script is readable
- [ ] Error handling
  - [ ] Failed generation shows error message
  - [ ] Can retry

---

## 💬 Chat Integration

### Chat Logic (`chat.js`)
```javascript
async function sendMessage() {
  const input = document.getElementById('chat-input');
  const message = input.value.trim();
  if (!message) return;

  // Add user message to UI
  addMessage('user', message);
  input.value = '';

  // Show typing indicator
  showTyping();

  // Send to chat worker
  const response = await fetch(`${CHAT_WORKER_URL}/api/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      session_id: SESSION_ID,
      message,
    }),
  });

  const { message: reply, toolcalls, suggestions } = await response.json();

  hideTyping();
  addMessage('assistant', reply);

  // Render toolcalls as cards
  if (toolcalls && toolcalls.length > 0) {
    renderToolcalls(toolcalls);
  }

  // Render suggestions as buttons
  if (suggestions && suggestions.length > 0) {
    renderSuggestions(suggestions);
  }
}

function renderToolcalls(toolcalls) {
  const messagesDiv = document.getElementById('chat-messages');

  toolcalls.forEach(tc => {
    if (tc.tool === 'search_moments') {
      const moments = tc.result;
      const card = document.createElement('div');
      card.className = 'toolcall-card moments';
      card.innerHTML = `
        <h4>Found ${moments.length} moments:</h4>
        ${moments.map(m => `
          <div class="moment-snippet" onclick="selectMomentFromChat('${m.moment_id}')">
            <p class="quote">"${m.quote.substring(0, 100)}..."</p>
            <span class="speaker">${m.speaker}</span>
            <span class="score">🔥 ${m.virality_score}</span>
          </div>
        `).join('')}
      `;
      messagesDiv.appendChild(card);
    } else if (tc.tool === 'generate_video') {
      // Show job status
      const { job_id, poll_url } = tc.result;
      pollVideoStatus(job_id, poll_url);
    }
  });
}

function renderSuggestions(suggestions) {
  const suggestionsDiv = document.getElementById('suggestions');
  suggestionsDiv.innerHTML = suggestions.map(s => {
    if (s.type === 'action') {
      return `
        <button class="suggestion-btn" onclick='executeSuggestion(${JSON.stringify(s.action)})'>
          ${s.icon || '▶️'} ${s.label}
        </button>
      `;
    }
  }).join('');
}
```

**Critical Tests**:
- [ ] Send message "What's the most viral moment?"
  - [ ] Shows typing indicator
  - [ ] Returns assistant message
  - [ ] Displays moment cards
  - [ ] Shows "Generate video" suggestion
- [ ] Click suggestion button
  - [ ] Triggers corresponding action
  - [ ] Updates UI accordingly
- [ ] Chat → video generation
  - [ ] Can generate video from chat
  - [ ] Results display in chat interface

---

## 🎨 Styling (`public/styles.css`)

```css
/* MVP Styles - Clean & Minimal */
:root {
  --primary: #3b82f6;
  --success: #10b981;
  --danger: #ef4444;
  --bg: #0f172a;
  --card: #1e293b;
  --text: #f1f5f9;
}

body {
  margin: 0;
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
  background: var(--bg);
  color: var(--text);
}

#app {
  max-width: 1400px;
  margin: 0 auto;
  padding: 2rem;
}

.mode-selector {
  display: flex;
  gap: 1rem;
  margin: 2rem 0;
}

.mode-btn {
  flex: 1;
  padding: 1rem;
  background: var(--card);
  border: 2px solid transparent;
  border-radius: 0.5rem;
  color: var(--text);
  cursor: pointer;
  transition: all 0.2s;
}

.mode-btn.active {
  border-color: var(--primary);
  background: rgba(59, 130, 246, 0.1);
}

.persona-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
  gap: 1rem;
}

.persona-btn {
  padding: 1rem;
  background: var(--card);
  border: 2px solid transparent;
  border-radius: 0.5rem;
  cursor: pointer;
  transition: all 0.2s;
}

.persona-btn.selected {
  border-color: var(--success);
}

.persona-btn.ai-decide {
  grid-column: 1 / -1;
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
}

.results-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 2rem;
  margin-top: 2rem;
}

@media (max-width: 768px) {
  .results-grid {
    grid-template-columns: 1fr;
  }
}

.chat-messages {
  height: 500px;
  overflow-y: auto;
  border: 1px solid var(--card);
  border-radius: 0.5rem;
  padding: 1rem;
  margin-bottom: 1rem;
}

.message {
  margin-bottom: 1rem;
  padding: 0.75rem;
  border-radius: 0.5rem;
}

.message.user {
  background: var(--primary);
  margin-left: 20%;
}

.message.assistant {
  background: var(--card);
  margin-right: 20%;
}

.generated-video {
  width: 100%;
  max-width: 400px;
  border-radius: 0.5rem;
}
```

**Critical Test**:
- [ ] Page is visually appealing
  - [ ] Dark theme works
  - [ ] Buttons have hover states
  - [ ] Layout is responsive

---

## 🧪 Integration Tests

### End-to-End User Flows

**Flow 1: Generate TikTok**
- [ ] User lands on page
- [ ] Clicks "Generate TikTok" mode
- [ ] Selects a moment from list
- [ ] Selects "Gen Z" persona
- [ ] Clicks "Generate Video"
- [ ] Sees polling status
- [ ] Results display side-by-side

**Flow 2: Chat to Video**
- [ ] User clicks "Chat with Session"
- [ ] Types "What's the most viral moment?"
- [ ] Sees top moments as cards
- [ ] Clicks suggestion "Generate Gen Z reaction"
- [ ] Video generation starts
- [ ] Results appear in chat

**Flow 3: AI Decide**
- [ ] Selects moment
- [ ] Clicks "Let AI Decide"
- [ ] Generates video
- [ ] Results show which persona won + reasoning

---

## 🚀 Deployment

### Pre-deployment
- [ ] Build assets: `npm run build`
- [ ] Test locally: `npx wrangler dev`
- [ ] Update worker URLs in `wrangler.toml` (production URLs)

### Deployment Steps
```bash
cd workers/capless-frontend
npx wrangler deploy
```

**Post-deployment Test**:
```bash
# Visit deployed URL
open https://capless.erniesg.workers.dev

# Test both modes
# Test video generation
# Test chat interface
```

---

## ⏱️ Time Estimates

| Task | Time | Priority |
|------|------|----------|
| Workers static assets setup | 20min | P0 |
| Landing page + mode selector | 30min | P0 |
| Generate mode UI | 45min | P0 |
| Chat mode UI | 45min | P0 |
| Video generation integration | 30min | P0 |
| Chat integration | 30min | P0 |
| Results display | 30min | P0 |
| Styling | 45min | P1 |
| Tests | 30min | P0 |

**Total MVP (P0 only)**: ~3.5 hours
**Full implementation**: ~4.5 hours

---

## 🎭 MVP Simplifications

1. **No session picker**: Hardcode to 22-09-2024
2. **No video embedding**: Show download link instead of player (avoid CORS)
3. **Simple polling**: No WebSocket, just HTTP polling
4. **No auth**: Public demo
5. **Minimal styling**: Focus on function over form

Reduces MVP to ~2 hours.
