#!/bin/bash
# Complete Capless Demo for Sep 22, 2024
# Tests: Session → Moments → Video Generation

echo "======================================"
echo " CAPLESS DEMO: Sep 22, 2024"
echo "======================================"
echo ""

# Session Details
SESSION_ID="parliament-22-09-2024"
DATE="22 September 2024"

echo "📅 Session: $DATE"
echo "🎯 Testing: 3 viral moments with video generation"
echo ""

# Show all 3 moments with timestamps
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "📋 MOMENTS FROM SESSION"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
cat /tmp/moments-22-sep.json | jq -r '.moments[] | "\n🎬 Moment \(.moment_id | split("-")[-1])\n   Speaker: \(.speaker)\n   Time: \(.timestamp_start)\n   Viral Score: \(.virality_score)/10\n   Quote: \"\(.quote)\"\n   "'
echo ""

# Test Video Generation for each moment
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "🎥 VIDEO GENERATION TESTS"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

# Moment 1: Document Falsification (Gen Z persona)
echo "1️⃣ Testing Moment 1 with Gen Z persona..."
echo "   Topic: Document Falsification Cover-up"
echo ""

RESPONSE_1=$(curl -s -X POST https://capless-video-generator.erniesg.workers.dev/api/video/generate \
  -H "Content-Type: application/json" \
  -d '{
    "moment_id": "parliament-22-09-2024-moment-1",
    "persona": "gen_z"
  }')

JOB_ID_1=$(echo "$RESPONSE_1" | jq -r '.job_id')
POLL_URL_1=$(echo "$RESPONSE_1" | jq -r '.poll_url')

if [ "$JOB_ID_1" != "null" ]; then
  echo "   ✅ Job created: $JOB_ID_1"
  echo "   ⏳ Est. time: 3-5 minutes (Veo 3.1 generation)"
  echo "   📊 Poll: https://capless-video-generator.erniesg.workers.dev$POLL_URL_1"
else
  echo "   ❌ Failed to create job"
  echo "$RESPONSE_1" | jq .
fi
echo ""

# Moment 2: COE Policy (Kopitiam Uncle persona)
echo "2️⃣ Testing Moment 2 with Kopitiam Uncle persona..."
echo "   Topic: COE Allocation Challenges"
echo ""

RESPONSE_2=$(curl -s -X POST https://capless-video-generator.erniesg.workers.dev/api/video/generate \
  -H "Content-Type: application/json" \
  -d '{
    "moment_id": "parliament-22-09-2024-moment-2",
    "persona": "kopitiam_uncle"
  }')

JOB_ID_2=$(echo "$RESPONSE_2" | jq -r '.job_id')
POLL_URL_2=$(echo "$RESPONSE_2" | jq -r '.poll_url')

if [ "$JOB_ID_2" != "null" ]; then
  echo "   ✅ Job created: $JOB_ID_2"
  echo "   ⏳ Est. time: 3-5 minutes"
  echo "   📊 Poll: https://capless-video-generator.erniesg.workers.dev$POLL_URL_2"
else
  echo "   ❌ Failed to create job"
  echo "$RESPONSE_2" | jq .
fi
echo ""

# Moment 3: Market Mechanism (Auntie persona)
echo "3️⃣ Testing Moment 3 with Auntie persona..."
echo "   Topic: COE Market Transparency"
echo ""

RESPONSE_3=$(curl -s -X POST https://capless-video-generator.erniesg.workers.dev/api/video/generate \
  -H "Content-Type: application/json" \
  -d '{
    "moment_id": "parliament-22-09-2024-moment-3",
    "persona": "auntie"
  }')

JOB_ID_3=$(echo "$RESPONSE_3" | jq -r '.job_id')
POLL_URL_3=$(echo "$RESPONSE_3" | jq -r '.poll_url')

if [ "$JOB_ID_3" != "null" ]; then
  echo "   ✅ Job created: $JOB_ID_3"
  echo "   ⏳ Est. time: 3-5 minutes"
  echo "   📊 Poll: https://capless-video-generator.erniesg.workers.dev$POLL_URL_3"
else
  echo "   ❌ Failed to create job"
  echo "$RESPONSE_3" | jq .
fi
echo ""

