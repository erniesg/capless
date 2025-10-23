#!/bin/bash

# Single Date Testing Script
# Tests one parliament date through the full pipeline
#
# Usage: ./scripts/test-single-date.sh [DATE]
# Example: ./scripts/test-single-date.sh 18-02-2025
#
# Or set DATE environment variable:
# DATE=18-02-2025 ./scripts/test-single-date.sh

set -e

# Colors
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

echo "╔═══════════════════════════════════════════════════════════╗"
echo "║  CAPLESS SINGLE DATE TEST                                 ║"
echo "╚═══════════════════════════════════════════════════════════╝"
echo ""

# Load environment variables
if [ -f ".env.local" ]; then
  export $(grep -v '^#' .env.local | xargs)
  echo -e "${GREEN}✅ Loaded .env.local${NC}"
else
  echo -e "${RED}❌ .env.local not found${NC}"
  echo "   Create it with your API keys:"
  echo "   OPENAI_API_KEY=sk-proj-..."
  echo "   YOUTUBE_API_KEY=AIza..."
  exit 1
fi

# Get date from argument or environment
TEST_DATE="${1:-${DATE:-18-02-2025}}"

echo "📅 Testing Date: $TEST_DATE"
echo ""

# Check prerequisites
echo "🔍 Checking API keys..."
echo ""

if [ -z "$OPENAI_API_KEY" ]; then
  echo -e "${RED}❌ OPENAI_API_KEY not set${NC}"
  exit 1
fi

if [ -z "$YOUTUBE_API_KEY" ]; then
  echo -e "${RED}❌ YOUTUBE_API_KEY not set${NC}"
  exit 1
fi

echo -e "${GREEN}✅ OpenAI API key: ${OPENAI_API_KEY:0:20}...${NC}"
echo -e "${GREEN}✅ YouTube API key: ${YOUTUBE_API_KEY:0:20}...${NC}"
echo ""

# Create output directory with absolute path
OUTPUT_DIR="$(pwd)/output/test-$(date +%Y%m%d-%H%M%S)"
mkdir -p "$OUTPUT_DIR"

echo "📁 Output directory: $OUTPUT_DIR"
echo ""

# ============================================================================
# STEP 1: Start Workers
# ============================================================================

echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "🚀 STARTING WORKERS"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

# Kill any existing workers and debug ports
echo "Cleaning up existing workers..."
pkill -f "wrangler dev" 2>/dev/null || true
lsof -ti:8787,8788,8789,9229,9230,9231 | xargs kill -9 2>/dev/null || true
sleep 3
echo "Workers cleaned up"
echo ""

# Start Ingestion Worker
echo "Starting Ingestion Worker (port 8787)..."
cd workers/capless-ingest
npx wrangler dev --port 8787 --local --inspector-port 9229 > "$OUTPUT_DIR/ingestion-worker.log" 2>&1 &
INGESTION_PID=$!
cd ../..

# Start Video Matcher
echo "Starting Video Matcher (port 8788)..."
cd workers/video-matcher
npx wrangler dev --port 8788 --local --inspector-port 9230 \
  --var YOUTUBE_API_KEY:"$YOUTUBE_API_KEY" \
  > "$OUTPUT_DIR/video-matcher.log" 2>&1 &
MATCHER_PID=$!
cd ../..

# Start Moments Worker
echo "Starting Moments Worker (port 8789)..."
cd workers/moments
npx wrangler dev --port 8789 --local --inspector-port 9231 \
  --var OPENAI_API_KEY:"$OPENAI_API_KEY" \
  > "$OUTPUT_DIR/moments-worker.log" 2>&1 &
MOMENTS_PID=$!
cd ../..

echo ""
echo "Waiting for workers to start..."
sleep 5

# Check if workers are running
if ! lsof -i:8787 >/dev/null 2>&1; then
  echo -e "${RED}❌ Ingestion worker failed to start${NC}"
  cat "$OUTPUT_DIR/ingestion-worker.log"
  exit 1
fi

if ! lsof -i:8788 >/dev/null 2>&1; then
  echo -e "${RED}❌ Video matcher failed to start${NC}"
  cat "$OUTPUT_DIR/video-matcher.log"
  exit 1
fi

if ! lsof -i:8789 >/dev/null 2>&1; then
  echo -e "${RED}❌ Moments worker failed to start${NC}"
  cat "$OUTPUT_DIR/moments-worker.log"
  exit 1
fi

