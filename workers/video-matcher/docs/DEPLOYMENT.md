# Deployment Guide - Capless Video Matcher Worker

Step-by-step guide to deploy the Video Matcher Worker to Cloudflare.

## Prerequisites Checklist

- [ ] Cloudflare account created
- [ ] Wrangler CLI installed (`npm install -g wrangler`)
- [ ] Wrangler authenticated (`wrangler login`)
- [ ] YouTube API key obtained
- [ ] Upstash Redis created
- [ ] R2 bucket created

## Step 1: Install Dependencies

```bash
cd workers/video-matcher
npm install
```

## Step 2: Create R2 Bucket

```bash
# Create bucket
wrangler r2 bucket create capless

# Verify bucket exists
wrangler r2 bucket list
```

Expected output:
```
bucket1: capless
```

## Step 3: Configure Secrets

### YouTube API Key

```bash
wrangler secret put YOUTUBE_API_KEY
```

When prompted, paste your YouTube API key (starts with `AIza...`)

### Upstash Redis URL

```bash
wrangler secret put UPSTASH_REDIS_REST_URL
```

Paste your Upstash Redis REST URL (e.g., `https://xxx-xxx.upstash.io`)

### Upstash Redis Token

```bash
wrangler secret put UPSTASH_REDIS_REST_TOKEN
```

Paste your Upstash Redis REST token (starts with `AYN...`)

### Verify Secrets

```bash
wrangler secret list
```

Expected output:
```
{
  "YOUTUBE_API_KEY": "set",
  "UPSTASH_REDIS_REST_URL": "set",
  "UPSTASH_REDIS_REST_TOKEN": "set"
}
```

## Step 4: Test Locally

Create `.dev.vars` file for local testing:

```bash
cat > .dev.vars << EOF
YOUTUBE_API_KEY=your_youtube_api_key_here
UPSTASH_REDIS_REST_URL=https://your-redis.upstash.io
UPSTASH_REDIS_REST_TOKEN=your_redis_token_here
EOF
```

Start local development server:

```bash
npm run dev
```

Expected output:
```
⛅️ wrangler 3.85.0
-------------------
⎔ Starting local server...
[wrangler:inf] Ready on http://localhost:8787
```

### Test Health Endpoint

```bash
curl http://localhost:8787/health
```

Expected response:
```json
{
  "status": "healthy",
  "service": "capless-video-matcher",
  "version": "1.0.0",
  "timestamp": "2025-01-20T10:30:00Z"
}
```

### Test Video Match (Local)

```bash
curl -X POST http://localhost:8787/api/video/match \
  -H "Content-Type: application/json" \
  -d '{
    "transcript_id": "test-hansard-001",
    "sitting_date": "02-07-2024"
  }'
```

This will make a real YouTube API call, so ensure you have a valid API key.

## Step 5: Run Tests

```bash
# Run unit tests
npm test

# Run with coverage
npm run test:coverage
```

All tests should pass before deploying.

## Step 6: Deploy to Production

```bash
npm run deploy
```

Expected output:
```
⛅️ wrangler 3.85.0
-------------------
Total Upload: XX.XX KiB / gzip: XX.XX KiB
Uploaded capless-video-matcher (X.XX sec)
Published capless-video-matcher (X.XX sec)
  https://capless-video-matcher.YOUR_SUBDOMAIN.workers.dev
```

Copy the URL - this is your production endpoint.

## Step 7: Test Production Deployment

### Test Health Endpoint

```bash
curl https://capless-video-matcher.YOUR_SUBDOMAIN.workers.dev/health
```

### Test Video Match (Production)

```bash
curl -X POST https://capless-video-matcher.YOUR_SUBDOMAIN.workers.dev/api/video/match \
  -H "Content-Type: application/json" \
  -d '{
    "transcript_id": "prod-test-001",
    "sitting_date": "02-07-2024"
  }'
```

Expected response (if video exists):
```json
{
  "video_id": "...",
  "video_url": "https://www.youtube.com/watch?v=...",
  "title": "Parliament Sitting - 2 July 2024",
  "confidence_score": 9.5,
  "cached": false
}
```

### Test Caching

Run the same request again:

```bash
curl -X POST https://capless-video-matcher.YOUR_SUBDOMAIN.workers.dev/api/video/match \
  -H "Content-Type: application/json" \
  -d '{
    "transcript_id": "prod-test-001",
    "sitting_date": "02-07-2024"
  }'
```

