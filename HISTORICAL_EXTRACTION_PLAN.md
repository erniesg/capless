# Historical Hansard Extraction Plan
## For ~1700+ Parliament Sessions

### Current Performance (Sept 22, 2025 Session)
- **Sections**: 132 sections → 11 chunks
- **Content**: 576,737 chars
- **API Calls**: 11 chunk extractions + 1 consolidation = 12 calls/session
- **Moments**: 72 candidates → 71 final (after dedup + reranking)
- **Time**: ~2-3 minutes per session (estimated)
- **Token Usage**: ~137k tokens per session (input only)

---

## 📊 SCALE ESTIMATION FOR 1700+ SESSIONS

### Time Requirements
```
Conservative estimate:
- 1700 sessions × 3 min/session = 5,100 minutes = 85 hours = 3.5 days
- With failures/retries: 4-5 days continuous

Optimistic estimate (with parallelization):
- 5 parallel workers = 17 hours = 0.7 days
```

### API Rate Limits (GPT-5-mini Tier 1)
```
Per-minute limits:
- 500 RPM (requests per minute)
- 500,000 TPM (tokens per minute)

Daily limits:
- 5,000,000 TPD (tokens per day)

Bottleneck analysis:
- 1700 sessions × 12 calls = 20,400 API calls total
- At 500 RPM: 20,400 / 500 = 40.8 minutes (theoretical minimum)
- At 137k tokens/session: 232,900,000 tokens total
- At 5M TPD: 232.9M / 5M = 46.6 days (if we hit token limit)

Reality: Token limit is the REAL bottleneck
- Solution: Parallelize across multiple API keys OR spread over 47 days
```

### Cost Estimation
```
GPT-5-mini pricing (estimated $0.10/1M tokens):
- Input: 232.9M tokens × $0.10 = $23.29
- Output: ~20k tokens/session × 1700 = 34M tokens × $0.30 = $10.20
- Total: ~$35-40 for full historical extraction
```

---

## 🎯 RECOMMENDED STRATEGY

### Option 1: Local Python Script with Checkpointing (RECOMMENDED)
**Pros:**
- Simplest to implement (build on existing script)
- Full control over rate limiting
- Easy to pause/resume
- No infrastructure complexity

**Cons:**
- Requires local machine running for 4-5 days
- Single-threaded (unless we add multiprocessing)

**Implementation:**
```python
# scripts/extract-all-historical-hansards.py

import json
from pathlib import Path
from datetime import datetime, timedelta
import time

CHECKPOINT_FILE = '/tmp/hansard-extraction-checkpoint.json'
OUTPUT_DIR = '/tmp/hansard-moments-historical'

def load_checkpoint():
    if Path(CHECKPOINT_FILE).exists():
        with open(CHECKPOINT_FILE) as f:
            return json.load(f)
    return {'completed': [], 'failed': [], 'last_date': None}

def save_checkpoint(checkpoint):
    with open(CHECKPOINT_FILE, 'w') as f:
        json.dump(checkpoint, f, indent=2)

def get_all_session_dates():
    """Fetch all parliament sitting dates from API"""
    # TODO: Query Parliament API for all sitting dates
    # For now, generate range from 1965-08-09 to 2025-09-22
    pass

def process_session(date_str, checkpoint):
    """Process single session with error handling"""
    if date_str in checkpoint['completed']:
        print(f"⏭️  Skipping {date_str} (already completed)")
        return True

    try:
        # Call existing extraction logic
        moments = extract_hansard_moments(date_str)

        # Save to individual file
        output_path = f"{OUTPUT_DIR}/hansard-moments-{date_str}.json"
        with open(output_path, 'w') as f:
            json.dump(moments, f, indent=2)

        # Update checkpoint
        checkpoint['completed'].append(date_str)
        checkpoint['last_date'] = date_str
        save_checkpoint(checkpoint)

        print(f"✅ {date_str}: {len(moments['moments'])} moments")
        return True

    except Exception as e:
        print(f"❌ {date_str}: {e}")
        checkpoint['failed'].append({'date': date_str, 'error': str(e)})
        save_checkpoint(checkpoint)
        return False

def main():
    checkpoint = load_checkpoint()
    session_dates = get_all_session_dates()

    # Start from most recent, work backwards
    session_dates.sort(reverse=True)

    print(f"📅 Total sessions to process: {len(session_dates)}")
    print(f"✅ Already completed: {len(checkpoint['completed'])}")
    print(f"❌ Previously failed: {len(checkpoint['failed'])}")

    remaining = [d for d in session_dates if d not in checkpoint['completed']]
    print(f"⏳ Remaining: {len(remaining)}")

    for i, date in enumerate(remaining, 1):
        print(f"\n[{i}/{len(remaining)}] Processing {date}...")
        process_session(date, checkpoint)

        # Rate limiting: 2s between sessions (conservative)
        if i < len(remaining):
            time.sleep(2)

    print("\n" + "="*60)
    print("EXTRACTION COMPLETE")
    print(f"✅ Successful: {len(checkpoint['completed'])}")
    print(f"❌ Failed: {len(checkpoint['failed'])}")
```

### Option 2: Cloudflare Workers + Queue + Container
**Pros:**
- Fully serverless, no local machine needed
- Can run 24/7 with automatic retries
- Leverages existing Cloudflare infrastructure

