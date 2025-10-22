/**
 * Mock factory for YouTube Data API v3 responses
 * Matches the actual YouTube API schema
 */

import { z } from 'zod';

// ============================================================================
// YouTube API Response Schemas
// ============================================================================

export const ThumbnailSchema = z.object({
  url: z.string().url(),
  width: z.number().optional(),
  height: z.number().optional(),
});

export const ThumbnailsSchema = z.object({
  default: ThumbnailSchema,
  medium: ThumbnailSchema.optional(),
  high: ThumbnailSchema.optional(),
  standard: ThumbnailSchema.optional(),
  maxres: ThumbnailSchema.optional(),
});

export const VideoSnippetSchema = z.object({
  publishedAt: z.string(),
  channelId: z.string(),
  title: z.string(),
  description: z.string(),
  thumbnails: ThumbnailsSchema,
  channelTitle: z.string(),
  tags: z.array(z.string()).optional(),
  categoryId: z.string().optional(),
  liveBroadcastContent: z.string().optional(),
  localized: z.object({
    title: z.string(),
    description: z.string(),
  }).optional(),
});

export const VideoContentDetailsSchema = z.object({
  duration: z.string(), // ISO 8601 (PT1H30M15S)
  dimension: z.string().optional(),
  definition: z.string().optional(),
  caption: z.string().optional(),
  licensedContent: z.boolean().optional(),
});

export const VideoStatisticsSchema = z.object({
  viewCount: z.string().optional(),
  likeCount: z.string().optional(),
  favoriteCount: z.string().optional(),
  commentCount: z.string().optional(),
});

export const VideoLiveStreamingDetailsSchema = z.object({
  actualStartTime: z.string().optional(),
  actualEndTime: z.string().optional(),
  scheduledStartTime: z.string().optional(),
  scheduledEndTime: z.string().optional(),
  concurrentViewers: z.string().optional(),
});

export const VideoItemSchema = z.object({
  kind: z.literal('youtube#video'),
  etag: z.string(),
  id: z.string(),
  snippet: VideoSnippetSchema.optional(),
  contentDetails: VideoContentDetailsSchema.optional(),
  statistics: VideoStatisticsSchema.optional(),
  liveStreamingDetails: VideoLiveStreamingDetailsSchema.optional(),
});

export const SearchResultSnippetSchema = z.object({
  publishedAt: z.string(),
  channelId: z.string(),
  title: z.string(),
  description: z.string(),
  thumbnails: ThumbnailsSchema,
  channelTitle: z.string(),
  liveBroadcastContent: z.string().optional(),
});

export const SearchResultIdSchema = z.object({
  kind: z.string(),
  videoId: z.string().optional(),
  channelId: z.string().optional(),
  playlistId: z.string().optional(),
});

export const SearchResultItemSchema = z.object({
  kind: z.literal('youtube#searchResult'),
  etag: z.string(),
  id: SearchResultIdSchema,
  snippet: SearchResultSnippetSchema,
});

export const VideoListResponseSchema = z.object({
  kind: z.literal('youtube#videoListResponse'),
  etag: z.string(),
  items: z.array(VideoItemSchema),
  pageInfo: z.object({
    totalResults: z.number(),
    resultsPerPage: z.number(),
  }),
});

export const SearchListResponseSchema = z.object({
  kind: z.literal('youtube#searchListResponse'),
  etag: z.string(),
  nextPageToken: z.string().optional(),
  prevPageToken: z.string().optional(),
  regionCode: z.string().optional(),
  pageInfo: z.object({
    totalResults: z.number(),
    resultsPerPage: z.number(),
  }),
  items: z.array(SearchResultItemSchema),
});

export type VideoItem = z.infer<typeof VideoItemSchema>;
export type SearchResultItem = z.infer<typeof SearchResultItemSchema>;
export type VideoListResponse = z.infer<typeof VideoListResponseSchema>;
export type SearchListResponse = z.infer<typeof SearchListResponseSchema>;

