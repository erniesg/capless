#!/bin/bash
cd /Users/erniesg/code/erniesg/capless

echo "====================================="
echo "Testing Moments Extraction API"
echo "====================================="
echo ""
echo "Transcript ID: youtube-26-09-2024"
echo "API Endpoint: http://localhost:8789/api/moments/extract"
echo ""
echo "Calling API..."
echo ""

# Call moments API with just transcript_id
curl -X POST http://localhost:8789/api/moments/extract \
  -H "Content-Type: application/json" \
  -d '{
    "transcript_id": "youtube-26-09-2024"
  }' \
  2>&1 | tee output/moments-result.json

echo ""
echo ""
echo "====================================="
echo "Results saved to: output/moments-result.json"
echo "====================================="
