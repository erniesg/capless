#!/bin/bash

# Run paginated KV backfill until complete
# Each call processes 500 dates to stay under Worker limits
#
# Usage:
#   ./run-backfill.sh           # Start from beginning
#   ./run-backfill.sh 5500      # Resume from offset 5500

BASE_URL="https://capless-parliament-scraper.erniesg.workers.dev"
LIMIT=500
PROGRESS_FILE="/tmp/backfill-progress.txt"

# Resume from argument or progress file or start from 0
if [ -n "$1" ]; then
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

echo "=== KV Backfill (Paginated) ==="
echo "Processing $LIMIT dates per batch..."
echo "Progress file: $PROGRESS_FILE"
echo ""

while [ "$complete" != "true" ]; do
  echo "Batch: offset=$offset"

  # Call backfill endpoint
  response=$(curl -s "$BASE_URL/backfill-kv?offset=$offset&limit=$LIMIT")

  # Check if response is valid JSON
  if ! echo "$response" | jq empty 2>/dev/null; then
    echo "ERROR: Invalid JSON response from API"
    echo "Response: $response"
    exit 1
  fi

  # Parse response
  complete=$(echo "$response" | jq -r '.complete')
  backfilled_this_batch=$(echo "$response" | jq -r '.backfilled_this_batch')
  processed=$(echo "$response" | jq -r '.processed')
  total_dates=$(echo "$response" | jq -r '.total_dates')
  next_offset=$(echo "$response" | jq -r '.next_offset')

  # Validate parsed values
  if [ -z "$complete" ] || [ -z "$backfilled_this_batch" ] || [ -z "$processed" ] || [ -z "$total_dates" ]; then
    echo "ERROR: Failed to parse response fields"
    echo "Response: $response"
    exit 1
  fi

  # Update counters
  total_backfilled=$((total_backfilled + backfilled_this_batch))

  echo "  ✓ Backfilled: $backfilled_this_batch entries"
  echo "  Progress: $processed / $total_dates dates"
  echo ""

  # Break if complete or no next offset
  if [ "$complete" == "true" ] || [ "$next_offset" == "null" ]; then
    break
  fi

  # Validate next_offset before continuing
  if [ -z "$next_offset" ] || [ "$next_offset" == "null" ]; then
    echo "ERROR: next_offset is empty or null but complete=false"
    echo "This indicates an API error. Last valid offset: $offset"
    exit 1
  fi

  # Update offset for next batch
  offset=$next_offset

  # Save progress to file (for resumability)
  echo "$offset" > "$PROGRESS_FILE"

  # Small delay to avoid rate limiting
  sleep 1
done

echo "=== Backfill Complete! ==="
echo "Total KV entries written: $total_backfilled"
echo "Total dates processed: $processed"

# Clean up progress file on successful completion
rm -f "$PROGRESS_FILE"
