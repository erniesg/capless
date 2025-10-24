#!/bin/bash

# Sync R2 session dates to KV (mark dates WITH sessions as has_session)
# This is the ONLY script you need for syncing R2 → KV
#
# Usage:
#   ./sync-r2-to-kv.sh           # Start from beginning
#   ./sync-r2-to-kv.sh 500       # Resume from offset 500

set -euo pipefail

BASE_URL="https://capless-parliament-scraper.erniesg.workers.dev"
LIMIT=100  # Conservative batch size to avoid CPU timeouts
PROGRESS_FILE="/tmp/sync-r2-kv-progress.txt"

# Resume from argument or progress file or start from 0
if [ -n "${1:-}" ]; then
  offset=$1
  echo "Resuming from provided offset: $offset"
elif [ -f "$PROGRESS_FILE" ]; then
  offset=$(cat "$PROGRESS_FILE")
  echo "Resuming from saved progress: $offset"
else
  offset=0
fi

complete=false
total_synced=0

echo "=== Sync R2 Sessions to KV ==="
echo "Endpoint: /sync-r2-batch"
echo "Batch size: $LIMIT dates"
echo "Progress file: $PROGRESS_FILE"
echo "Start time: $(date)"
echo ""

while [ "$complete" != "true" ]; do
  echo "[$(date +%H:%M:%S)] Syncing offset=$offset, limit=$LIMIT"

  # Call sync endpoint
  response=$(curl -s -f -m 180 "$BASE_URL/sync-r2-batch?offset=$offset&limit=$LIMIT" 2>&1 || echo '{"error":"curl_failed"}')

  # Check if response is valid JSON
  if ! echo "$response" | jq empty 2>/dev/null; then
    echo "ERROR: Invalid JSON response"
    echo "Response: $response"
    exit 1
  fi

  # Check for errors
  if echo "$response" | jq -e '.error' >/dev/null 2>&1; then
    error_msg=$(echo "$response" | jq -r '.message // .error')
    echo "ERROR: $error_msg"
    exit 1
  fi

  # Parse response
  complete=$(echo "$response" | jq -r '.complete // "false"')
  processed=$(echo "$response" | jq -r '.processed // 0')
  total_processed=$(echo "$response" | jq -r '.total_processed // 0')
  total_sessions=$(echo "$response" | jq -r '.total_sessions // 0')
  next_offset=$(echo "$response" | jq -r '.next_offset // "null"')

  # Update counter
  total_synced=$((total_synced + processed))

  # Calculate progress percentage (avoid division by zero)
  if [ "$total_sessions" -gt 0 ]; then
    progress_pct=$((total_processed * 100 / total_sessions))
  else
    progress_pct=0
  fi

  echo "  ✓ Synced: $processed dates"
  echo "  Progress: $total_processed / $total_sessions ($progress_pct%)"
  echo ""

  # Break if complete
  if [ "$complete" == "true" ]; then
    break
  fi

  # Validate next_offset
  if [ "$next_offset" == "null" ] || [ -z "$next_offset" ]; then
    echo "ERROR: next_offset is null but complete=false"
    exit 1
  fi

  # Update offset
  offset=$next_offset

  # Save progress
  echo "$offset" > "$PROGRESS_FILE"

  # Rate limiting
  sleep 2
done

echo "=== Sync Complete! ==="
echo "Total R2 sessions synced to KV: $total_synced"
echo "End time: $(date)"

# Clean up
rm -f "$PROGRESS_FILE"
