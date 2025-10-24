#!/bin/bash

# Enhanced paginated KV backfill with robust error handling
# Each call processes 500 dates to stay under Worker limits
#
# Usage:
#   ./run-backfill-v2.sh           # Start from beginning
#   ./run-backfill-v2.sh 5500      # Resume from offset 5500

set -euo pipefail  # Exit on error, undefined vars, pipe failures

BASE_URL="https://capless-parliament-scraper.erniesg.workers.dev"
LIMIT=500
PROGRESS_FILE="/tmp/backfill-progress.txt"
LOG_FILE="/tmp/backfill.log"
MAX_RETRIES=3

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
total_backfilled=0
batch_count=0

echo "=== KV Backfill (Enhanced v2) ===" | tee -a "$LOG_FILE"
echo "Processing $LIMIT dates per batch..." | tee -a "$LOG_FILE"
echo "Progress file: $PROGRESS_FILE" | tee -a "$LOG_FILE"
echo "Log file: $LOG_FILE" | tee -a "$LOG_FILE"
echo "Start time: $(date)" | tee -a "$LOG_FILE"
echo "" | tee -a "$LOG_FILE"

while [ "$complete" != "true" ]; do
  batch_count=$((batch_count + 1))
  retry_count=0
  success=false

  echo "[Batch $batch_count] offset=$offset" | tee -a "$LOG_FILE"

  # Retry loop for transient errors
  while [ $retry_count -lt $MAX_RETRIES ] && [ "$success" != "true" ]; do
    if [ $retry_count -gt 0 ]; then
      echo "  Retry attempt $retry_count/$MAX_RETRIES..." | tee -a "$LOG_FILE"
      sleep 2  # Wait before retry
    fi

    # Call backfill endpoint
    response=$(curl -s -f -m 120 "$BASE_URL/backfill-kv?offset=$offset&limit=$LIMIT" 2>&1 || echo '{"error":"curl_failed"}')

    # Check if response is valid JSON
    if echo "$response" | jq empty 2>/dev/null; then
      # Check for error in response
      if echo "$response" | jq -e '.error' >/dev/null 2>&1; then
        error_msg=$(echo "$response" | jq -r '.error')
        echo "  ERROR: API returned error: $error_msg" | tee -a "$LOG_FILE"
        retry_count=$((retry_count + 1))
        continue
      fi

      # Parse response fields
      complete=$(echo "$response" | jq -r '.complete // "false"')
      backfilled_this_batch=$(echo "$response" | jq -r '.backfilled_this_batch // 0')
      processed=$(echo "$response" | jq -r '.processed // 0')
      total_dates=$(echo "$response" | jq -r '.total_dates // 0')
      next_offset=$(echo "$response" | jq -r '.next_offset // "null"')

      # Validate critical fields
      if [ -z "$complete" ] || [ -z "$backfilled_this_batch" ] || [ -z "$processed" ] || [ -z "$total_dates" ]; then
        echo "  ERROR: Failed to parse response fields" | tee -a "$LOG_FILE"
        echo "  Response: $response" | tee -a "$LOG_FILE"
        retry_count=$((retry_count + 1))
        continue
      fi

      # Success!
      success=true

      # Update counters
      total_backfilled=$((total_backfilled + backfilled_this_batch))

      echo "  ✓ Backfilled: $backfilled_this_batch entries" | tee -a "$LOG_FILE"
      echo "  Progress: $processed / $total_dates dates ($(awk "BEGIN {printf \"%.1f\", ($processed/$total_dates)*100}")%)" | tee -a "$LOG_FILE"
      echo "  Total backfilled so far: $total_backfilled" | tee -a "$LOG_FILE"
      echo "" | tee -a "$LOG_FILE"

      # Break if complete
      if [ "$complete" == "true" ]; then
        echo "  🎉 Backfill complete!" | tee -a "$LOG_FILE"
        break
      fi

      # Validate next_offset before continuing
      if [ "$next_offset" == "null" ] || [ -z "$next_offset" ]; then
        echo "  ERROR: next_offset is null/empty but complete=false" | tee -a "$LOG_FILE"
        echo "  This indicates an API error. Last valid offset: $offset" | tee -a "$LOG_FILE"
        exit 1
      fi

      # Update offset for next batch
      offset=$next_offset

      # Save progress to file (for resumability)
      echo "$offset" > "$PROGRESS_FILE"

    else
      echo "  ERROR: Invalid JSON response from API" | tee -a "$LOG_FILE"
      echo "  Response: $response" | tee -a "$LOG_FILE"
      retry_count=$((retry_count + 1))
    fi
  done

  # Check if we exhausted retries
  if [ "$success" != "true" ]; then
    echo "" | tee -a "$LOG_FILE"
    echo "FATAL: Failed after $MAX_RETRIES retries at offset $offset" | tee -a "$LOG_FILE"
    echo "You can resume with: $0 $offset" | tee -a "$LOG_FILE"
    exit 1
  fi

  # Small delay to avoid rate limiting
  sleep 1
done

echo "=== Backfill Complete! ===" | tee -a "$LOG_FILE"
echo "Total KV entries written: $total_backfilled" | tee -a "$LOG_FILE"
echo "Total dates processed: $processed" | tee -a "$LOG_FILE"
echo "Total batches: $batch_count" | tee -a "$LOG_FILE"
echo "End time: $(date)" | tee -a "$LOG_FILE"

# Clean up progress file on successful completion
rm -f "$PROGRESS_FILE"
echo "" | tee -a "$LOG_FILE"
echo "Progress file cleaned up. Full log available at: $LOG_FILE" | tee -a "$LOG_FILE"
