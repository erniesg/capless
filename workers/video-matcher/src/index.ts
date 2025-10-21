/**
 * Capless Video Matcher Worker
 * Matches Hansard transcripts with YouTube parliamentary videos
 */

import { Hono } from 'hono';
import { cors } from 'hono/cors';
import type {
  Env,
  VideoMatchRequest,
  VideoMatchResponse,
  TimestampMatchRequest,
  TimestampMatchResponse,
} from './types';
import {
  VideoMatchError,
  YouTubeAPIError,
  RateLimitError,
  NoMatchFoundError,
} from './types';
import { findMatchingVideo } from './youtube';
import { findTimestampForQuote } from './timestamp';
import { createRedisClient, getCachedMatch, cacheMatch } from './cache';
import { storeMatch, getStoredMatch } from './storage';

const app = new Hono<{ Bindings: Env }>();

// CORS middleware
app.use('/*', cors());

// Health check endpoint
app.get('/health', (c) => {
  return c.json({
    status: 'healthy',
    service: 'capless-video-matcher',
    version: '1.0.0',
    timestamp: new Date().toISOString(),
  });
});

// POST /api/video/match
// Match transcript with YouTube video
app.post('/api/video/match', async (c) => {
  try {
    const body = await c.req.json<VideoMatchRequest>();

    // Validate request
    if (!body.transcript_id || !body.sitting_date) {
      return c.json(
        {
          error: 'Missing required fields',
          required: ['transcript_id', 'sitting_date'],
        },
        400
      );
    }

    // Validate date format (DD-MM-YYYY)
    if (!/^\d{2}-\d{2}-\d{4}$/.test(body.sitting_date)) {
      return c.json(
        {
          error: 'Invalid date format',
          expected: 'DD-MM-YYYY',
          received: body.sitting_date,
        },
        400
      );
    }

    const redis = createRedisClient(c.env);
    const channelId = body.youtube_channel_id || c.env.YOUTUBE_CHANNEL_ID;

    // Check cache first
    const cached = await getCachedMatch(redis, body.transcript_id);
    if (cached) {
      console.log(`Cache hit for transcript ${body.transcript_id}`);
      return c.json({
        ...cached,
        cached: true,
      });
    }

    // Check R2 storage
    const stored = await getStoredMatch(c.env.R2, body.transcript_id);
    if (stored) {
      console.log(`Storage hit for transcript ${body.transcript_id}`);
      // Restore to cache
      const ttl = parseInt(c.env.CACHE_TTL_SECONDS);
      await cacheMatch(redis, body.transcript_id, stored, ttl);
      return c.json({
        ...stored,
        cached: false,
        from_storage: true,
      });
    }

    // Find matching video via YouTube API
    console.log(`Finding match for transcript ${body.transcript_id}, date ${body.sitting_date}`);
    const match = await findMatchingVideo(
      c.env.YOUTUBE_API_KEY,
      channelId,
      body.sitting_date,
      body.speakers
    );

    if (!match) {
      return c.json(
        {
          error: 'No matching video found',
          transcript_id: body.transcript_id,
          sitting_date: body.sitting_date,
        },
        404
      );
    }

    // Build response
    const response: VideoMatchResponse = {
      ...match,
      metadata: {
        description: '', // Would need additional API call
        thumbnail_url: `https://img.youtube.com/vi/${match.video_id}/maxresdefault.jpg`,
      },
    };

    // Store in R2 and cache
    await Promise.all([
      storeMatch(c.env.R2, body.transcript_id, response),
      cacheMatch(redis, body.transcript_id, response, parseInt(c.env.CACHE_TTL_SECONDS)),
    ]);

    return c.json({
      ...response,
      cached: false,
      from_storage: false,
    });
  } catch (error) {
    return handleError(c, error);
  }
});

// POST /api/video/find-timestamp
// Find specific timestamp within a video
app.post('/api/video/find-timestamp', async (c) => {
  try {
    const body = await c.req.json<TimestampMatchRequest>();

    // Validate request
    if (!body.video_id || !body.quote_text) {
      return c.json(
        {
          error: 'Missing required fields',
          required: ['video_id', 'quote_text'],
        },
        400
      );
    }

    console.log(`Finding timestamp for video ${body.video_id}`);
    const result = await findTimestampForQuote(
      c.env.YOUTUBE_API_KEY,
      body.video_id,
      body.quote_text,
      body.speaker,
      body.approximate_time
    );

    return c.json(result);
  } catch (error) {
    return handleError(c, error);
  }
});

// GET /api/video/match/:transcript_id
// Get cached/stored match for a transcript
app.get('/api/video/match/:transcript_id', async (c) => {
  try {
    const transcriptId = c.req.param('transcript_id');

    const redis = createRedisClient(c.env);

    // Check cache
    const cached = await getCachedMatch(redis, transcriptId);
    if (cached) {
      return c.json({
        ...cached,
        cached: true,
      });
    }

    // Check storage
    const stored = await getStoredMatch(c.env.R2, transcriptId);
    if (stored) {
      return c.json({
        ...stored,
        cached: false,
        from_storage: true,
      });
    }

    return c.json(
      {
        error: 'No match found for this transcript',
        transcript_id: transcriptId,
      },
      404
    );
  } catch (error) {
    return handleError(c, error);
  }
});

// Error handler
function handleError(c: any, error: unknown) {
  console.error('Error:', error);

  if (error instanceof VideoMatchError) {
    return c.json(
      {
        error: error.message,
        code: error.code,
      },
      error.status
    );
  }

  if (error instanceof YouTubeAPIError) {
    return c.json(
      {
        error: error.message,
        code: error.code,
        details: error.apiError,
      },
      error.status
    );
  }

  if (error instanceof RateLimitError) {
    return c.json(
      {
        error: error.message,
        code: error.code,
        retry_after: '3600', // 1 hour
      },
      error.status
    );
  }

  if (error instanceof NoMatchFoundError) {
    return c.json(
      {
        error: error.message,
        code: error.code,
        suggestion: 'Try adjusting the sitting date or check if the video exists on YouTube',
      },
      error.status
    );
  }

  // Generic error
  return c.json(
    {
      error: 'Internal server error',
      message: error instanceof Error ? error.message : 'Unknown error',
    },
    500
  );
}

// 404 handler
app.notFound((c) => {
  return c.json(
    {
      error: 'Endpoint not found',
      path: c.req.path,
      available_endpoints: [
        'GET /health',
        'POST /api/video/match',
        'POST /api/video/find-timestamp',
        'GET /api/video/match/:transcript_id',
      ],
    },
    404
  );
});

export default app;
