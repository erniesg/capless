# Parliament Moments - Voting & AI Reactions UI Flow

## 📱 User Journey

```
Session View → Vote on Categories → See Reactions → Share
```

---

## 1️⃣ SESSION LANDING PAGE

```
┌─────────────────────────────────────────────────────────────┐
│  🏛️ Parliament Session: 22 Sept 2025                       │
│  132 sections | 71 viral moments extracted                  │
└─────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────┐
│  🗳️ VOTE FOR THE BEST MOMENTS                               │
│                                                               │
│  🤡 Most SUCK-UP Moment          [5 candidates] →           │
│  🌍 Most ATTENBOROUGH Moment     [2 candidates] →           │
│  😬 Most OUT-OF-TOUCH Moment     [8 candidates] →           │
│  🎭 Most DRAMATIC Moment         [9 candidates] →           │
│  🚨 Most ACCOUNTABLE Moment      [6 candidates] →           │
│  💚 Most WHOLESOME Moment        [5 candidates] →           │
│  🤯 Most WHAT-THE-ACTUAL Moment  [7 candidates] →           │
│  📊 Most REALITY-CHECK Moment    [5 candidates] →           │
│                                                               │
│  [View All 71 Moments →]                                    │
└─────────────────────────────────────────────────────────────┘
```

---

## 2️⃣ VOTING PAGE (Example: Most SUCK-UP Moment)

```
┌─────────────────────────────────────────────────────────────┐
│  🤡 Vote for Most SUCK-UP Moment                            │
│  ────────────────────────────────────────                   │
│  Tone-deaf flattery after failures, awkward deflections,    │
│  "you're doing such hard work" vibes                        │
└─────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────┐
│  🏆 #1                                          [23 votes ⬆] │
│  ──────────────────────────────────────────────────────────  │
│  "Senior Minister's 'You Missed the Reports' Snap"           │
│  👤 The Senior Minister (Mr Teo Chee Hean)                   │
│                                                               │
│  💬 "Assoc Prof Jamus Lim had missed reports in the          │
│      newspapers from the last few days..."                   │
│                                                               │
│  🎯 Why viral: Dismissively telling Jamus he missed reports  │
│     right after grilling about audit failures                │
│                                                               │
│  [🎙️ Generate AI Reaction] [🔗 Share] [⬆️ Vote]             │
└─────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────┐
│  🥈 #2                                          [18 votes ⬆] │
│  ──────────────────────────────────────────────────────────  │
│  "'八字都还没一撇' — Too Early, Minister Says"             │
│  👤 Mr Chee Hong Tat                                         │
│                                                               │
│  💬 "It is a bit too early, a bit too premature to start     │
│      to talk about whether there are concerns..."            │
│                                                               │
│  🎯 Why viral: Classic deflection using Chinese idiom to     │
│     avoid answering legitimate concern                       │
│                                                               │
│  [🎙️ Generate AI Reaction] [🔗 Share] [⬆️ Vote]             │
└─────────────────────────────────────────────────────────────┘

... (3 more candidates)
```

---

## 3️⃣ AI REACTION GENERATOR (Modal/Drawer)

```
┌─────────────────────────────────────────────────────────────┐
│  🎙️ Generate AI Reaction                            [✕]    │
│  ───────────────────────────────────────────────────────────│
│                                                               │
│  📜 Moment:                                                  │
│  "Senior Minister's 'You Missed the Reports' Snap"           │
│                                                               │
│  Choose reaction style:                                      │
│                                                               │
│  ┌───────────────┐  ┌───────────────┐  ┌───────────────┐   │
│  │ 🧒 Gen Z      │  │ 👴 Kopitiam   │  │ 🌍 Attenborough│   │
│  │ Bro, fr fr    │  │ Uncle/Auntie  │  │ Documentary   │   │
│  │ no cap        │  │ Wah lau eh    │  │ *whispers*    │   │
│  └───────────────┘  └───────────────┘  └───────────────┘   │
│                                                               │
│  [Generate Reaction 🎬]                                      │
└─────────────────────────────────────────────────────────────┘
```

