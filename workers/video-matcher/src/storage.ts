/**
 * R2 storage layer for persisting video match results
 */

import type { VideoMatchResponse, Env } from './types';

/**
 * Generate R2 key for video match
 */
export function getR2Key(transcriptId: string): string {
  return `video-matches/${transcriptId}.json`;
}

/**
 * Store video match in R2
 */
export async function storeMatch(
  r2: R2Bucket,
  transcriptId: string,
  match: VideoMatchResponse
): Promise<void> {
  try {
    const key = getR2Key(transcriptId);
    const data = JSON.stringify({
      transcript_id: transcriptId,
      match,
      stored_at: new Date().toISOString(),
      version: '1.0',
    }, null, 2);

    await r2.put(key, data, {
      httpMetadata: {
        contentType: 'application/json',
      },
      customMetadata: {
        transcript_id: transcriptId,
        video_id: match.video_id,
        confidence_score: match.confidence_score.toString(),
      },
    });
  } catch (error) {
    console.error('R2 put error:', error);
    throw new Error(`Failed to store match in R2: ${error}`);
  }
}

/**
 * Retrieve video match from R2
 */
export async function getStoredMatch(
  r2: R2Bucket,
  transcriptId: string
): Promise<VideoMatchResponse | null> {
  try {
    const key = getR2Key(transcriptId);
    const object = await r2.get(key);

    if (!object) {
      return null;
    }

    const data = await object.text();
    const parsed = JSON.parse(data);

    return parsed.match;
  } catch (error) {
    console.error('R2 get error:', error);
    return null;
  }
}

/**
 * List all stored matches
 */
export async function listStoredMatches(
  r2: R2Bucket,
  limit: number = 100
): Promise<Array<{ transcript_id: string; video_id: string; confidence_score: number }>> {
  try {
    const listed = await r2.list({
      prefix: 'video-matches/',
      limit,
    });

    const matches = listed.objects.map(obj => ({
      transcript_id: obj.customMetadata?.transcript_id || '',
      video_id: obj.customMetadata?.video_id || '',
      confidence_score: parseFloat(obj.customMetadata?.confidence_score || '0'),
    }));

    return matches;
  } catch (error) {
    console.error('R2 list error:', error);
    return [];
  }
}

/**
 * Delete stored match
 */
export async function deleteStoredMatch(
  r2: R2Bucket,
  transcriptId: string
): Promise<void> {
  try {
    const key = getR2Key(transcriptId);
    await r2.delete(key);
  } catch (error) {
    console.error('R2 delete error:', error);
    throw new Error(`Failed to delete match from R2: ${error}`);
  }
}

/**
 * Check if match exists in R2
 */
export async function matchExists(
  r2: R2Bucket,
  transcriptId: string
): Promise<boolean> {
  try {
    const key = getR2Key(transcriptId);
    const object = await r2.head(key);
    return object !== null;
  } catch (error) {
    console.error('R2 head error:', error);
    return false;
  }
}
