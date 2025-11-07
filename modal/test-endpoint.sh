#!/bin/bash
# Quick test script for Modal transcription endpoint
# Usage: ./test-endpoint.sh [session_date]

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo -e "${YELLOW}=== Modal Transcription Endpoint Test ===${NC}\n"

# Load environment variables
if [ -f .env.local ]; then
    echo -e "${GREEN}✓ Loading credentials from .env.local${NC}"
    source .env.local
else
    echo -e "${RED}✗ Error: .env.local not found${NC}"
    echo "Please create .env.local with:"
    echo "  MODAL_KEY=wk-your-key"
    echo "  MODAL_SECRET=ws-your-secret"
    exit 1
fi

# Check if credentials are set
if [ -z "$MODAL_KEY" ] || [ -z "$MODAL_SECRET" ]; then
    echo -e "${RED}✗ Error: MODAL_KEY or MODAL_SECRET not set${NC}"
    echo ""
    echo "Steps to fix:"
    echo "1. Go to https://modal.com/settings/tokens"
    echo "2. Create a new Proxy Auth Token"
    echo "3. Add to .env.local:"
    echo "   MODAL_KEY=wk-xxxxx"
    echo "   MODAL_SECRET=ws-xxxxx"
    exit 1
fi

# Get session date from argument or use default
SESSION_DATE=${1:-"2024-10-15"}

# Endpoint URL
ENDPOINT="https://berlayar-ai--transcribe.modal.run"

echo -e "${GREEN}✓ Credentials loaded${NC}"
echo "  Modal-Key: ${MODAL_KEY:0:10}... (hidden)"
echo "  Modal-Secret: ${MODAL_SECRET:0:10}... (hidden)"
echo ""
echo "Endpoint: $ENDPOINT"
echo "Session Date: $SESSION_DATE"
echo ""

# Test without authentication first (should fail)
echo -e "${YELLOW}Test 1: Without Authentication (should fail)${NC}"
RESPONSE=$(curl -s -X POST "$ENDPOINT" \
  -H "Content-Type: application/json" \
  -d "{\"session_date\":\"$SESSION_DATE\"}")

if [[ $RESPONSE == *"missing credentials"* ]]; then
    echo -e "${GREEN}✓ Endpoint security working (requires auth)${NC}"
else
    echo -e "${RED}✗ Unexpected response: $RESPONSE${NC}"
fi
echo ""

# Test with authentication (should succeed or show processing error)
echo -e "${YELLOW}Test 2: With Authentication${NC}"
echo "Sending request with valid credentials..."
echo ""

RESPONSE=$(curl -s -X POST "$ENDPOINT" \
  -H "Modal-Key: $MODAL_KEY" \
  -H "Modal-Secret: $MODAL_SECRET" \
  -H "Content-Type: application/json" \
  -d "{\"session_date\":\"$SESSION_DATE\",\"skip_audio_extraction\":false}")

# Check response
if [[ $RESPONSE == *"success"* ]]; then
    echo -e "${GREEN}✓ Transcription request successful!${NC}"
    echo ""
    echo "Response:"
    echo "$RESPONSE" | python3 -m json.tool 2>/dev/null || echo "$RESPONSE"
elif [[ $RESPONSE == *"error"* ]]; then
    echo -e "${YELLOW}⚠ Transcription request sent but encountered error:${NC}"
    echo "$RESPONSE" | python3 -m json.tool 2>/dev/null || echo "$RESPONSE"
elif [[ $RESPONSE == *"invalid credentials"* ]]; then
    echo -e "${RED}✗ Invalid credentials${NC}"
    echo "Please check your MODAL_KEY and MODAL_SECRET at:"
    echo "https://modal.com/settings/tokens"
else
    echo -e "${YELLOW}Response:${NC}"
    echo "$RESPONSE"
fi

echo ""
echo -e "${YELLOW}=== Test Complete ===${NC}"
echo ""
echo "To monitor processing:"
echo "  modal app logs capless-api"
echo ""
echo "To check deployment:"
echo "  https://modal.com/apps/berlayar-ai/main/deployed/capless-api"
