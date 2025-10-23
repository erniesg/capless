#!/bin/bash

# Direct Video Test - Skip YouTube Search
# Test download → transcribe → moments extraction

set -e

# Colors
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
BLUE='\033[0;34m'
NC='\033[0m'

echo "╔═══════════════════════════════════════════════════════════╗"
echo "║  CAPLESS DIRECT VIDEO TEST                                ║"
echo "╚═══════════════════════════════════════════════════════════╝"
echo ""

# Parameters
TEST_DATE="${1:-26-09-2024}"
VIDEO_ID="${2:-BbRLecFBH2g}"
VIDEO_TITLE="Singapore Parliament - $TEST_DATE"

echo "📅 Date: $TEST_DATE"
echo "🎥 Video ID: $VIDEO_ID"
echo "📺 URL: https://www.youtube.com/watch?v=$VIDEO_ID"
echo ""

# Load environment variables
if [ -f ".env.local" ]; then
  export $(grep -v '^#' .env.local | xargs)
  echo -e "${GREEN}✅ Loaded .env.local${NC}"
else
  echo -e "${RED}❌ .env.local not found${NC}"
  exit 1
fi

# Create output directory
OUTPUT_DIR="$(pwd)/output/direct-test-$(date +%Y%m%d-%H%M%S)"
mkdir -p "$OUTPUT_DIR"
echo "📁 Output: $OUTPUT_DIR"
echo ""

# ============================================================================
# STEP 1: Ingest Hansard
# ============================================================================

echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "1️⃣  INGESTING HANSARD"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

# Start ingestion worker
cd workers/capless-ingest
npx wrangler dev --port 8787 --local --inspector-port 9229 > "$OUTPUT_DIR/ingestion.log" 2>&1 &
INGEST_PID=$!
cd ../..

sleep 3

# Fetch Hansard
HANSARD_RESPONSE=$(curl -s -X POST http://localhost:8787/api/ingest/hansard \
  -H "Content-Type: application/json" \
  -d "{
    \"sittingDate\": \"$TEST_DATE\",
    \"skipStorage\": true
  }")

echo "$HANSARD_RESPONSE" | jq '.' > "$OUTPUT_DIR/01-hansard.json"

if echo "$HANSARD_RESPONSE" | jq -e '.success == true' > /dev/null; then
  TRANSCRIPT_ID=$(echo "$HANSARD_RESPONSE" | jq -r '.transcript_id')
  SEGMENTS=$(echo "$HANSARD_RESPONSE" | jq -r '.segments_count')

  echo -e "${GREEN}✅ Hansard ingested${NC}"
  echo "   ID: $TRANSCRIPT_ID"
  echo "   Segments: $SEGMENTS"
else
  echo -e "${RED}❌ Hansard failed${NC}"
  echo "$HANSARD_RESPONSE" | jq '.'
  kill $INGEST_PID 2>/dev/null || true
  exit 1
fi

kill $INGEST_PID 2>/dev/null || true
echo ""

# ============================================================================
# STEP 2: Download YouTube Video
# ============================================================================

echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "2️⃣  DOWNLOADING YOUTUBE VIDEO"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

# Check yt-dlp
if ! command -v yt-dlp &> /dev/null; then
  echo -e "${YELLOW}⚠️  Installing yt-dlp...${NC}"
  if command -v brew &> /dev/null; then
    brew install yt-dlp
  else
    pip3 install yt-dlp
  fi
fi

echo "Downloading audio..."
yt-dlp -f 'bestaudio[ext=m4a]' \
  --extract-audio \
  --audio-format mp3 \
  --output "$OUTPUT_DIR/video.%(ext)s" \
  "https://www.youtube.com/watch?v=$VIDEO_ID" \
  2>&1 | tee "$OUTPUT_DIR/yt-dlp.log"

if [ ! -f "$OUTPUT_DIR/video.mp3" ]; then
  echo -e "${RED}❌ Download failed${NC}"
  exit 1
fi

AUDIO_SIZE=$(du -h "$OUTPUT_DIR/video.mp3" | cut -f1)
echo -e "${GREEN}✅ Downloaded ($AUDIO_SIZE)${NC}"
echo ""

