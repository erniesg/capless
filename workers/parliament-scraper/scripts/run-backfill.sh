#!/bin/bash

# Run paginated KV backfill until complete
# Each call processes 500 dates to stay under Worker limits

BASE_URL="https://capless-parliament-scraper.erniesg.workers.dev"
LIMIT=500
offset=0
complete=false
total_backfilled=0

echo "=== KV Backfill (Paginated) ==="
echo "Processing $LIMIT dates per batch..."
echo ""

while [ "$complete" != "true" ]; do
  echo "Batch: offset=$offset"

  # Call backfill endpoint
  response=$(curl -s "$BASE_URL/backfill-kv?offset=$offset&limit=$LIMIT")

  # Parse response
  complete=$(echo "$response" | jq -r '.complete')
  backfilled_this_batch=$(echo "$response" | jq -r '.backfilled_this_batch')
  processed=$(echo "$response" | jq -r '.processed')
  total_dates=$(echo "$response" | jq -r '.total_dates')
  next_offset=$(echo "$response" | jq -r '.next_offset')

  # Update counters
  total_backfilled=$((total_backfilled + backfilled_this_batch))

  echo "  ✓ Backfilled: $backfilled_this_batch entries"
  echo "  Progress: $processed / $total_dates dates"
  echo ""

  # Break if complete or no next offset
  if [ "$complete" == "true" ] || [ "$next_offset" == "null" ]; then
    break
  fi

  # Update offset for next batch
  offset=$next_offset

  # Small delay to avoid rate limiting
  sleep 1
done

echo "=== Backfill Complete! ==="
echo "Total KV entries written: $total_backfilled"
echo "Total dates processed: $processed"
