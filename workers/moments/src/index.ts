import { OpenAI } from 'openai';
import { MomentExtractor } from './extractor';
import type {
  Env,
  ExtractMomentsRequest,
  AnalyzeMomentRequest,
  BatchExtractRequest,
  ProcessedTranscript,
  ExtractionResult,
  ErrorResponse,
} from './types';
import {
  ExtractMomentsRequestSchema,
  AnalyzeMomentRequestSchema,
  BatchExtractRequestSchema,
  ProcessedTranscriptSchema,
} from './types';

/**
 * Storage helper for R2 operations
 */
class Storage {
  constructor(private r2: R2Bucket) {}

  async getTranscript(transcriptId: string): Promise<ProcessedTranscript | null> {
    const key = `transcripts/processed/${transcriptId}.json`;
    const object = await this.r2.get(key);

    if (!object) {
      return null;
    }

    const data = await object.json();
    return ProcessedTranscriptSchema.parse(data);
  }

  async saveMoments(result: ExtractionResult): Promise<void> {
    const key = `moments/${result.transcript_id}.json`;
    await this.r2.put(key, JSON.stringify(result, null, 2), {
      httpMetadata: {
        contentType: 'application/json',
      },
    });
  }

  async getMoments(transcriptId: string): Promise<ExtractionResult | null> {
    const key = `moments/${transcriptId}.json`;
    const object = await this.r2.get(key);

    if (!object) {
      return null;
    }

    return await object.json();
  }
}

/**
 * Cache helper for Redis operations
 */
class Cache {
  constructor(
    private redisUrl?: string,
    private redisToken?: string
  ) {}

  async get(key: string): Promise<any | null> {
    if (!this.redisUrl || !this.redisToken) {
      return null;
    }

    try {
      const response = await fetch(`${this.redisUrl}/get/${key}`, {
        headers: {
          Authorization: `Bearer ${this.redisToken}`,
        },
      });

      if (!response.ok) {
        return null;
      }

      const data = await response.json();
      return data.result;
    } catch (error) {
      console.error('Redis get error:', error);
      return null;
    }
  }

