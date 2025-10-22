import { defineConfig, devices } from '@playwright/test';

/**
 * Playwright configuration for Capless integration tests
 *
 * NOTE: Playwright integration tests have been replaced with Vitest + @cloudflare/vitest-pool-workers
 * This configuration is kept for reference. Archived tests are in tests/integration-playwright-archived/
 *
 * Active integration tests: tests/integration-vitest/ (run with: npm run test:integration)
 *
 * Tests Cloudflare Workers running locally via wrangler dev
 */
export default defineConfig({
  testDir: './tests/integration-playwright-archived',

  // Test execution settings
  fullyParallel: false, // Sequential by default, parallel where safe
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : 1, // Run tests serially

  // Reporting
  reporter: [
    ['html', { outputFolder: 'playwright-report' }],
    ['json', { outputFile: 'test-results/results.json' }],
    ['list']
  ],

  // Output
  outputDir: 'test-results',

  // Global settings
  use: {
    // Base URL for workers running locally
    baseURL: 'http://localhost:8787',

    // Timeout for individual actions
    actionTimeout: 30000,

    // Tracing on first retry
    trace: 'on-first-retry',

    // Screenshot on failure
    screenshot: 'only-on-failure',

    // Video on first retry
    video: 'retain-on-failure',
  },

  // Global timeout for each test
  timeout: 120000, // 2 minutes (workers may take time to start)

  // Expect timeout
  expect: {
    timeout: 10000
  },

  // Projects for different worker tests
  projects: [
    {
      name: 'ingestion-worker',
      testMatch: /ingestion\.integration\.spec\.ts/,
      use: {
        ...devices['Desktop Chrome'],
        baseURL: 'http://localhost:8787',
      },
    },
    {
      name: 'video-matcher-worker',
      testMatch: /video-matcher\.integration\.spec\.ts/,
      use: {
        ...devices['Desktop Chrome'],
        baseURL: 'http://localhost:8788',
      },
    },
    {
      name: 'moments-worker',
      testMatch: /moments\.integration\.spec\.ts/,
      use: {
        ...devices['Desktop Chrome'],
        baseURL: 'http://localhost:8789',
      },
    },
    {
      name: 'asset-generator-worker',
      testMatch: /asset-generator\.integration\.spec\.ts/,
      use: {
        ...devices['Desktop Chrome'],
        baseURL: 'http://localhost:8790',
      },
    },
    {
      name: 'video-compositor-worker',
      testMatch: /video-compositor\.integration\.spec\.ts/,
      use: {
        ...devices['Desktop Chrome'],
        baseURL: 'http://localhost:8791',
      },
    },
    {
      name: 'pipeline-e2e',
      testMatch: /pipeline\.e2e\.spec\.ts/,
      use: {
        ...devices['Desktop Chrome'],
      },
      dependencies: ['ingestion-worker', 'video-matcher-worker', 'moments-worker', 'asset-generator-worker', 'video-compositor-worker'],
    },
  ],

  // Web server configuration for starting workers
  // Note: Workers will be started manually in test beforeAll hooks
  // to allow per-port configuration
});
