/**
 * Test fixtures for YouTube video metadata
 * Used for video matcher integration tests
 */

import type { VideoMatchResponse, TimestampMatchResponse } from '../../../workers/video-matcher/src/types';

/**
 * Sample video match responses
 */
export const PARLIAMENT_SESSION_VIDEO: VideoMatchResponse = {
  video_id: 'parl-2024-07-02-abc',
  video_url: 'https://www.youtube.com/watch?v=parl-2024-07-02-abc',
  title: 'Parliament Sitting - 2 July 2024',
  duration: 9015, // 2h 30m 15s in seconds
  publish_date: '2024-07-02T04:00:00Z',
  confidence_score: 9.5,
  match_criteria: [
    'date_exact_match',
    'title_contains_parliament',
    'duration_appropriate_for_session',
    'channel_official',
  ],
  channel_id: 'UC-parliament-singapore',
  has_transcript: true,
  metadata: {
    description: 'Full coverage of Parliament sitting on 2 July 2024. Watch as MPs debate budget proposals and climate action.',
    thumbnail_url: 'https://i.ytimg.com/vi/parl-2024-07-02-abc/hqdefault.jpg',
    view_count: 15234,
  },
};

export const PARLIAMENT_LIVESTREAM_VIDEO: VideoMatchResponse = {
  video_id: 'parl-2024-07-02-live',
  video_url: 'https://www.youtube.com/watch?v=parl-2024-07-02-live',
  title: 'LIVE: Parliament Sitting - 2 July 2024',
  duration: 0, // Live stream, duration not finalized
  publish_date: '2024-07-02T04:00:00Z',
  confidence_score: 10.0,
  match_criteria: [
    'date_exact_match',
    'title_contains_parliament',
    'is_livestream',
    'channel_official',
    'livestream_timing_matches',
  ],
  channel_id: 'UC-parliament-singapore',
  has_transcript: false, // Livestreams may not have transcripts yet
  metadata: {
    description: 'Live coverage of Parliament sitting on 2 July 2024.',
    thumbnail_url: 'https://i.ytimg.com/vi/parl-2024-07-02-live/hqdefault.jpg',
    view_count: 3421,
  },
};

export const HIGHLIGHT_CLIP_VIDEO: VideoMatchResponse = {
  video_id: 'clip-moment-123',
  video_url: 'https://www.youtube.com/watch?v=clip-moment-123',
  title: 'Minister vs Opposition: Budget Debate Highlights',
  duration: 330, // 5m 30s
  publish_date: '2024-07-02T10:30:00Z',
  confidence_score: 6.5,
  match_criteria: [
    'date_match',
    'title_contains_keywords',
  ],
  channel_id: 'UC-news-channel',
  has_transcript: true,
  metadata: {
    description: 'Highlights from today\'s heated budget debate in Parliament.',
    thumbnail_url: 'https://i.ytimg.com/vi/clip-moment-123/hqdefault.jpg',
    view_count: 45678,
  },
};

/**
 * Sample timestamp match responses
 */
export const CAKE_QUOTE_TIMESTAMP: TimestampMatchResponse = {
  video_id: 'parl-2024-07-02-abc',
  start_timestamp: 135, // 2m 15s
  end_timestamp: 147, // 2m 27s
  segment_url: 'https://www.youtube.com/watch?v=parl-2024-07-02-abc&t=135',
  confidence: 9.2,
  method: 'transcript',
  matched_text: 'Mr Speaker, I think the Minister is trying to have his cake and eat it too.',
};

export const CLIMATE_QUOTE_TIMESTAMP: TimestampMatchResponse = {
  video_id: 'parl-2024-07-02-abc',
  start_timestamp: 3600, // 1h mark
  end_timestamp: 3612,
  segment_url: 'https://www.youtube.com/watch?v=parl-2024-07-02-abc&t=3600',
  confidence: 8.8,
  method: 'transcript',
  matched_text: 'We cannot continue to kick the can down the road on climate action.',
};

export const APPROXIMATE_TIMESTAMP: TimestampMatchResponse = {
  video_id: 'parl-2024-07-02-abc',
  start_timestamp: 7800, // ~2h 10m
  end_timestamp: 7820,
  segment_url: 'https://www.youtube.com/watch?v=parl-2024-07-02-abc&t=7800',
  confidence: 5.5,
  method: 'approximate',
};

