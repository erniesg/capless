/**
 * Integration tests for Video Compositor Worker (Worker 5/5)
 * Tests video rendering via Modal and publishing to social platforms
 */

import { test, expect } from '@playwright/test';
import { createMockServer } from './helpers/mock-server';
import { createWorkerManager, WORKER_CONFIGS } from './helpers/worker-manager';
import { assertStatusCode, assertValidURL, assertInRange } from './helpers/validation';
import {
  TIKTOK_COMPOSE_REQUEST,
  INSTAGRAM_COMPOSE_REQUEST,
  JOB_STATUS_QUEUED,
  JOB_STATUS_RENDERING_50,
  JOB_STATUS_COMPLETED,
  JOB_STATUS_FAILED,
  PUBLISH_TIKTOK_REQUEST,
  PUBLISH_SUCCESS_RESPONSE,
} from './fixtures/rendered-videos';

test.describe('Video Compositor Worker Integration Tests', () => {
  const mockServer = createMockServer();
  const workerManager = createWorkerManager();
  const BASE_URL = `http://localhost:${WORKER_CONFIGS.videoCompositor.port}`;

  test.beforeAll(async ({ browser }) => {
    await workerManager.startWorker(WORKER_CONFIGS.videoCompositor);

    const page = await browser.newPage();
    await mockServer.setup(page);
    await page.close();
  });

  test.afterAll(async () => {
    await workerManager.stopAll();
  });

  test.beforeEach(() => {
    mockServer.clearLogs();
  });

  test.describe('POST /compose - Video Rendering', () => {
    test('should submit TikTok video composition job', async ({ request }) => {
      const response = await request.post(`${BASE_URL}/compose`, {
        data: TIKTOK_COMPOSE_REQUEST,
      });

      assertStatusCode(response, 200, 'compose request');
      const body = await response.json();

      // Validate response structure
      expect(body.job_id).toBeTruthy();
      expect(body.status).toBe('queued');
      expect(body.estimated_completion).toBeGreaterThan(0);
      expect(body.modal_job_id).toBeTruthy();

      // Verify Modal API was called
      const modalLogs = mockServer.getLogsForAPI(/modal.*\/render/);
      expect(modalLogs.length).toBeGreaterThan(0);
    });

    test('should submit Instagram Reels composition job', async ({ request }) => {
      const response = await request.post(`${BASE_URL}/compose`, {
        data: INSTAGRAM_COMPOSE_REQUEST,
      });

      assertStatusCode(response, 200);
      const body = await response.json();

      expect(body.status).toBe('queued');
      expect(body.modal_job_id).toBeTruthy();
    });

    test('should validate compose request schema', async ({ request }) => {
      const invalidRequest = {
        // Missing required fields
        persona: 'gen_z',
      };

      const response = await request.post(`${BASE_URL}/compose`, {
        data: invalidRequest,
      });

      expect(response.status).toBeGreaterThanOrEqual(400);
      const body = await response.json();
      expect(body.error).toBeTruthy();
    });

    test('should accept webhook configuration', async ({ request }) => {
      const requestWithWebhook = {
        ...TIKTOK_COMPOSE_REQUEST,
        webhook_url: 'https://api.example.com/webhooks/video',
        webhook_events: ['completed', 'failed'],
      };

      const response = await request.post(`${BASE_URL}/compose`, {
        data: requestWithWebhook,
      });

      assertStatusCode(response, 200);
      const body = await response.json();
      expect(body.job_id).toBeTruthy();
    });
  });

  test.describe('GET /jobs/:id - Job Status Polling', () => {
    test('should track job progress through stages', async ({ request }) => {
      // Submit job
      const submitResponse = await request.post(`${BASE_URL}/compose`, {
        data: TIKTOK_COMPOSE_REQUEST,
      });

      const { job_id } = await submitResponse.json();

      // Poll status multiple times to see progression
      const statuses: string[] = [];

      for (let i = 0; i < 5; i++) {
        const statusResponse = await request.get(`${BASE_URL}/jobs/${job_id}`);
        assertStatusCode(statusResponse, 200);

        const status = await statusResponse.json();
        statuses.push(status.status);

        // Progress should be 0-100
        assertInRange(status.progress, 0, 100, 'job progress');

        // If completed, break
        if (status.status === 'completed') {
          expect(status.video_url).toBeTruthy();
          assertValidURL(status.video_url);
          break;
        }

        // Wait before next poll
        await new Promise(resolve => setTimeout(resolve, 1000));
      }

      // Should have seen progression
      expect(statuses.length).toBeGreaterThan(1);
    });

    test('should return 404 for non-existent job', async ({ request }) => {
      const response = await request.get(`${BASE_URL}/jobs/non-existent-job-id`);
      assertStatusCode(response, 404);
    });

    test('should handle failed job status', async ({ request }) => {
      // This would be configured in mock server to simulate failure
      const submitResponse = await request.post(`${BASE_URL}/compose`, {
        data: TIKTOK_COMPOSE_REQUEST,
      });

      const { job_id } = await submitResponse.json();

      // Poll until status changes
      let attempts = 0;
      while (attempts < 10) {
        const statusResponse = await request.get(`${BASE_URL}/jobs/${job_id}`);
        const status = await statusResponse.json();

        if (status.status === 'failed') {
          expect(status.error).toBeTruthy();
          expect(status.retry_count).toBeDefined();
          break;
        }

        attempts++;
        await new Promise(resolve => setTimeout(resolve, 500));
      }
    });
  });

  test.describe('POST /publish - Social Media Publishing', () => {
    test('should publish to TikTok', async ({ request }) => {
      const response = await request.post(`${BASE_URL}/publish`, {
        data: PUBLISH_TIKTOK_REQUEST,
      });

      assertStatusCode(response, 200, 'publish to TikTok');
      const body = await response.json();

      expect(body.published).toBe(1);
      expect(body.failed).toBe(0);
      expect(body.results).toHaveLength(1);

      const result = body.results[0];
      expect(result.platform).toBe('tiktok');
      expect(result.success).toBe(true);
      expect(result.url).toBeTruthy();
      assertValidURL(result.url);
    });

    test('should publish to multiple platforms', async ({ request }) => {
      const multiPlatformRequest = {
        ...PUBLISH_TIKTOK_REQUEST,
        platforms: ['tiktok', 'instagram', 'youtube'],
      };

      const response = await request.post(`${BASE_URL}/publish`, {
        data: multiPlatformRequest,
      });

      assertStatusCode(response, 200);
      const body = await response.json();

      expect(body.published).toBeGreaterThan(0);
      expect(body.results).toHaveLength(3);

      // Check each platform result
      const platforms = body.results.map((r: any) => r.platform);
      expect(platforms).toContain('tiktok');
      expect(platforms).toContain('instagram');
      expect(platforms).toContain('youtube');
    });

    test('should handle partial publishing failures', async ({ request }) => {
      // Mock server can simulate partial failures
      const response = await request.post(`${BASE_URL}/publish`, {
        data: {
          ...PUBLISH_TIKTOK_REQUEST,
          platforms: ['tiktok', 'instagram', 'youtube'],
        },
      });

      const body = await response.json();

      // Should have mix of successes and failures
      const successful = body.results.filter((r: any) => r.success);
      const failed = body.results.filter((r: any) => !r.success);

      expect(successful.length + failed.length).toBe(body.results.length);
      expect(body.published).toBe(successful.length);
      expect(body.failed).toBe(failed.length);

      // Failed results should have error message
      failed.forEach((result: any) => {
        expect(result.error).toBeTruthy();
      });
    });

    test('should schedule future publishing', async ({ request }) => {
      const futureTime = Math.floor(Date.now() / 1000) + 3600; // 1 hour from now

      const response = await request.post(`${BASE_URL}/publish`, {
        data: {
          ...PUBLISH_TIKTOK_REQUEST,
          schedule: futureTime,
        },
      });

      assertStatusCode(response, 200);
      const body = await response.json();

      expect(body.scheduled).toBe(true);
      expect(body.publish_at).toBe(futureTime);
      expect(body.job_id).toBeTruthy();
    });

    test('should validate publish request', async ({ request }) => {
      const invalidRequest = {
        video_url: 'invalid-url',
        platforms: [],
      };

      const response = await request.post(`${BASE_URL}/publish`, {
        data: invalidRequest,
      });

      expect(response.status).toBeGreaterThanOrEqual(400);
    });
  });

  test.describe('POST /cleanup - Storage Cleanup', () => {
    test('should perform dry run cleanup', async ({ request }) => {
      const response = await request.post(`${BASE_URL}/cleanup`, {
        data: {
          older_than: Math.floor(Date.now() / 1000) - 86400 * 7, // 7 days ago
          pattern: 'renders/*',
          dry_run: true,
        },
      });

      assertStatusCode(response, 200);
      const body = await response.json();

      expect(body.deleted_count).toBe(0); // Dry run doesn't delete
      expect(body.would_delete_count).toBeDefined();
      expect(body.freed_space_mb).toBe(0);
    });

    test('should execute cleanup', async ({ request }) => {
      const response = await request.post(`${BASE_URL}/cleanup`, {
        data: {
          older_than: Math.floor(Date.now() / 1000) - 86400 * 7,
          pattern: 'renders/*',
          dry_run: false,
        },
      });

      assertStatusCode(response, 200);
      const body = await response.json();

      expect(body.deleted_count).toBeGreaterThanOrEqual(0);
      expect(body.freed_space_mb).toBeGreaterThanOrEqual(0);
      expect(body.deleted_files).toBeInstanceOf(Array);
    });
  });

  test.describe('Effects Configuration', () => {
    test('should apply captions with different styles', async ({ request }) => {
      const requests = [
        { ...TIKTOK_COMPOSE_REQUEST, effects: { captions: { enabled: true, style: 'word_by_word' } } },
        { ...TIKTOK_COMPOSE_REQUEST, effects: { captions: { enabled: true, style: 'sentence' } } },
        { ...TIKTOK_COMPOSE_REQUEST, effects: { captions: { enabled: false } } },
      ];

      for (const req of requests) {
        const response = await request.post(`${BASE_URL}/compose`, { data: req });
        assertStatusCode(response, 200);

        const body = await response.json();
        expect(body.job_id).toBeTruthy();
      }
    });

    test('should apply transition effects', async ({ request }) => {
      const transitionTypes = ['fade', 'cut', 'wipe', 'dissolve'];

      for (const type of transitionTypes) {
        const req = {
          ...TIKTOK_COMPOSE_REQUEST,
          effects: {
            transitions: { enabled: true, type },
          },
        };

        const response = await request.post(`${BASE_URL}/compose`, { data: req });
        assertStatusCode(response, 200);
      }
    });

    test('should apply overlay effects', async ({ request }) => {
      const response = await request.post(`${BASE_URL}/compose`, {
        data: {
          ...TIKTOK_COMPOSE_REQUEST,
          effects: {
            overlays: {
              persona_emoji: true,
              progress_bar: true,
            },
          },
        },
      });

      assertStatusCode(response, 200);
      const body = await response.json();
      expect(body.job_id).toBeTruthy();
    });
  });

  test.describe('Template Handling', () => {
    test('should use TikTok parliamentary template', async ({ request }) => {
      const response = await request.post(`${BASE_URL}/compose`, {
        data: { ...TIKTOK_COMPOSE_REQUEST, template: 'tiktok_parliamentary' },
      });

      assertStatusCode(response, 200);
    });

    test('should use Instagram Reels template', async ({ request }) => {
      const response = await request.post(`${BASE_URL}/compose`, {
        data: { ...INSTAGRAM_COMPOSE_REQUEST, template: 'instagram_reels' },
      });

      assertStatusCode(response, 200);
    });

    test('should use YouTube Shorts template', async ({ request }) => {
      const response = await request.post(`${BASE_URL}/compose`, {
        data: {
          ...TIKTOK_COMPOSE_REQUEST,
          template: 'youtube_shorts',
        },
      });

      assertStatusCode(response, 200);
    });
  });

  test.describe('Performance', () => {
    test('should queue jobs quickly', async ({ request }) => {
      const startTime = Date.now();

      const response = await request.post(`${BASE_URL}/compose`, {
        data: TIKTOK_COMPOSE_REQUEST,
      });

      const endTime = Date.now();
      const responseTime = endTime - startTime;

      // Job submission should be fast (< 2 seconds)
      expect(responseTime).toBeLessThan(2000);
      assertStatusCode(response, 200);
    });

    test('should handle concurrent job submissions', async ({ request }) => {
      const requests = Array.from({ length: 5 }, () =>
        request.post(`${BASE_URL}/compose`, {
          data: TIKTOK_COMPOSE_REQUEST,
        })
      );

      const responses = await Promise.all(requests);

      // All should succeed
      responses.forEach(response => {
        assertStatusCode(response, 200);
      });

      // All should have unique job IDs
      const jobIds = await Promise.all(
        responses.map(async r => {
          const body = await r.json();
          return body.job_id;
        })
      );

      const uniqueIds = new Set(jobIds);
      expect(uniqueIds.size).toBe(5);
    });
  });

  test.describe('Health Check', () => {
    test('should return healthy status', async ({ request }) => {
      const response = await request.get(`${BASE_URL}/health`);

      assertStatusCode(response, 200);
      const body = await response.json();

      expect(body.status).toBe('healthy');
      expect(body.service).toBe('video-compositor');
      expect(body.modal_available).toBeDefined();
      expect(body.r2_available).toBeDefined();
    });
  });
});
