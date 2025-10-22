/**
 * Integration Test Specification: Video Compositor Worker
 *
 * Purpose: Define exact behavior for TDD development
 * Status: Specification (worker not built yet)
 *
 * Test Coverage:
 * - Video composition via Modal
 * - Job status tracking with Durable Objects
 * - Multi-platform publishing (TikTok, Instagram, YouTube)
 * - R2 storage management
 * - Storage cleanup
 * - Error handling & retry logic
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';

const WORKER_URL = 'http://localhost:8787'; // Dev server

const TEST_ASSETS = {
  script: 'Okay so the Minister just explained why your insurance is expensive and it\'s giving quantum physics. The math ain\'t mathing!',
  audio_url: 'https://test.r2.dev/audio/test_gen_z.mp3',
  video_url: 'https://www.youtube.com/watch?v=test',
  persona: 'gen_z'
};

describe('Video Compositor Worker - Composition', () => {
  it('should trigger video composition on Modal', async () => {
    const response = await fetch(`${WORKER_URL}/api/video/compose`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        script: TEST_ASSETS.script,
        audio_url: TEST_ASSETS.audio_url,
        video_url: TEST_ASSETS.video_url,
        persona: TEST_ASSETS.persona,
        template: 'tiktok_parliamentary'
      })
    });

    expect(response.status).toBe(200);
    const data = await response.json();

    // Should return job metadata
    expect(data).toMatchObject({
      job_id: expect.any(String),
      status: 'rendering',
      estimated_completion: expect.any(Number),
      modal_job_id: expect.any(String)
    });

    // Estimated completion should be in future (30-180 seconds)
    const now = Date.now();
    const estimatedTime = data.estimated_completion;
    expect(estimatedTime).toBeGreaterThan(now);
    expect(estimatedTime).toBeLessThan(now + 180000); // Within 3 minutes
  });

  it('should support different templates', async () => {
    const templates = ['tiktok_parliamentary', 'instagram_reels', 'youtube_shorts'];

    for (const template of templates) {
      const response = await fetch(`${WORKER_URL}/api/video/compose`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...TEST_ASSETS,
          template
        })
      });

      expect(response.status).toBe(200);
      const data = await response.json();
      expect(data.job_id).toBeTruthy();
    }
  });

  it('should support custom effects', async () => {
    const response = await fetch(`${WORKER_URL}/api/video/compose`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ...TEST_ASSETS,
        template: 'tiktok_parliamentary',
        effects: {
          captions: {
            enabled: true,
            style: 'word_by_word',
            font_size: 48
          },
          transitions: {
            enabled: true,
            type: 'fade'
          },
          overlays: {
            persona_emoji: true,
            progress_bar: true
          }
        }
      })
    });

    expect(response.status).toBe(200);
    const data = await response.json();
    expect(data.job_id).toBeTruthy();
  });

  it('should validate required fields', async () => {
    const response = await fetch(`${WORKER_URL}/api/video/compose`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        // Missing script
        audio_url: TEST_ASSETS.audio_url,
        video_url: TEST_ASSETS.video_url,
        persona: TEST_ASSETS.persona
      })
    });

    expect(response.status).toBe(400);
    const data = await response.json();
    expect(data.error).toContain('script');
  });

  it('should handle Modal API errors gracefully', async () => {
    const response = await fetch(`${WORKER_URL}/api/video/compose`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        script: TEST_ASSETS.script,
        audio_url: 'https://invalid.url/audio.mp3', // Invalid URL
        video_url: TEST_ASSETS.video_url,
        persona: TEST_ASSETS.persona
      })
    });

    expect(response.status).toBe(500);
    const data = await response.json();
    expect(data.error).toBeTruthy();
    expect(data.details).toContain('audio_url');
  });
});

describe('Video Compositor Worker - Status Tracking', () => {
  let testJobId: string;

  beforeAll(async () => {
    // Create a test job
    const response = await fetch(`${WORKER_URL}/api/video/compose`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ...TEST_ASSETS,
        template: 'tiktok_parliamentary'
      })
    });

    const data = await response.json();
    testJobId = data.job_id;
  });

  it('should track render job status', async () => {
    const response = await fetch(`${WORKER_URL}/api/video/status/${testJobId}`);

    expect(response.status).toBe(200);
    const data = await response.json();

    expect(data).toMatchObject({
      job_id: testJobId,
      status: expect.stringMatching(/^(rendering|completed|failed)$/),
      progress: expect.any(Number),
      created_at: expect.any(Number),
      updated_at: expect.any(Number)
    });

    // Progress should be 0-100
    expect(data.progress).toBeGreaterThanOrEqual(0);
    expect(data.progress).toBeLessThanOrEqual(100);
  });

  it('should return 404 for nonexistent job', async () => {
    const response = await fetch(`${WORKER_URL}/api/video/status/nonexistent_job_123`);

    expect(response.status).toBe(404);
    const data = await response.json();
    expect(data.error).toContain('Job not found');
  });

  it('should update progress over time', async () => {
    const firstCheck = await fetch(`${WORKER_URL}/api/video/status/${testJobId}`);
    const firstData = await firstCheck.json();
    const firstProgress = firstData.progress;

    // Wait 5 seconds
    await new Promise(resolve => setTimeout(resolve, 5000));

    const secondCheck = await fetch(`${WORKER_URL}/api/video/status/${testJobId}`);
    const secondData = await secondCheck.json();
    const secondProgress = secondData.progress;

    // Progress should increase (or be completed)
    expect(secondProgress).toBeGreaterThanOrEqual(firstProgress);
  });

  it('should return video URL when completed', async () => {
    // Poll until completed (max 3 minutes)
    let data: any;
    let attempts = 0;
    const maxAttempts = 18; // 18 * 10s = 3 minutes

    do {
      await new Promise(resolve => setTimeout(resolve, 10000)); // Wait 10s
      const response = await fetch(`${WORKER_URL}/api/video/status/${testJobId}`);
      data = await response.json();
      attempts++;
    } while (data.status === 'rendering' && attempts < maxAttempts);

    if (data.status === 'completed') {
      expect(data.video_url).toMatch(/^https:\/\/.+\.mp4$/);
      expect(data.progress).toBe(100);
    } else if (data.status === 'failed') {
      expect(data.error).toBeTruthy();
    }
  });

  it('should provide preview URL during rendering', async () => {
    const response = await fetch(`${WORKER_URL}/api/video/status/${testJobId}`);
    const data = await response.json();

    if (data.status === 'rendering' && data.progress > 50) {
      // Preview should be available after 50% progress
      expect(data.preview_url).toBeTruthy();
      expect(data.preview_url).toMatch(/^https:\/\/.+\.(mp4|gif)$/);
    }
  });
});

describe('Video Compositor Worker - Publishing', () => {
  const TEST_VIDEO_URL = 'https://test.r2.dev/videos/test_video.mp4';

  it('should publish to TikTok', async () => {
    const response = await fetch(`${WORKER_URL}/api/video/publish`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        video_url: TEST_VIDEO_URL,
        platforms: ['tiktok'],
        metadata: {
          title: 'Parliament Explained: Healthcare',
          description: 'Minister explains insurance "knot"',
          hashtags: ['Parliament', 'Singapore', 'Healthcare', 'Capless']
        }
      })
    });

    expect(response.status).toBe(200);
    const data = await response.json();

    expect(data.published).toBeGreaterThanOrEqual(0);
    expect(data.results).toHaveLength(1);

    const tiktokResult = data.results[0];
    expect(tiktokResult).toMatchObject({
      platform: 'tiktok',
      success: expect.any(Boolean)
    });

    if (tiktokResult.success) {
      expect(tiktokResult.url).toMatch(/^https:\/\/(www\.)?tiktok\.com\//);
      expect(tiktokResult.post_id).toBeTruthy();
    } else {
      expect(tiktokResult.error).toBeTruthy();
    }
  });

  it('should publish to Instagram', async () => {
    const response = await fetch(`${WORKER_URL}/api/video/publish`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        video_url: TEST_VIDEO_URL,
        platforms: ['instagram'],
        metadata: {
          title: 'Parliament Explained',
          description: 'Healthcare insurance explained #Singapore #Parliament',
          hashtags: []
        }
      })
    });

    expect(response.status).toBe(200);
    const data = await response.json();

    const instagramResult = data.results[0];
    expect(instagramResult).toMatchObject({
      platform: 'instagram',
      success: expect.any(Boolean)
    });

    if (instagramResult.success) {
      expect(instagramResult.url).toMatch(/^https:\/\/(www\.)?instagram\.com\//);
    }
  });

  it('should publish to YouTube', async () => {
    const response = await fetch(`${WORKER_URL}/api/video/publish`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        video_url: TEST_VIDEO_URL,
        platforms: ['youtube'],
        metadata: {
          title: 'Singapore Parliament: Healthcare Insurance Explained',
          description: 'Minister Rahayu Mahzam explains the "knot" in insurance market...',
          hashtags: ['Singapore', 'Parliament', 'Healthcare']
        }
      })
    });

    expect(response.status).toBe(200);
    const data = await response.json();

    const youtubeResult = data.results[0];
    expect(youtubeResult).toMatchObject({
      platform: 'youtube',
      success: expect.any(Boolean)
    });

    if (youtubeResult.success) {
      expect(youtubeResult.url).toMatch(/^https:\/\/(www\.)?youtube\.com\/shorts\//);
    }
  });

  it('should publish to multiple platforms in parallel', async () => {
    const startTime = Date.now();

    const response = await fetch(`${WORKER_URL}/api/video/publish`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        video_url: TEST_VIDEO_URL,
        platforms: ['tiktok', 'instagram', 'youtube'],
        metadata: {
          title: 'Parliament Explained',
          description: 'Test multi-platform publish',
          hashtags: ['test']
        }
      })
    });

    const endTime = Date.now();
    const duration = (endTime - startTime) / 1000;

    expect(response.status).toBe(200);
    const data = await response.json();

    // Should publish to all 3 platforms
    expect(data.results).toHaveLength(3);

    // Parallel publishing should be faster than sequential
    // (3 platforms sequentially would take ~45s, parallel should be ~15s)
    expect(duration).toBeLessThan(30);

    // Count successful publishes
    const successCount = data.results.filter((r: any) => r.success).length;
    expect(data.published).toBe(successCount);
  });

  it('should handle partial publish failures gracefully', async () => {
    const response = await fetch(`${WORKER_URL}/api/video/publish`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        video_url: 'https://invalid.url/video.mp4', // Invalid URL
        platforms: ['tiktok', 'instagram'],
        metadata: {
          title: 'Test',
          description: 'Test',
          hashtags: []
        }
      })
    });

    expect(response.status).toBe(200); // Partial success is OK
    const data = await response.json();

    expect(data.failed).toBeGreaterThan(0);
    expect(data.results).toHaveLength(2);

    data.results.forEach((result: any) => {
      expect(result.success).toBe(false);
      expect(result.error).toBeTruthy();
    });
  });

  it('should support scheduled publishing', async () => {
    const scheduledTime = Date.now() + 3600000; // 1 hour from now

    const response = await fetch(`${WORKER_URL}/api/video/publish`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        video_url: TEST_VIDEO_URL,
        platforms: ['tiktok'],
        schedule: scheduledTime,
        metadata: {
          title: 'Scheduled Post',
          description: 'Test scheduled publishing',
          hashtags: []
        }
      })
    });

    expect(response.status).toBe(200);
    const data = await response.json();

    expect(data).toMatchObject({
      scheduled: true,
      publish_at: scheduledTime,
      job_id: expect.any(String)
    });
  });

  it('should validate metadata', async () => {
    const response = await fetch(`${WORKER_URL}/api/video/publish`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        video_url: TEST_VIDEO_URL,
        platforms: ['tiktok'],
        // Missing metadata
      })
    });

    expect(response.status).toBe(400);
    const data = await response.json();
    expect(data.error).toContain('metadata');
  });
});

describe('Video Compositor Worker - Storage Management', () => {
  it('should store rendered video in R2', async () => {
    // First compose a video
    const composeResponse = await fetch(`${WORKER_URL}/api/video/compose`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ...TEST_ASSETS,
        template: 'tiktok_parliamentary'
      })
    });

    const { job_id } = await composeResponse.json();

    // Wait for completion
    let statusData: any;
    do {
      await new Promise(resolve => setTimeout(resolve, 10000));
      const statusResponse = await fetch(`${WORKER_URL}/api/video/status/${job_id}`);
      statusData = await statusResponse.json();
    } while (statusData.status === 'rendering');

    if (statusData.status === 'completed') {
      // Video should be in R2
      expect(statusData.video_url).toMatch(/\.r2\.dev\/videos\//);

      // Should be accessible
      const videoResponse = await fetch(statusData.video_url);
      expect(videoResponse.ok).toBe(true);
      expect(videoResponse.headers.get('content-type')).toBe('video/mp4');
    }
  });

  it('should cleanup old renders', async () => {
    const oldTimestamp = Date.now() - (7 * 24 * 60 * 60 * 1000); // 7 days ago

    const response = await fetch(`${WORKER_URL}/api/video/cleanup`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        older_than: oldTimestamp,
        pattern: 'renders/*',
        dry_run: false
      })
    });

    expect(response.status).toBe(200);
    const data = await response.json();

    expect(data).toMatchObject({
      deleted_count: expect.any(Number),
      freed_space_mb: expect.any(Number),
      deleted_files: expect.any(Array)
    });

    expect(data.deleted_count).toBeGreaterThanOrEqual(0);
  });

  it('should support dry run for cleanup', async () => {
    const response = await fetch(`${WORKER_URL}/api/video/cleanup`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        older_than: Date.now(),
        pattern: 'renders/*',
        dry_run: true
      })
    });

    expect(response.status).toBe(200);
    const data = await response.json();

    // Dry run should not delete anything
    expect(data.deleted_count).toBe(0);

    // But should report what would be deleted
    expect(data.would_delete_count).toBeGreaterThanOrEqual(0);
  });

  it('should handle R2 storage errors', async () => {
    const response = await fetch(`${WORKER_URL}/api/video/cleanup`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        older_than: Date.now(),
        pattern: 'invalid_pattern/**', // Invalid pattern
        dry_run: false
      })
    });

    expect(response.status).toBe(500);
    const data = await response.json();
    expect(data.error).toBeTruthy();
  });
});

describe('Video Compositor Worker - Error Handling', () => {
  it('should retry failed renders', async () => {
    const response = await fetch(`${WORKER_URL}/api/video/compose`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        script: TEST_ASSETS.script,
        audio_url: TEST_ASSETS.audio_url,
        video_url: 'https://youtube.com/watch?v=nonexistent',
        persona: TEST_ASSETS.persona
      })
    });

    const { job_id } = await response.json();

    // Wait and check status
    await new Promise(resolve => setTimeout(resolve, 20000));
    const statusResponse = await fetch(`${WORKER_URL}/api/video/status/${job_id}`);
    const statusData = await statusResponse.json();

    // Should eventually fail or succeed after retries
    if (statusData.status === 'failed') {
      expect(statusData.error).toBeTruthy();
      expect(statusData.retry_count).toBeGreaterThan(0);
    }
  });

  it('should provide detailed error messages', async () => {
    const response = await fetch(`${WORKER_URL}/api/video/compose`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        script: '', // Empty script
        audio_url: TEST_ASSETS.audio_url,
        video_url: TEST_ASSETS.video_url,
        persona: TEST_ASSETS.persona
      })
    });

    expect(response.status).toBe(400);
    const data = await response.json();

    expect(data).toMatchObject({
      error: expect.any(String),
      details: expect.objectContaining({
        field: 'script',
        issue: expect.any(String)
      })
    });
  });
});

describe('Video Compositor Worker - Performance', () => {
  it('should handle concurrent render requests', async () => {
    // Submit 5 concurrent render jobs
    const promises = Array.from({ length: 5 }, (_, i) =>
      fetch(`${WORKER_URL}/api/video/compose`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...TEST_ASSETS,
          template: 'tiktok_parliamentary',
          metadata: { test_id: i }
        })
      })
    );

    const responses = await Promise.all(promises);
    const data = await Promise.all(responses.map(r => r.json()));

    // All should succeed
    responses.forEach(response => {
      expect(response.status).toBe(200);
    });

    // All should have unique job IDs
    const jobIds = data.map(d => d.job_id);
    const uniqueJobIds = new Set(jobIds);
    expect(uniqueJobIds.size).toBe(5);
  });

  it('should queue renders when at capacity', async () => {
    // Submit 20 render jobs (more than typical concurrent capacity)
    const promises = Array.from({ length: 20 }, () =>
      fetch(`${WORKER_URL}/api/video/compose`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...TEST_ASSETS,
          template: 'tiktok_parliamentary'
        })
      })
    );

    const responses = await Promise.all(promises);

    // All should be accepted (queued)
    responses.forEach(response => {
      expect(response.status).toBe(200);
    });

    const data = await Promise.all(responses.map(r => r.json()));

    // Some should be queued
    const queuedJobs = data.filter(d => d.status === 'queued');
    expect(queuedJobs.length).toBeGreaterThan(0);
  });
});

describe('Video Compositor Worker - Webhook Integration', () => {
  it('should support webhook callbacks on completion', async () => {
    const webhookUrl = 'https://test.webhook.site/completion';

    const response = await fetch(`${WORKER_URL}/api/video/compose`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ...TEST_ASSETS,
        template: 'tiktok_parliamentary',
        webhook_url: webhookUrl,
        webhook_events: ['completed', 'failed']
      })
    });

    const { job_id } = await response.json();

    // When job completes, webhook should be called
    // (This would need to be verified externally via webhook.site)
  });
});

describe('Video Compositor Worker - Health Check', () => {
  it('should return healthy status', async () => {
    const response = await fetch(`${WORKER_URL}/health`);

    expect(response.status).toBe(200);
    const data = await response.json();

    expect(data).toMatchObject({
      status: 'healthy',
      service: 'capless-video-compositor',
      timestamp: expect.any(String)
    });
  });

  it('should check external service availability', async () => {
    const response = await fetch(`${WORKER_URL}/health`);
    const data = await response.json();

    // Should report status of external services
    expect(data).toMatchObject({
      modal_available: expect.any(Boolean),
      r2_available: expect.any(Boolean),
      tiktok_api_available: expect.any(Boolean),
      instagram_api_available: expect.any(Boolean),
      youtube_api_available: expect.any(Boolean)
    });
  });

  it('should report degraded status when services are down', async () => {
    // This would require mocking Modal API failure
    // Skipping for now - manual test required
  });
});
