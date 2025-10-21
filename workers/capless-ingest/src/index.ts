/**
 * Capless Ingestion Worker
 * Processes Singapore Parliament Hansard JSON transcripts
 */

import { fetchHansardJSON, fetchHansardFromURL, normalizeSittingDate } from "./clients/hansard-api";
import { processHansardJSON } from "./processors/transcript-processor";
import { storeTranscripts } from "./storage/r2-storage";
import {
  cacheRawHansard,
  cacheProcessedTranscript,
  getCachedRawHansard,
  getCachedProcessedTranscript,
} from "./cache/redis-cache";
import type { Env, IngestRequest, IngestResponse, HansardJSON } from "./types";

/**
 * Main ingestion handler
 */
async function handleIngest(request: Request, env: Env): Promise<Response> {
  const startTime = Date.now();

  try {
    // Parse request body
    const body = (await request.json()) as IngestRequest;

    // Validate request
    if (!body.sittingDate && !body.hansardJSON && !body.hansardURL) {
      return new Response(
        JSON.stringify({
          success: false,
          error: "Missing required field: sittingDate, hansardJSON, or hansardURL",
        }),
        {
          status: 400,
          headers: { "Content-Type": "application/json" },
        }
      );
    }

    let hansard: HansardJSON;
    let sittingDate: string;
    let fromCache = false;

    // Case 1: Hansard JSON provided directly
    if (body.hansardJSON) {
      hansard = body.hansardJSON;
      sittingDate = normalizeSittingDate(hansard.metadata.sittingDate);
    }
    // Case 2: Fetch from custom URL
    else if (body.hansardURL) {
      hansard = await fetchHansardFromURL(body.hansardURL);
      sittingDate = normalizeSittingDate(hansard.metadata.sittingDate);
    }
    // Case 3: Fetch from Singapore Parliament API
    else if (body.sittingDate) {
      sittingDate = normalizeSittingDate(body.sittingDate);

      // Check cache first (unless force refresh)
      if (!body.forceRefresh && env.REDIS) {
        const cached = await getCachedRawHansard(env.REDIS, sittingDate);
        if (cached) {
          hansard = cached;
          fromCache = true;
        }
      }

      // Fetch from API if not cached
      if (!fromCache) {
        const baseUrl = env.PARLIAMENT_API_BASE_URL;
        const maxRetries = env.MAX_RETRIES ? parseInt(env.MAX_RETRIES) : undefined;
        const retryDelay = env.RETRY_DELAY_MS ? parseInt(env.RETRY_DELAY_MS) : undefined;

        hansard = await fetchHansardJSON(body.sittingDate, {
          baseUrl,
          maxRetries,
          retryDelay,
        });

        // Cache raw hansard if Redis available
        if (env.REDIS) {
          const ttl = env.CACHE_TTL_SECONDS ? parseInt(env.CACHE_TTL_SECONDS) : undefined;
          await cacheRawHansard(env.REDIS, sittingDate, hansard, ttl);
        }
      }
    } else {
      // Should never reach here due to validation above
      throw new Error("Invalid request state");
    }

    // Check if already processed (unless force refresh)
    if (!body.forceRefresh && env.REDIS && body.transcriptId) {
      const cached = await getCachedProcessedTranscript(env.REDIS, body.transcriptId);
      if (cached) {
        const processingTime = Date.now() - startTime;

        const response: IngestResponse = {
          success: true,
          transcript_id: cached.transcript_id,
          sitting_date: cached.sitting_date,
          speakers: cached.speakers,
          topics: cached.topics,
          segments_count: cached.segments.length,
          metadata: {
            total_words: cached.metadata.total_words,
            processing_time_ms: processingTime,
            cached: true,
          },
        };

        return new Response(JSON.stringify(response), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      }
    }

    // Process Hansard JSON
    const transcript = processHansardJSON(hansard, body.transcriptId);

    // Store in R2 (unless skipStorage flag)
    let storageUrls: { raw: string; processed: string } | undefined;
    if (!body.skipStorage && env.R2) {
      storageUrls = await storeTranscripts(env.R2, hansard, transcript);
    }

    // Cache processed transcript
    if (env.REDIS) {
      const ttl = env.CACHE_TTL_SECONDS ? parseInt(env.CACHE_TTL_SECONDS) : undefined;
      await cacheProcessedTranscript(env.REDIS, transcript, ttl);
    }

    const processingTime = Date.now() - startTime;

    // Build response
    const response: IngestResponse = {
      success: true,
      transcript_id: transcript.transcript_id,
      sitting_date: transcript.sitting_date,
      speakers: transcript.speakers,
      topics: transcript.topics,
      segments_count: transcript.segments.length,
      metadata: {
        total_words: transcript.metadata.total_words,
        processing_time_ms: processingTime,
        cached: fromCache,
        storage_urls: storageUrls,
      },
    };

    return new Response(JSON.stringify(response), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (error) {
    const errorMessage = (error as Error).message;
    const processingTime = Date.now() - startTime;

    const response: IngestResponse = {
      success: false,
      transcript_id: "",
      sitting_date: "",
      speakers: [],
      topics: [],
      segments_count: 0,
      metadata: {
        total_words: 0,
        processing_time_ms: processingTime,
        cached: false,
      },
      error: errorMessage,
    };

    return new Response(JSON.stringify(response), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
}

/**
 * Health check endpoint
 */
function handleHealthCheck(): Response {
  return new Response(
    JSON.stringify({
      status: "ok",
      service: "capless-ingest",
      version: "1.0.0",
      timestamp: new Date().toISOString(),
    }),
    {
      status: 200,
      headers: { "Content-Type": "application/json" },
    }
  );
}

/**
 * Main Worker export
 */
export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    // CORS headers
    const corsHeaders = {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
    };

    // Handle CORS preflight
    if (request.method === "OPTIONS") {
      return new Response(null, {
        status: 204,
        headers: corsHeaders,
      });
    }

    // Route requests
    if (url.pathname === "/health" && request.method === "GET") {
      const response = handleHealthCheck();
      return new Response(response.body, {
        status: response.status,
        headers: { ...Object.fromEntries(response.headers), ...corsHeaders },
      });
    }

    if (url.pathname === "/api/ingest/hansard" && request.method === "POST") {
      const response = await handleIngest(request, env);
      return new Response(response.body, {
        status: response.status,
        headers: { ...Object.fromEntries(response.headers), ...corsHeaders },
      });
    }

    // 404 for unknown routes
    return new Response(
      JSON.stringify({
        error: "Not Found",
        available_endpoints: [
          "GET /health",
          "POST /api/ingest/hansard",
        ],
      }),
      {
        status: 404,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      }
    );
  },
};
