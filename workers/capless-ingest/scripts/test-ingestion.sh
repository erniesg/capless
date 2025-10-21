#!/bin/bash
# Test script for Capless Ingestion Worker

set -e

WORKER_URL="${1:-http://localhost:8787}"
BOLD='\033[1m'
GREEN='\033[0;32m'
RED='\033[0;31m'
NC='\033[0m' # No Color

echo -e "${BOLD}Capless Ingestion Worker - Test Suite${NC}\n"

# Function to print test results
print_result() {
    if [ $1 -eq 0 ]; then
        echo -e "${GREEN}✓${NC} $2"
    else
        echo -e "${RED}✗${NC} $2"
        exit 1
    fi
}

# Test 1: Health check
echo "Test 1: Health Check"
response=$(curl -s -w "%{http_code}" -o /tmp/health.json "${WORKER_URL}/health")
http_code="${response: -3}"

if [ "$http_code" = "200" ]; then
    print_result 0 "Health endpoint returned 200 OK"
    cat /tmp/health.json | jq '.'
else
    print_result 1 "Health endpoint failed (HTTP $http_code)"
fi

echo ""

# Test 2: Ingest with example JSON
echo "Test 2: Ingest Hansard from Example JSON"
response=$(curl -s -w "%{http_code}" -X POST "${WORKER_URL}/api/ingest/hansard" \
    -H "Content-Type: application/json" \
    -d '{
        "hansardJSON": '$(cat examples/hansard-sample.json)',
        "skipStorage": true
    }' -o /tmp/ingest.json)
http_code="${response: -3}"

if [ "$http_code" = "200" ]; then
    success=$(cat /tmp/ingest.json | jq -r '.success')
    if [ "$success" = "true" ]; then
        print_result 0 "Ingestion successful"
        echo -e "\n${BOLD}Response:${NC}"
        cat /tmp/ingest.json | jq '{
            transcript_id,
            sitting_date,
            speakers_count: (.speakers | length),
            topics_count: (.topics | length),
            segments_count,
            total_words: .metadata.total_words,
            processing_time_ms: .metadata.processing_time_ms
        }'
    else
        error=$(cat /tmp/ingest.json | jq -r '.error')
        print_result 1 "Ingestion failed: $error"
    fi
else
    print_result 1 "Ingestion endpoint failed (HTTP $http_code)"
fi

echo ""

# Test 3: Test with sitting date (will attempt to fetch from real API)
echo "Test 3: Fetch from Parliament API (will fail if date doesn't exist)"
response=$(curl -s -w "%{http_code}" -X POST "${WORKER_URL}/api/ingest/hansard" \
    -H "Content-Type: application/json" \
    -d '{
        "sittingDate": "02-07-2024",
        "skipStorage": true
    }' -o /tmp/ingest-api.json)
http_code="${response: -3}"

if [ "$http_code" = "200" ]; then
    success=$(cat /tmp/ingest-api.json | jq -r '.success')
    if [ "$success" = "true" ]; then
        print_result 0 "Parliament API fetch successful"
        echo -e "\n${BOLD}Response:${NC}"
        cat /tmp/ingest-api.json | jq '{
            transcript_id,
            sitting_date,
            cached: .metadata.cached
        }'
    else
        error=$(cat /tmp/ingest-api.json | jq -r '.error')
        echo -e "${RED}✗${NC} Parliament API fetch failed: $error"
        echo "  (This may be expected if the date doesn't have published Hansard)"
    fi
else
    echo -e "${RED}✗${NC} Parliament API endpoint failed (HTTP $http_code)"
fi

echo ""

# Test 4: CORS headers
echo "Test 4: CORS Headers"
cors_headers=$(curl -s -X OPTIONS "${WORKER_URL}/api/ingest/hansard" -I | grep -i "access-control")

if [ -n "$cors_headers" ]; then
    print_result 0 "CORS headers present"
    echo "$cors_headers"
else
    print_result 1 "CORS headers missing"
fi

echo ""
echo -e "${GREEN}${BOLD}All basic tests passed!${NC}"
echo ""
echo "Next steps:"
echo "1. Review the processed output in examples/"
echo "2. Test with real Hansard data from Singapore Parliament API"
echo "3. Deploy to Cloudflare: npm run deploy"
