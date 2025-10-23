#!/bin/bash
set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Check if date provided
if [ -z "$1" ]; then
  echo -e "${RED}Usage: $0 DD-MM-YYYY [youtube_url]${NC}"
  echo "Example: $0 22-09-2024"
  echo "Example: $0 22-09-2024 https://www.youtube.com/watch?v=..."
  exit 1
fi

DATE=$1
YOUTUBE_URL=$2
SESSION_ID="parliament-${DATE}"
OUTPUT_DIR="output"
TEST_OUTPUT_DIR="test-outputs/${DATE}"

echo -e "${GREEN}=== Processing Parliament Session: ${DATE} ===${NC}"
echo ""

# Create directories
mkdir -p "${OUTPUT_DIR}"
mkdir -p "${TEST_OUTPUT_DIR}"

# Step 1: Fetch Hansard JSON
echo -e "${YELLOW}[1/5] Fetching Hansard report from Parliament API...${NC}"
HANSARD_URL="https://sprs.parl.gov.sg/search/getHansardReport/?sittingDate=${DATE}"
curl -s "${HANSARD_URL}" > "${OUTPUT_DIR}/hansard-${DATE}.json"

if [ ! -s "${OUTPUT_DIR}/hansard-${DATE}.json" ]; then
  echo -e "${RED}Failed to fetch Hansard report${NC}"
  exit 1
fi

echo -e "${GREEN}✓ Hansard report saved${NC}"

# Step 2: Extract YouTube URL if not provided
if [ -z "$YOUTUBE_URL" ]; then
  echo -e "${YELLOW}[2/5] Searching for YouTube video URL...${NC}"
  
  # Try to find YouTube link in Hansard JSON
  YOUTUBE_URL=$(cat "${OUTPUT_DIR}/hansard-${DATE}.json" | jq -r '.videoUrl // .multimedia // empty' | head -1)
  
  if [ -z "$YOUTUBE_URL" ] || [ "$YOUTUBE_URL" == "null" ]; then
    echo -e "${YELLOW}⚠ No YouTube URL found in Hansard. Searching YouTube...${NC}"
    
    # Search YouTube for parliament session
    SEARCH_DATE=$(date -j -f "%d-%m-%Y" "$DATE" "+%d %B %Y" 2>/dev/null || date -d "$DATE" "+%d %B %Y" 2>/dev/null)
    echo "Searching for: Parliament Singapore ${SEARCH_DATE}"
    
    # Use YouTube API or manual input
    echo -e "${RED}Please provide YouTube URL manually:${NC}"
    read -p "YouTube URL: " YOUTUBE_URL
  fi
fi

if [ -z "$YOUTUBE_URL" ] || [ "$YOUTUBE_URL" == "null" ]; then
  echo -e "${RED}No YouTube URL available. Please provide video file manually.${NC}"
  echo "Place video at: ${OUTPUT_DIR}/${SESSION_ID}.mp4"
  echo "Then run manual transcript extraction."
  exit 1
fi

echo -e "${GREEN}✓ YouTube URL: ${YOUTUBE_URL}${NC}"

# Step 3: Download YouTube subtitles
echo -e "${YELLOW}[3/5] Downloading YouTube subtitles...${NC}"
cd "${OUTPUT_DIR}"

yt-dlp --write-auto-sub --sub-lang en --skip-download \
  --output "${SESSION_ID}" \
  "${YOUTUBE_URL}" || {
    echo -e "${RED}Failed to download subtitles. Trying alternative method...${NC}"
    yt-dlp --write-sub --sub-lang en --skip-download \
      --output "${SESSION_ID}" \
      "${YOUTUBE_URL}"
  }

cd ..

if [ ! -f "${OUTPUT_DIR}/${SESSION_ID}.en.json3" ] && [ ! -f "${OUTPUT_DIR}/${SESSION_ID}.en.vtt" ]; then
  echo -e "${RED}Failed to download subtitles${NC}"
  exit 1
fi

# Convert VTT to json3 if needed
if [ -f "${OUTPUT_DIR}/${SESSION_ID}.en.vtt" ] && [ ! -f "${OUTPUT_DIR}/${SESSION_ID}.en.json3" ]; then
  echo "Converting VTT to JSON3..."
  # Convert VTT format (future enhancement)
fi

echo -e "${GREEN}✓ Subtitles downloaded${NC}"

# Step 4: Convert to ProcessedTranscript format
echo -e "${YELLOW}[4/5] Converting to ProcessedTranscript format...${NC}"

python3 scripts/convert-youtube-to-processed.py \
  "${OUTPUT_DIR}/${SESSION_ID}.en.json3" \
  "${OUTPUT_DIR}/processed-transcript-${DATE}.json" \
  "${SESSION_ID}" \
  "${DATE}" \
  "Parliament Session ${DATE}"

if [ ! -f "${OUTPUT_DIR}/processed-transcript-${DATE}.json" ]; then
  echo -e "${RED}Failed to convert transcript${NC}"
  exit 1
fi

SEGMENT_COUNT=$(cat "${OUTPUT_DIR}/processed-transcript-${DATE}.json" | jq '.segments | length')
echo -e "${GREEN}✓ Transcript converted (${SEGMENT_COUNT} segments)${NC}"

# Step 5: Extract moments
echo -e "${YELLOW}[5/5] Extracting viral moments with Claude Haiku...${NC}"

# Check if worker is running
if ! curl -s http://localhost:8789/health > /dev/null 2>&1; then
  echo "Starting moments worker..."
  cd workers/moments
  npx wrangler dev > /tmp/moments-worker.log 2>&1 &
  WORKER_PID=$!
  cd ../..
  
  # Wait for worker
  for i in {1..30}; do
    if curl -s http://localhost:8789/health > /dev/null 2>&1; then
      break
    fi
    echo -n "."
    sleep 1
  done
  echo ""
fi

# Upload transcript
echo "Uploading transcript to R2..."
curl -s -X POST http://localhost:8789/api/test/upload-transcript \
  -H "Content-Type: application/json" \
  -d @"${OUTPUT_DIR}/processed-transcript-${DATE}.json" \
  > /dev/null

# Extract moments
echo "Extracting moments (this may take 20-30 seconds)..."
curl -X POST http://localhost:8789/api/moments/extract \
  -H "Content-Type: application/json" \
  -d "{\"transcript_id\": \"${SESSION_ID}\"}" \
  2>&1 | tee "${TEST_OUTPUT_DIR}/moments-extraction.json"

# Display results
echo ""
echo -e "${GREEN}=== Extraction Complete ===${NC}"
echo ""

MOMENTS_COUNT=$(cat "${TEST_OUTPUT_DIR}/moments-extraction.json" | jq '.moments | length')
AVG_SCORE=$(cat "${TEST_OUTPUT_DIR}/moments-extraction.json" | jq '.statistics.avg_virality_score')

echo -e "Moments found: ${GREEN}${MOMENTS_COUNT}${NC}"
echo -e "Average virality score: ${GREEN}${AVG_SCORE}/10${NC}"
echo ""
echo "Top 3 moments:"
cat "${TEST_OUTPUT_DIR}/moments-extraction.json" | jq -r '.moments[:3] | .[] | "  • [\(.virality_score)/10] \(.speaker): \"\(.quote)\""'

echo ""
echo -e "${GREEN}Results saved to: ${TEST_OUTPUT_DIR}/moments-extraction.json${NC}"
