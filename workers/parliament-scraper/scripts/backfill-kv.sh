#!/bin/bash

# Mark dates WITHOUT sessions as no_session in KV
# This is for dates NOT in R2 (dates without parliament sessions)
#
# NOTE: If you want to sync dates WITH sessions (dates in R2), use sync-r2-to-kv.sh instead
#
# This script uses wrangler CLI to write directly to KV (avoids Worker limits)

echo "=== No-Session KV Backfill (CLI) ==="
echo "Marking dates WITHOUT parliament sessions as no_session"
echo ""

KV_NAMESPACE_ID="02616e8644a44f02ae8e1cb90c40cffe"

# Step 1: Get all dates from R2
echo "Step 1: Fetching dates from R2..."
R2_DATES=$(npx wrangler r2 object list --bucket capless-preview --prefix hansard/raw/ | jq -r '.[].key' | sed 's|hansard/raw/||g' | sed 's|\.json||g')
R2_COUNT=$(echo "$R2_DATES" | wc -l | tr -d ' ')
echo "Found $R2_COUNT dates in R2"
echo ""

# Step 2: Generate all dates from 1955-04-22 to today
echo "Step 2: Generating all dates from 1955-04-22 to today..."
ALL_DATES=$(node -e "
const start = new Date('1955-04-22');
const end = new Date();
const dates = [];
const current = new Date(start);

while (current <= end) {
  const day = String(current.getDate()).padStart(2, '0');
  const month = String(current.getMonth() + 1).padStart(2, '0');
  const year = current.getFullYear();
  dates.push(\`\${day}-\${month}-\${year}\`);
  current.setDate(current.getDate() + 1);
}

console.log(dates.join('\\n'));
")
TOTAL_COUNT=$(echo "$ALL_DATES" | wc -l | tr -d ' ')
echo "Generated $TOTAL_COUNT total dates"
echo ""

# Step 3: Find dates NOT in R2
echo "Step 3: Finding dates without sessions..."
DATES_TO_BACKFILL=$(comm -23 <(echo "$ALL_DATES" | sort) <(echo "$R2_DATES" | sort))
BACKFILL_COUNT=$(echo "$DATES_TO_BACKFILL" | wc -l | tr -d ' ')
echo "Found $BACKFILL_COUNT dates to backfill"
echo ""

# Step 4: Write to KV in batches
echo "Step 4: Writing to KV (this will take a while)..."
echo ""

counter=0
for date in $DATES_TO_BACKFILL; do
  counter=$((counter + 1))

  # Create KV value
  value="{\"last_checked\":\"$(date -u +"%Y-%m-%dT%H:%M:%S.000Z")\",\"status\":\"no_session\",\"attempts\":1}"

  # Write to KV
  echo "$value" | npx wrangler kv:key put "date:$date" --namespace-id="$KV_NAMESPACE_ID" > /dev/null 2>&1

  # Progress update every 100 dates
  if [ $((counter % 100)) -eq 0 ]; then
    echo "Progress: $counter / $BACKFILL_COUNT dates backfilled..."
  fi
done

echo ""
echo "=== Backfill Complete! ==="
echo "Total dates: $TOTAL_COUNT"
echo "In R2 (has_session): $R2_COUNT"
echo "Backfilled (no_session): $BACKFILL_COUNT"
