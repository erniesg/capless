#!/bin/bash

# Live Pipeline Testing Script
# Tests: Hansard Ingestion → Video Matching → Moment Detection
#
# Prerequisites:
# 1. YouTube API Key (free from Google Cloud Console)
# 2. OpenAI API Key (for moment detection)
# 3. Upstash Redis (free tier) for caching
#
# Run: ./scripts/test-live-pipeline.sh

set -e

echo "╔═══════════════════════════════════════════════════════════╗"
echo "║  CAPLESS LIVE PIPELINE TEST                               ║"
echo "╚═══════════════════════════════════════════════════════════╝"
echo ""

# Colors
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

# Check prerequisites
echo "🔍 Checking prerequisites..."
echo ""

if [ -z "$YOUTUBE_API_KEY" ]; then
  echo -e "${RED}❌ YOUTUBE_API_KEY not set${NC}"
  echo "   Get it from: https://console.cloud.google.com/apis/credentials"
  echo "   Then: export YOUTUBE_API_KEY='your-key'"
  exit 1
fi

if [ -z "$OPENAI_API_KEY" ]; then
  echo -e "${RED}❌ OPENAI_API_KEY not set${NC}"
  echo "   Get it from: https://platform.openai.com/api-keys"
  echo "   Then: export OPENAI_API_KEY='your-key'"
  exit 1
fi

echo -e "${GREEN}✅ API keys configured${NC}"
echo ""

# Test dates - recent parliament sittings
TEST_DATES=(
  "02-07-2024"
  "03-07-2024"
  "08-07-2024"
)

echo "📅 Test Dates: ${TEST_DATES[@]}"
echo ""

# ============================================================================
# STEP 1: Test Ingestion Worker Locally
# ============================================================================

echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "1️⃣  TESTING INGESTION WORKER (Local)"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

cd workers/capless-ingest

echo "Starting ingestion worker..."
npx wrangler dev --port 8787 > /tmp/ingestion-worker.log 2>&1 &
INGESTION_PID=$!
sleep 3  # Wait for worker to start

echo "Testing Hansard fetch for: ${TEST_DATES[0]}"

INGESTION_RESPONSE=$(curl -s -X POST http://localhost:8787/api/ingest/hansard \
  -H "Content-Type: application/json" \
  -d "{
    \"sittingDate\": \"${TEST_DATES[0]}\",
    \"skipStorage\": true
  }")

echo "$INGESTION_RESPONSE" | jq '.'

# Check if successful
if echo "$INGESTION_RESPONSE" | jq -e '.success == true' > /dev/null; then
  echo -e "${GREEN}✅ Ingestion successful!${NC}"

  TRANSCRIPT_ID=$(echo "$INGESTION_RESPONSE" | jq -r '.transcript_id')
  SEGMENTS_COUNT=$(echo "$INGESTION_RESPONSE" | jq -r '.segments_count')
  SPEAKERS=$(echo "$INGESTION_RESPONSE" | jq -r '.speakers | join(", ")')

  echo "   Transcript ID: $TRANSCRIPT_ID"
  echo "   Segments: $SEGMENTS_COUNT"
  echo "   Speakers: $SPEAKERS"
else
  echo -e "${RED}❌ Ingestion failed${NC}"
  kill $INGESTION_PID
  exit 1
fi

echo ""

# ============================================================================
# STEP 2: Test Video Matcher Locally
# ============================================================================

echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "2️⃣  TESTING VIDEO MATCHER (Local)"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

cd ../video-matcher

echo "Starting video matcher worker..."
npx wrangler dev --port 8788 \
  --var YOUTUBE_API_KEY:"$YOUTUBE_API_KEY" \
  > /tmp/video-matcher.log 2>&1 &
MATCHER_PID=$!
sleep 3

echo "Searching YouTube for videos matching: ${TEST_DATES[0]}"

# Extract keywords from ingestion response
KEYWORDS=$(echo "$INGESTION_RESPONSE" | jq -r '.topics[0:3] | join(", ")')

MATCHER_RESPONSE=$(curl -s -X POST http://localhost:8788/api/match \
  -H "Content-Type: application/json" \
  -d "{
    \"sittingDate\": \"${TEST_DATES[0]}\",
    \"keywords\": [\"Singapore\", \"Parliament\", \"Budget\"],
    \"maxResults\": 5
  }")

echo "$MATCHER_RESPONSE" | jq '.'