Expected response:
```json
{
  "video_id": "...",
  "cached": true
}
```

Notice `"cached": true` - this confirms Redis caching is working.

## Step 8: Monitor Deployment

### View Live Logs

```bash
wrangler tail
```

Make a request and watch logs in real-time.

### Check R2 Storage

```bash
wrangler r2 object list capless --prefix video-matches/
```

You should see stored matches:
```
video-matches/prod-test-001.json
```

### Download Match from R2

```bash
wrangler r2 object get capless video-matches/prod-test-001.json --file match.json
cat match.json
```

## Step 9: Configure Custom Domain (Optional)

### Add Custom Domain

1. Go to Cloudflare Dashboard
2. Navigate to Workers & Pages
3. Select `capless-video-matcher`
4. Click "Triggers" tab
5. Click "Add Custom Domain"
6. Enter domain: `video-matcher.capless.ai`
7. Click "Add Custom Domain"

### Update DNS

Cloudflare will automatically create a DNS record.

### Test Custom Domain

```bash
curl https://video-matcher.capless.ai/health
```

## Step 10: Set Up Monitoring (Optional)

### Enable Analytics

1. Go to Workers & Pages → capless-video-matcher
2. Click "Metrics" tab
3. View:
   - Requests per second
   - Error rate
   - CPU time
   - Duration

### Set Up Alerts

1. Go to Notifications
2. Create alert for:
   - Error rate > 5%
   - Request volume spike
   - Long execution time

## Troubleshooting Deployment Issues

### Issue: "Secret not found"

**Solution:**
```bash
# List secrets to verify
wrangler secret list

# Re-add missing secret
wrangler secret put SECRET_NAME
```

### Issue: "R2 bucket not found"

**Solution:**
```bash
# Verify bucket exists
wrangler r2 bucket list

# Create if missing
wrangler r2 bucket create capless
```

### Issue: "Cannot find module 'googleapis'"

**Solution:**
```bash
# Reinstall dependencies
rm -rf node_modules package-lock.json
npm install
```

### Issue: "TypeError: Cannot read property 'R2'"

**Solution:**
- Check `wrangler.toml` has correct R2 binding
- Verify bucket name matches in config
- Redeploy after fixing config

### Issue: YouTube API returns 403

**Solution:**
- Verify API key is correct
- Check API is enabled in Google Cloud Console
- Verify quota hasn't been exceeded

## Rollback Procedure

If deployment has issues:

```bash
# View deployment history
wrangler deployments list

# Rollback to previous version
wrangler rollback --version-id PREVIOUS_VERSION_ID
```

## Post-Deployment Checklist

- [ ] Health endpoint returns 200 OK
- [ ] Video match endpoint works
- [ ] Caching is functioning (check `cached: true`)
- [ ] R2 storage is being populated
- [ ] Logs show no errors
- [ ] Custom domain is working (if configured)
- [ ] Monitoring/alerts are set up

## Environment Variables Reference

Set in `wrangler.toml`:

```toml
[vars]
YOUTUBE_CHANNEL_ID = "UCq9h3I2kQQCLb7snx_X8zSw"
CACHE_TTL_SECONDS = "604800"
```

Secrets (set with `wrangler secret put`):

- `YOUTUBE_API_KEY`
- `UPSTASH_REDIS_REST_URL`
- `UPSTASH_REDIS_REST_TOKEN`

## Production Best Practices

1. **Monitor Quota**: Check YouTube API quota daily
2. **Enable Caching**: Reduces API costs by 90%+
3. **Set Up Alerts**: Get notified of errors/issues
4. **Regular Testing**: Test endpoints weekly
5. **Backup Matches**: R2 provides automatic durability
6. **Version Control**: Tag releases in git
7. **Documentation**: Keep README updated

## Next Steps

After successful deployment:

1. Integrate with main Capless orchestration workflow
2. Set up automated testing pipeline
3. Configure monitoring dashboards
4. Document API for team members
5. Set up staging environment for testing

## Support

For deployment issues:
- Check [troubleshooting](#troubleshooting-deployment-issues)
- Review Cloudflare Workers documentation
- Check wrangler logs: `wrangler tail`
- Open issue in repository

---

**Deployment Status**: Production Ready ✅
