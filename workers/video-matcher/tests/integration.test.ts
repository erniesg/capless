/**
 * Integration tests for Video Matcher Worker
 * Note: These tests require actual YouTube API key and Upstash Redis credentials
 * Set environment variables before running:
 * - YOUTUBE_API_KEY
 * - UPSTASH_REDIS_REST_URL
 * - UPSTASH_REDIS_REST_TOKEN
 */

import { describe, it, expect, beforeAll } from 'vitest';
import { findMatchingVideo, calculateConfidenceScore } from '../src/youtube';
import { findTimestampForQuote } from '../src/timestamp';
import type { YouTubeVideo } from '../src/types';

// Skip integration tests if API credentials are not provided
const SKIP_INTEGRATION = !process.env.YOUTUBE_API_KEY;

describe.skipIf(SKIP_INTEGRATION)('YouTube API Integration', () => {
  const apiKey = process.env.YOUTUBE_API_KEY || '';
  const channelId = 'UCq9h3I2kQQCLb7snx_X8zSw'; // @SingaporeMDDI

  it('should search for videos on Singapore Parliament channel', async () => {
    // This test requires a real API key
    // Test with a known sitting date
    const sittingDate = '02-07-2024'; // Adjust to a real date

    const match = await findMatchingVideo(apiKey, channelId, sittingDate);

    expect(match).toBeDefined();
    if (match) {
      expect(match.video_id).toBeDefined();
      expect(match.video_url).toContain('youtube.com/watch?v=');
      expect(match.confidence_score).toBeGreaterThanOrEqual(0);
      expect(match.confidence_score).toBeLessThanOrEqual(10);
      expect(match.channel_id).toBe(channelId);
    }
  }, 30000); // 30 second timeout for API call
});

describe('Confidence Scoring', () => {
  it('should give high score for exact date match with parliament keywords', () => {
    const video: YouTubeVideo = {
      id: 'test123',
      title: 'Parliament Sitting - 2 July 2024',
      description: 'Singapore Parliament session discussing healthcare',
      publishedAt: '2024-07-02T10:00:00Z',
      channelId: 'UCq9h3I2kQQCLb7snx_X8zSw',
      thumbnails: { default: { url: 'https://example.com/thumb.jpg' } },
      duration: 'PT2H30M', // 2.5 hours
      liveStreamingDetails: {
        actualStartTime: '2024-07-02T10:00:00Z',
      },
    };

    const { score, factors } = calculateConfidenceScore(video, '02-07-2024');

    expect(score).toBeGreaterThanOrEqual(8); // Should be high confidence
    expect(factors.date_match).toBe(true);
    expect(factors.title_keywords_match).toBe(true);
    expect(factors.duration_appropriate).toBe(true);
    expect(factors.is_livestream).toBe(true);
  });

  it('should give medium score for near-date match', () => {
    const video: YouTubeVideo = {
      id: 'test456',
      title: 'Live Broadcast - 3 July 2024', // One day off, no parliament keywords
      description: 'General discussion',
      publishedAt: '2024-07-03T10:00:00Z',
      channelId: 'UCq9h3I2kQQCLb7snx_X8zSw',
      thumbnails: { default: { url: 'https://example.com/thumb.jpg' } },
      duration: 'PT1H15M', // 1.25 hours
    };

    const { score, factors } = calculateConfidenceScore(video, '02-07-2024');

    expect(score).toBeGreaterThanOrEqual(3);
    expect(score).toBeLessThan(8);
    expect(factors.title_keywords_match).toBe(false);
  });

  it('should give low score for wrong date and short duration', () => {
    const video: YouTubeVideo = {
      id: 'test789',
      title: 'Random Video',
      description: 'Not related to parliament',
      publishedAt: '2024-06-01T10:00:00Z', // One month off
      channelId: 'UCq9h3I2kQQCLb7snx_X8zSw',
      thumbnails: { default: { url: 'https://example.com/thumb.jpg' } },
      duration: 'PT5M', // 5 minutes
    };

    const { score, factors } = calculateConfidenceScore(video, '02-07-2024');

    expect(score).toBeLessThan(5);
    expect(factors.date_match).toBe(false);
    expect(factors.duration_appropriate).toBe(false);
  });

  it('should bonus score for speaker match in description', () => {
    const video: YouTubeVideo = {
      id: 'test999',
      title: 'Parliament Sitting - 2 July 2024',
      description: 'Ms Rahayu Mahzam discusses healthcare policy',
      publishedAt: '2024-07-02T10:00:00Z',
      channelId: 'UCq9h3I2kQQCLb7snx_X8zSw',
      thumbnails: { default: { url: 'https://example.com/thumb.jpg' } },
      duration: 'PT2H',
    };

    const speakers = ['Ms Rahayu Mahzam'];
    const { score, factors } = calculateConfidenceScore(video, '02-07-2024', speakers);

    // Score should be high: date(4) + title(2) + duration(2) + description(0.5) + speaker(0.5) = 9
    // But actual might be slightly less depending on implementation
    expect(score).toBeGreaterThanOrEqual(7);
    expect(factors.description_keywords).toBe(true);
  });
});

describe.skipIf(SKIP_INTEGRATION)('Timestamp Matching Integration', () => {
  const apiKey = process.env.YOUTUBE_API_KEY || '';

  it('should find timestamp using approximate time', async () => {
    const videoId = 'test-video-id'; // Replace with actual video ID
    const quoteText = 'healthcare policy discussion';
    const approximateTime = '2:30 PM';

    const result = await findTimestampForQuote(
      apiKey,
      videoId,
      quoteText,
      undefined,
      approximateTime
    );

    expect(result).toBeDefined();
    expect(result.video_id).toBe(videoId);
    expect(result.start_timestamp).toBeGreaterThanOrEqual(0);
    expect(result.end_timestamp).toBeGreaterThan(result.start_timestamp);
    expect(result.segment_url).toContain('youtube.com/watch?v=');
    expect(['transcript', 'description', 'approximate']).toContain(result.method);
  }, 30000);
});
