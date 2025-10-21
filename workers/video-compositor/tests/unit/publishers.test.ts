import { describe, it, expect, beforeEach, vi } from 'vitest';
import { TikTokPublisher } from '../../src/publishers/tiktok';
import { InstagramPublisher } from '../../src/publishers/instagram';
import { YouTubePublisher } from '../../src/publishers/youtube';

describe('TikTokPublisher', () => {
  let publisher: TikTokPublisher;

  beforeEach(() => {
    publisher = new TikTokPublisher({ accessToken: 'test-token' });
  });

  it('should publish video successfully', async () => {
    global.fetch = vi.fn()
      .mockResolvedValueOnce({
        ok: true,
        blob: async () => new Blob(['video data'])
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          data: { share_id: '123456' }
        })
      });

    const result = await publisher.publish('https://test.com/video.mp4', {
      title: 'Test Video',
      description: 'Test description',
      hashtags: ['test', 'video']
    });

    expect(result).toMatchObject({
      platform: 'tiktok',
      success: true,
      url: expect.stringContaining('tiktok.com'),
      post_id: '123456'
    });
  });

  it('should handle publish errors gracefully', async () => {
    global.fetch = vi.fn().mockRejectedValue(new Error('Network error'));

    const result = await publisher.publish('https://test.com/video.mp4', {
      title: 'Test',
      description: 'Test',
      hashtags: []
    });

    expect(result).toMatchObject({
      platform: 'tiktok',
      success: false,
      error: expect.any(String)
    });
  });

  it('should format caption correctly', async () => {
    global.fetch = vi.fn()
      .mockResolvedValueOnce({
        ok: true,
        blob: async () => new Blob(['video data'])
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          data: { share_id: '123' }
        })
      });

    await publisher.publish('https://test.com/video.mp4', {
      title: 'My Title',
      description: 'My description',
      hashtags: ['Parliament', 'Singapore']
    });

    const lastCall = (global.fetch as any).mock.calls[1];
    const body = JSON.parse(lastCall[1].body);
    expect(body.caption).toContain('My Title');
    expect(body.caption).toContain('My description');
    expect(body.caption).toContain('#Parliament');
    expect(body.caption).toContain('#Singapore');
  });
});

describe('InstagramPublisher', () => {
  let publisher: InstagramPublisher;

  beforeEach(() => {
    publisher = new InstagramPublisher({ accessToken: 'test-token' });
  });

  it('should publish video successfully', async () => {
    global.fetch = vi.fn()
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          instagram_business_account: { id: 'account-123' }
        })
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ id: 'container-456' })
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ id: 'media-789' })
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ permalink: 'https://instagram.com/p/xyz' })
      });

    const result = await publisher.publish('https://test.com/video.mp4', {
      title: 'Test',
      description: 'Test description',
      hashtags: ['test']
    });

    expect(result).toMatchObject({
      platform: 'instagram',
      success: true,
      url: expect.stringContaining('instagram.com'),
      post_id: 'media-789'
    });
  });

  it('should handle missing Instagram Business Account', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({})
    });

    const result = await publisher.publish('https://test.com/video.mp4', {
      title: 'Test',
      description: 'Test',
      hashtags: []
    });

    expect(result.success).toBe(false);
    expect(result.error).toContain('No Instagram Business Account');
  });
});

describe('YouTubePublisher', () => {
  let publisher: YouTubePublisher;

  beforeEach(() => {
    publisher = new YouTubePublisher({ apiKey: 'test-key' });
  });

  it('should format description with hashtags', async () => {
    global.fetch = vi.fn()
      .mockResolvedValueOnce({
        ok: true,
        blob: async () => new Blob(['video data'])
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ id: 'video-123' })
      });

    await publisher.publish('https://test.com/video.mp4', {
      title: 'My Video',
      description: 'Description here',
      hashtags: ['Parliament', 'Singapore']
    });

    const lastCall = (global.fetch as any).mock.calls[1];
    const bodyText = new TextDecoder().decode(lastCall[1].body.slice(0, 500));
    expect(bodyText).toContain('Parliament');
    expect(bodyText).toContain('#Shorts');
  });

  it('should check health correctly', async () => {
    global.fetch = vi.fn().mockResolvedValue({ ok: true });

    const result = await publisher.checkHealth();
    expect(result).toBe(true);
  });
});
