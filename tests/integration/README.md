## # Capless Integration Testing Infrastructure

Comprehensive Playwright-based integration tests for the 5-worker Capless pipeline.

## Overview

This testing infrastructure validates the complete Capless pipeline from Hansard ingestion to final video publishing. All external APIs (OpenAI, ElevenLabs, Modal, Parliament, YouTube) are mocked with typed factories to ensure deterministic, fast, and reliable tests.

## Architecture

```
tests/integration/
├── mocks/                      # Typed mock factories for external APIs
│   ├── openai.ts              # GPT-4o, embeddings
│   ├── elevenlabs.ts          # TTS, voice generation
│   ├── modal.ts               # Video rendering jobs
│   ├── parliament.ts          # Hansard API
│   └── youtube.ts             # YouTube Data API v3
├── fixtures/                   # Reusable test data
│   ├── hansard-transcripts.ts
│   ├── youtube-videos.ts
│   ├── viral-moments.ts
│   ├── generated-scripts.ts
│   └── rendered-videos.ts
├── helpers/                    # Test utilities
│   ├── mock-server.ts         # Playwright route interception
│   ├── validation.ts          # Schema validation helpers
│   └── worker-manager.ts      # Wrangler dev process management
├── ingestion.integration.spec.ts
├── video-matcher.integration.spec.ts
├── moments.integration.spec.ts
├── asset-generator.integration.spec.ts
├── video-compositor.integration.spec.ts
└── pipeline.e2e.spec.ts       # Full pipeline test
```

## Running Tests

### Run All Tests
```bash
npm run test:integration
# or
./scripts/test-integration.sh
```

### Run Individual Worker Tests
```bash
# Ingestion Worker
npx playwright test ingestion.integration
./scripts/test-integration.sh ingestion

# Video Matcher Worker
npx playwright test video-matcher.integration
./scripts/test-integration.sh video-matcher

# Moments Worker
npx playwright test moments.integration
./scripts/test-integration.sh moments

# Asset Generator Worker
npx playwright test asset-generator.integration
./scripts/test-integration.sh asset-generator

# Video Compositor Worker
npx playwright test video-compositor.integration
./scripts/test-integration.sh video-compositor

# End-to-End Pipeline
npx playwright test pipeline.e2e
./scripts/test-integration.sh e2e
```

### Run with UI Mode (Debug)
```bash
npm run test:integration:ui

# Or specific test in UI mode
npx playwright test ingestion.integration --ui
```

### Run in Headed Mode (See Browser)
```bash
npm run test:integration:headed
./scripts/test-integration.sh all --headed
```

### Run with Debug Mode
```bash
npm run test:integration:debug
```

## Test Structure

### Worker Integration Tests

Each worker has a comprehensive integration test suite covering:

1. **Happy Path Tests** - Core functionality with valid inputs
2. **Data Quality Tests** - Validates correctness of data processing
3. **Error Handling Tests** - Tests invalid inputs and edge cases
4. **Performance Tests** - Ensures operations complete within time limits
5. **Caching Tests** - Validates caching behavior where applicable

### Example: Ingestion Worker Tests

```typescript
test.describe('Ingestion Worker Integration Tests', () => {
  // Setup mock server and worker before tests
  test.beforeAll(async () => {
    await workerManager.startWorker(WORKER_CONFIGS.ingestion);
    await mockServer.setup(page);
  });

  test('should ingest Hansard by sitting date', async ({ request }) => {
    const response = await request.post(`${BASE_URL}/ingest`, {
      data: { sittingDate: '02-07-2024' }
    });

    assertStatusCode(response, 200);
    const body = await response.json();

    expect(body.success).toBe(true);
    expect(body.transcript_id).toBeTruthy();
  });
});
```

## Mock Factories

### OpenAI Mocks

```typescript
import { createViralMomentDetectionResponse } from './mocks/openai';

const response = createViralMomentDetectionResponse([
  {
    quote: "Have his cake and eat it too",
    speaker: "Leader of Opposition",
    ai_score: 8.5,
    // ... more fields
  }
]);
```

**Available Factories:**
- `createViralMomentDetectionResponse()` - GPT-4o viral moment analysis
- `createScriptGenerationResponse()` - Multi-persona script generation
- `createJudgingResponse()` - GPT-4o-mini script judging
- `createEmbeddingResponse()` - Text embeddings
- `createOpenAIErrorResponse()` - Error scenarios

### ElevenLabs Mocks

```typescript
import { createTTSResponse } from './mocks/elevenlabs';

const response = createTTSResponse(
  "Bruh, this Minister really said...",
  "voice_gen_z_energetic_123"
);
```

**Available Factories:**
- `createTTSResponse()` - Text-to-speech audio generation
- `createVoicesResponse()` - Voice list
- `createMockAudioBuffer()` - Binary audio data
- `createElevenLabsErrorResponse()` - Error scenarios

