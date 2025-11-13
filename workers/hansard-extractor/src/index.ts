/**
 * Cloudflare Worker for historical Hansard moment extraction
 * Uses Queue for job distribution and Durable Objects for checkpointing
 */

import { fetchHansard, chunkBySections } from './lib/chunking';
import {
  extractMomentsWithRetry,
  semanticDeduplication,
  globalReranking,
  type Moment,
  type ConsolidationStats,
} from './lib/extraction';

export interface Env {
  OPENAI_API_KEY: string;
  CAPLESS_R2: R2Bucket;
  HANSARD_QUEUE: Queue<SessionJob>;
  CHECKPOINT: DurableObjectNamespace;
}

export interface SessionJob {
  date: string;
  retry_count?: number;
}

export interface ExtractionResult {
  date: string;
  model: string;
  extracted_at: string;
  format: string;
  extraction_strategy: string;
  chunks_processed: number;
  chunks_metadata: any[];
  raw_moments_by_chunk: any[];
  consolidation_stats: ConsolidationStats;
  deduplication_decisions: any[];
  moments: Moment[];
}

/**
 * Main Worker: Handles HTTP requests and Queue consumers
 */
export default {
  /**
   * HTTP handler - for triggering extractions manually
   */
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    // Health check
    if (url.pathname === '/health') {
      return new Response('OK', { status: 200 });
    }

    // Trigger extraction for a specific date
    if (url.pathname === '/extract' && request.method === 'POST') {
      const body = await request.json() as { date: string };

      await env.HANSARD_QUEUE.send({
        date: body.date,
        retry_count: 0
      });

      return Response.json({
        success: true,
        message: `Queued extraction for ${body.date}`
      });
    }

    // Trigger full historical extraction
    if (url.pathname === '/extract-all' && request.method === 'POST') {
      const body = await request.json() as {
        start_date?: string;
        end_date?: string;
        dates?: string[];
      };

      let dates: string[];

      if (body.dates) {
        dates = body.dates;
      } else {
        // TODO: Fetch all sitting dates from Parliament API
        // For now, generate a range
        dates = generateDateRange(
          body.start_date || '2024-01-01',
          body.end_date || '2025-09-22'
        );
      }

      // Send all dates to queue
      await env.HANSARD_QUEUE.sendBatch(
        dates.map(date => ({ body: { date, retry_count: 0 } }))
      );

      return Response.json({
        success: true,
        message: `Queued ${dates.length} sessions for extraction`,
        dates_count: dates.length
      });
    }

    // Get extraction status
    if (url.pathname === '/status') {
      const id = env.CHECKPOINT.idFromName('global');
      const checkpoint = env.CHECKPOINT.get(id);
      const status = await checkpoint.fetch(new Request('http://internal/status'));
      return status;
    }

    return new Response('Not Found', { status: 404 });
  },

  /**
   * Queue consumer - processes individual session extractions
   */
  async queue(batch: MessageBatch<SessionJob>, env: Env): Promise<void> {
    for (const message of batch.messages) {
      try {
        const { date, retry_count = 0 } = message.body;

        console.log(`📅 Processing ${date} (attempt ${retry_count + 1})...`);

        // Check if already processed (ONLY check new path - we're re-extracting ALL sessions)
        const newPath = await env.CAPLESS_R2.get(`hansard/moments/${date}.json`);

        if (newPath) {
          console.log(`⏭️  Skipping ${date} (already exists in new path)`);
          message.ack();
          continue;
        }

        // Extract moments for this session
        const result = await extractSession(date, env);

        if (result) {
          // Upload to R2
          await env.CAPLESS_R2.put(
            `hansard/moments/${date}.json`,
            JSON.stringify(result, null, 2),
            {
              httpMetadata: { contentType: 'application/json' }
            }
          );

          // Update checkpoint
          const id = env.CHECKPOINT.idFromName('global');
          const checkpoint = env.CHECKPOINT.get(id);
          await checkpoint.fetch(new Request('http://internal/complete', {
            method: 'POST',
            body: JSON.stringify({ date, success: true })
          }));

          console.log(`✅ ${date}: ${result.moments.length} moments extracted and saved`);
          message.ack();

        } else {
          throw new Error('Extraction failed');
        }

      } catch (error) {
        console.error(`❌ Error processing ${message.body.date}: ${error}`);

        const retryCount = message.body.retry_count || 0;

        if (retryCount < 3) {
          // Retry with exponential backoff
          message.retry({ delaySeconds: Math.pow(2, retryCount) });
        } else {
          // Record failure
          const id = env.CHECKPOINT.idFromName('global');
          const checkpoint = env.CHECKPOINT.get(id);
          await checkpoint.fetch(new Request('http://internal/complete', {
            method: 'POST',
            body: JSON.stringify({
              date: message.body.date,
              success: false,
              error: String(error)
            })
          }));
          message.ack();
        }
      }
    }
  }
};