# ============================================================================
# STEP 3: Transcribe with Whisper
# ============================================================================

echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "3️⃣  TRANSCRIBING WITH WHISPER"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

echo "Calling OpenAI Whisper API..."

WHISPER_RESPONSE=$(curl -s -X POST https://api.openai.com/v1/audio/transcriptions \
  -H "Authorization: Bearer $OPENAI_API_KEY" \
  -F model="whisper-1" \
  -F file="@$OUTPUT_DIR/video.mp3" \
  -F response_format="verbose_json" \
  -F timestamp_granularities[]="segment")

echo "$WHISPER_RESPONSE" | jq '.' > "$OUTPUT_DIR/02-whisper.json"

if echo "$WHISPER_RESPONSE" | jq -e '.segments' > /dev/null 2>&1; then
  DURATION=$(echo "$WHISPER_RESPONSE" | jq -r '.duration')
  SEGMENT_COUNT=$(echo "$WHISPER_RESPONSE" | jq -r '.segments | length')

  echo -e "${GREEN}✅ Transcribed${NC}"
  echo "   Duration: ${DURATION}s"
  echo "   Segments: $SEGMENT_COUNT"
else
  echo -e "${RED}❌ Transcription failed${NC}"
  echo "$WHISPER_RESPONSE" | jq '.'
  exit 1
fi

echo ""

# ============================================================================
# STEP 4: Extract Moments with GPT-4
# ============================================================================

echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "4️⃣  EXTRACTING VIRAL MOMENTS (GPT-4)"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

# Start moments worker
cd workers/moments
npx wrangler dev --port 8789 --local --inspector-port 9231 \
  --var OPENAI_API_KEY:"$OPENAI_API_KEY" \
  > "$OUTPUT_DIR/moments.log" 2>&1 &
MOMENTS_PID=$!
cd ../..

sleep 3

# Extract moments
MOMENTS_REQUEST=$(cat <<EOF
{
  "transcript_id": "$TRANSCRIPT_ID",
  "transcript": $(cat "$OUTPUT_DIR/02-whisper.json" | jq -c '.segments | map({text: .text, start: .start, end: .end})'),
  "metadata": {
    "sitting_date": "$TEST_DATE",
    "video_id": "$VIDEO_ID",
    "duration": $(echo "$WHISPER_RESPONSE" | jq -r '.duration')
  }
}
EOF
)

MOMENTS_RESPONSE=$(curl -s -X POST http://localhost:8789/api/moments/extract \
  -H "Content-Type: application/json" \
  -d "$MOMENTS_REQUEST")

echo "$MOMENTS_RESPONSE" | jq '.' > "$OUTPUT_DIR/03-moments.json"

if echo "$MOMENTS_RESPONSE" | jq -e '.moments' > /dev/null 2>&1; then
  MOMENT_COUNT=$(echo "$MOMENTS_RESPONSE" | jq -r '.moments | length')

  echo -e "${GREEN}✅ Extracted $MOMENT_COUNT moments${NC}"
  echo ""

  if [ "$MOMENT_COUNT" -gt 0 ]; then
    echo "Top moments:"
    echo "$MOMENTS_RESPONSE" | jq -r '.moments[0:3] | .[] | "  🔥 [\(.virality_score)/10] \(.title)\n     \(.timestamp_start) - \(.timestamp_end)\n     \(.quote | .[0:100])...\n"'
  fi
else
  echo -e "${RED}❌ Moment extraction failed${NC}"
  echo "$MOMENTS_RESPONSE" | jq '.'
fi

kill $MOMENTS_PID 2>/dev/null || true
echo ""

# ============================================================================
# SUMMARY
# ============================================================================

echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "✅ TEST COMPLETE"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
echo "Results: $OUTPUT_DIR/"
echo ""
echo "Files:"
echo "  01-hansard.json  - Hansard transcript"
echo "  02-whisper.json  - YouTube transcription"
echo "  03-moments.json  - Viral moments"
echo "  video.mp3        - Downloaded audio"
echo ""