echo -e "${GREEN}✅ All workers running${NC}"
echo ""

# ============================================================================
# STEP 2: Test Ingestion
# ============================================================================

echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "1️⃣  INGESTING HANSARD TRANSCRIPT"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

echo "Fetching Hansard for: $TEST_DATE"

INGESTION_RESPONSE=$(curl -s -X POST http://localhost:8787/api/ingest/hansard \
  -H "Content-Type: application/json" \
  -d "{
    \"sittingDate\": \"$TEST_DATE\",
    \"skipStorage\": true
  }")

echo "$INGESTION_RESPONSE" | jq '.' > "$OUTPUT_DIR/01-ingestion.json"

# Check if successful
if echo "$INGESTION_RESPONSE" | jq -e '.success == true' > /dev/null; then
  TRANSCRIPT_ID=$(echo "$INGESTION_RESPONSE" | jq -r '.transcript_id')
  SEGMENTS_COUNT=$(echo "$INGESTION_RESPONSE" | jq -r '.segments_count')
  SPEAKERS=$(echo "$INGESTION_RESPONSE" | jq -r '.speakers | join(", ")')
  TOTAL_WORDS=$(echo "$INGESTION_RESPONSE" | jq -r '.metadata.total_words')

  echo -e "${GREEN}✅ Ingestion successful!${NC}"
  echo "   Transcript ID: $TRANSCRIPT_ID"
  echo "   Segments: $SEGMENTS_COUNT"
  echo "   Total Words: $TOTAL_WORDS"
  echo "   Speakers: $SPEAKERS"
  echo ""
else
  echo -e "${RED}❌ Ingestion failed${NC}"
  echo "$INGESTION_RESPONSE" | jq '.'
  kill $INGESTION_PID $MATCHER_PID $MOMENTS_PID 2>/dev/null || true
  exit 1
fi

# ============================================================================
# STEP 3: Test Video Matching
# ============================================================================

echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "2️⃣  MATCHING YOUTUBE VIDEOS"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

# Extract speakers from transcript
SPEAKERS_JSON=$(echo "$INGESTION_RESPONSE" | jq -c '.speakers[0:5]')
echo "Top speakers: $(echo "$SPEAKERS_JSON" | jq -r '. | join(", ")')"

MATCHER_RESPONSE=$(curl -s -X POST http://localhost:8788/api/video/match \
  -H "Content-Type: application/json" \
  -d "{
    \"transcript_id\": \"$TRANSCRIPT_ID\",
    \"sitting_date\": \"$TEST_DATE\",
    \"speakers\": $SPEAKERS_JSON
  }")

echo "$MATCHER_RESPONSE" | jq '.' > "$OUTPUT_DIR/02-matching.json"

# Check if successful (video_id field means success)
if echo "$MATCHER_RESPONSE" | jq -e '.video_id' > /dev/null 2>&1; then
  VIDEO_ID=$(echo "$MATCHER_RESPONSE" | jq -r '.video_id')
  VIDEO_TITLE=$(echo "$MATCHER_RESPONSE" | jq -r '.title')
  CONFIDENCE=$(echo "$MATCHER_RESPONSE" | jq -r '.confidence_score')
  VIDEO_URL=$(echo "$MATCHER_RESPONSE" | jq -r '.video_url')
  MATCHES_COUNT=1

  echo -e "${GREEN}✅ Video matching successful!${NC}"
  echo "   Video ID: $VIDEO_ID"
  echo "   Title: $VIDEO_TITLE"
  echo "   Confidence: $CONFIDENCE/10"
  echo "   URL: $VIDEO_URL"
  echo ""
else
  MATCHES_COUNT=0
  echo -e "${RED}❌ Video matching failed${NC}"
  ERROR_MSG=$(echo "$MATCHER_RESPONSE" | jq -r '.error // "Unknown error"')
  echo "   Error: $ERROR_MSG"

  # Show suggestions if available
  if echo "$MATCHER_RESPONSE" | jq -e '.suggestion' > /dev/null 2>&1; then
    echo "   Suggestion: $(echo "$MATCHER_RESPONSE" | jq -r '.suggestion')"
  fi
  echo ""
fi

# ============================================================================
# STEP 4: Test Moment Detection (if videos found)
# ============================================================================

