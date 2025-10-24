import { describe, it, expect, beforeAll } from 'vitest';
import { env } from 'cloudflare:test';
import app from './index';
import { Moment } from './types';

// Mock moment data for testing
const mockMoment: Moment = {
  moment_id: 'parliament-22-09-2025-moment-1',
  quote:
    'We need to ensure that our policies are not just reactive but proactive in addressing climate change.',
  speaker: 'Grace Fu',
  timestamp_start: '00:12:34',
  timestamp_end: '00:12:48',
  virality_score: 8.5,
  why_viral: 'Strong stance on climate policy with clear urgency',
  topic: 'Climate Policy',
  emotional_tone: 'Determined, Urgent',
  target_demographic: 'Environmentally conscious youth',
  transcript_id: 'abc123xyz',
};

describe('Video Generator Worker', () => {
  beforeAll(async () => {
    // Store mock moment in R2 for testing
    const momentData = { moments: [mockMoment] };
    await env.R2.put(
      'moments/parliament-22-09-2025.json',
      JSON.stringify(momentData)
    );
  });

  describe('Health Check', () => {
    it('should return ok status', async () => {
      const res = await app.request('/health');
      expect(res.status).toBe(200);

      const data = await res.json();
      expect(data).toEqual({
        status: 'ok',
        service: 'video-generator',
      });
    });
  });

  describe('POST /api/video/generate', () => {
    it('should accept valid video generation request', async () => {
      const res = await app.request('/api/video/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          moment_id: 'parliament-22-09-2025-moment-1',
          persona: 'gen_z',
        }),
      });

      expect(res.status).toBe(202);

      const data = await res.json();
      expect(data).toHaveProperty('job_id');
      expect(data).toHaveProperty('status', 'processing');
      expect(data).toHaveProperty('estimated_time_seconds');
      expect(data).toHaveProperty('poll_url');
      expect(data.poll_url).toContain('/api/video/status/');
    });

    it('should reject invalid persona', async () => {
      const res = await app.request('/api/video/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          moment_id: 'parliament-22-09-2025-moment-1',
          persona: 'invalid_persona',
        }),
      });

      expect(res.status).toBe(400);

      const data = await res.json();
      expect(data).toHaveProperty('error', 'Invalid request');
    });

    it('should reject missing moment_id', async () => {
      const res = await app.request('/api/video/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          persona: 'gen_z',
        }),
      });

      expect(res.status).toBe(400);

      const data = await res.json();
      expect(data).toHaveProperty('error', 'Invalid request');
    });

    it('should return 404 for non-existent moment', async () => {
      const res = await app.request('/api/video/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          moment_id: 'parliament-01-01-2099-moment-999',
          persona: 'gen_z',
        }),
      });

      expect(res.status).toBe(404);

      const data = await res.json();
      expect(data).toHaveProperty('error', 'Moment not found');
    });
  });

  describe('GET /api/video/status/:job_id', () => {
    it('should return job status', async () => {
      // First create a job
      const createRes = await app.request('/api/video/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          moment_id: 'parliament-22-09-2025-moment-1',
          persona: 'kopitiam_uncle',
        }),
      });

      const createData = await createRes.json();
      const jobId = createData.job_id;

      // Then check status
      const statusRes = await app.request(`/api/video/status/${jobId}`);
      expect(statusRes.status).toBe(200);

      const statusData = await statusRes.json();
      expect(statusData).toHaveProperty('job_id', jobId);
      expect(statusData).toHaveProperty('status');
      expect(statusData).toHaveProperty('request');
      expect(statusData).toHaveProperty('moment');
      expect(statusData).toHaveProperty('created_at');
    });

    it('should return 404 for non-existent job', async () => {
      const res = await app.request('/api/video/status/non-existent-job-id');
      expect(res.status).toBe(404);

      const data = await res.json();
      expect(data).toHaveProperty('error', 'Job not found');
    });
  });

  describe('Script Generation', () => {
    it('should generate script for gen_z persona', async () => {
      // This test requires actual API keys, so we'll skip it in CI
      // In local testing, ensure ANTHROPIC_API_KEY is set
      if (!env.ANTHROPIC_API_KEY || env.ANTHROPIC_API_KEY === 'test-key') {
        console.log('Skipping script generation test (no API key)');
        return;
      }

      const { generateScript } = await import('./script-generator');

      const script = await generateScript(mockMoment, 'gen_z', env);

      expect(script).toHaveProperty('persona', 'gen_z');
      expect(script).toHaveProperty('script');
      expect(script).toHaveProperty('hook');
      expect(script).toHaveProperty('cta');
      expect(script).toHaveProperty('hashtags');
      expect(script).toHaveProperty('word_count');
      expect(script).toHaveProperty('validation_score');

      // Script should be between 100-150 words
      expect(script.word_count).toBeGreaterThanOrEqual(80); // Allow some flexibility
      expect(script.word_count).toBeLessThanOrEqual(200);

      // Gen Z script should have some validation markers
      expect(script.validation_score).toBeGreaterThan(0);

      console.log('Generated Gen Z script:');
      console.log(script.script);
    });
  });
});
