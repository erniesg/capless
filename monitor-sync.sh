#!/bin/bash

# Monitor R2→KV sync progress in real-time

PROGRESS_FILE="/tmp/sync-r2-kv-progress.txt"
TOTAL_SESSIONS=1725

echo "=== Monitoring R2→KV Sync Progress ==="
echo ""

while [ -f "$PROGRESS_FILE" ]; do
  offset=$(cat "$PROGRESS_FILE" 2>/dev/null || echo "0")

  if [ "$offset" == "0" ]; then
    echo "Waiting for sync to start..."
  else
    pct=$((offset * 100 / TOTAL_SESSIONS))
    remaining=$((TOTAL_SESSIONS - offset))

    # Create progress bar
    filled=$((pct / 2))  # 50 chars max
    bar=$(printf '%*s' "$filled" | tr ' ' '█')
    empty=$(printf '%*s' $((50 - filled)) | tr ' ' '░')

    echo -ne "\r[$bar$empty] $offset/$TOTAL_SESSIONS ($pct%) - $remaining remaining    "
  fi

  sleep 5
done

echo ""
echo "✅ Sync complete!"
