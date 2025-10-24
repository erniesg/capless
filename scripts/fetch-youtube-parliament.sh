#!/bin/bash
# Fetch all YouTube Parliament sessions using yt-dlp
# No API key required - works directly with YouTube

set -e

echo "=== YOUTUBE PARLIAMENT SESSION FETCHER ==="
echo ""

PYENV_VERSION=innovasian

OUTPUT_DIR="/Users/erniesg/code/erniesg/capless/youtube-sessions"
mkdir -p "$OUTPUT_DIR"

# 14th Parliament playlist
PLAYLIST_14TH="https://www.youtube.com/playlist?list=PLetiU3qG4uSpff9aA_pstQp7pCaDYKZHQ"
# 15th Parliament playlist
PLAYLIST_15TH="https://www.youtube.com/playlist?list=PLetiU3qG4uSrSjL6UlfVsgR89lxBzP5D1"

echo "1. Fetching 14th Parliament playlist metadata..."
PYENV_VERSION=innovasian yt-dlp \
  --flat-playlist \
  --print "%(id)s|%(title)s|%(upload_date)s" \
  "$PLAYLIST_14TH" \
  2>&1 | grep -v "^\[" | tee "$OUTPUT_DIR/14th-parliament-videos.txt"

count_14=$(wc -l < "$OUTPUT_DIR/14th-parliament-videos.txt" | xargs)
echo "   ✅ Found $count_14 videos"

echo ""
echo "2. Fetching 15th Parliament playlist metadata..."
PYENV_VERSION=innovasian yt-dlp \
  --flat-playlist \
  --print "%(id)s|%(title)s|%(upload_date)s" \
  "$PLAYLIST_15TH" \
  2>&1 | grep -v "^\[" | tee "$OUTPUT_DIR/15th-parliament-videos.txt"

count_15=$(wc -l < "$OUTPUT_DIR/15th-parliament-videos.txt" | xargs)
echo "   ✅ Found $count_15 videos"

echo ""
echo "3. Sample from 15th Parliament:"
head -5 "$OUTPUT_DIR/15th-parliament-videos.txt" | while IFS='|' read -r video_id title upload_date; do
  echo "   - $title"
  echo "     https://www.youtube.com/watch?v=$video_id"
done

echo ""
echo "4. Looking for September 22, 2024 session..."
grep -i "22.*sept\|sept.*22\|22-09\|09-22" "$OUTPUT_DIR/15th-parliament-videos.txt" "$OUTPUT_DIR/14th-parliament-videos.txt" || echo "   Not found in titles"

echo ""
echo "=== COMPLETE ==="
echo "Total: $((count_14 + count_15)) videos"
echo "Data saved to: $OUTPUT_DIR/"
