/**
 * Timestamp matching logic for finding specific moments in videos
 */

import type { TimestampMatchResponse, YouTubeVideo } from './types';
import {
  extractTimestampsFromDescription,
  parseApproximateTime,
  buildYouTubeURL,
} from './utils';
import { google } from 'googleapis';

/**
 * Find timestamp for a quote in a video using multiple strategies
 */
export async function findTimestampForQuote(
  apiKey: string,
  videoId: string,
  quoteText: string,
  speaker?: string,
  approximateTime?: string
): Promise<TimestampMatchResponse> {
  // Strategy 1: Try to find in video description timestamps
  const descriptionMatch = await findInDescription(apiKey, videoId, quoteText, speaker);
  if (descriptionMatch) {
    return descriptionMatch;
  }

  // Strategy 2: Use approximate time if provided
  if (approximateTime) {
    const approximateMatch = findUsingApproximateTime(videoId, approximateTime);
    if (approximateMatch) {
      return approximateMatch;
    }
  }

  // Strategy 3: Fallback to start of video with low confidence
  return createFallbackMatch(videoId);
}

/**
 * Strategy 1: Search video description for timestamp markers
 */
async function findInDescription(
  apiKey: string,
  videoId: string,
  quoteText: string,
  speaker?: string
): Promise<TimestampMatchResponse | null> {
  try {
    const youtube = google.youtube({
      version: 'v3',
      auth: apiKey,
    });

    const response = await youtube.videos.list({
      part: ['snippet'],
      id: [videoId],
    });

    if (!response.data.items || response.data.items.length === 0) {
      return null;
    }

    const description = response.data.items[0].snippet?.description || '';
    const timestamps = extractTimestampsFromDescription(description);

    if (timestamps.length === 0) {
      return null;
    }

    // Try to match based on quote text or speaker
    const searchTerms = [
      quoteText.toLowerCase(),
      ...(speaker ? [speaker.toLowerCase()] : []),
    ];

    for (const term of searchTerms) {
      for (const ts of timestamps) {
        if (ts.label.toLowerCase().includes(term.substring(0, 30))) {
          // Match found in timestamp label
          const segmentDuration = 30; // Default 30-second segment

          return {
            video_id: videoId,
            start_timestamp: ts.timestamp,
            end_timestamp: ts.timestamp + segmentDuration,
            segment_url: buildYouTubeURL(videoId, ts.timestamp),
            confidence: 8, // High confidence for description match
            method: 'description',
            matched_text: ts.label,
          };
        }
      }
    }

    return null;
  } catch (error) {
    console.error('Error searching description:', error);
    return null;
  }
}

/**
 * Strategy 2: Use approximate time from Hansard (e.g., "2:30 PM")
 */
function findUsingApproximateTime(
  videoId: string,
  approximateTime: string
): TimestampMatchResponse | null {
  try {
    const secondsFromMidnight = parseApproximateTime(approximateTime);

    // Parliamentary sessions typically start around 1:30 PM or 10:00 AM
    // Calculate offset from session start
    const typicalStartTimes = [
      parseApproximateTime('10:00 AM'), // Morning session
      parseApproximateTime('1:30 PM'),  // Afternoon session
      parseApproximateTime('7:00 PM'),  // Evening session
    ];

    // Find closest session start time
    let minDiff = Infinity;
    let sessionStart = typicalStartTimes[0];

    for (const startTime of typicalStartTimes) {
      const diff = Math.abs(secondsFromMidnight - startTime);
      if (diff < minDiff) {
        minDiff = diff;
        sessionStart = startTime;
      }
    }

    // Calculate offset from session start
    const offsetSeconds = Math.max(0, secondsFromMidnight - sessionStart);

    // Create timestamp with ±2 minute buffer
    const segmentDuration = 120; // 2 minutes

    return {
      video_id: videoId,
      start_timestamp: Math.max(0, offsetSeconds - 60),
      end_timestamp: offsetSeconds + 60,
      segment_url: buildYouTubeURL(videoId, offsetSeconds),
      confidence: 5, // Medium confidence for approximate time
      method: 'approximate',
    };
  } catch (error) {
    console.error('Error using approximate time:', error);
    return null;
  }
}

/**
 * Strategy 3: Fallback - return start of video with low confidence
 */
function createFallbackMatch(videoId: string): TimestampMatchResponse {
  return {
    video_id: videoId,
    start_timestamp: 0,
    end_timestamp: 30,
    segment_url: buildYouTubeURL(videoId, 0),
    confidence: 2, // Low confidence for fallback
    method: 'approximate',
  };
}

/**
 * Extract segment from video URL
 * This generates a shareable URL with start and end time
 */
export function extractSegmentURL(
  videoId: string,
  startTime: number,
  endTime: number
): string {
  // YouTube doesn't support end time in URL, but we include it in our metadata
  // For now, just return URL with start time
  return buildYouTubeURL(videoId, startTime);
}

/**
 * Validate timestamp range
 */
export function validateTimestampRange(
  startTimestamp: number,
  endTimestamp: number,
  videoDuration?: number
): boolean {
  if (startTimestamp < 0 || endTimestamp < 0) {
    return false;
  }

  if (startTimestamp >= endTimestamp) {
    return false;
  }

  if (videoDuration && endTimestamp > videoDuration) {
    return false;
  }

  return true;
}