if [ "$MATCHES_COUNT" -gt 0 ]; then
  echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
  echo "3️⃣  DOWNLOADING & TRANSCRIBING VIDEO (OpenAI Whisper)"
  echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
  echo ""

  echo "Video: $VIDEO_TITLE"
  echo "Video ID: $VIDEO_ID"
  echo ""

  # Check if yt-dlp is installed
  if ! command -v yt-dlp &> /dev/null; then
    echo -e "${YELLOW}⚠️  yt-dlp not installed${NC}"
    echo "   Installing yt-dlp..."
    if command -v brew &> /dev/null; then
      brew install yt-dlp
    elif command -v pip3 &> /dev/null; then
      pip3 install yt-dlp
    else
      echo -e "${RED}❌ Cannot install yt-dlp. Install with: brew install yt-dlp${NC}"
      kill $INGESTION_PID $MATCHER_PID $MOMENTS_PID 2>/dev/null || true
      exit 1
    fi
  fi

  echo "Downloading audio from YouTube..."
  yt-dlp -f 'bestaudio[ext=m4a]' \
    --extract-audio \
    --audio-format mp3 \
    --output "$OUTPUT_DIR/video.%(ext)s" \
    "https://www.youtube.com/watch?v=$VIDEO_ID" \
    2>&1 | tee "$OUTPUT_DIR/yt-dlp.log"

  if [ ! -f "$OUTPUT_DIR/video.mp3" ]; then
    echo -e "${RED}❌ Video download failed${NC}"
    cat "$OUTPUT_DIR/yt-dlp.log"
    kill $INGESTION_PID $MATCHER_PID $MOMENTS_PID 2>/dev/null || true
    exit 1
  fi

  echo -e "${GREEN}✅ Video downloaded${NC}"
  echo ""

  echo "Transcribing with OpenAI Whisper..."

  # Call OpenAI Whisper API
  WHISPER_RESPONSE=$(curl -s -X POST https://api.openai.com/v1/audio/transcriptions \
    -H "Authorization: Bearer $OPENAI_API_KEY" \
    -F model="whisper-1" \
    -F file="@$OUTPUT_DIR/video.mp3" \
    -F response_format="verbose_json" \
    -F timestamp_granularities[]="segment")

  echo "$WHISPER_RESPONSE" | jq '.' > "$OUTPUT_DIR/03-whisper-transcript.json"

  if echo "$WHISPER_RESPONSE" | jq -e '.segments' > /dev/null 2>&1; then
    SEGMENTS_COUNT=$(echo "$WHISPER_RESPONSE" | jq -r '.segments | length')
    DURATION=$(echo "$WHISPER_RESPONSE" | jq -r '.duration')

    echo -e "${GREEN}✅ Transcription successful!${NC}"
    echo "   Duration: ${DURATION}s"
    echo "   Segments: $SEGMENTS_COUNT"
    echo ""
  else
    echo -e "${RED}❌ Whisper transcription failed${NC}"
    echo "$WHISPER_RESPONSE" | jq '.'
    kill $INGESTION_PID $MATCHER_PID $MOMENTS_PID 2>/dev/null || true
    exit 1
  fi

  echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
  echo "4️⃣  DETECTING VIRAL MOMENTS (GPT-4)"
  echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
  echo ""

  echo "Analyzing moments with aligned timestamps..."

  # TODO: This endpoint needs to be built to accept both transcripts
  # For now, we'll save what we have
  echo -e "${YELLOW}⚠️  Moment alignment not yet implemented${NC}"
  echo "   Saved:"
  echo "   - Hansard transcript: $OUTPUT_DIR/01-ingestion.json"
  echo "   - YouTube transcript: $OUTPUT_DIR/03-whisper-transcript.json"
  echo ""
  echo "   Next step: Build alignment logic to match Hansard → YouTube timestamps"
fi

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

echo ""
echo "╔═══════════════════════════════════════════════════════════╗"
echo "║  ✅ TEST COMPLETE                                         ║"
echo "╚═══════════════════════════════════════════════════════════╝"
echo ""
echo "Results saved to: $OUTPUT_DIR/"
echo ""
echo "Files:"
echo "  - 01-ingestion.json   - Hansard transcript"
echo "  - 02-matching.json    - YouTube video matches"
echo "  - 03-moments.json     - Viral moments detected"
echo "  - *.log              - Worker logs"
echo ""
echo "Next steps:"
echo "  1. Review results: cat $OUTPUT_DIR/*.json | jq '.'"
echo "  2. If successful, test more dates"
echo "  3. Run batch processing: ./scripts/test-batch.sh"
echo ""
