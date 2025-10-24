/**
 * Parliament Chat Worker
 *
 * RAG-based chat interface for parliamentary session transcripts
 *
 * Endpoints:
 * - POST /chat - Ask questions about a session
 * - POST /embed-session - Embed a session transcript
 * - GET /session/:date/status - Check embedding status
 * - POST /bulk-embed - Embed multiple sessions
 * - GET /health - Health check
 */

import type { Env, SessionStatus } from './types';
import {
  ChatRequestSchema,
  EmbedSessionRequestSchema,
  BulkEmbedRequestSchema,
} from './types';
import { chat, vectorSearch, generateAnswerStream } from './chat-service';
import {
  embedChunks,
  storeEmbeddings,
  markSessionEmbedded,
  isSessionEmbedded,
} from './embedding-service';
import {
  loadSessionFromR2,
  parseTranscript,
  chunkTranscript,
} from './transcript-loader';

/**
 * CORS headers
 */
const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

/**
 * JSON response helper
 */
function jsonResponse(data: unknown, status: number = 200): Response {
  return new Response(JSON.stringify(data, null, 2), {
    status,
    headers: {
      ...CORS_HEADERS,
      'Content-Type': 'application/json',
    },
  });
}

/**
 * Error response helper
 */
function errorResponse(message: string, status: number = 500): Response {
  return jsonResponse(
    {
      error: true,
      message,
    },
    status
  );
}

/**
 * Main worker
 */