### Modal Mocks

```typescript
import { createModalJobResponse, createModalStatusResponse } from './mocks/modal';

const jobResponse = createModalJobResponse(120); // 120 second estimate
const statusResponse = createModalStatusResponse('job-123', 'completed', {
  progress: 100,
  videoUrl: 'https://storage.modal.com/videos/job-123.mp4'
});
```

**Available Factories:**
- `createModalJobResponse()` - Job submission
- `createModalStatusResponse()` - Job status at different stages
- `createProgressiveJobStatuses()` - Sequence of status updates
- `createModalWebhookPayload()` - Webhook notifications

### Parliament API Mocks

```typescript
import { createHansardResponse } from './mocks/parliament';

const hansard = createHansardResponse({
  date: '02-07-2024',
  sections: [...],
  attendance: ['PM', 'DPM', ...]
});
```

**Available Factories:**
- `createHansardResponse()` - Complete Hansard JSON
- `createParliamentaryHTML()` - Realistic HTML content
- Pre-built fixtures: `COMPLETE_HANSARD_FIXTURE`, `MINIMAL_HANSARD_FIXTURE`

### YouTube API Mocks

```typescript
import { createSearchResponse, createVideoDetailsResponse } from './mocks/youtube';

const searchResults = createSearchResponse('parliament 2024', 'UC-parliament', 5);
const videoDetails = createVideoDetailsResponse('video-123', {
  duration: 'PT2H30M15S',
  publishedAt: '2024-07-02T04:00:00Z'
});
```

**Available Factories:**
- `createSearchResponse()` - YouTube search results
- `createVideoDetailsResponse()` - Video metadata
- `parseDuration()` / `formatDuration()` - ISO 8601 conversion

## Test Fixtures

Fixtures provide realistic, reusable test data:

### Hansard Transcripts

```typescript
import { COMPLETE_TRANSCRIPT, MINIMAL_TRANSCRIPT } from './fixtures/hansard-transcripts';

// Use in tests
const transcript = COMPLETE_TRANSCRIPT;
expect(transcript.segments).toHaveLength(5);
```

### YouTube Videos

```typescript
import { PARLIAMENT_SESSION_VIDEO, HIGHLIGHT_CLIP_VIDEO } from './fixtures/youtube-videos';
```

### Viral Moments

```typescript
import { CAKE_MOMENT, CLIMATE_MOMENT, EXTRACTION_RESULT } from './fixtures/viral-moments';
```

### Generated Scripts

```typescript
import { GEN_Z_SCRIPT, FULL_ASSET_RESPONSE } from './fixtures/generated-scripts';
```

### Rendered Videos

```typescript
import { TIKTOK_COMPOSE_REQUEST, JOB_STATUS_COMPLETED } from './fixtures/rendered-videos';
```

## Validation Helpers

Schema validation ensures responses match TypeScript definitions:

```typescript
import { assertResponse, assertStatusCode, assertValidURL } from './helpers/validation';

// Validate status code
assertStatusCode(response, 200, 'context');

// Validate response against Zod schema
const data = await assertResponse(response, MySchema, 'API response');

// Validate URL format
assertValidURL('https://example.com/video.mp4');

// Validate numeric range
assertInRange(score, 0, 10, 'virality score');
```

**Available Validators:**
- `assertSchema()` - Validate against Zod schema (throws on error)
- `assertResponse()` - Validate HTTP response body
- `assertStatusCode()` - Validate HTTP status
- `assertHeaders()` - Validate response headers
- `assertArrayLength()` - Validate array length
- `assertValidURL()` - Validate URL format
- `assertValidISO8601()` - Validate timestamp format
- `assertInRange()` - Validate numeric range

## Mock Server

The mock server intercepts Playwright requests and routes them to mocks:

```typescript
import { createMockServer } from './helpers/mock-server';

const mockServer = createMockServer({
  openai: { enabled: true, failRate: 0.1 }, // 10% failure rate
  elevenlabs: { enabled: true },
  modal: { enabled: true },
  parliament: { enabled: true },
  youtube: { enabled: true },
});

await mockServer.setup(page);

// Get request logs for debugging
const logs = mockServer.getRequestLogs();
const openaiLogs = mockServer.getLogsForAPI(/openai\.com/);
```

**Features:**
- Automatic route interception via Playwright
- Configurable failure rates for chaos testing
- Request logging for debugging
- Progressive job status simulation (Modal)

## Worker Manager

Manages wrangler dev processes during tests:

```typescript
import { createWorkerManager, WORKER_CONFIGS } from './helpers/worker-manager';

const manager = createWorkerManager();

// Start worker on specific port
await manager.startWorker(WORKER_CONFIGS.ingestion);

// Check if running
if (manager.isRunning('capless-ingest')) {
  // Make request
  const response = await manager.request(8787, '/health');
}

// Stop worker
await manager.stopWorker('capless-ingest');

// Stop all workers
await manager.stopAll();
```