// ============================================================================
// Mock Factories
// ============================================================================

/**
 * Create a mock YouTube search response
 */
export function createSearchResponse(
  query: string,
  channelId: string,
  results: number = 5
): SearchListResponse {
  const items: SearchResultItem[] = [];

  for (let i = 0; i < results; i++) {
    items.push({
      kind: 'youtube#searchResult',
      etag: `etag-${Math.random().toString(36).substring(7)}`,
      id: {
        kind: 'youtube#video',
        videoId: `vid-${Date.now()}-${i}`,
      },
      snippet: {
        publishedAt: new Date(Date.now() - i * 86400000).toISOString(),
        channelId,
        title: `Parliament Sitting ${i + 1} - ${query}`,
        description: `Full coverage of Parliament sitting discussing ${query}. Watch live as MPs debate key issues.`,
        thumbnails: {
          default: {
            url: `https://i.ytimg.com/vi/vid-${i}/default.jpg`,
            width: 120,
            height: 90,
          },
          medium: {
            url: `https://i.ytimg.com/vi/vid-${i}/mqdefault.jpg`,
            width: 320,
            height: 180,
          },
          high: {
            url: `https://i.ytimg.com/vi/vid-${i}/hqdefault.jpg`,
            width: 480,
            height: 360,
          },
        },
        channelTitle: 'Singapore Parliament',
        liveBroadcastContent: i === 0 ? 'none' : 'none',
      },
    });
  }

  return {
    kind: 'youtube#searchListResponse',
    etag: `etag-${Math.random().toString(36).substring(7)}`,
    pageInfo: {
      totalResults: results,
      resultsPerPage: results,
    },
    items,
  };
}

/**
 * Create a mock video details response
 */
export function createVideoDetailsResponse(
  videoId: string,
  options?: {
    title?: string;
    duration?: string;
    publishedAt?: string;
    viewCount?: string;
    isLivestream?: boolean;
  }
): VideoListResponse {
  return {
    kind: 'youtube#videoListResponse',
    etag: `etag-${Math.random().toString(36).substring(7)}`,
    pageInfo: {
      totalResults: 1,
      resultsPerPage: 1,
    },
    items: [
      {
        kind: 'youtube#video',
        etag: `etag-${videoId}`,
        id: videoId,
        snippet: {
          publishedAt: options?.publishedAt ?? new Date().toISOString(),
          channelId: 'UC-parliament-singapore',
          title: options?.title ?? 'Parliament Sitting - 2 July 2024',
          description: 'Full coverage of Parliament sitting. Watch as MPs debate important issues affecting Singapore.',
          thumbnails: {
            default: {
              url: `https://i.ytimg.com/vi/${videoId}/default.jpg`,
              width: 120,
              height: 90,
            },
            medium: {
              url: `https://i.ytimg.com/vi/${videoId}/mqdefault.jpg`,
              width: 320,
              height: 180,
            },
            high: {
              url: `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`,
              width: 480,
              height: 360,
            },
          },
          channelTitle: 'Singapore Parliament',
          tags: ['parliament', 'singapore', 'politics', 'debate'],
          categoryId: '25', // News & Politics
          liveBroadcastContent: 'none',
        },
        contentDetails: {
          duration: options?.duration ?? 'PT2H30M15S', // 2h 30m 15s
          dimension: '2d',
          definition: 'hd',
          caption: 'true',
          licensedContent: false,
        },
        statistics: {
          viewCount: options?.viewCount ?? '15234',
          likeCount: '856',
          favoriteCount: '0',
          commentCount: '123',
        },
        liveStreamingDetails: options?.isLivestream ? {
          actualStartTime: options.publishedAt ?? new Date().toISOString(),
          actualEndTime: new Date(Date.now() + 7200000).toISOString(),
        } : undefined,
      },
    ],
  };
}

/**
 * Create a YouTube API error response
 */
