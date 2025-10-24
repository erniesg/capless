# Parliament Chat - Quick Start

Get the worker running in 5 minutes.

## Prerequisites

- Cloudflare account
- Wrangler CLI installed: `npm install -g wrangler`
- Logged in: `wrangler login`
- At least one API key (Anthropic or OpenAI)

## 1-Minute Setup

```bash
# 1. Install dependencies
npm install

# 2. Create Vectorize index
wrangler vectorize create parliament-chat --dimensions=768 --metric=cosine

# 3. Create KV namespaces
wrangler kv:namespace create "KV"
wrangler kv:namespace create "KV" --preview

# 4. Update wrangler.toml with KV IDs (from step 3 output)

# 5. Add API keys
cp .dev.vars.example .dev.vars
# Edit .dev.vars and add your ANTHROPIC_API_KEY or OPENAI_API_KEY

# 6. Start local dev server
npm run dev
```

## Test Locally

```bash
# Terminal 1: Run worker
npm run dev

# Terminal 2: Test endpoints

# 1. Health check
curl http://localhost:8788/health

# 2. Embed demo session (takes 30s)
curl -X POST http://localhost:8788/embed-session \
  -H "Content-Type: application/json" \
  -d '{"session_date": "22-09-2024"}'

# 3. Ask a question
curl -X POST http://localhost:8788/chat \
  -H "Content-Type: application/json" \
  -d '{
    "session_date": "22-09-2024",
    "question": "What was discussed about COE allocation?"
  }'
```

## Deploy to Production

```bash
# 1. Set production secrets
wrangler secret put ANTHROPIC_API_KEY
# Paste your key when prompted

# 2. Deploy
npm run deploy

# 3. Test production URL
curl https://parliament-chat.YOUR-SUBDOMAIN.workers.dev/health
```

## Demo Questions

Once you've embedded the 22-09-2024 session:

```bash
BASE_URL="http://localhost:8788"  # or your production URL

# Question 1: Transport policy
curl -X POST $BASE_URL/chat \
  -H "Content-Type: application/json" \
  -d '{"session_date": "22-09-2024", "question": "What about COE allocation?"}'

# Question 2: PUB document
curl -X POST $BASE_URL/chat \
  -H "Content-Type: application/json" \
  -d '{"session_date": "22-09-2024", "question": "Summarize the PUB document issue"}'

# Question 3: Market mechanisms
curl -X POST $BASE_URL/chat \
  -H "Content-Type: application/json" \
  -d '{"session_date": "22-09-2024", "question": "Who spoke about market mechanisms?"}'
```

## Bulk Embed Sessions

```bash
# Embed last 10 sessions
curl -X POST $BASE_URL/bulk-embed \
  -H "Content-Type: application/json" \
  -d '{"limit": 10}'
```

## Next Steps

1. Read [README.md](README.md) for full API documentation
2. Read [SETUP.md](SETUP.md) for detailed setup guide
3. Read [ARCHITECTURE.md](ARCHITECTURE.md) for technical deep-dive
4. Integrate with frontend UI
5. Add YouTube timestamp links

## Troubleshooting

**Worker won't start?**
- Check Node.js version: `node --version` (requires 18+)
- Run `npm install` again

**"No embedding provider available"?**
- Add API key to .dev.vars
- Check wrangler.toml has AI binding

**"Session not found"?**
- Ensure parliament-scraper has run
- Check R2 bucket: `wrangler r2 object list capless --prefix hansard/raw/`

**Tests failing?**
- Run `npm install`
- Check TypeScript version: `npx tsc --version`

## Support

- Issues: https://github.com/erniesg/capless/issues
- Docs: See README.md, SETUP.md, ARCHITECTURE.md
