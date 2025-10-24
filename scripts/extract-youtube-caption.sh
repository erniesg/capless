#!/bin/bash
# Extract YouTube auto-generated captions for a Parliament session

if [ $# -ne 2 ]; then
    echo "Usage: $0 <date> <video_url>"
    echo "Example: $0 2024-09-09 https://www.youtube.com/watch?v=iOw2HV1BwWo"
    exit 1
fi

DATE=$1
VIDEO_URL=$2

OUTPUT_DIR="/Users/erniesg/code/erniesg/capless/youtube-transcripts"
mkdir -p "$OUTPUT_DIR"

echo "=== EXTRACTING YOUTUBE CAPTIONS ==="
echo "Date: $DATE"
echo "URL: $VIDEO_URL"
echo ""

# Extract captions
PYENV_VERSION=innovasian /Users/erniesg/.pyenv/shims/yt-dlp \
    --write-auto-sub \
    --sub-lang en \
    --skip-download \
    --output "$OUTPUT_DIR/$DATE" \
    "$VIDEO_URL"

if [ -f "$OUTPUT_DIR/$DATE.en.vtt" ]; then
    echo ""
    echo "✅ Caption extracted: $OUTPUT_DIR/$DATE.en.vtt"
    echo "Size: $(du -h "$OUTPUT_DIR/$DATE.en.vtt" | cut -f1)"
    echo ""
    echo "Sample (first 20 lines):"
    head -20 "$OUTPUT_DIR/$DATE.en.vtt"
else
    echo "❌ Caption extraction failed"
fi