### After Generation:

```
┌─────────────────────────────────────────────────────────────┐
│  🎙️ Kopitiam Uncle Reaction                         [✕]    │
│  ───────────────────────────────────────────────────────────│
│                                                               │
│  *slaps table*                                               │
│                                                               │
│  "AIYO! See what I see! After the audit people kena          │
│  whack left right center about PUB contract irregularities,  │
│  this Senior Minister come out and say Jamus 'missed the     │
│  reports'??                                                   │
│                                                               │
│  WAH LAU EH. This one what we call 'shoot the messenger'     │
│  lah! The problem is the CONTRACT IRREGULARITIES, not        │
│  whether Jamus read Straits Times or not!                    │
│                                                               │
│  You know ah, my time in kampung days, if someone catch      │
│  you stealing chicken, you cannot say 'eh you never read     │
│  the notice board ah?' Still STEALING CHICKEN what!          │
│                                                               │
│  This kind of wayang very high level hor. Use big big        │
│  position to make small small problem. Classic lah!          │
│                                                               │
│  *sips kopi loudly*                                          │
│                                                               │
│  But we kopitiam people ah, we see through one. This one     │
│  NATO - No Action, Talk Only. Tsk tsk tsk."                  │
│                                                               │
│  [🔊 Listen (TTS)] [📋 Copy] [🐦 Share on Twitter]          │
│  [🎬 Regenerate] [🎨 Try Different Style]                   │
└─────────────────────────────────────────────────────────────┘
```

---

## 4️⃣ RESULTS PAGE (After Voting Closes)

```
┌─────────────────────────────────────────────────────────────┐
│  🏆 PARLIAMENT SESSION: 22 SEPT 2025 - WINNERS              │
└─────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────┐
│  🤡 MOST SUCK-UP MOMENT                                      │
│  ────────────────────────────────────────────────────────    │
│  🥇 "Senior Minister's 'You Missed the Reports' Snap"       │
│      👤 Mr Teo Chee Hean                                     │
│      ⬆️ 156 votes (42%)                                      │
│                                                               │
│  Top Reaction (347 shares):                                  │
│  🎙️ Kopitiam Uncle: "AIYO! This one NATO - No Action..."   │
│  [Read Full Reaction →]                                      │
│                                                               │
│  [🎙️ Generate My Own Reaction] [🔗 Share Winner]            │
└─────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────┐
│  🌍 MOST ATTENBOROUGH MOMENT                                 │
│  ────────────────────────────────────────────────────────    │
│  🥇 "Illicit Money as Toxic Waste"                          │
│      👤 Mrs Josephine Teo                                    │
│      ⬆️ 203 votes (68%)                                      │
│                                                               │
│  💬 "In the ocean of money flows, criminal proceeds are      │
│      like toxic waste that gets carried along..."            │
│                                                               │
│  Top Reaction (512 shares):                                  │
│  🎙️ David Attenborough: "*whispers* And here, in the..."   │
│  [Read Full Reaction →]                                      │
└─────────────────────────────────────────────────────────────┘

... (6 more categories)

┌─────────────────────────────────────────────────────────────┐
│  📊 SESSION STATS                                            │
│  ────────────────────────────────────────────────────────    │
│  • Total Votes Cast: 2,847                                   │
│  • AI Reactions Generated: 1,523                             │
│  • Most Shared Reaction: Kopitiam Uncle on Suck-Up (512)    │
│  • Most Controversial: "Just Ventilate" (48% vs 52%)        │
│                                                               │
│  [🗳️ Vote on Next Session →] [📚 Browse All Sessions]       │
└─────────────────────────────────────────────────────────────┘
```

---

## 5️⃣ SHARE CARD (Generated for Social Media)

