# Deployment Guide - Capless Ingestion Worker

## Prerequisites Checklist

- [ ] Cloudflare account with Workers enabled
- [ ] Wrangler CLI installed and authenticated
- [ ] Node.js 18+ installed
- [ ] Git repository initialized

## Step 1: Initial Setup

### 1.1 Install Dependencies

```bash
cd workers/capless-ingest
npm install
```

### 1.2 Authenticate Wrangler

```bash
wrangler login
```

This will open a browser window to authenticate with Cloudflare.

## Step 2: Create Infrastructure

### 2.1 Create R2 Bucket

```bash
# Create production bucket
wrangler r2 bucket create capless

# Create development bucket
wrangler r2 bucket create capless-dev
```

### 2.2 Create KV Namespace (Redis Cache)

```bash
# Create production KV namespace
wrangler kv:namespace create REDIS

# Create preview KV namespace for development
wrangler kv:namespace create REDIS --preview
```

**Example output:**
```
✨ Success! Add the following to your wrangler.toml:
[[kv_namespaces]]
binding = "REDIS"
id = "abc123xyz456"
preview_id = "def789uvw012"
```

### 2.3 Update wrangler.toml

Copy the IDs from above and update `wrangler.toml`:

```toml
account_id = "your-cloudflare-account-id"  # Find in Cloudflare Dashboard

[[kv_namespaces]]
binding = "REDIS"
id = "abc123xyz456"              # Production KV ID
preview_id = "def789uvw012"      # Preview KV ID
```

**To find your account ID:**
1. Go to https://dash.cloudflare.com
2. Click on Workers & Pages
3. Your Account ID is shown in the right sidebar

## Step 3: Test Locally

### 3.1 Run Tests

```bash
npm test
```

**Expected output:**
```
✓ tests/api-client.test.ts  (16 tests)
✓ tests/html-parser.test.ts  (22 tests)
✓ tests/transcript-processor.test.ts  (21 tests)

Test Files  3 passed (3)
     Tests  59 passed (59)
```

### 3.2 Start Development Server

```bash
npm run dev
```

**Expected output:**
```
⛅️ wrangler 3.91.0
-------------------
Your worker has access to the following bindings:
- R2 Buckets:
  - R2: capless-dev
- KV Namespaces:
  - REDIS: REDIS

⎔ Starting local server...
[mf:inf] Ready on http://localhost:8787
```

### 3.3 Test Health Endpoint

```bash
curl http://localhost:8787/health
```

**Expected response:**
```json
{
  "status": "ok",
  "service": "capless-ingest",
  "version": "1.0.0",
  "timestamp": "2025-10-21T12:00:00.000Z"
}
```

### 3.4 Test Ingestion Endpoint

```bash
curl -X POST http://localhost:8787/api/ingest/hansard \
  -H "Content-Type: application/json" \
  -d @examples/hansard-sample.json
```

**Expected response:**
```json
{
  "success": true,
  "transcript_id": "2024-07-02-p14-s3",
  "sitting_date": "2024-07-02",
  "speakers": [...],
  "topics": [...],
  "segments_count": 8,
  "metadata": {
    "total_words": 315,
    "processing_time_ms": 1234,
    "cached": false
  }
}
```

## Step 4: Deploy to Cloudflare

### 4.1 Deploy to Development Environment

```bash
wrangler deploy --env dev
```

**Expected output:**
```
⛅️ wrangler 3.91.0
-------------------
Total Upload: XX.XX KiB / gzip: XX.XX KiB
Uploaded capless-ingest-dev (X.XX sec)
Published capless-ingest-dev (X.XX sec)
  https://capless-ingest-dev.your-subdomain.workers.dev
Current Deployment ID: xxxx-xxxx-xxxx
```

### 4.2 Test Development Deployment

```bash
curl https://capless-ingest-dev.your-subdomain.workers.dev/health
```

### 4.3 Deploy to Production

```bash
wrangler deploy --env production
```

**Expected output:**
```
Published capless-ingest-prod (X.XX sec)
  https://capless-ingest-prod.your-subdomain.workers.dev
```

## Step 5: Post-Deployment Verification

### 5.1 Test Production Endpoint

```bash
# Test with real Hansard data
curl -X POST https://capless-ingest-prod.your-subdomain.workers.dev/api/ingest/hansard \
  -H "Content-Type: application/json" \
  -d '{
    "sittingDate": "02-07-2024"
  }'
```

### 5.2 Verify R2 Storage

```bash
# List objects in R2 bucket
wrangler r2 object list capless --prefix=transcripts/
```

### 5.3 Verify KV Cache

```bash
# List keys in KV namespace
wrangler kv:key list --namespace-id=abc123xyz456
```

## Step 6: Configure Custom Domain (Optional)

### 6.1 Add Custom Domain in Cloudflare Dashboard

1. Go to Workers & Pages
2. Select your worker
3. Click "Triggers" tab
4. Click "Add Custom Domain"
5. Enter your domain (e.g., `ingest.capless.dev`)
6. Click "Add Custom Domain"

### 6.2 Update DNS

Cloudflare will automatically create the DNS record if you're using Cloudflare DNS.

