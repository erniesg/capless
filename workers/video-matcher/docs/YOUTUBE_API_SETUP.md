# YouTube Data API v3 Setup Guide

Complete guide to setting up YouTube Data API v3 for the Video Matcher Worker.

## Prerequisites

- Google account
- Credit card (for verification, but API usage is free within quota)

## Step-by-Step Setup

### 1. Create Google Cloud Project

1. Go to [Google Cloud Console](https://console.cloud.google.com)
2. Click the project dropdown at the top
3. Click "New Project"
4. Fill in project details:
   - **Project Name**: "Capless Video Matcher"
   - **Organization**: (leave as default or select your organization)
5. Click "Create"
6. Wait for project creation (takes ~10 seconds)

### 2. Enable YouTube Data API v3

1. In the Cloud Console, ensure your new project is selected
2. Click the hamburger menu (☰) → "APIs & Services" → "Library"
3. Search for "YouTube Data API v3"
4. Click on "YouTube Data API v3" from the results
5. Click the "Enable" button
6. Wait for API to be enabled

### 3. Create API Credentials

1. Go to "APIs & Services" → "Credentials"
2. Click "Create Credentials" dropdown
3. Select "API Key"
4. A dialog appears with your new API key
5. **IMPORTANT**: Copy the API key immediately (starts with `AIza...`)
6. Click "Close"

### 4. Restrict API Key (Recommended)

For security, restrict your API key:

#### Option A: HTTP Referrers (for web apps)

1. Click on the API key you just created
2. Under "Application restrictions":
   - Select "HTTP referrers (web sites)"
   - Click "Add an item"
   - Enter your domain: `https://capless-video-matcher.*.workers.dev/*`
   - Add staging domain if needed
3. Click "Save"

#### Option B: IP Addresses (for servers)

1. Click on the API key
2. Under "Application restrictions":
   - Select "IP addresses"
   - Click "Add an item"
   - Enter your server IP or Cloudflare Workers IPs
3. Click "Save"

#### Option C: None (Testing Only)

For testing/development, you can leave unrestricted, but **change this before production**.

### 5. Restrict to YouTube Data API Only

1. Under "API restrictions":
   - Select "Restrict key"
   - Check only "YouTube Data API v3"
2. Click "Save"

### 6. Test API Key

Test your API key with curl:

```bash
API_KEY="YOUR_API_KEY_HERE"
CHANNEL_ID="UCq9h3I2kQQCLb7snx_X8zSw"

curl "https://www.googleapis.com/youtube/v3/search?part=snippet&channelId=${CHANNEL_ID}&type=video&maxResults=1&key=${API_KEY}"
```

Expected response:
```json
{
  "kind": "youtube#searchListResponse",
  "items": [...]
}
```

If you get an error:
- `403 Forbidden`: API key restrictions too strict or API not enabled
- `400 Bad Request`: Check URL parameters
- `401 Unauthorized`: Invalid API key

## Understanding Quota

### Default Quota

- **Free tier**: 10,000 units per day
- Resets: Midnight Pacific Time (PST/PDT)
- No credit card charges within quota

### Quota Costs per Operation

| Operation | Cost (units) | Usage in Capless |
|-----------|--------------|------------------|
| `search.list` | 100 | 1 per video match |
| `videos.list` | 1 | 1 per video match |
| `captions.list` | 50 | 1 per timestamp find (if available) |

### Daily Capacity

With 10,000 units/day:

- **Video matches**: ~99 per day (100 + 1 units each)
- **With caching**: Effectively unlimited (cached matches use 0 quota)

### Example Usage Pattern

```
Day 1: 50 new transcripts × 101 units = 5,050 units
Day 2: 20 new transcripts × 101 units = 2,020 units
       30 cached matches × 0 units = 0 units
Total: 7,070 units (within quota)
```

## Monitoring Quota Usage

### View Current Usage

1. Go to [Google Cloud Console](https://console.cloud.google.com)
2. Select your project
3. Go to "APIs & Services" → "Dashboard"
4. Click on "YouTube Data API v3"
5. Click "Quotas" tab
6. View usage graph and metrics

### Set Up Quota Alerts

1. Go to "APIs & Services" → "Dashboard"
2. Click on "YouTube Data API v3"
3. Click "Quotas" tab
4. Click "All quotas" link
5. Select "Queries per day"
6. Click "Edit Quotas" in the top right
7. Set alert threshold (e.g., 80% = 8,000 units)
8. Enter email for notifications
9. Click "Save"

## Requesting Quota Increase

If you need more than 10,000 units/day:

### 1. Fill Out Quota Extension Form

1. Go to "APIs & Services" → "Dashboard"
2. Click "YouTube Data API v3"
3. Click "Quotas" tab
4. Click "All quotas"
5. Find "Queries per day"
6. Click the checkbox next to it
7. Click "Edit Quotas" button
8. Fill out the form:
   - **New quota limit**: 1,000,000 (or as needed)
   - **Justification**: Explain your use case

Example justification:
```
Our application (Capless) matches Singapore parliamentary
transcripts with YouTube videos to make government proceedings
more accessible. We process 200+ transcripts daily, requiring
~20,000 API units per day. Our caching strategy reduces repeat
calls, but initial processing requires higher quota.
```

### 2. Google's Review Process

- **Timeline**: 1-3 business days
- **Approval**: Usually granted for legitimate use cases
- **Notification**: Email sent to project owner

### 3. After Approval

- Quota automatically increases
- No code changes needed
- Monitor new quota in dashboard

## Cost Considerations

### Free Tier

- **YouTube Data API v3**: FREE within quota
- **Above quota**: Requests are rejected (not charged)
- **No surprise bills**: You must explicitly enable billing to exceed quota

### Paid Tier (if needed)

If you enable billing and exceed quota:

- **Cost**: $0.00 per additional 10,000 units (as of 2024)
- **Note**: YouTube Data API is currently free even above quota
- **However**: Other Google Cloud services may have charges

**Recommendation**: Don't enable billing unless necessary. Rely on quota increases instead.

## Best Practices

### 1. Optimize API Usage

```javascript
// ✅ Good: Use fields parameter to limit response
const response = await youtube.search.list({
  part: ['snippet'],
  fields: 'items(id,snippet(title,publishedAt))',
  // ... other params
});

// ❌ Bad: Request all data
const response = await youtube.search.list({
  part: ['snippet', 'contentDetails', 'statistics'],
  // Uses more bandwidth and processing
});
```

### 2. Implement Caching

```javascript
// ✅ Good: Check cache first
const cached = await redis.get(key);
if (cached) return cached;

const result = await youtubeAPI.search();
await redis.set(key, result, { ex: 604800 }); // 7 days

// Reduces API calls by 90%+
```

### 3. Batch Operations

```javascript
// ✅ Good: Batch video details
const videoIds = searchResults.map(r => r.id.videoId);
const details = await youtube.videos.list({
  id: videoIds, // Up to 50 IDs
});

// Uses 1 unit instead of N units
```

### 4. Handle Quota Errors

```javascript
try {
  const result = await youtubeAPI.search();
} catch (error) {
  if (error.code === 403 && error.message.includes('quota')) {
    // Return cached results or show user-friendly error
    return getCachedFallback();
  }
  throw error;
}
```

### 5. Monitor Usage Patterns

Set up logging to track:
- Daily API calls
- Cache hit rate
- Quota usage percentage
- Peak usage times

## Troubleshooting

### Issue: "The request cannot be completed because you have exceeded your quota"

**Solution:**
1. Check if quota reset time has passed (midnight PT)
2. Review cache strategy to reduce API calls
3. Request quota increase if consistently hitting limit
4. Implement request queuing for off-peak hours

### Issue: "API key not valid. Please pass a valid API key"

**Causes:**
- API key copied incorrectly
- Extra spaces in key
- API not enabled for project
- API key deleted or regenerated

**Solution:**
1. Verify key in Cloud Console
2. Regenerate key if needed
3. Confirm YouTube Data API v3 is enabled

### Issue: "Access Not Configured"

**Solution:**
1. Go to Cloud Console
2. Enable "YouTube Data API v3"
3. Wait 1-2 minutes for changes to propagate

### Issue: "The provided API key is expired"

**Solution:**
API keys don't expire by default, but can be manually set to expire:
1. Check key expiration in Cloud Console
2. Create new key if expired
3. Update Cloudflare Worker secrets

## Security Best Practices

### 1. Never Commit API Keys

```bash
# ✅ Good: Use environment variables
YOUTUBE_API_KEY=your_key_here

# ❌ Bad: Hard-coded in source
const apiKey = 'AIza...'; // DON'T DO THIS
```

### 2. Use Separate Keys per Environment

- **Development**: Separate API key
- **Staging**: Separate API key
- **Production**: Separate API key with restrictions

### 3. Rotate Keys Regularly

1. Create new API key
2. Update Worker secrets
3. Delete old key after verification
4. Repeat every 90 days

### 4. Monitor for Unauthorized Usage

Set up alerts for:
- Unusual quota spikes
- API calls from unexpected IPs
- Error rate increases

## API Key Rotation Procedure

### Step 1: Create New Key

```bash
# In Google Cloud Console
APIs & Services → Credentials → Create Credentials → API Key
```

### Step 2: Update Cloudflare Worker

```bash
wrangler secret put YOUTUBE_API_KEY
# Paste new key
```

### Step 3: Test New Key

```bash
# Test in production
curl -X POST https://your-worker.workers.dev/api/video/match \
  -H "Content-Type: application/json" \
  -d '{"transcript_id":"test","sitting_date":"02-07-2024"}'
```

### Step 4: Delete Old Key

```bash
# In Google Cloud Console
APIs & Services → Credentials → Delete old key
```

### Step 5: Verify

Monitor logs for any API key errors:
```bash
wrangler tail
```

## Support Resources

- [YouTube Data API Documentation](https://developers.google.com/youtube/v3)
- [API Explorer](https://developers.google.com/youtube/v3/docs)
- [Quota Calculator](https://developers.google.com/youtube/v3/determine_quota_cost)
- [Stack Overflow - YouTube API](https://stackoverflow.com/questions/tagged/youtube-api)
- [Google Cloud Support](https://cloud.google.com/support)

## Quick Reference

### API Endpoints Used

| Endpoint | Purpose | Quota Cost |
|----------|---------|------------|
| `search.list` | Find videos by date/keywords | 100 units |
| `videos.list` | Get video details | 1 unit |
| `captions.list` | Check transcript availability | 50 units |

### Quota Limits

| Tier | Daily Quota | Notes |
|------|-------------|-------|
| Free | 10,000 units | Default |
| Extended | 1,000,000+ units | Requires approval |

### Key Restrictions

| Type | Use Case | Security Level |
|------|----------|----------------|
| None | Testing only | ⚠️ Low |
| HTTP referrers | Web apps | ⭐⭐ Medium |
| IP addresses | Server apps | ⭐⭐⭐ High |

---

**Last Updated**: 2025-01-20
**API Version**: YouTube Data API v3
