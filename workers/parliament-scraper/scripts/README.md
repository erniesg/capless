# Parliament Scraper Scripts

## Overview

These scripts manage KV synchronization for the Parliament Hansard scraper.

## Scripts

### `sync-r2-to-kv.sh` ✅ **Use this to sync R2 → KV**

**Purpose:** Sync dates WITH parliament sessions from R2 to KV

- Marks dates that exist in R2 as `has_session` in KV
- Uses the `/sync-r2-batch` Worker endpoint
- Batches of 100 dates to avoid Worker CPU timeouts
- Shows progress percentage
- Resumable from offset

**Usage:**
```bash
# Start from beginning
./sync-r2-to-kv.sh

# Resume from offset 500
./sync-r2-to-kv.sh 500
```

**Expected Output:**
```
=== Sync R2 Sessions to KV ===
[19:08:55] Syncing offset=0, limit=100
  ✓ Synced: 100 dates
  Progress: 100 / 1725 (5%)

[19:10:57] Syncing offset=100, limit=100
  ✓ Synced: 100 dates
  Progress: 200 / 1725 (11%)
...
=== Sync Complete! ===
Total R2 sessions synced to KV: 1725
```

**Time:** ~35 minutes for 1,725 sessions (2 seconds per batch)

---

### `backfill-kv.sh` (Optional - rarely needed)

**Purpose:** Mark dates WITHOUT parliament sessions as `no_session` in KV

- Uses wrangler CLI to write directly to KV
- For dates NOT in R2 (no parliament session on those dates)
- This is the **opposite** of `sync-r2-to-kv.sh`

**Usage:**
```bash
./backfill-kv.sh
```

**Time:** ~6 hours for ~24,000 dates (via wrangler CLI)

---

## Which Script Should I Use?

### Use `sync-r2-to-kv.sh` if:
- ✅ You want to update KV with actual session dates from R2
- ✅ You've scraped new parliament sessions and need to update KV
- ✅ KV is out of sync with R2 for session dates

### Use `backfill-kv.sh` if:
- ✅ You want to mark dates without sessions as `no_session`
- ✅ You're doing initial KV setup
- ✅ You want to prevent re-checking old dates that have no sessions

---

## Worker Endpoints

### `/sync-r2-batch` (used by sync-r2-to-kv.sh)
- **Purpose:** Mark dates WITH sessions as `has_session`
- **Batch size:** 100 dates (configurable)
- **Query params:** `?offset=0&limit=100`

### `/backfill-kv` (alternative to backfill-kv.sh)
- **Purpose:** Mark dates WITHOUT sessions as `no_session`
- **Batch size:** 500 dates (configurable)
- **Query params:** `?offset=0&limit=500`

---

## Cleanup (2025-10-24)

**Removed redundant scripts:**
- ❌ `run-backfill.sh` - Called `/backfill-kv` endpoint
- ❌ `run-backfill-v2.sh` - Enhanced version with retry logic
- ❌ `resume-backfill.sh` - Resume from specific offset

**Reason:** All three called `/backfill-kv` which marks dates WITHOUT sessions. The user needed to sync dates WITH sessions, so a new `sync-r2-to-kv.sh` script was created.

**Improved Worker logging:**
- `[R2→KV Sync]` - Syncing sessions to KV
- `[No-Session Backfill]` - Marking non-session dates
- Added progress percentages to responses
- Clearer error messages

---

## Troubleshooting

### "Too many API requests by single worker invocation"
- **Cause:** Batch size too large or too many KV writes
- **Solution:** Reduce batch size (default: 100 for sync-r2-batch, 500 for backfill-kv)

### Sync taking too long
- **Expected:** ~35 minutes for 1,725 sessions with 2-second sleep
- **Speed up:** Reduce sleep time in script (but risk rate limiting)

### Resume from failure
```bash
# Check progress file
cat /tmp/sync-r2-kv-progress.txt
# Resume from that offset
./sync-r2-to-kv.sh <offset>
```