**Cons:**
- Complex setup (queue trigger → container → Python runtime)
- Cloudflare Container pricing ($5/month + usage)
- Python in Workers requires container/WASM

**Architecture:**
```
Cloudflare Queue → Worker (dispatch) → Durable Object (Python container)
                                     ↓
                                   R2 Storage (results)
```

**Feasibility:**
- Containers: 25 GiB-hours/month free = ~33 hours at 1 core
- Not enough for 85 hours needed
- Would cost: (85 - 33) × 1 GiB × $0.0000025/s ≈ $0.52 extra
- Plus vCPU: 85 hours = 5,100 vCPU-minutes
- Free tier: 375 minutes, excess: (5,100 - 375) × $0.000020 = $0.09

**Total Cloudflare cost: ~$5.61 (first month)**

### Option 3: Modal (Python-native serverless)
**Pros:**
- Python-first, dead simple deployment
- Auto-scaling, parallel execution
- Free tier: 30 free GPU-hours/month

**Cons:**
- New platform to learn
- Requires Modal account setup

**Implementation:**
```python
import modal

app = modal.App("hansard-extraction")

@app.function(
    secrets=[modal.Secret.from_name("openai-api-key")],
    timeout=600,  # 10 min per session
)
def extract_session(date_str):
    from your_extraction_lib import extract_hansard_moments
    return extract_hansard_moments(date_str)

@app.local_entrypoint()
def main():
    dates = get_all_session_dates()

    # Run in parallel (respecting rate limits)
    for batch in chunk(dates, 5):  # 5 parallel
        results = list(extract_session.map(batch))
        time.sleep(12)  # Rate limit: 5 calls / 12s = 25 calls/min < 500 RPM
```

---

## 🚀 RECOMMENDED IMPLEMENTATION STEPS

### Phase 1: Preparation (1 hour)
1. **Fetch all sitting dates** from Parliament API
2. **Create checkpoint system** with resumability
3. **Test on 10 recent sessions** to validate

### Phase 2: Batch Extraction (4-5 days)
1. **Run local script** with checkpointing
2. **Monitor progress** daily
3. **Handle failures** with retry logic

### Phase 3: Validation (2 hours)
1. **Verify all dates processed**
2. **Check for missing/corrupted files**
3. **Re-run failed sessions**

### Phase 4: Upload to R2/KV (1 hour)
1. **Batch upload** all JSON files to R2
2. **Create KV index** for fast lookups
3. **Generate manifest** of all available dates

---

## 📋 RISK MITIGATION

### Rate Limit Protection
```python
# Adaptive rate limiting
def call_with_backoff(func, max_retries=5):
    for attempt in range(max_retries):
        try:
            return func()
        except RateLimitError as e:
            if attempt < max_retries - 1:
                wait = min(2 ** attempt + random.uniform(0, 1), 60)
                print(f"⏳ Rate limited. Waiting {wait:.1f}s...")
                time.sleep(wait)
            else:
                raise
```

### Token Limit Protection
```python
# Track daily token usage
daily_tokens = 0
MAX_DAILY_TOKENS = 4_500_000  # 90% of 5M limit

def check_daily_limit():
    global daily_tokens
    if daily_tokens > MAX_DAILY_TOKENS:
        print("⏸️  Daily token limit reached. Pausing for 24h...")
        time.sleep(86400)  # Sleep for 24 hours
        daily_tokens = 0
```

### Checkpoint Recovery
```python
# Automatic recovery on crash
def signal_handler(sig, frame):
    print("\n⚠️  Interrupted! Checkpoint saved.")
    save_checkpoint(checkpoint)
    sys.exit(0)

signal.signal(signal.SIGINT, signal_handler)
```

---

## 💡 PARALLELIZATION STRATEGY (Advanced)

If we have multiple OpenAI API keys, we can parallelize:

```python
from concurrent.futures import ThreadPoolExecutor

API_KEYS = [key1, key2, key3, key4, key5]  # 5 keys = 5x throughput

def process_with_key(date, api_key):
    # Use specific API key for this session
    return extract_hansard_moments(date, api_key=api_key)

with ThreadPoolExecutor(max_workers=5) as executor:
    futures = []
    for i, date in enumerate(dates):
        api_key = API_KEYS[i % len(API_KEYS)]
        futures.append(executor.submit(process_with_key, date, api_key))

    # Collect results
    for future in futures:
        result = future.result()
```

**With 5 API keys:**
- 500 RPM × 5 = 2,500 RPM combined
- 5M TPD × 5 = 25M TPD combined
- Time reduced from 47 days to 9.3 days
- Still need to respect per-key limits

---

## ✅ FINAL RECOMMENDATION

**Start with Option 1 (Local Script with Checkpointing)**

Rationale:
1. Simplest to implement (1 hour setup)
2. Full control and monitoring
3. Easy to pause/resume
4. No new infrastructure
5. Can run in background for 4-5 days

**Next steps:**
1. Create `scripts/extract-all-historical-hansards.py`
2. Fetch all sitting dates from Parliament API
3. Test on 10 sessions
4. Run full extraction (4-5 days)
5. Upload to R2 when complete

**If we need faster:** Consider Modal (Option 3) for parallel execution.

**Budget estimate:**
- API costs: ~$35-40
- Time: 4-5 days (local) or 1 day (Modal with parallelization)