export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    // Handle CORS preflight
    if (request.method === 'OPTIONS') {
      return new Response(null, { headers: CORS_HEADERS });
    }

    try {
      // POST /chat - Ask a question about a session
      if (url.pathname === '/chat' && request.method === 'POST') {
        const body = await request.json();

        // Validate request
        const validation = ChatRequestSchema.safeParse(body);
        if (!validation.success) {
          return errorResponse(
            `Invalid request: ${validation.error.errors.map(e => e.message).join(', ')}`,
            400
          );
        }

        const { session_date, question, max_results } = validation.data;

        // Check if session is embedded
        const status = await isSessionEmbedded(env.KV, session_date);
        if (!status.embedded) {
          return errorResponse(
            `Session ${session_date} is not embedded yet. Use POST /embed-session to embed it first.`,
            404
          );
        }

        // Generate answer
        const response = await chat(env, question, session_date, max_results);

        return jsonResponse(response);
      }

      // POST /chat-stream - Ask a question with streaming response
      if (url.pathname === '/chat-stream' && request.method === 'POST') {
        const body = await request.json();

        // Validate request
        const validation = ChatRequestSchema.safeParse(body);
        if (!validation.success) {
          return errorResponse(
            `Invalid request: ${validation.error.errors.map(e => e.message).join(', ')}`,
            400
          );
        }

        const { session_date, question, max_results } = validation.data;

        // Check if session is embedded
        const status = await isSessionEmbedded(env.KV, session_date);
        if (!status.embedded) {
          return errorResponse(
            `Session ${session_date} is not embedded yet. Use POST /embed-session to embed it first.`,
            404
          );
        }

        // Step 1: Vector search for relevant chunks
        const searchResults = await vectorSearch(env, question, session_date, max_results || 5);

        if (searchResults.length === 0) {
          return jsonResponse({
            error: true,
            message: `I couldn't find any relevant information in the ${session_date} parliamentary session transcript.`,
          });
        }

        // Step 2: Build context from search results
        const contextParts = searchResults.map((result, index) => {
          const speaker = result.metadata.speaker ? `[${result.metadata.speaker}]` : '[Unknown Speaker]';
          const section = result.metadata.section_title ? `\nSection: ${result.metadata.section_title}` : '';

          return `--- Source ${index + 1} (Confidence: ${(result.score * 100).toFixed(1)}%) ---
${speaker}${section}
${result.metadata.text}
`;
        });
        const context = contextParts.join('\n');

        // Step 3: Generate streaming answer
        const { stream, model } = await generateAnswerStream(env, question, context, session_date);

        // Return the stream with CORS headers
        const response = new Response(stream.body, {
          headers: {
            ...CORS_HEADERS,
            'Content-Type': 'text/plain; charset=utf-8',
            'X-Model-Used': model,
            'X-Citations-Count': searchResults.length.toString(),
          },
        });

        return response;
      }

      // POST /embed-session - Embed a single session
      if (url.pathname === '/embed-session' && request.method === 'POST') {
        const body = await request.json();

        // Validate request
        const validation = EmbedSessionRequestSchema.safeParse(body);
        if (!validation.success) {
          return errorResponse(
            `Invalid request: ${validation.error.errors.map(e => e.message).join(', ')}`,
            400
          );
        }

        const { session_date, force } = validation.data;

        // Check if already embedded
        if (!force) {
          const status = await isSessionEmbedded(env.KV, session_date);
          if (status.embedded) {
            return jsonResponse({
              message: `Session ${session_date} is already embedded`,
              chunk_count: status.chunk_count,
              embedded_at: status.embedded_at,
            });
          }
        }

        // Load transcript from R2
        const hansard = await loadSessionFromR2(env.R2, session_date);
        if (!hansard) {
          return errorResponse(`Session ${session_date} not found in R2 storage`, 404);
        }

        // Parse transcript
        const segments = parseTranscript(hansard);
        if (segments.length === 0) {
          return errorResponse(`Session ${session_date} has no parseable content`, 400);
        }

        // STRATEGY 3: Fixed-Size Chunks with Overlap
        // Split into manageable chunks (500 tokens max, 50 token overlap)
        // This preserves context while staying within embedding model limits
        const chunks = chunkTranscript(segments, 500, 50);

        console.log(`[Embed] Created ${chunks.length} chunks from ${segments.length} segments`);

        // Generate embeddings for all chunks
        const embeddedChunks = await embedChunks(env, session_date, chunks);

        // Store in Vectorize
        await storeEmbeddings(env.VECTORIZE, embeddedChunks);

        // Mark as embedded in KV
        await markSessionEmbedded(env.KV, session_date, embeddedChunks.length);

        return jsonResponse({
          message: `Session ${session_date} embedded successfully`,
          session_date,
          chunk_count: embeddedChunks.length,
          segment_count: segments.length,
          chunking_strategy: 'fixed-size-with-overlap',
          max_tokens_per_chunk: 500,
          overlap_tokens: 50,
        });
      }

      // GET /session/:date/status - Check if session is embedded
      if (url.pathname.match(/^\/session\/[\d-]+\/status$/) && request.method === 'GET') {
        const sessionDate = url.pathname.split('/')[2];

        // Validate date format
        if (!/^\d{2}-\d{2}-\d{4}$/.test(sessionDate)) {
          return errorResponse('Invalid date format. Use DD-MM-YYYY', 400);
        }

        const status = await isSessionEmbedded(env.KV, sessionDate);

        const response: SessionStatus = {
          session_date: sessionDate,
          is_embedded: status.embedded,
          chunk_count: status.chunk_count,
          embedded_at: status.embedded_at,
        };

        return jsonResponse(response);
      }

      // POST /bulk-embed - Embed multiple sessions
      if (url.pathname === '/bulk-embed' && request.method === 'POST') {
        const body = await request.json();

        // Validate request
        const validation = BulkEmbedRequestSchema.safeParse(body);
        if (!validation.success) {
          return errorResponse(
            `Invalid request: ${validation.error.errors.map(e => e.message).join(', ')}`,
            400
          );
        }

        const { start_date, end_date, limit } = validation.data;

        // List sessions from R2
        const list = await env.R2.list({
          prefix: 'hansard/raw/',
          limit: limit || 10,
        });

        const sessions = list.objects.map(obj =>
          obj.key.replace('hansard/raw/', '').replace('.json', '')
        );

        // Filter by date range if provided
        let filteredSessions = sessions;
        if (start_date || end_date) {
          filteredSessions = sessions.filter(date => {
            if (start_date && date < start_date) return false;
            if (end_date && date > end_date) return false;
            return true;
          });
        }

        // Embed each session
        const results = [];
        for (const sessionDate of filteredSessions) {
          try {
            // Check if already embedded
            const status = await isSessionEmbedded(env.KV, sessionDate);
            if (status.embedded) {
              results.push({
                session_date: sessionDate,
                status: 'already_embedded',
                chunk_count: status.chunk_count,
              });
              continue;
            }

            // Load and embed
            const hansard = await loadSessionFromR2(env.R2, sessionDate);
            if (!hansard) {
              results.push({
                session_date: sessionDate,
                status: 'not_found',
              });
              continue;
            }

            const segments = parseTranscript(hansard);
            if (segments.length === 0) {
              results.push({
                session_date: sessionDate,
                status: 'no_content',
              });
              continue;
            }

            const chunks = chunkTranscript(segments);
            const embeddedChunks = await embedChunks(env, sessionDate, chunks);
            await storeEmbeddings(env.VECTORIZE, embeddedChunks);
            await markSessionEmbedded(env.KV, sessionDate, embeddedChunks.length);

            results.push({
              session_date: sessionDate,
              status: 'embedded',
              chunk_count: embeddedChunks.length,
            });
          } catch (error) {
            results.push({
              session_date: sessionDate,
              status: 'error',
              error: String(error),
            });
          }
        }

        return jsonResponse({
          message: `Bulk embedding complete`,
          total_sessions: filteredSessions.length,
          results,
        });
      }

      // GET /list-sessions - List available sessions
      if (url.pathname === '/list-sessions' && request.method === 'GET') {
        const limitParam = url.searchParams.get('limit');
        const limit = limitParam ? parseInt(limitParam, 10) : 100;

        const list = await env.R2.list({
          prefix: 'hansard/raw/',
          limit,
        });

        const sessions = list.objects.map(obj => ({
          date: obj.key.replace('hansard/raw/', '').replace('.json', ''),
          size: obj.size,
          uploaded: obj.uploaded,
        }));

        return jsonResponse({
          sessions,
          count: sessions.length,
          truncated: list.truncated,
        });
      }

      // GET /debug-vectors - Debug vector search (no filter)
      if (url.pathname === '/debug-vectors' && request.method === 'GET') {
        try {
          // Generate a test embedding
          const testText = ["COE allocation transport"];
          const { embeddings } = await import('./embedding-service').then(m => m.generateEmbeddings(env, testText));

          // Query without filter
          const results = await env.VECTORIZE.query(embeddings[0], {
            topK: 5,
            returnMetadata: 'all',
          });

          return jsonResponse({
            test_query: testText[0],
            results_count: results.matches.length,
            results: results.matches.map(m => ({
              id: m.id,
              score: m.score,
              metadata: m.metadata,
            })),
          });
        } catch (error) {
          return errorResponse(`Debug failed: ${error}`, 500);
        }
      }

      // GET /health - Health check
      if (url.pathname === '/health' && request.method === 'GET') {
        return jsonResponse({
          status: 'healthy',
          service: 'parliament-chat',
          timestamp: new Date().toISOString(),
          bindings: {
            r2: !!env.R2,
            vectorize: !!env.VECTORIZE,
            kv: !!env.KV,
            ai: !!env.AI,
            anthropic: !!env.ANTHROPIC_API_KEY,
            openai: !!env.OPENAI_API_KEY,
          },
        });
      }

      // Root endpoint - API documentation
      if (url.pathname === '/' && request.method === 'GET') {
        return new Response(
          `Parliament Chat API - RAG-based Q&A for Parliamentary Sessions

Endpoints:

POST /chat
  Ask questions about a parliamentary session
  Body: { "session_date": "22-09-2024", "question": "What did the minister say about COEs?", "max_results": 5 }

POST /embed-session
  Embed a session transcript into vector database
  Body: { "session_date": "22-09-2024", "force": false }

GET /session/:date/status
  Check if a session is embedded
  Example: GET /session/22-09-2024/status

POST /bulk-embed
  Embed multiple sessions
  Body: { "start_date": "01-09-2024", "end_date": "30-09-2024", "limit": 10 }

GET /list-sessions
  List available sessions in R2
  Query: ?limit=100

GET /health
  Health check

Example chat request:
curl -X POST https://your-worker.workers.dev/chat \\
  -H "Content-Type: application/json" \\
  -d '{"session_date": "22-09-2024", "question": "What was discussed about transport policy?"}'
`,
          {
            headers: {
              ...CORS_HEADERS,
              'Content-Type': 'text/plain',
            },
          }
        );
      }

      return errorResponse('Not found', 404);
    } catch (error) {
      console.error('[Worker] Error:', error);
      return errorResponse(
        error instanceof Error ? error.message : 'Internal server error',
        500
      );
    }
  },
};