**Predefined Configs:**
- `WORKER_CONFIGS.ingestion` - Port 8787
- `WORKER_CONFIGS.videoMatcher` - Port 8788
- `WORKER_CONFIGS.moments` - Port 8789
- `WORKER_CONFIGS.assetGenerator` - Port 8790
- `WORKER_CONFIGS.videoCompositor` - Port 8791

## Writing New Tests

### 1. Create Test File

```typescript
import { test, expect } from '@playwright/test';
import { createMockServer } from './helpers/mock-server';
import { createWorkerManager } from './helpers/worker-manager';

test.describe('My Worker Tests', () => {
  const mockServer = createMockServer();
  const workerManager = createWorkerManager();

  test.beforeAll(async ({ browser }) => {
    await workerManager.startWorker({ /* config */ });
    const page = await browser.newPage();
    await mockServer.setup(page);
    await page.close();
  });

  test.afterAll(async () => {
    await workerManager.stopAll();
  });

  test('should do something', async ({ request }) => {
    const response = await request.post('http://localhost:8787/endpoint', {
      data: { /* payload */ }
    });

    expect(response.ok).toBe(true);
  });
});
```

### 2. Add Mock Data

Create fixtures in `fixtures/` or use mock factories from `mocks/`.

### 3. Add Validation

Use helpers from `helpers/validation.ts` to validate responses:

```typescript
const body = await assertResponse(response, MySchema, 'my endpoint');
```

### 4. Run Tests

```bash
npx playwright test my-worker.spec.ts
```

## Debugging Tests

### View Test Report

```bash
npx playwright show-report
```

### Enable Debug Logging

```bash
DEBUG_WORKERS=1 npx playwright test
```

### Use Playwright Inspector

```bash
npx playwright test --debug
```

### Check Worker Logs

```typescript
const logs = workerManager.getLogs('worker-name');
console.log(logs);
```

### Check Mock Server Logs

```typescript
const logs = mockServer.getRequestLogs();
console.log(logs);
```

## CI/CD Integration

### GitHub Actions Example

```yaml
name: Integration Tests

on: [push, pull_request]

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - uses: actions/setup-node@v3
        with:
          node-version: '18'
      - run: npm install
      - run: npx playwright install --with-deps
      - run: npm run test:integration
      - uses: actions/upload-artifact@v3
        if: always()
        with:
          name: playwright-report
          path: playwright-report/
```

## Performance Benchmarks

Expected test durations (approximate):

- **Ingestion Worker**: 30-45 seconds
- **Video Matcher Worker**: 25-35 seconds
- **Moments Worker**: 40-60 seconds
- **Asset Generator Worker**: 35-50 seconds
- **Video Compositor Worker**: 30-45 seconds
- **End-to-End Pipeline**: 2-3 minutes

Total suite: ~5-7 minutes

## Troubleshooting

### Workers Won't Start

**Issue**: Worker fails to start on port
```
Error: Worker ingestion failed to start: EADDRINUSE
```

**Solution**: Kill existing wrangler processes
```bash
pkill -f wrangler
```

### Mock Server Not Intercepting

**Issue**: Real API calls being made

**Solution**: Ensure mock server is setup before making requests
```typescript
test.beforeAll(async ({ browser }) => {
  const page = await browser.newPage();
  await mockServer.setup(page);
  await page.close();
});
```

### Schema Validation Failing

**Issue**: Response doesn't match schema

**Solution**: Check the schema matches worker types
```typescript
// Import schema from worker
import { MyResponseSchema } from '../../workers/my-worker/src/types';

// Validate
const body = await assertResponse(response, MyResponseSchema);
```

### Test Timeouts

**Issue**: Tests timing out

**Solution**: Increase timeout in playwright.config.ts
```typescript
timeout: 120000, // 2 minutes
```

## Best Practices

1. **Use Mock Factories** - Always use typed mocks, never raw JSON
2. **Validate Schemas** - Use `assertResponse()` to catch type mismatches early
3. **Test Error Cases** - Include error handling tests for robustness
4. **Keep Tests Independent** - Each test should be runnable in isolation
5. **Clean Up** - Always stop workers in `afterAll()`
6. **Use Fixtures** - Reuse fixtures for consistency
7. **Document Edge Cases** - Comment unusual test scenarios
8. **Check Logs** - Use mock server logs for debugging

## Contributing

When adding new features to workers:

1. Update type definitions in `workers/*/src/types.ts`
2. Update corresponding mock factories in `tests/integration/mocks/`
3. Add fixtures if needed in `tests/integration/fixtures/`
4. Write integration tests covering new functionality
5. Ensure all tests pass before submitting PR

## License

Same as project license.