  async set(key: string, value: any, expirySeconds: number = 3600): Promise<void> {
    if (!this.redisUrl || !this.redisToken) {
      return;
    }

    try {
      await fetch(`${this.redisUrl}/set/${key}`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${this.redisToken}`,
        },
        body: JSON.stringify({
          value: JSON.stringify(value),
          ex: expirySeconds,
        }),
      });
    } catch (error) {
      console.error('Redis set error:', error);
    }
  }
}

/**
 * Error response helper
 */
function errorResponse(message: string, status: number = 500, details?: any): Response {
  const error: ErrorResponse = {
    error: 'Error',
    message,
    details,
  };

  return new Response(JSON.stringify(error), {
    status,
    headers: {
      'Content-Type': 'application/json',
    },
  });
}

/**
 * Success response helper
 */
function jsonResponse(data: any, status: number = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'Content-Type': 'application/json',
    },
  });
}

/**
 * Main worker handler
 */
export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    // CORS headers
    const corsHeaders = {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    };

    if (request.method === 'OPTIONS') {
      return new Response(null, { headers: corsHeaders });
    }

    // Initialize services
    const openai = new OpenAI({
      apiKey: env.OPENAI_API_KEY,
    });

    const storage = new Storage(env.R2);
    const cache = new Cache(env.UPSTASH_REDIS_REST_URL, env.UPSTASH_REDIS_REST_TOKEN);
    const extractor = new MomentExtractor(openai, env.OPENAI_MODEL);

    try {
      // POST /api/moments/extract
      if (url.pathname === '/api/moments/extract' && request.method === 'POST') {
        const body = await request.json();
        const validated = ExtractMomentsRequestSchema.parse(body);

        // Check cache first
        const cacheKey = `moments:${validated.transcript_id}`;
        const cached = await cache.get(cacheKey);
        if (cached) {
          return jsonResponse(cached);
        }

        // Get transcript from R2
        const transcript = await storage.getTranscript(validated.transcript_id);
        if (!transcript) {
          return errorResponse(`Transcript not found: ${validated.transcript_id}`, 404);
        }

        // Extract moments
        const result = await extractor.extractMoments(transcript, validated.criteria);

        // Save to R2
        await storage.saveMoments(result);

        // Cache for 1 hour
        await cache.set(cacheKey, result, 3600);

        // Index embeddings in Vectorize
        if (result.moments.length > 0) {
          const vectors = result.moments
            .filter(m => m.embedding && m.embedding.length > 0)
            .map(m => ({
              id: m.moment_id,
              values: m.embedding!,
              metadata: {
                transcript_id: m.transcript_id,
                speaker: m.speaker,
                topic: m.topic,
                virality_score: m.virality_score,
                quote: m.quote,
              },
            }));

          if (vectors.length > 0) {
            await env.VECTORIZE.upsert(vectors);
          }
        }

        return jsonResponse(result);
      }

      // POST /api/moments/analyze
      if (url.pathname === '/api/moments/analyze' && request.method === 'POST') {
        const body = await request.json();
        const validated = AnalyzeMomentRequestSchema.parse(body);

        const analysis = await extractor.analyzeMoment(
          validated.moment_text,
          validated.context,
          validated.speaker
        );

        return jsonResponse(analysis);
      }

      // GET /api/moments/trending
      if (url.pathname === '/api/moments/trending' && request.method === 'GET') {
        const timeframe = url.searchParams.get('timeframe') || '7d';
        const limit = parseInt(url.searchParams.get('limit') || '10');
        const minScore = parseFloat(url.searchParams.get('min_score') || '7.0');

        // TODO: Implement trending logic with time-based filtering
        // For now, return a placeholder response
        return jsonResponse({
          moments: [],
          timeframe,
          limit,
          min_score: minScore,
        });
      }

      // POST /api/moments/batch
      if (url.pathname === '/api/moments/batch' && request.method === 'POST') {
        const body = await request.json();
        const validated = BatchExtractRequestSchema.parse(body);

        const results = await Promise.allSettled(
          validated.transcript_ids.map(async transcriptId => {
            const transcript = await storage.getTranscript(transcriptId);
            if (!transcript) {
              throw new Error(`Transcript not found: ${transcriptId}`);
            }

            const result = await extractor.extractMoments(transcript, validated.criteria);
            await storage.saveMoments(result);

            return result;
          })
        );

        const successful = results
          .filter((r): r is PromiseFulfilledResult<ExtractionResult> => r.status === 'fulfilled')
          .map(r => r.value);

        const failed = results
          .filter((r): r is PromiseRejectedResult => r.status === 'rejected')
          .map(r => r.reason);

        return jsonResponse({
          job_id: `batch-${Date.now()}`,
          successful: successful.length,
          failed: failed.length,
          results: successful,
          errors: failed.map(e => e.message),
        });
      }

      // GET /api/moments/search
      if (url.pathname === '/api/moments/search' && request.method === 'GET') {
        const query = url.searchParams.get('q');
        const limit = parseInt(url.searchParams.get('limit') || '10');

        if (!query) {
          return errorResponse('Query parameter "q" is required', 400);
        }

        // Generate embedding for query
        const queryEmbedding = await extractor.generateEmbedding(query);

        // Search in Vectorize
        const results = await env.VECTORIZE.query(queryEmbedding, {
          topK: limit,
          returnMetadata: true,
        });

        return jsonResponse({
          query,
          results: results.matches.map(match => ({
            moment_id: match.id,
            score: match.score,
            ...match.metadata,
          })),
        });
      }

      // Health check
      if (url.pathname === '/health' && request.method === 'GET') {
        return jsonResponse({
          status: 'healthy',
          service: 'capless-moments',
          timestamp: new Date().toISOString(),
        });
      }

      return errorResponse('Not found', 404);
    } catch (error) {
      console.error('Worker error:', error);

      if (error instanceof Error) {
        return errorResponse(error.message, 500, {
          stack: error.stack,
        });
      }

      return errorResponse('Internal server error', 500);
    }
  },
};
