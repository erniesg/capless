#!/bin/bash
# Fetch all YouTube Parliament sessions and match with our hansard dates

set -e

echo "=== FETCHING YOUTUBE PARLIAMENT SESSIONS ==="
echo ""

# Check API key
if [ -z "$YOUTUBE_API_KEY" ]; then
  echo "❌ YOUTUBE_API_KEY not set"
  exit 1
fi

OUTPUT_DIR="/Users/erniesg/code/erniesg/capless/youtube-sessions"
mkdir -p "$OUTPUT_DIR"

# 14th Parliament playlist
PLAYLIST_14TH="PLetiU3qG4uSpff9aA_pstQp7pCaDYKZHQ"
# 15th Parliament playlist
PLAYLIST_15TH="PLetiU3qG4uSrSjL6UlfVsgR89lxBzP5D1"

echo "1. Fetching 14th Parliament sessions..."
curl -s "https://www.googleapis.com/youtube/v3/playlistItems?part=snippet&maxResults=50&playlistId=$PLAYLIST_14TH&key=$YOUTUBE_API_KEY" \
  > "$OUTPUT_DIR/14th-parliament-raw.json"

total_14=$(jq -r '.pageInfo.totalResults' "$OUTPUT_DIR/14th-parliament-raw.json")
echo "   Found $total_14 videos"

echo ""
echo "2. Fetching 15th Parliament sessions..."
curl -s "https://www.googleapis.com/youtube/v3/playlistItems?part=snippet&maxResults=50&playlistId=$PLAYLIST_15TH&key=$YOUTUBE_API_KEY" \
  > "$OUTPUT_DIR/15th-parliament-raw.json"

total_15=$(jq -r '.pageInfo.totalResults' "$OUTPUT_DIR/15th-parliament-raw.json")
echo "   Found $total_15 videos"

echo ""
echo "3. Extracting video data..."

# Extract video IDs, titles, and URLs
jq -r '.items[] | {
  video_id: .snippet.resourceId.videoId,
  title: .snippet.title,
  url: ("https://www.youtube.com/watch?v=" + .snippet.resourceId.videoId),
  published: .snippet.publishedAt
}' "$OUTPUT_DIR/14th-parliament-raw.json" > "$OUTPUT_DIR/14th-parliament-videos.json"

jq -r '.items[] | {
  video_id: .snippet.resourceId.videoId,
  title: .snippet.title,
  url: ("https://www.youtube.com/watch?v=" + .snippet.resourceId.videoId),
  published: .snippet.publishedAt
}' "$OUTPUT_DIR/15th-parliament-raw.json" > "$OUTPUT_DIR/15th-parliament-videos.json"

echo "   ✅ Saved to $OUTPUT_DIR/"

echo ""
echo "4. Sample from 15th Parliament:"
jq -r '.items[0:3][] | "  - \(.snippet.title)"' "$OUTPUT_DIR/15th-parliament-raw.json"

echo ""
echo "=== COMPLETE ==="
echo "Next: Extract transcripts and match with hansard dates"