/**
 * Low confidence match (no exact match found)
 */
export const LOW_CONFIDENCE_VIDEO: VideoMatchResponse = {
  video_id: 'related-video-xyz',
  video_url: 'https://www.youtube.com/watch?v=related-video-xyz',
  title: 'Parliament News Summary - July 2024',
  duration: 180, // 3 minutes
  publish_date: '2024-07-03T00:00:00Z', // Day after
  confidence_score: 3.2,
  match_criteria: [
    'approximate_date',
    'related_content',
  ],
  channel_id: 'UC-news-channel',
  has_transcript: false,
  metadata: {
    description: 'Summary of parliamentary activities in July.',
    thumbnail_url: 'https://i.ytimg.com/vi/related-video-xyz/hqdefault.jpg',
    view_count: 1234,
  },
};

/**
 * Sample video IDs for testing
 */
export const VIDEO_IDS = {
  parliament_session: 'parl-2024-07-02-abc',
  parliament_livestream: 'parl-2024-07-02-live',
  highlight_clip: 'clip-moment-123',
  low_confidence: 'related-video-xyz',
};

/**
 * Sample channel IDs
 */
export const CHANNEL_IDS = {
  official_parliament: 'UC-parliament-singapore',
  news_channel: 'UC-news-channel',
  unofficial: 'UC-political-commentary',
};

/**
 * Sample search parameters
 */
export const SEARCH_PARAMS = {
  by_date: {
    transcript_id: '2024-07-02-sitting-1',
    sitting_date: '02-07-2024',
    speakers: ['Leader of Opposition', 'Minister for Finance'],
  },
  by_date_no_speakers: {
    transcript_id: '2024-07-02-sitting-1',
    sitting_date: '02-07-2024',
  },
  custom_channel: {
    transcript_id: '2024-07-02-sitting-1',
    sitting_date: '02-07-2024',
    youtube_channel_id: CHANNEL_IDS.news_channel,
  },
};

/**
 * Helper to create a custom video match
 */
export function createVideoMatch(options: {
  videoId: string;
  title: string;
  duration: number;
  publishDate: string;
  confidenceScore: number;
  hasTranscript?: boolean;
}): VideoMatchResponse {
  return {
    video_id: options.videoId,
    video_url: `https://www.youtube.com/watch?v=${options.videoId}`,
    title: options.title,
    duration: options.duration,
    publish_date: options.publishDate,
    confidence_score: options.confidenceScore,
    match_criteria: options.confidenceScore > 7 ? ['high_confidence'] : ['low_confidence'],
    channel_id: CHANNEL_IDS.official_parliament,
    has_transcript: options.hasTranscript ?? true,
    metadata: {
      description: `Video: ${options.title}`,
      thumbnail_url: `https://i.ytimg.com/vi/${options.videoId}/hqdefault.jpg`,
    },
  };
}

/**
 * Helper to create a timestamp match
 */
export function createTimestampMatch(options: {
  videoId: string;
  startTimestamp: number;
  quoteText: string;
  method?: 'transcript' | 'description' | 'approximate';
}): TimestampMatchResponse {
  const duration = 10 + Math.floor(options.quoteText.length / 10); // Rough estimate
  return {
    video_id: options.videoId,
    start_timestamp: options.startTimestamp,
    end_timestamp: options.startTimestamp + duration,
    segment_url: `https://www.youtube.com/watch?v=${options.videoId}&t=${options.startTimestamp}`,
    confidence: options.method === 'transcript' ? 9.0 : options.method === 'description' ? 6.0 : 4.0,
    method: options.method ?? 'transcript',
    matched_text: options.method === 'transcript' ? options.quoteText : undefined,
  };
}

/**
 * Multiple results scenario
 */
export const MULTIPLE_MATCHES = [
  PARLIAMENT_SESSION_VIDEO,
  PARLIAMENT_LIVESTREAM_VIDEO,
  LOW_CONFIDENCE_VIDEO,
];

/**
 * No results scenario
 */
export const NO_MATCH_ERROR = {
  error: 'NO_MATCH_FOUND',
  message: 'No matching video found for the specified transcript',
  status: 404,
};