// REMOVED: No longer needed, get from API metadata

/**
 * Extract moments from a single session
 */
async function extractSession(
  date: string,
  env: Env
): Promise<ExtractionResult | null> {
  console.log(`\n${'='.repeat(60)}`);
  console.log(`HANSARD MOMENT EXTRACTION`);
  console.log(`Date: ${date}`);
  console.log(`${'='.repeat(60)}\n`);

  // Fetch Hansard data from R2 to get parliament metadata
  const hansardData = await fetchHansard(date, env.CAPLESS_R2);
  if (!hansardData) {
    console.error('❌ Failed to fetch Hansard from R2');
    return null;
  }

  // Extract parliament info from API metadata
  const parliamentNumber = hansardData.metadata?.parlimentNO || 0; // Note: API typo
  const sessionNumber = hansardData.metadata?.sessionNO;
  const sittingNumber = hansardData.metadata?.sittingNO;
  const dateDisplay = hansardData.metadata?.dateToDisplay;

  // Convert DD-MM-YYYY to session_id format (parliament-YYYY-MM-DD)
  const [dd, mm, yyyy] = date.split('-');
  const sessionId = `parliament-${yyyy}-${mm}-${dd}`;

  console.log(`Session: ${sessionId}, Parliament: ${parliamentNumber}, Session: ${sessionNumber}, Sitting: ${sittingNumber}`);

  // Calculate total length
  const sections = hansardData.takesSectionVOList || [];
  const totalChars = sections.reduce((sum, s) => {
    const text = s.content || '';
    return sum + text.replace(/<[^<]+?>/g, '').replace(/\s+/g, ' ').trim().length;
  }, 0);

  console.error(`📊 Total content: ${totalChars.toLocaleString()} chars across ${sections.length} sections\n`);

  // Chunk by sections
  const chunks = chunkBySections(hansardData);
  console.error(`📦 Created ${chunks.length} chunks (section-aware)`);

  for (const chunk of chunks) {
    const sectionsStr = chunk.metadata.sections.join(', ');
    const titlePreview = chunk.metadata.section_titles[0] || 'N/A';
    console.error(`  • ${chunk.metadata.chunk_id}: sections ${sectionsStr} | ${titlePreview}... | ${chunk.metadata.char_count.toLocaleString()} chars`);
  }
  console.error('');

  // Stage 1: Extract moments from each chunk
  const allMoments: Moment[] = [];
  const rawMomentsByChunk: any[] = [];

  for (let i = 0; i < chunks.length; i++) {
    const chunk = chunks[i];
    console.error(`🔄 Processing chunk ${i + 1}/${chunks.length} (${chunk.text.length.toLocaleString()} chars)...`);

    const moments = await extractMomentsWithRetry(
      chunk.text,
      chunk.metadata,
      env.OPENAI_API_KEY
    );

    if (moments && moments.length > 0) {
      rawMomentsByChunk.push({
        chunk_id: chunk.metadata.chunk_id,
        moments_count: moments.length,
        moments
      });

      allMoments.push(...moments);
      console.error(`  ✅ Extracted ${moments.length} moments`);
    } else {
      console.error(`  ⚠️  No moments extracted`);
    }

    // Rate limiting between chunks
    if (i < chunks.length - 1) {
      console.error(`  ⏳ Waiting 2s before next chunk...`);
      await sleep(2000);
    }

    console.error('');
  }

  if (allMoments.length === 0) {
    console.error('❌ No moments extracted from any chunk');
    return null;
  }

  console.error(`✅ Stage 1 complete: ${allMoments.length} candidate moments from ${chunks.length} chunks\n`);

  // Stage 2: Consolidation
  console.error(`${'='.repeat(60)}`);
  console.error('📊 STAGE 2: CONSOLIDATION');
  console.error(`${'='.repeat(60)}`);

  // Semantic deduplication
  const { unique: semanticallyUnique, decisions: dedupDecisions } =
    await semanticDeduplication(allMoments, env.OPENAI_API_KEY, 0.85);

  // Global reranking
  const finalMoments = await globalReranking(semanticallyUnique, env.OPENAI_API_KEY);

  // NEW: Add session metadata to all moments (from API metadata)
  for (const moment of finalMoments) {
    moment.date = date;
    moment.session_id = sessionId;
    moment.parliament_number = parliamentNumber;  // From API metadata.parlimentNO
    // youtube field stays undefined (populated by separate worker)
  }

  // Consolidation stats
  const consolidationStats: ConsolidationStats = {
    total_candidates_extracted: allMoments.length,
    semantic_duplicates_removed: allMoments.length - semanticallyUnique.length,
    final_moments_count: finalMoments.length,
    avg_initial_score: allMoments.length > 0
      ? allMoments.reduce((sum, m) => sum + (m.viral_score || 7.0), 0) / allMoments.length
      : 0,
    avg_final_score: finalMoments.length > 0
      ? finalMoments.reduce((sum, m) => sum + (m.final_score || m.viral_score || 7.0), 0) / finalMoments.length
      : 0,
    top_moment_score: finalMoments.length > 0
      ? (finalMoments[0].final_score || finalMoments[0].viral_score || 0)
      : 0
  };

  console.error('');
  console.error('✅ Consolidation complete:');
  console.error(`   • ${allMoments.length} candidates → ${semanticallyUnique.length} unique → ${finalMoments.length} ranked`);
  console.error(`   • Removed ${allMoments.length - semanticallyUnique.length} semantic duplicates`);
  console.error(`   • Avg score: ${consolidationStats.avg_initial_score.toFixed(2)} → ${consolidationStats.avg_final_score.toFixed(2)}`);
  console.error('');

  // Prepare output
  return {
    date,
    model: 'gpt-5-mini',
    extracted_at: new Date().toISOString(),
    format: 'NEW_STRUCTURED_FORMAT_V2_WITH_CONSOLIDATION',
    extraction_strategy: 'section_aware_chunked_v2_with_consolidation',
    chunks_processed: chunks.length,
    chunks_metadata: chunks.map(c => c.metadata),
    raw_moments_by_chunk: rawMomentsByChunk,
    consolidation_stats: consolidationStats,
    deduplication_decisions: dedupDecisions.slice(0, 50),
    moments: finalMoments
  };
}