### 6.3 Test Custom Domain

```bash
curl https://ingest.capless.dev/health
```

## Step 7: Monitoring & Logs

### 7.1 View Real-Time Logs

```bash
wrangler tail --env production
```

### 7.2 View Metrics in Dashboard

1. Go to https://dash.cloudflare.com
2. Navigate to Workers & Pages
3. Select `capless-ingest-prod`
4. Click "Metrics" tab

**Key metrics to monitor:**
- Requests per second
- Success rate
- P50/P95/P99 latency
- Error rate

### 7.3 Set Up Alerts

1. In Cloudflare Dashboard, go to Notifications
2. Create alert for:
   - Worker CPU time exceeded
   - Worker error rate spike
   - R2 operations errors

## Step 8: CI/CD Integration (GitHub Actions)

Create `.github/workflows/deploy.yml`:

```yaml
name: Deploy Capless Ingest Worker

on:
  push:
    branches:
      - main
    paths:
      - 'workers/capless-ingest/**'

jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3

      - uses: actions/setup-node@v3
        with:
          node-version: '18'

      - name: Install dependencies
        working-directory: workers/capless-ingest
        run: npm ci

      - name: Run tests
        working-directory: workers/capless-ingest
        run: npm test

      - name: Deploy to Cloudflare
        working-directory: workers/capless-ingest
        run: npx wrangler deploy --env production
        env:
          CLOUDFLARE_API_TOKEN: ${{ secrets.CLOUDFLARE_API_TOKEN }}
```

### 8.1 Create Cloudflare API Token

1. Go to https://dash.cloudflare.com/profile/api-tokens
2. Click "Create Token"
3. Use template "Edit Cloudflare Workers"
4. Add permissions:
   - Account > Workers R2 Storage > Edit
   - Account > Workers KV Storage > Edit
   - Zone > Workers Routes > Edit
5. Copy the token

### 8.2 Add GitHub Secret

1. Go to your GitHub repository
2. Settings > Secrets and variables > Actions
3. Click "New repository secret"
4. Name: `CLOUDFLARE_API_TOKEN`
5. Value: Paste the token from above

## Troubleshooting

### Issue: "Error: Not authenticated"

**Solution:**
```bash
wrangler logout
wrangler login
```

### Issue: "Error: R2 bucket not found"

**Solution:**
```bash
# List available buckets
wrangler r2 bucket list

# Create if missing
wrangler r2 bucket create capless
```

### Issue: "Error: KV namespace not found"

**Solution:**
```bash
# List namespaces
wrangler kv:namespace list

# Verify IDs in wrangler.toml match output
```

### Issue: Tests failing with "fetch is not defined"

**Solution:**
This is expected in vitest environment. The mock is properly set up in tests.

### Issue: High latency on cold starts

**Solution:**
1. Enable Smart Placement in Cloudflare Dashboard
2. Consider using Durable Objects for state
3. Implement warmup requests

## Rollback Procedure

### Rollback to Previous Version

```bash
# List deployments
wrangler deployments list --env production

# Rollback to specific deployment
wrangler rollback --message "Rollback to stable version" --deployment-id xxxx-xxxx
```

## Performance Optimization

### Enable R2 Public Access (for CDN)

```bash
# Enable public access
wrangler r2 bucket create-public-access capless

# Access files via public URL
https://pub-capless.r2.dev/transcripts/processed/2024-07-02-p14-s3.json
```

### Configure Cache Rules

In Cloudflare Dashboard:
1. Go to Cache > Configuration
2. Add cache rule for `/api/*` endpoints
3. Set TTL based on your needs

## Security Hardening

### Add API Key Authentication

Update `src/index.ts`:

```typescript
function validateAPIKey(request: Request, env: Env): boolean {
  const apiKey = request.headers.get('X-API-Key');
  return apiKey === env.API_KEY;
}
```

Update `wrangler.toml`:

```toml
[env.production.vars]
API_KEY = "your-secure-api-key"
```

### Enable Rate Limiting

Use Cloudflare Rate Limiting:
1. Go to Security > WAF
2. Create rate limiting rule
3. Set threshold (e.g., 100 requests/minute per IP)

## Cost Estimation

**Cloudflare Workers Paid Plan ($5/month):**
- 10 million requests included
- Additional: $0.50 per million requests

**R2 Storage:**
- $0.015 per GB/month
- Class A operations: $4.50 per million
- Class B operations: $0.36 per million

**KV Storage:**
- $0.50 per million read operations
- $5.00 per million write operations

**Example: 100K requests/day**
- ~3M requests/month = Included in paid plan
- ~100MB storage = $0.0015/month
- Total: ~$5.01/month

## Next Steps

1. [ ] Set up monitoring alerts
2. [ ] Configure custom domain
3. [ ] Implement API key authentication
4. [ ] Set up CI/CD pipeline
5. [ ] Enable R2 public access for CDN
6. [ ] Create backup strategy
7. [ ] Document API usage for team

## Support

- Cloudflare Workers Docs: https://developers.cloudflare.com/workers/
- Wrangler CLI Docs: https://developers.cloudflare.com/workers/wrangler/
- Community Discord: https://discord.gg/cloudflaredev
