/**
 * Type definitions for Video Matcher Worker
 */

// Environment bindings
export interface Env {
  R2: R2Bucket;
  YOUTUBE_API_KEY: string;
  YOUTUBE_CHANNEL_ID: string;
  UPSTASH_REDIS_REST_URL: string;
  UPSTASH_REDIS_REST_TOKEN: string;
  CACHE_TTL_SECONDS: string;
}

// API Request/Response types
export interface VideoMatchRequest {
  transcript_id: string;
  sitting_date: string; // Format: DD-MM-YYYY (e.g., "02-07-2024")
  speakers?: string[];
  youtube_channel_id?: string;
}

export interface VideoMatchResponse {
  video_id: string;
  video_url: string;
  title: string;
  duration: number; // seconds
  publish_date: string;
  confidence_score: number; // 0-10
  match_criteria: string[];
  channel_id: string;
  has_transcript: boolean;
  metadata?: {
    description: string;
    thumbnail_url: string;
    view_count?: number;
  };
}

export interface TimestampMatchRequest {
  video_id: string;
  quote_text: string;
  speaker?: string;
  approximate_time?: string; // Format: "HH:MM AM/PM" (e.g., "12:00 PM")
}

export interface TimestampMatchResponse {
  video_id: string;
  start_timestamp: number; // seconds
  end_timestamp: number; // seconds
  segment_url: string; // YouTube URL with &t= parameter
  confidence: number; // 0-10
  method: 'transcript' | 'description' | 'approximate';
  matched_text?: string;
}

// YouTube API types
export interface YouTubeSearchParams {
  channelId: string;
  query: string;
  publishedAfter: string;
  publishedBefore: string;
  maxResults?: number;
  type?: 'video';
  order?: 'date' | 'relevance';
}

export interface YouTubeVideo {
  id: string;
  title: string;
  description: string;
  publishedAt: string;
  channelId: string;
  thumbnails: {
    default: { url: string };
    medium?: { url: string };
    high?: { url: string };
  };
  duration?: string; // ISO 8601 duration (PT1H2M3S)
  viewCount?: string;
  liveStreamingDetails?: {
    actualStartTime?: string;
    actualEndTime?: string;
  };
}

// Internal types
export interface VideoMatch {
  video_id: string;
  video_url: string;
  title: string;
  duration: number;
  publish_date: string;
  confidence_score: number;
  match_criteria: string[];
  channel_id: string;
  has_transcript: boolean;
}

export interface ConfidenceFactors {
  date_match: boolean;
  title_keywords_match: boolean;
  duration_appropriate: boolean; // >1 hour for parliament sessions
  is_livestream: boolean;
  description_keywords: boolean;
}

export interface CachedMatch {
  match: VideoMatchResponse;
  cached_at: string;
  ttl: number;
}

// Error types
export class VideoMatchError extends Error {
  constructor(
    message: string,
    public code: string,
    public status: number = 500
  ) {
    super(message);
    this.name = 'VideoMatchError';
  }
}

export class YouTubeAPIError extends VideoMatchError {
  constructor(message: string, public apiError?: any) {
    super(message, 'YOUTUBE_API_ERROR', 503);
    this.name = 'YouTubeAPIError';
  }
}

export class RateLimitError extends VideoMatchError {
  constructor(message: string = 'YouTube API rate limit exceeded') {
    super(message, 'RATE_LIMIT_ERROR', 429);
    this.name = 'RateLimitError';
  }
}

export class NoMatchFoundError extends VideoMatchError {
  constructor(message: string = 'No matching video found') {
    super(message, 'NO_MATCH_FOUND', 404);
    this.name = 'NoMatchFoundError';
  }
}
