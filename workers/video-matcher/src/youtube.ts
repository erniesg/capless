/**
 * YouTube Data API v3 integration
 */

import { google } from 'googleapis';
import type {
  YouTubeSearchParams,
  YouTubeVideo,
  VideoMatch,
  ConfidenceFactors,
} from './types';
import {
  parseSittingDate,
  generateDateVariants,
  parseISO8601Duration,
  containsParliamentKeywords,
  buildYouTubeURL,
} from './utils';
import { YouTubeAPIError, NoMatchFoundError } from './types';

/**
 * Search for videos on YouTube matching the given criteria
 */
export async function searchYouTubeVideos(
  apiKey: string,
  params: YouTubeSearchParams
): Promise<YouTubeVideo[]> {
  try {
    const youtube = google.youtube({
      version: 'v3',
      auth: apiKey,
    });

    const searchResponse = await youtube.search.list({
      part: ['snippet'],
      channelId: params.channelId,
      q: params.query,
      type: ['video'],
      order: params.order || 'date',
      maxResults: params.maxResults || 10,
      publishedAfter: params.publishedAfter,
      publishedBefore: params.publishedBefore,
    });

    if (!searchResponse.data.items || searchResponse.data.items.length === 0) {
      return [];
    }

    // Get video IDs for detailed information
    const videoIds = searchResponse.data.items
      .map(item => item.id?.videoId)
      .filter((id): id is string => !!id);

    if (videoIds.length === 0) {
      return [];
    }

    // Fetch detailed video information including duration
    const videosResponse = await youtube.videos.list({
      part: ['snippet', 'contentDetails', 'statistics', 'liveStreamingDetails'],
      id: videoIds,
    });

    if (!videosResponse.data.items) {
      return [];
    }

    // Map to our YouTubeVideo type
    const videos: YouTubeVideo[] = videosResponse.data.items.map(item => ({
      id: item.id!,
      title: item.snippet?.title || '',
      description: item.snippet?.description || '',
      publishedAt: item.snippet?.publishedAt || '',
      channelId: item.snippet?.channelId || '',
      thumbnails: {
        default: { url: item.snippet?.thumbnails?.default?.url || '' },
        medium: item.snippet?.thumbnails?.medium ? { url: item.snippet.thumbnails.medium.url || '' } : undefined,
        high: item.snippet?.thumbnails?.high ? { url: item.snippet.thumbnails.high.url || '' } : undefined,
      },
      duration: item.contentDetails?.duration,
      viewCount: item.statistics?.viewCount,
      liveStreamingDetails: item.liveStreamingDetails ? {
        actualStartTime: item.liveStreamingDetails.actualStartTime,
        actualEndTime: item.liveStreamingDetails.actualEndTime,
      } : undefined,
    }));

    return videos;
  } catch (error: any) {
    if (error.code === 403 && error.message?.includes('quota')) {
      throw new YouTubeAPIError('YouTube API quota exceeded', error);
    }
    throw new YouTubeAPIError(`YouTube API error: ${error.message}`, error);
  }
}

/**
 * Calculate confidence score for a video match
 * Returns a score from 0-10 based on multiple factors
 */