# Monitor progress
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "⏱️  MONITORING VIDEO GENERATION"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
echo "Checking every 30 seconds for up to 5 minutes..."
echo "(Veo 3.1 typically takes 3-5 minutes)"
echo ""

# Poll for 5 minutes (10 attempts x 30 seconds)
for i in {1..10}; do
  echo "Check $i/10 at $(date +%H:%M:%S):"

  # Check job 1
  if [ "$JOB_ID_1" != "null" ]; then
    STATUS_1=$(curl -s "https://capless-video-generator.erniesg.workers.dev$POLL_URL_1" | jq -r '.status')
    VIDEO_URL_1=$(curl -s "https://capless-video-generator.erniesg.workers.dev$POLL_URL_1" | jq -r '.video_url // "pending"')

    if [ "$STATUS_1" = "completed" ]; then
      echo "  ✅ Moment 1 (Gen Z): COMPLETE - $VIDEO_URL_1"
    elif [ "$STATUS_1" = "failed" ]; then
      echo "  ❌ Moment 1 (Gen Z): FAILED"
    else
      echo "  ⏳ Moment 1 (Gen Z): $STATUS_1"
    fi
  fi

  # Check job 2
  if [ "$JOB_ID_2" != "null" ]; then
    STATUS_2=$(curl -s "https://capless-video-generator.erniesg.workers.dev$POLL_URL_2" | jq -r '.status')
    VIDEO_URL_2=$(curl -s "https://capless-video-generator.erniesg.workers.dev$POLL_URL_2" | jq -r '.video_url // "pending"')

    if [ "$STATUS_2" = "completed" ]; then
      echo "  ✅ Moment 2 (Uncle): COMPLETE - $VIDEO_URL_2"
    elif [ "$STATUS_2" = "failed" ]; then
      echo "  ❌ Moment 2 (Uncle): FAILED"
    else
      echo "  ⏳ Moment 2 (Uncle): $STATUS_2"
    fi
  fi

  # Check job 3
  if [ "$JOB_ID_3" != "null" ]; then
    STATUS_3=$(curl -s "https://capless-video-generator.erniesg.workers.dev$POLL_URL_3" | jq -r '.status')
    VIDEO_URL_3=$(curl -s "https://capless-video-generator.erniesg.workers.dev$POLL_URL_3" | jq -r '.video_url // "pending"')

    if [ "$STATUS_3" = "completed" ]; then
      echo "  ✅ Moment 3 (Auntie): COMPLETE - $VIDEO_URL_3"
    elif [ "$STATUS_3" = "failed" ]; then
      echo "  ❌ Moment 3 (Auntie): FAILED"
    else
      echo "  ⏳ Moment 3 (Auntie): $STATUS_3"
    fi
  fi

  # Check if all complete
  if [ "$STATUS_1" = "completed" ] && [ "$STATUS_2" = "completed" ] && [ "$STATUS_3" = "completed" ]; then
    echo ""
    echo "🎉 All videos generated successfully!"
    break
  fi

  # Wait 30 seconds before next check
  if [ $i -lt 10 ]; then
    echo ""
    sleep 30
  fi
done

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "📦 FINAL RESULTS"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

# Get final status for all jobs
if [ "$JOB_ID_1" != "null" ]; then
  echo "1. Document Falsification (Gen Z):"
  curl -s "https://capless-video-generator.erniesg.workers.dev$POLL_URL_1" | jq '{status, video_url, youtube_link, youtube_timestamp, script: .scripts[0].script}'
  echo ""
fi

if [ "$JOB_ID_2" != "null" ]; then
  echo "2. COE Allocation (Kopitiam Uncle):"
  curl -s "https://capless-video-generator.erniesg.workers.dev$POLL_URL_2" | jq '{status, video_url, youtube_link, youtube_timestamp, script: .scripts[0].script}'
  echo ""
fi

if [ "$JOB_ID_3" != "null" ]; then
  echo "3. Market Transparency (Auntie):"
  curl -s "https://capless-video-generator.erniesg.workers.dev$POLL_URL_3" | jq '{status, video_url, youtube_link, youtube_timestamp, script: .scripts[0].script}'
  echo ""
fi

echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "✨ Demo Complete!"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