# Check if successful
if echo "$MATCHER_RESPONSE" | jq -e '.success == true' > /dev/null; then
  echo -e "${GREEN}✅ Video matching successful!${NC}"

  MATCHES_COUNT=$(echo "$MATCHER_RESPONSE" | jq -r '.matches | length')
  echo "   Matched Videos: $MATCHES_COUNT"

  # Show top match
  if [ "$MATCHES_COUNT" -gt 0 ]; then
    TOP_VIDEO=$(echo "$MATCHER_RESPONSE" | jq -r '.matches[0]')
    VIDEO_TITLE=$(echo "$TOP_VIDEO" | jq -r '.title')
    VIDEO_URL=$(echo "$TOP_VIDEO" | jq -r '.url')
    CONFIDENCE=$(echo "$TOP_VIDEO" | jq -r '.confidence_score')

    echo "   Top Match:"
    echo "     Title: $VIDEO_TITLE"
    echo "     URL: $VIDEO_URL"
    echo "     Confidence: $CONFIDENCE"
  fi
else
  echo -e "${RED}❌ Video matching failed${NC}"
  echo "Response: $MATCHER_RESPONSE"
  kill $INGESTION_PID $MATCHER_PID
  exit 1
fi

echo ""

# ============================================================================
# STEP 3: Test Moments Worker Locally
# ============================================================================

echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "3️⃣  TESTING MOMENTS WORKER (Local)"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

cd ../moments

echo "Starting moments worker..."
npx wrangler dev --port 8789 \
  --var OPENAI_API_KEY:"$OPENAI_API_KEY" \
  > /tmp/moments-worker.log 2>&1 &
MOMENTS_PID=$!
sleep 3

echo "Detecting viral moments..."

# Get first matched video
VIDEO_ID=$(echo "$MATCHER_RESPONSE" | jq -r '.matches[0].video_id')

MOMENTS_RESPONSE=$(curl -s -X POST http://localhost:8789/api/detect-moments \
  -H "Content-Type: application/json" \
  -d "{
    \"videoId\": \"$VIDEO_ID\",
    \"transcriptId\": \"$TRANSCRIPT_ID\",
    \"maxMoments\": 3
  }")

echo "$MOMENTS_RESPONSE" | jq '.'

# Check if successful
if echo "$MOMENTS_RESPONSE" | jq -e '.success == true' > /dev/null; then
  echo -e "${GREEN}✅ Moment detection successful!${NC}"

  MOMENTS_COUNT=$(echo "$MOMENTS_RESPONSE" | jq -r '.moments | length')
  echo "   Detected Moments: $MOMENTS_COUNT"

  # Show moments
  echo "$MOMENTS_RESPONSE" | jq -r '.moments[] | "     [\(.start_time)s - \(.end_time)s] Score: \(.engagement_score) | \(.summary)"'
else
  echo -e "${YELLOW}⚠️  Moment detection failed (might need real transcript data)${NC}"
fi

echo ""

# ============================================================================
# STEP 4: Test Batch Processing
# ============================================================================

echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "4️⃣  TESTING BATCH PROCESSING"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

echo "Processing ${#TEST_DATES[@]} dates..."
echo ""

BATCH_RESULTS=()

for date in "${TEST_DATES[@]}"; do
  echo "Processing: $date"

  BATCH_RESPONSE=$(curl -s -X POST http://localhost:8787/api/ingest/hansard \
    -H "Content-Type: application/json" \
    -d "{
      \"sittingDate\": \"$date\",
      \"skipStorage\": true
    }")

  if echo "$BATCH_RESPONSE" | jq -e '.success == true' > /dev/null; then
    TRANSCRIPT_ID=$(echo "$BATCH_RESPONSE" | jq -r '.transcript_id')
    SEGMENTS=$(echo "$BATCH_RESPONSE" | jq -r '.segments_count')
    echo -e "  ${GREEN}✅ $TRANSCRIPT_ID ($SEGMENTS segments)${NC}"
    BATCH_RESULTS+=("✅ $date")
  else
    echo -e "  ${RED}❌ Failed${NC}"
    BATCH_RESULTS+=("❌ $date")
  fi
done

echo ""
echo "Batch Results:"
printf '%s\n' "${BATCH_RESULTS[@]}"

# ============================================================================
# CLEANUP
# ============================================================================

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "🧹 CLEANUP"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

echo "Stopping workers..."
kill $INGESTION_PID $MATCHER_PID $MOMENTS_PID 2>/dev/null || true
sleep 2

echo "Logs saved to:"
echo "  - /tmp/ingestion-worker.log"
echo "  - /tmp/video-matcher.log"
echo "  - /tmp/moments-worker.log"

echo ""
echo "╔═══════════════════════════════════════════════════════════╗"
echo "║  ✅ LIVE PIPELINE TEST COMPLETE                           ║"
echo "╚═══════════════════════════════════════════════════════════╝"
echo ""
echo "Next Steps:"
echo "  1. Review logs for any errors"
echo "  2. If all passed: Deploy to Cloudflare Workers"
echo "  3. If any failed: Check API keys and rate limits"
echo ""
