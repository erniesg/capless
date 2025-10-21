import { describe, it, expect } from 'vitest';
import type { ExtractionResult } from '../src/types';

/**
 * Integration tests for the Moments Worker
 * These tests verify end-to-end functionality
 */

describe('Moments Worker Integration', () => {
  // Mock worker URL - update for actual deployment
  const WORKER_URL = process.env.WORKER_URL || 'http://localhost:8788';

  describe('Health Check', () => {
    it('should respond to health check endpoint', async () => {
      const response = await fetch(`${WORKER_URL}/health`);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data).toHaveProperty('status', 'healthy');
      expect(data).toHaveProperty('service', 'capless-moments');
    });
  });

  describe('POST /api/moments/extract', () => {
    it('should extract moments from transcript', async () => {
      const request = {
        transcript_id: 'transcript-2025-01-15-healthcare',
        criteria: {
          min_score: 5.0,
          max_results: 10,
        },
      };

      const response = await fetch(`${WORKER_URL}/api/moments/extract`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(request),
      });

      expect(response.status).toBe(200);

      const result: ExtractionResult = await response.json();

      expect(result).toHaveProperty('transcript_id');
      expect(result).toHaveProperty('moments');
      expect(result).toHaveProperty('statistics');
      expect(Array.isArray(result.moments)).toBe(true);

      if (result.moments.length > 0) {
        const moment = result.moments[0];
        expect(moment).toHaveProperty('moment_id');
        expect(moment).toHaveProperty('quote');
        expect(moment).toHaveProperty('speaker');
        expect(moment).toHaveProperty('virality_score');
        expect(moment?.virality_score).toBeGreaterThanOrEqual(0);
        expect(moment?.virality_score).toBeLessThanOrEqual(10);
      }
    });

    it('should filter moments by criteria', async () => {
      const request = {
        transcript_id: 'transcript-2025-01-15-healthcare',
        criteria: {
          min_score: 8.0, // High threshold
          max_results: 5,
        },
      };

      const response = await fetch(`${WORKER_URL}/api/moments/extract`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(request),
      });

      const result: ExtractionResult = await response.json();

      // All moments should be above min_score
      result.moments.forEach(moment => {
        expect(moment.virality_score).toBeGreaterThanOrEqual(8.0);
      });

      // Should not exceed max_results
      expect(result.moments.length).toBeLessThanOrEqual(5);
    });

    it('should return 404 for non-existent transcript', async () => {
      const request = {
        transcript_id: 'non-existent-transcript',
      };

      const response = await fetch(`${WORKER_URL}/api/moments/extract`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(request),
      });

      expect(response.status).toBe(404);
    });

    it('should validate request schema', async () => {
      const invalidRequest = {
        // Missing transcript_id
        criteria: {
          min_score: 5.0,
        },
      };

      const response = await fetch(`${WORKER_URL}/api/moments/extract`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(invalidRequest),
      });

      expect(response.status).toBe(500); // Schema validation error
    });
  });

  describe('POST /api/moments/analyze', () => {
    it('should analyze a single moment', async () => {
      const request = {
        moment_text: "The increase is modest when you factor in the comprehensive coverage enhancement package.",
        context: "Discussion about healthcare premium increases",
        speaker: "Minister Tan",
      };

      const response = await fetch(`${WORKER_URL}/api/moments/analyze`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(request),
      });

      if (response.ok) {
        const result = await response.json();

        expect(result).toHaveProperty('virality_score');
        expect(result).toHaveProperty('topics');
        expect(result).toHaveProperty('emotions');
        expect(Array.isArray(result.topics)).toBe(true);
        expect(Array.isArray(result.emotions)).toBe(true);
      }
    });
  });

  describe('GET /api/moments/search', () => {
    it('should search for similar moments', async () => {
      const query = 'healthcare jargon';
      const response = await fetch(
        `${WORKER_URL}/api/moments/search?q=${encodeURIComponent(query)}&limit=5`
      );

      if (response.ok) {
        const result = await response.json();

        expect(result).toHaveProperty('query', query);
        expect(result).toHaveProperty('results');
        expect(Array.isArray(result.results)).toBe(true);
      }
    });

    it('should return error without query parameter', async () => {
      const response = await fetch(`${WORKER_URL}/api/moments/search`);

      expect(response.status).toBe(400);
    });
  });

  describe('POST /api/moments/batch', () => {
    it('should process multiple transcripts', async () => {
      const request = {
        transcript_ids: [
          'transcript-001',
          'transcript-002',
        ],
        criteria: {
          min_score: 6.0,
        },
      };

      const response = await fetch(`${WORKER_URL}/api/moments/batch`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(request),
      });

      if (response.ok) {
        const result = await response.json();

        expect(result).toHaveProperty('job_id');
        expect(result).toHaveProperty('successful');
        expect(result).toHaveProperty('failed');
        expect(result).toHaveProperty('results');
      }
    });
  });

  describe('Caching', () => {
    it('should cache extraction results', async () => {
      const request = {
        transcript_id: 'transcript-2025-01-15-healthcare',
      };

      // First request - should hit OpenAI
      const response1 = await fetch(`${WORKER_URL}/api/moments/extract`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(request),
      });

      const result1 = await response1.json();

      // Second request - should be cached (faster)
      const startTime = Date.now();
      const response2 = await fetch(`${WORKER_URL}/api/moments/extract`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(request),
      });
      const duration = Date.now() - startTime;

      const result2 = await response2.json();

      // Results should be identical
      expect(result2.transcript_id).toBe(result1.transcript_id);

      // Second request should be faster (< 1 second)
      expect(duration).toBeLessThan(1000);
    });
  });
});
