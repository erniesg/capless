/**
 * Integration tests for Ingestion Worker (Worker 1/5)
 * Tests Hansard transcript fetching and processing
 */

import { test, expect } from '@playwright/test';
import { createMockServer } from './helpers/mock-server';
import { createWorkerManager, WORKER_CONFIGS } from './helpers/worker-manager';
import { assertResponse, assertStatusCode, assertValidURL, assertInRange } from './helpers/validation';
import { COMPLETE_HANSARD_FIXTURE, MINIMAL_HANSARD_FIXTURE } from './mocks/parliament';
import { COMPLETE_TRANSCRIPT, MINIMAL_TRANSCRIPT } from './fixtures/hansard-transcripts';

test.describe('Ingestion Worker Integration Tests', () => {
  const mockServer = createMockServer();
  const workerManager = createWorkerManager();
  const BASE_URL = `http://localhost:${WORKER_CONFIGS.ingestion.port}`;

  test.beforeAll(async ({ browser }) => {
    // Start the worker
    await workerManager.startWorker(WORKER_CONFIGS.ingestion);

    // Setup mock server on a page (we'll use it for external calls)
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

  test.describe('POST /ingest - Happy Path', () => {
    test('should ingest Hansard by sitting date', async ({ request }) => {
      const response = await request.post(`${BASE_URL}/ingest`, {
        data: {
          sittingDate: '02-07-2024',
        },
      });

      assertStatusCode(response, 200, 'ingest by sitting date');
      const body = await response.json();

      // Validate response structure
      expect(body.success).toBe(true);
      expect(body.transcript_id).toBe('2024-07-02-sitting-1');
      expect(body.sitting_date).toBe('2024-07-02');
      expect(body.speakers).toBeInstanceOf(Array);
      expect(body.topics).toBeInstanceOf(Array);
      expect(body.segments_count).toBeGreaterThan(0);

      // Validate metadata
      expect(body.metadata.total_words).toBeGreaterThan(0);
      expect(body.metadata.processing_time_ms).toBeGreaterThan(0);
      expect(body.metadata.cached).toBeDefined();

      // Check Parliament API was called
      const parliamentLogs = mockServer.getLogsForAPI(/parl\.gov\.sg/);
      expect(parliamentLogs.length).toBeGreaterThan(0);
    });

    test('should ingest with pre-fetched Hansard JSON', async ({ request }) => {
      const response = await request.post(`${BASE_URL}/ingest`, {
        data: {
          hansardJSON: COMPLETE_HANSARD_FIXTURE,
        },
      });

      assertStatusCode(response, 200, 'ingest with hansardJSON');
      const body = await response.json();

      expect(body.success).toBe(true);
      expect(body.transcript_id).toBeTruthy();
      expect(body.segments_count).toBeGreaterThan(0);

      // Should NOT call Parliament API (using provided JSON)
      const parliamentLogs = mockServer.getLogsForAPI(/parl\.gov\.sg/);
      expect(parliamentLogs.length).toBe(0);
    });

    test('should handle minimal transcript', async ({ request }) => {
      const response = await request.post(`${BASE_URL}/ingest`, {
        data: {
          hansardJSON: MINIMAL_HANSARD_FIXTURE,
        },
      });

      assertStatusCode(response, 200, 'minimal transcript');
      const body = await response.json();

      expect(body.success).toBe(true);
      expect(body.segments_count).toBe(1);
      expect(body.speakers).toHaveLength(1);
    });

    test('should skip storage when requested', async ({ request }) => {
      const response = await request.post(`${BASE_URL}/ingest`, {
        data: {
          sittingDate: '02-07-2024',
          skipStorage: true,
        },
      });

      assertStatusCode(response, 200, 'skip storage');
      const body = await response.json();

      expect(body.success).toBe(true);
      expect(body.metadata.storage_urls).toBeUndefined();
    });

    test('should provide storage URLs when storing', async ({ request }) => {
      const response = await request.post(`${BASE_URL}/ingest`, {
        data: {
          sittingDate: '02-07-2024',
          skipStorage: false,
        },
      });

      assertStatusCode(response, 200, 'with storage');
      const body = await response.json();

      expect(body.success).toBe(true);
      expect(body.metadata.storage_urls).toBeDefined();
      expect(body.metadata.storage_urls.raw).toBeTruthy();
      expect(body.metadata.storage_urls.processed).toBeTruthy();

      // Validate URLs are well-formed
      assertValidURL(body.metadata.storage_urls.raw);
      assertValidURL(body.metadata.storage_urls.processed);
    });
  });

  test.describe('POST /ingest - Data Quality', () => {
    test('should correctly parse speakers from HTML', async ({ request }) => {
      const response = await request.post(`${BASE_URL}/ingest`, {
        data: {
          hansardJSON: COMPLETE_HANSARD_FIXTURE,
        },
      });

      const body = await response.json();

      // Verify speaker extraction
      expect(body.speakers).toContain('Leader of Opposition');
      expect(body.speakers).toContain('Minister for Finance');
      expect(body.speakers.length).toBeGreaterThan(1);
    });

    test('should correctly parse section titles', async ({ request }) => {
      const response = await request.post(`${BASE_URL}/ingest`, {
        data: {
          hansardJSON: COMPLETE_HANSARD_FIXTURE,
        },
      });

      const body = await response.json();

      // Verify topic extraction
      expect(body.topics).toContain('Oral Answers to Questions');
      expect(body.topics.length).toBeGreaterThan(0);
    });

    test('should strip HTML tags from speech text', async ({ request }) => {
      const response = await request.post(`${BASE_URL}/ingest`, {
        data: {
          hansardJSON: COMPLETE_HANSARD_FIXTURE,
        },
      });

      const body = await response.json();

      // Fetch the processed transcript to verify
      const getResponse = await request.get(`${BASE_URL}/transcripts/${body.transcript_id}`);
      if (getResponse.ok) {
        const transcript = await getResponse.json();
        const firstSegment = transcript.segments[0];

        // Verify no HTML tags in text
        expect(firstSegment.text).not.toContain('<');
        expect(firstSegment.text).not.toContain('>');
        expect(firstSegment.text).not.toContain('&nbsp;');
      }
    });

    test('should calculate word counts correctly', async ({ request }) => {
      const response = await request.post(`${BASE_URL}/ingest`, {
        data: {
          hansardJSON: COMPLETE_HANSARD_FIXTURE,
        },
      });

      const body = await response.json();

      // Word count should be reasonable for a parliamentary session
      assertInRange(body.metadata.total_words, 10, 100000, 'total word count');
    });
  });

  test.describe('POST /ingest - Error Handling', () => {
    test('should handle missing parameters', async ({ request }) => {
      const response = await request.post(`${BASE_URL}/ingest`, {
        data: {},
      });

      expect(response.status).toBeGreaterThanOrEqual(400);
      const body = await response.json();
      expect(body.success).toBe(false);
      expect(body.error).toBeTruthy();
    });

    test('should handle invalid sitting date format', async ({ request }) => {
      const response = await request.post(`${BASE_URL}/ingest`, {
        data: {
          sittingDate: 'invalid-date',
        },
      });

      expect(response.status).toBeGreaterThanOrEqual(400);
      const body = await response.json();
      expect(body.success).toBe(false);
    });

    test('should handle malformed Hansard JSON', async ({ request }) => {
      const response = await request.post(`${BASE_URL}/ingest`, {
        data: {
          hansardJSON: {
            metadata: {}, // Missing required fields
          },
        },
      });

      expect(response.status).toBeGreaterThanOrEqual(400);
      const body = await response.json();
      expect(body.success).toBe(false);
    });
  });

  test.describe('GET /transcripts/:id - Retrieval', () => {
    test('should retrieve processed transcript by ID', async ({ request }) => {
      // First ingest a transcript
      const ingestResponse = await request.post(`${BASE_URL}/ingest`, {
        data: {
          hansardJSON: COMPLETE_HANSARD_FIXTURE,
          transcriptId: 'test-transcript-001',
        },
      });

      const ingestBody = await ingestResponse.json();
      const transcriptId = ingestBody.transcript_id;

      // Then retrieve it
      const getResponse = await request.get(`${BASE_URL}/transcripts/${transcriptId}`);

      assertStatusCode(getResponse, 200, 'get transcript');
      const transcript = await getResponse.json();

      expect(transcript.transcript_id).toBe(transcriptId);
      expect(transcript.segments).toBeInstanceOf(Array);
      expect(transcript.segments.length).toBeGreaterThan(0);
      expect(transcript.metadata).toBeDefined();
    });

    test('should return 404 for non-existent transcript', async ({ request }) => {
      const getResponse = await request.get(`${BASE_URL}/transcripts/non-existent-id`);

      assertStatusCode(getResponse, 404, 'non-existent transcript');
    });
  });

  test.describe('Caching Behavior', () => {
    test('should return cached result on repeated ingestion', async ({ request }) => {
      // First ingestion
      const firstResponse = await request.post(`${BASE_URL}/ingest`, {
        data: {
          sittingDate: '02-07-2024',
        },
      });

      const firstBody = await firstResponse.json();
      expect(firstBody.metadata.cached).toBe(false);

      // Second ingestion (should be cached)
      const secondResponse = await request.post(`${BASE_URL}/ingest`, {
        data: {
          sittingDate: '02-07-2024',
        },
      });

      const secondBody = await secondResponse.json();
      expect(secondBody.metadata.cached).toBe(true);
      expect(secondBody.transcript_id).toBe(firstBody.transcript_id);
    });

    test('should force refresh when requested', async ({ request }) => {
      // First ingestion
      await request.post(`${BASE_URL}/ingest`, {
        data: {
          sittingDate: '02-07-2024',
        },
      });

      // Force refresh
      const refreshResponse = await request.post(`${BASE_URL}/ingest`, {
        data: {
          sittingDate: '02-07-2024',
          forceRefresh: true,
        },
      });

      const refreshBody = await refreshResponse.json();
      expect(refreshBody.metadata.cached).toBe(false);
    });
  });

  test.describe('Performance', () => {
    test('should process transcript within reasonable time', async ({ request }) => {
      const startTime = Date.now();

      const response = await request.post(`${BASE_URL}/ingest`, {
        data: {
          hansardJSON: COMPLETE_HANSARD_FIXTURE,
        },
      });

      const endTime = Date.now();
      const totalTime = endTime - startTime;

      const body = await response.json();

      // Should complete within 10 seconds
      expect(totalTime).toBeLessThan(10000);

      // Processing time in response should be reasonable
      expect(body.metadata.processing_time_ms).toBeLessThan(5000);
    });

    test('should handle large transcripts efficiently', async ({ request }) => {
      // Create a large Hansard fixture
      const largeHansard = {
        ...COMPLETE_HANSARD_FIXTURE,
        takesSectionVOList: Array.from({ length: 50 }, (_, i) => ({
          ...COMPLETE_HANSARD_FIXTURE.takesSectionVOList[0],
          startPgNo: i + 1,
          title: `Section ${i + 1}`,
        })),
      };

      const response = await request.post(`${BASE_URL}/ingest`, {
        data: {
          hansardJSON: largeHansard,
        },
      });

      const body = await response.json();

      expect(body.success).toBe(true);
      expect(body.segments_count).toBeGreaterThan(50);
      // Should still process within reasonable time
      expect(body.metadata.processing_time_ms).toBeLessThan(10000);
    });
  });

  test.describe('Health Check', () => {
    test('should return healthy status', async ({ request }) => {
      const response = await request.get(`${BASE_URL}/health`);

      assertStatusCode(response, 200, 'health check');
      const body = await response.json();

      expect(body.status).toBe('healthy');
      expect(body.service).toBe('capless-ingest');
      expect(body.timestamp).toBeTruthy();
    });
  });
});