/**
 * Helper: Generate date range (placeholder)
 */
function generateDateRange(start: string, end: string): string[] {
  // TODO: Implement proper date range generation
  // For now, return a sample
  return ['2025-09-22'];
}

/**
 * Helper: Sleep function
 */
function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Durable Object for checkpoint management
 */
export class Checkpoint implements DurableObject {
  private state: DurableObjectState;
  private completed: Set<string>;
  private failed: Map<string, string>;

  constructor(state: DurableObjectState) {
    this.state = state;
    this.completed = new Set();
    this.failed = new Map();
  }

  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);

    // Initialize from storage
    if (this.completed.size === 0) {
      const stored = await this.state.storage.get<{
        completed: string[];
        failed: [string, string][];
      }>('checkpoint');

      if (stored) {
        this.completed = new Set(stored.completed);
        this.failed = new Map(stored.failed);
      }
    }

    // Get status
    if (url.pathname === '/status') {
      return Response.json({
        completed: Array.from(this.completed),
        failed: Object.fromEntries(this.failed),
        total_completed: this.completed.size,
        total_failed: this.failed.size
      });
    }

    // Mark as complete
    if (url.pathname === '/complete' && request.method === 'POST') {
      const body = await request.json() as {
        date: string;
        success: boolean;
        error?: string;
      };

      if (body.success) {
        this.completed.add(body.date);
      } else {
        this.failed.set(body.date, body.error || 'Unknown error');
      }

      // Persist to storage
      await this.state.storage.put('checkpoint', {
        completed: Array.from(this.completed),
        failed: Array.from(this.failed)
      });

      return Response.json({ success: true });
    }

    return new Response('Not Found', { status: 404 });
  }
}