export function createYouTubeErrorResponse(
  message: string,
  code: number,
  reason: string
): Response {
  return new Response(
    JSON.stringify({
      error: {
        code,
        message,
        errors: [
          {
            message,
            domain: 'youtube.video',
            reason,
          },
        ],
      },
    }),
    {
      status: code,
      headers: { 'Content-Type': 'application/json' },
    }
  );
}

// ============================================================================
// Fixture Data
// ============================================================================

/**
 * Sample channel IDs
 */
export const CHANNEL_IDS = {
  parliament: 'UC-parliament-singapore',
  news: 'UC-channelnewsasia',
  test: 'UC-test-channel',
};

/**
 * Sample video fixtures for common scenarios
 */
export const VIDEO_FIXTURES = {
  parliament_session: {
    videoId: 'parl-2024-07-02-abc',
    title: 'Parliament Sitting - 2 July 2024',
    duration: 'PT2H30M15S',
    publishedAt: '2024-07-02T04:00:00Z',
    viewCount: '15234',
    isLivestream: false,
  },
  parliament_livestream: {
    videoId: 'parl-2024-07-02-live',
    title: 'LIVE: Parliament Sitting - 2 July 2024',
    duration: 'PT0S', // Live
    publishedAt: '2024-07-02T04:00:00Z',
    viewCount: '3421',
    isLivestream: true,
  },
  short_clip: {
    videoId: 'clip-moment-123',
    title: 'Minister vs Opposition: Budget Debate Highlights',
    duration: 'PT5M30S',
    publishedAt: '2024-07-02T10:30:00Z',
    viewCount: '45678',
    isLivestream: false,
  },
};

/**
 * Sample search queries
 */
export const SEARCH_QUERIES = {
  by_date: 'parliament singapore 2 july 2024',
  by_topic: 'budget debate 2024',
  by_speaker: 'opposition leader speech',
};

/**
 * Helper to parse ISO 8601 duration to seconds
 */
export function parseDuration(isoDuration: string): number {
  const matches = isoDuration.match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/);
  if (!matches) return 0;

  const hours = parseInt(matches[1] || '0');
  const minutes = parseInt(matches[2] || '0');
  const seconds = parseInt(matches[3] || '0');

  return hours * 3600 + minutes * 60 + seconds;
}

/**
 * Helper to format seconds to ISO 8601 duration
 */
export function formatDuration(seconds: number): string {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = seconds % 60;

  let duration = 'PT';
  if (hours > 0) duration += `${hours}H`;
  if (minutes > 0) duration += `${minutes}M`;
  if (secs > 0) duration += `${secs}S`;

  return duration === 'PT' ? 'PT0S' : duration;
}

/**
 * Sample transcript data (for timestamp matching)
 */
export const SAMPLE_TRANSCRIPT = {
  videoId: 'parl-2024-07-02-abc',
  captions: [
    {
      start: 0,
      duration: 5.2,
      text: 'Good afternoon, Mr Speaker.',
    },
    {
      start: 5.2,
      duration: 8.5,
      text: 'I rise to address the budget proposal.',
    },
    {
      start: 135.0,
      duration: 12.3,
      text: 'Mr Speaker, I think the Minister is trying to have his cake and eat it too.',
    },
    {
      start: 147.3,
      duration: 6.8,
      text: 'On one hand, he claims fiscal responsibility.',
    },
  ],
};

/**
 * Create a mock with multiple matching videos
 */
export const MULTIPLE_MATCHES_FIXTURE = createSearchResponse(
  'parliament 2 july 2024',
  CHANNEL_IDS.parliament,
  5
);

/**
 * Create a mock with no results
 */
export const NO_RESULTS_FIXTURE: SearchListResponse = {
  kind: 'youtube#searchListResponse',
  etag: 'no-results-etag',
  pageInfo: {
    totalResults: 0,
    resultsPerPage: 0,
  },
  items: [],
};
