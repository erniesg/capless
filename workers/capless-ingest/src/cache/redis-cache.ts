/**
 * Redis caching layer for Hansard transcripts
 * Uses Cloudflare KV as Redis-like storage
 */

import type { ProcessedTranscript, HansardJSON } from "../types";

const DEFAULT_TTL = 24 * 60 * 60; // 24 hours in seconds

/**
 * Generate cache key for raw Hansard JSON
 */
export function generateRawCacheKey(sittingDate: string): string {
  return `hansard:raw:${sittingDate}`;
}

/**
 * Generate cache key for processed transcript
 */
export function generateProcessedCacheKey(transcriptId: string): string {
  return `transcript:processed:${transcriptId}`;
}

/**
 * Cache raw Hansard JSON
 */
export async function cacheRawHansard(
  kv: KVNamespace,
  sittingDate: string,
  hansard: HansardJSON,
  ttl: number = DEFAULT_TTL
): Promise<void> {
  const key = generateRawCacheKey(sittingDate);
  const value = JSON.stringify(hansard);

  await kv.put(key, value, {
    expirationTtl: ttl,
    metadata: {
      cached_at: new Date().toISOString(),
      type: "raw_hansard",
      sitting_date: sittingDate,
    },
  });
}

/**
 * Get cached raw Hansard JSON
 */
export async function getCachedRawHansard(
  kv: KVNamespace,
  sittingDate: string
): Promise<HansardJSON | null> {
  const key = generateRawCacheKey(sittingDate);
  const value = await kv.get(key, "text");

  if (!value) {
    return null;
  }

  try {
    return JSON.parse(value) as HansardJSON;
  } catch (error) {
    // Invalid JSON in cache, delete it
    await kv.delete(key);
    return null;
  }
}

/**
 * Cache processed transcript
 */
export async function cacheProcessedTranscript(
  kv: KVNamespace,
  transcript: ProcessedTranscript,
  ttl: number = DEFAULT_TTL
): Promise<void> {
  const key = generateProcessedCacheKey(transcript.transcript_id);
  const value = JSON.stringify(transcript);

  await kv.put(key, value, {
    expirationTtl: ttl,
    metadata: {
      cached_at: new Date().toISOString(),
      type: "processed_transcript",
      transcript_id: transcript.transcript_id,
      sitting_date: transcript.sitting_date,
      segment_count: transcript.segments.length,
    },
  });
}

/**
 * Get cached processed transcript
 */
export async function getCachedProcessedTranscript(
  kv: KVNamespace,
  transcriptId: string
): Promise<ProcessedTranscript | null> {
  const key = generateProcessedCacheKey(transcriptId);
  const value = await kv.get(key, "text");

  if (!value) {
    return null;
  }

  try {
    return JSON.parse(value) as ProcessedTranscript;
  } catch (error) {
    // Invalid JSON in cache, delete it
    await kv.delete(key);
    return null;
  }
}

/**
 * Invalidate cache for a transcript
 */
export async function invalidateTranscriptCache(
  kv: KVNamespace,
  transcriptId: string,
  sittingDate?: string
): Promise<void> {
  const promises: Promise<void>[] = [
    kv.delete(generateProcessedCacheKey(transcriptId)),
  ];

  if (sittingDate) {
    promises.push(kv.delete(generateRawCacheKey(sittingDate)));
  }

  await Promise.all(promises);
}

/**
 * Check if transcript is cached
 */
export async function isTranscriptCached(
  kv: KVNamespace,
  transcriptId: string
): Promise<boolean> {
  const key = generateProcessedCacheKey(transcriptId);
  const metadata = await kv.getWithMetadata(key);

  return metadata.value !== null;
}

/**
 * Get cache metadata without fetching full value
 */
export async function getCacheMetadata(
  kv: KVNamespace,
  transcriptId: string
): Promise<Record<string, any> | null> {
  const key = generateProcessedCacheKey(transcriptId);
  const { metadata } = await kv.getWithMetadata(key);

  return metadata;
}