export function calculateConfidenceScore(
  video: YouTubeVideo,
  sittingDate: string,
  speakers?: string[]
): { score: number; factors: ConfidenceFactors } {
  const factors: ConfidenceFactors = {
    date_match: false,
    title_keywords_match: false,
    duration_appropriate: false,
    is_livestream: false,
    description_keywords: false,
  };

  let score = 0;

  // Factor 1: Date match (4 points - most important)
  const parsed = parseSittingDate(sittingDate);
  const videoDate = new Date(video.publishedAt);
  const sittingDateObj = new Date(parsed.year, parsed.month - 1, parsed.day);

  const daysDifference = Math.abs(
    (videoDate.getTime() - sittingDateObj.getTime()) / (1000 * 60 * 60 * 24)
  );

  if (daysDifference === 0) {
    factors.date_match = true;
    score += 4; // Exact date match
  } else if (daysDifference <= 1) {
    factors.date_match = true;
    score += 3; // Within 1 day
  } else if (daysDifference <= 3) {
    score += 1; // Within 3 days (might be uploaded later)
  }

  // Factor 2: Title contains parliamentary keywords (2 points)
  if (containsParliamentKeywords(video.title)) {
    factors.title_keywords_match = true;
    score += 2;
  }

  // Factor 3: Duration appropriate for parliament session (2 points)
  if (video.duration) {
    const durationSeconds = parseISO8601Duration(video.duration);
    // Parliament sessions are typically 1+ hours
    if (durationSeconds >= 3600) {
      factors.duration_appropriate = true;
      score += 2;
    } else if (durationSeconds >= 1800) {
      // At least 30 minutes
      score += 1;
    }
  }

  // Factor 4: Is a livestream (1 point)
  if (video.liveStreamingDetails?.actualStartTime) {
    factors.is_livestream = true;
    score += 1;
  }

  // Factor 5: Description contains keywords or speaker names (1 point)
  if (containsParliamentKeywords(video.description)) {
    factors.description_keywords = true;
    score += 0.5;
  }

  if (speakers && speakers.length > 0) {
    const speakerFound = speakers.some(speaker =>
      video.description.includes(speaker) || video.title.includes(speaker)
    );
    if (speakerFound) {
      factors.description_keywords = true;
      score += 0.5;
    }
  }

  return { score: Math.min(score, 10), factors };
}

/**
 * Find best matching video for a parliamentary sitting
 */
export async function findMatchingVideo(
  apiKey: string,
  channelId: string,
  sittingDate: string,
  speakers?: string[]
): Promise<VideoMatch | null> {
  const parsed = parseSittingDate(sittingDate);
  const dateVariants = generateDateVariants(sittingDate);

  // Build search query with date variants
  const searchQuery = `Parliament Singapore ${dateVariants[0]}`; // Use formatted date

  // Set search window: day of sitting ± 2 days
  const startDate = new Date(parsed.year, parsed.month - 1, parsed.day - 2);
  const endDate = new Date(parsed.year, parsed.month - 1, parsed.day + 3);

  const params: YouTubeSearchParams = {
    channelId,
    query: searchQuery,
    publishedAfter: startDate.toISOString(),
    publishedBefore: endDate.toISOString(),
    maxResults: 10,
    type: 'video',
    order: 'date',
  };

  const videos = await searchYouTubeVideos(apiKey, params);

  if (videos.length === 0) {
    throw new NoMatchFoundError(`No videos found for sitting date ${sittingDate}`);
  }

  // Score all videos and find the best match
  const scoredVideos = videos.map(video => {
    const { score, factors } = calculateConfidenceScore(video, sittingDate, speakers);
    return {
      video,
      score,
      factors,
    };
  });

  // Sort by confidence score (descending)
  scoredVideos.sort((a, b) => b.score - a.score);

  const best = scoredVideos[0];

  // Only return match if confidence score is at least 5/10
  if (best.score < 5) {
    throw new NoMatchFoundError(
      `Best match score too low (${best.score}/10) for sitting date ${sittingDate}`
    );
  }

  // Convert to VideoMatch
  const duration = best.video.duration ? parseISO8601Duration(best.video.duration) : 0;

  const match: VideoMatch = {
    video_id: best.video.id,
    video_url: buildYouTubeURL(best.video.id),
    title: best.video.title,
    duration,
    publish_date: best.video.publishedAt,
    confidence_score: best.score,
    match_criteria: Object.entries(best.factors)
      .filter(([_, value]) => value)
      .map(([key, _]) => key),
    channel_id: best.video.channelId,
    has_transcript: false, // Will be determined separately
  };

  return match;
}

/**
 * Check if video has available transcript/captions
 * Note: This requires OAuth, so for now we return false
 * In production, implement OAuth flow to access captions API
 */
export async function checkTranscriptAvailability(
  apiKey: string,
  videoId: string
): Promise<boolean> {
  try {
    const youtube = google.youtube({
      version: 'v3',
      auth: apiKey,
    });

    const response = await youtube.captions.list({
      part: ['snippet'],
      videoId: videoId,
    });

    return (response.data.items?.length || 0) > 0;
  } catch (error) {
    // Captions API requires OAuth, might not work with API key only
    // Fallback to false
    return false;
  }
}
