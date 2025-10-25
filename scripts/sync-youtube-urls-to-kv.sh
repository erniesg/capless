#!/bin/bash
# Sync YouTube URLs from mapping file to parliament-scraper KV
# Usage: ./scripts/sync-youtube-urls-to-kv.sh

echo "=== SYNCING YOUTUBE URLS TO KV ==="
echo ""

MAPPING_FILE="/Users/erniesg/code/erniesg/capless/youtube-sessions/youtube-complete-mapping.json"
WORKER_URL="https://capless-parliament-scraper.erniesg.workers.dev"

if [ ! -f "$MAPPING_FILE" ]; then
  echo "Error: Mapping file not found: $MAPPING_FILE"
  exit 1
fi

total=$(cat "$MAPPING_FILE" | jq 'length')
count=0

echo "Found $total YouTube URLs to sync"
echo ""

# Read each entry from the mapping file
while IFS= read -r date; do
  video_id=$(cat "$MAPPING_FILE" | jq -r ".[\"$date\"].video_id")
  title=$(cat "$MAPPING_FILE" | jq -r ".[\"$date\"].title")
  is_interpretation=$(cat "$MAPPING_FILE" | jq -r ".[\"$date\"].is_interpretation")
  has_hansard=$(cat "$MAPPING_FILE" | jq -r ".[\"$date\"].has_hansard")

  count=$((count + 1))
  echo "[$count/$total] $date: $video_id"
  echo "  Title: $title"

  # Use wrangler to write to KV
  # Key format: youtube:{date}
  # Value: JSON with video metadata
  value=$(jq -n \
    --arg video_id "$video_id" \
    --arg title "$title" \
    --argjson is_interpretation "$is_interpretation" \
    --argjson has_hansard "$has_hansard" \
    '{video_id: $video_id, title: $title, is_interpretation: $is_interpretation, has_hansard: $has_hansard}')

  # Write to KV using wrangler
  cd /Users/erniesg/code/erniesg/capless/workers/parliament-scraper
  echo "$value" | npx wrangler kv:key put --binding DATES_KV "youtube:${date}" --path /dev/stdin > /dev/null 2>&1

  if [ $? -eq 0 ]; then
    echo "  ✅ Synced to KV"
  else
    echo "  ❌ Failed to sync"
  fi

  echo ""
  sleep 0.1  # Small delay to avoid rate limiting
done < <(cat "$MAPPING_FILE" | jq -r 'keys[]' | sort)

echo "=== SYNC COMPLETE ==="
echo "Total synced: $count/$total"
