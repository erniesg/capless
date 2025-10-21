import { describe, it, expect, beforeEach, vi } from 'vitest';
import { ModalClient } from '../../src/compositor/modal-client';

describe('ModalClient', () => {
  let client: ModalClient;

  beforeEach(() => {
    client = new ModalClient({
      endpoint: 'https://api.modal.com/v1',
      apiKey: 'test-key',
      maxRetries: 3,
      timeout: 300000
    });
  });

  describe('triggerRender', () => {
    it('should trigger render job successfully', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          job_id: 'modal-123',
          status: 'queued',
          estimated_duration: 90
        })
      });

      const result = await client.triggerRender({
        script: 'Test script',
        audio_url: 'https://test.com/audio.mp3',
        video_url: 'https://youtube.com/watch?v=test',
        persona: 'gen_z',
        template: 'tiktok_parliamentary'
      });

      expect(result).toMatchObject({
        job_id: 'modal-123',
        status: 'queued',
        estimated_duration: 90
      });
    });

    it('should handle Modal API errors', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 400, // Use 400 to avoid retry logic
        text: async () => 'Bad request'
      });

      await expect(
        client.triggerRender({
          script: 'Test',
          audio_url: 'https://test.com/audio.mp3',
          video_url: 'https://test.com/video.mp4',
          persona: 'gen_z',
          template: 'tiktok_parliamentary'
        })
      ).rejects.toThrow('Modal API error: 400');
    });
  });

  describe('getJobStatus', () => {
    it('should get job status successfully', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          status: 'running',
          progress: 50
        })
      });

      const result = await client.getJobStatus('modal-123');

      expect(result).toMatchObject({
        status: 'running',
        progress: 50
      });
    });

    it('should map Modal status to our status', async () => {
      const testCases = [
        { modalStatus: 'pending', expectedStatus: 'queued' },
        { modalStatus: 'processing', expectedStatus: 'running' },
        { modalStatus: 'success', expectedStatus: 'completed' },
        { modalStatus: 'error', expectedStatus: 'failed' }
      ];

      for (const { modalStatus, expectedStatus } of testCases) {
        global.fetch = vi.fn().mockResolvedValue({
          ok: true,
          json: async () => ({ status: modalStatus })
        });

        const result = await client.getJobStatus('test-job');
        expect(result.status).toBe(expectedStatus);
      }
    });

    it('should throw on 404', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 404,
        text: async () => 'Not found'
      });

      await expect(client.getJobStatus('nonexistent')).rejects.toThrow('Job not found');
    });
  });

  describe('checkHealth', () => {
    it('should return true when healthy', async () => {
      global.fetch = vi.fn().mockResolvedValue({ ok: true });

      const result = await client.checkHealth();
      expect(result).toBe(true);
    });

    it('should return false when unhealthy', async () => {
      global.fetch = vi.fn().mockRejectedValue(new Error('Network error'));

      const result = await client.checkHealth();
      expect(result).toBe(false);
    });
  });
});
