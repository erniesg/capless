#!/bin/bash
# Quick script to refresh all secrets for dev and prod

echo "=== Refresh Cloudflare Worker Secrets ==="
echo ""
echo "This will prompt you to paste API keys for each environment."
echo ""

read -p "Refresh secrets? (y/n) " -n 1 -r
echo
if [[ ! $REPLY =~ ^[Yy]$ ]]; then
    exit 0
fi

# Production
echo ""
echo "--- PRODUCTION SECRETS ---"
wrangler secret put OPENAI_API_KEY
wrangler secret put ANTHROPIC_API_KEY
wrangler secret put YOUTUBE_API_KEY

# Development
echo ""
echo "--- DEV SECRETS ---"
wrangler secret put OPENAI_API_KEY --env dev
wrangler secret put ANTHROPIC_API_KEY --env dev
wrangler secret put YOUTUBE_API_KEY --env dev

echo ""
echo "✅ All secrets refreshed!"
