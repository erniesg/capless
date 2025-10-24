#!/bin/bash

# Resume KV backfill from offset 5500 with limit=100 to avoid CPU timeouts
# Total dates: 25,754
# Remaining: 20,254 (from 5500 to 25754)

WORKER_URL="https://capless-parliament-scraper.erniesg.workers.dev/backfill-kv"
START_OFFSET=5500
END_OFFSET=25754
LIMIT=100
SLEEP_SECONDS=1

echo "=== KV Backfill Resume Script ==="
echo "Starting offset: $START_OFFSET"
echo "End offset: $END_OFFSET"
echo "Batch size: $LIMIT dates"
echo "Total remaining: $((END_OFFSET - START_OFFSET)) dates"
echo "============================="
echo ""

processed=0
total_backfilled=0

for offset in $(seq $START_OFFSET $LIMIT $END_OFFSET); do
  processed=$((processed + LIMIT))
  progress=$((100 * (offset - START_OFFSET) / (END_OFFSET - START_OFFSET)))

  echo "[$(date +%H:%M:%S)] Batch: offset=$offset/$END_OFFSET ($progress%)"

  response=$(curl -s "$WORKER_URL?offset=$offset&limit=$LIMIT")

  # Extract backfilled count from response
  backfilled=$(echo "$response" | grep -o '"backfilled":[0-9]*' | grep -o '[0-9]*' || echo "0")
  total_backfilled=$((total_backfilled + backfilled))

  # Check if complete
  complete=$(echo "$response" | grep -o '"complete":true')

  if [ ! -z "$complete" ]; then
    echo ""
    echo "✅ BACKFILL COMPLETE!"
    echo "Total dates backfilled: $total_backfilled"
    echo "Final offset: $offset"
    exit 0
  fi

  # Report progress every 1000 dates
  if [ $((processed % 1000)) -eq 0 ]; then
    echo ">>> Progress checkpoint: $processed dates processed, $total_backfilled backfilled"
  fi

  sleep $SLEEP_SECONDS
done

echo ""
echo "✅ Reached end offset: $END_OFFSET"
echo "Total dates backfilled: $total_backfilled"
