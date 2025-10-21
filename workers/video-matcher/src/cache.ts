/**
 * Redis caching layer for video matches
 */

import { Redis } from '@upstash/redis/cloudflare';
import type { VideoMatchResponse, CachedMatch, Env } from './types';

/**
 * Initialize Redis client
 */
export function createRedisClient(env: Env): Redis {
  return new Redis({
    url: env.UPSTASH_REDIS_REST_URL,
    token: env.UPSTASH_REDIS_REST_TOKEN,
  });
}

/**
 * Generate cache key for a video match
 */
export function getCacheKey(transcriptId: string): string {
  return `video_match:${transcriptId}`;
}

/**
 * Get cached video match
 */
export async function getCachedMatch(
  redis: Redis,
  transcriptId: string
): Promise<VideoMatchResponse | null> {
  try {
    const key = getCacheKey(transcriptId);
    const cached = await redis.get<CachedMatch>(key);

    if (!cached) {
      return null;
    }

    // Check if cache is still valid
    const cachedAt = new Date(cached.cached_at);
    const now = new Date();
    const ageSeconds = (now.getTime() - cachedAt.getTime()) / 1000;

    if (ageSeconds > cached.ttl) {
      // Cache expired, delete it
      await redis.del(key);
      return null;
    }

    return cached.match;
  } catch (error) {
    console.error('Redis get error:', error);
    return null;
  }
}

/**
 * Cache a video match
 */
export async function cacheMatch(
  redis: Redis,
  transcriptId: string,
  match: VideoMatchResponse,
  ttlSeconds: number
): Promise<void> {
  try {
    const key = getCacheKey(transcriptId);
    const cached: CachedMatch = {
      match,
      cached_at: new Date().toISOString(),
      ttl: ttlSeconds,
    };

    await redis.set(key, cached, { ex: ttlSeconds });
  } catch (error) {
    console.error('Redis set error:', error);
    // Don't throw - caching failures shouldn't break the request
  }
}

/**
 * Invalidate cached match
 */
export async function invalidateCache(
  redis: Redis,
  transcriptId: string
): Promise<void> {
  try {
    const key = getCacheKey(transcriptId);
    await redis.del(key);
  } catch (error) {
    console.error('Redis delete error:', error);
  }
}

/**
 * Get cache statistics
 */
export async function getCacheStats(redis: Redis): Promise<{
  total_keys: number;
  memory_usage: string;
}> {
  try {
    const keys = await redis.keys('video_match:*');
    return {
      total_keys: keys.length,
      memory_usage: 'N/A', // Upstash doesn't provide memory info via REST
    };
  } catch (error) {
    console.error('Redis stats error:', error);
    return {
      total_keys: 0,
      memory_usage: 'error',
    };
  }
}
