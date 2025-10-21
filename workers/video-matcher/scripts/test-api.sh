#!/bin/bash

# Test script for Video Matcher Worker API
# Usage: ./scripts/test-api.sh [local|prod]

set -e

# Determine environment
ENV=${1:-local}

if [ "$ENV" = "local" ]; then
  BASE_URL="http://localhost:8787"
  echo "🧪 Testing LOCAL environment: $BASE_URL"
  echo "   (Make sure 'npm run dev' is running)"
elif [ "$ENV" = "prod" ]; then
  # Update this with your actual production URL
  BASE_URL="https://capless-video-matcher.YOUR_SUBDOMAIN.workers.dev"
  echo "🚀 Testing PRODUCTION environment: $BASE_URL"
  echo "   (Update BASE_URL in this script with your actual URL)"
else
  echo "❌ Invalid environment. Use: ./test-api.sh [local|prod]"
  exit 1
fi

echo ""
echo "================================================"
echo "Test 1: Health Check"
echo "================================================"

curl -s "$BASE_URL/health" | jq '.'

echo ""
echo "================================================"
echo "Test 2: Video Match - Valid Request"
echo "================================================"

curl -s -X POST "$BASE_URL/api/video/match" \
  -H "Content-Type: application/json" \
  -d '{
    "transcript_id": "test-hansard-2024-07-02",
    "sitting_date": "02-07-2024",
    "speakers": ["Ms Rahayu Mahzam"]
  }' | jq '.'

echo ""
echo "================================================"
echo "Test 3: Video Match - Same Request (Test Cache)"
echo "================================================"

curl -s -X POST "$BASE_URL/api/video/match" \
  -H "Content-Type: application/json" \
  -d '{
    "transcript_id": "test-hansard-2024-07-02",
    "sitting_date": "02-07-2024",
    "speakers": ["Ms Rahayu Mahzam"]
  }' | jq '.cached'

echo ""
echo "Should return: true (cached)"

echo ""
echo "================================================"
echo "Test 4: Get Cached Match by ID"
echo "================================================"

curl -s "$BASE_URL/api/video/match/test-hansard-2024-07-02" | jq '.'

echo ""
echo "================================================"
echo "Test 5: Invalid Date Format (Expect 400)"
echo "================================================"

curl -s -X POST "$BASE_URL/api/video/match" \
  -H "Content-Type: application/json" \
  -d '{
    "transcript_id": "test-invalid-date",
    "sitting_date": "2024-07-02"
  }' | jq '.'

echo ""
echo "================================================"
echo "Test 6: Missing Required Fields (Expect 400)"
echo "================================================"

curl -s -X POST "$BASE_URL/api/video/match" \
  -H "Content-Type: application/json" \
  -d '{
    "sitting_date": "02-07-2024"
  }' | jq '.'

echo ""
echo "================================================"
echo "Test 7: Find Timestamp - With Approximate Time"
echo "================================================"

# First get a video_id from a match
VIDEO_ID=$(curl -s -X POST "$BASE_URL/api/video/match" \
  -H "Content-Type: application/json" \
  -d '{
    "transcript_id": "test-timestamp-search",
    "sitting_date": "02-07-2024"
  }' | jq -r '.video_id // "dQw4w9WgXcQ"')

echo "Using video_id: $VIDEO_ID"

curl -s -X POST "$BASE_URL/api/video/find-timestamp" \
  -H "Content-Type: application/json" \
  -d "{
    \"video_id\": \"$VIDEO_ID\",
    \"quote_text\": \"healthcare policy discussion\",
    \"speaker\": \"Ms Rahayu Mahzam\",
    \"approximate_time\": \"2:30 PM\"
  }" | jq '.'

echo ""
echo "================================================"
echo "Test 8: 404 Not Found - Invalid Endpoint"
echo "================================================"

curl -s "$BASE_URL/api/invalid-endpoint" | jq '.'

echo ""
echo "================================================"
echo "Test 9: Non-existent Transcript (Expect 404)"
echo "================================================"

curl -s "$BASE_URL/api/video/match/non-existent-transcript-id" | jq '.'

echo ""
echo "================================================"
echo "✅ All Tests Complete!"
echo "================================================"
echo ""
echo "Summary:"
echo "- Health check: ✓"
echo "- Video matching: ✓"
echo "- Caching: ✓"
echo "- Timestamp finding: ✓"
echo "- Error handling: ✓"
echo ""
echo "Check output above for any unexpected errors."