```
┌─────────────────────────────────────────────────────────────┐
│                                                               │
│  🏛️ PARLIAMENT MOMENT                                       │
│  22 SEPT 2025                                                │
│  ─────────────────────────────────────────────────────────   │
│                                                               │
│  🏆 MOST SUCK-UP MOMENT                                      │
│                                                               │
│  "Senior Minister's 'You Missed the Reports' Snap"           │
│  — Mr Teo Chee Hean                                          │
│                                                               │
│  💬 "Assoc Prof Jamus Lim had missed reports in the          │
│      newspapers from the last few days..."                   │
│                                                               │
│  🎙️ KOPITIAM UNCLE SAYS:                                    │
│  "AIYO! This one NATO - No Action, Talk Only!"               │
│                                                               │
│  ⬆️ 156 votes • 347 shares                                   │
│                                                               │
│  capless.sg/session/2025-09-22                               │
│                                                               │
└─────────────────────────────────────────────────────────────┘
```

---

## 🎯 KEY FEATURES

### 1. **Multiple Reaction Styles**
- Gen Z (slang, emojis, "fr fr no cap")
- Kopitiam Uncle/Auntie (Singlish, analogies, table-slapping)
- David Attenborough (nature doc, whisper voice, academic)

### 2. **Voting Mechanics**
- Vote on 8 different categories per session
- See live vote counts
- Generate unlimited AI reactions
- Share winning moments

### 3. **Viral Loop**
- Winners announced weekly
- Most-shared reactions featured
- Leaderboards (users who generated most viral reactions)
- Session-to-session comparison

### 4. **Gamification**
- Earn points for:
  - Early votes on eventual winners
  - Generating highly-shared reactions
  - Discovering hidden gems (moments with <5% initial votes that win)
- Unlock reaction styles (start with 3, unlock more)
- "Prophet" badge for consistently voting for winners

---

## 💡 BONUS IDEAS

### "Reaction Battle"
- Two AI styles react to same moment
- Users vote on which reaction was better
- Trains better reaction generation

### "Remix Mode"
- Combine reaction styles
- "Gen Z Attenborough": "*whispers* bro this one cannot fr fr 💀"
- "Kopitiam Gen Z": "Aiyo uncle say no cap this one sus"

### "Historical Moments"
- Apply AI reactions to classic moments from 1965-2024
- "What would Kopitiam Uncle say about Lee Kuan Yew's 1965 speech?"
- Archive of greatest hits

---

## 📊 TECH STACK

### Frontend:
- React + TypeScript
- Voting: WebSocket real-time updates
- Animations: Framer Motion
- Audio: Text-to-Speech for reactions

### Backend:
- Cloudflare Workers (voting API)
- Durable Objects (vote counting)
- Queue (AI reaction generation)
- R2 (moments + reactions storage)
- KV (leaderboards, session stats)

### AI:
- GPT-4 for reaction generation
- ElevenLabs for voice (optional)
- Prompt templates for each style

---

## 🎬 REACTION PROMPT TEMPLATES

### Gen Z:
```
You are a Gen Z Singaporean reacting to a parliament moment.
Use: slang, emojis, "fr fr", "no cap", "bro", "sis", "💀", lowercase
Tone: Sarcastic, dramatic, relatable
Length: 3-5 sentences
```

### Kopitiam Uncle/Auntie:
```
You are a kopitiam uncle/auntie reacting to parliament moment.
Use: Singlish, analogies, "aiyo", "wah lau", "*slaps table*"
Include: Comparisons to "my time", skepticism, common sense
Tone: Cynical but funny, seen-it-all wisdom
Length: 5-8 sentences
```

### David Attenborough:
```
You are David Attenborough narrating a nature documentary.
Style: "*whispers*", scientific observations, poetic
Tone: Dry wit, detached fascination, profound
Compare to: Animal behavior, nature patterns, survival tactics
Length: 6-10 sentences, dramatic pacing
```
