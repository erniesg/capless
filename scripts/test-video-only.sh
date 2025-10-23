#!/bin/bash

# Test Video Processing Only
# Download → Whisper → Show transcript

set -e

VIDEO_ID="${1:-BbRLecFBH2g}"

echo "🎥 Video: https://www.youtube.com/watch?v=$VIDEO_ID"
echo ""

# Load API keys
if [ -f ".env.local" ]; then
  export $(grep -v '^#' .env.local | xargs)
fi

OUTPUT_DIR="output/video-$(date +%Y%m%d-%H%M%S)"
mkdir -p "$OUTPUT_DIR"

echo "📁 Output: $OUTPUT_DIR"
echo ""

# Download
echo "━━━ DOWNLOADING ━━━"
yt-dlp -f 'bestaudio[ext=m4a]' --extract-audio --audio-format mp3 \
  --output "$OUTPUT_DIR/video.%(ext)s" \
  "https://www.youtube.com/watch?v=$VIDEO_ID"

echo ""
echo "✅ Downloaded: $(du -h "$OUTPUT_DIR/video.mp3" | cut -f1)"
echo ""

# Transcribe
echo "━━━ TRANSCRIBING WITH WHISPER ━━━"
RESPONSE=$(curl -s -X POST https://api.openai.com/v1/audio/transcriptions \
  -H "Authorization: Bearer $OPENAI_API_KEY" \
  -F model="whisper-1" \
  -F file="@$OUTPUT_DIR/video.mp3" \
  -F response_format="verbose_json" \
  -F timestamp_granularities[]="segment")

echo "$RESPONSE" | jq '.' > "$OUTPUT_DIR/transcript.json"

DURATION=$(echo "$RESPONSE" | jq -r '.duration')
SEGMENTS=$(echo "$RESPONSE" | jq -r '.segments | length')

echo "✅ Transcribed: ${DURATION}s, $SEGMENTS segments"
echo ""

# Show first few segments
echo "━━━ FIRST 5 SEGMENTS ━━━"
echo "$RESPONSE" | jq -r '.segments[0:5] | .[] | "[\(.start | tonumber | floor)s] \(.text)"'
echo ""

echo "Full transcript: $OUTPUT_DIR/transcript.json"
