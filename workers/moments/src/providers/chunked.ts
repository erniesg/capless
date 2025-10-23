import type {
  ProcessedTranscript,
  TranscriptSegment,
  ExtractionCriteria,
  ExtractionResult,
  ViralMoment,
  ExtractionStatistics,
} from '../types';
import { MomentExtractor } from '../extractor';

/**
 * ChunkedExtractor splits large transcripts into smaller chunks for processing
 * Use this when transcript exceeds both Claude and Gemini limits
 */
export class ChunkedExtractor {
  private extractor: MomentExtractor;
  private chunkSize: number;

  constructor(
    anthropicApiKey: string,
    model: string = 'claude-haiku-4-5-20251001',
    chunkSize: number = 5000
  ) {
    this.extractor = new MomentExtractor(anthropicApiKey, model, true);
    this.chunkSize = chunkSize;
  }

  /**
   * Split transcript into chunks that fit within Claude's context window
   */
  private chunkTranscript(transcript: ProcessedTranscript): ProcessedTranscript[] {
    const chunks: ProcessedTranscript[] = [];
    const segments = transcript.segments;

    for (let i = 0; i < segments.length; i += this.chunkSize) {
      const chunkSegments = segments.slice(i, i + this.chunkSize);

      chunks.push({
        ...transcript,
        transcript_id: `${transcript.transcript_id}-chunk-${Math.floor(i / this.chunkSize)}`,
        segments: chunkSegments,
      });
    }

    return chunks;
  }

  /**
   * Merge moments from multiple chunks, removing duplicates
   */
  private mergeMoments(results: ExtractionResult[]): ExtractionResult {
    const allMoments: ViralMoment[] = [];
    const seenQuotes = new Set<string>();

    // Collect all unique moments
    for (const result of results) {
      for (const moment of result.moments) {
        // Use quote as unique identifier
        const quoteKey = moment.quote.toLowerCase().trim();

        if (!seenQuotes.has(quoteKey)) {
          seenQuotes.add(quoteKey);
          allMoments.push(moment);
        }
      }
    }

    // Sort by virality score (highest first)
    allMoments.sort((a, b) => b.virality_score - a.virality_score);

    // Calculate merged statistics
    const totalSegments = results.reduce((sum, r) => sum + r.statistics.total_segments_analyzed, 0);
    const topics: Record<string, number> = {};
    const speakers: Record<string, number> = {};
    const emotionalTones: Record<string, number> = {};

    allMoments.forEach(moment => {
      topics[moment.topic] = (topics[moment.topic] ?? 0) + 1;
      speakers[moment.speaker] = (speakers[moment.speaker] ?? 0) + 1;
      emotionalTones[moment.emotional_tone] = (emotionalTones[moment.emotional_tone] ?? 0) + 1;
    });

    const avgScore =
      allMoments.length > 0
        ? allMoments.reduce((sum, m) => sum + m.virality_score, 0) / allMoments.length
        : 0;

    const statistics: ExtractionStatistics = {
      total_segments_analyzed: totalSegments,
      moments_found: allMoments.length,
      avg_virality_score: avgScore,
      topics,
      speakers,
      emotional_tones: emotionalTones,
    };

    return {
      transcript_id: results[0].transcript_id.replace(/-chunk-\d+$/, ''),
      moments: allMoments,
      top_moment: allMoments[0],
      statistics,
      processed_at: new Date().toISOString(),
      model_used: results[0].model_used + ' (chunked)',
    };
  }

  /**
   * Extract moments from a large transcript using chunking strategy
   */
  async extractMoments(
    transcript: ProcessedTranscript,
    criteria?: ExtractionCriteria
  ): Promise<ExtractionResult> {
    console.log(
      `[ChunkedExtractor] Processing ${transcript.segments.length} segments in chunks of ${this.chunkSize}`
    );

    // Split into chunks
    const chunks = this.chunkTranscript(transcript);
    console.log(`[ChunkedExtractor] Split into ${chunks.length} chunks`);

    // Limit moments per chunk to prevent token overflow
    const chunkCriteria: ExtractionCriteria = {
      ...criteria,
      max_results: 10, // Limit to 10 moments per chunk
    };

    // Process each chunk
    const results: ExtractionResult[] = [];
    for (let i = 0; i < chunks.length; i++) {
      console.log(`[ChunkedExtractor] Processing chunk ${i + 1}/${chunks.length}...`);

      try {
        const result = await this.extractor.extractMoments(chunks[i], chunkCriteria);
        results.push(result);
        console.log(`[ChunkedExtractor] Chunk ${i + 1} found ${result.moments.length} moments`);
      } catch (error) {
        console.error(`[ChunkedExtractor] Error processing chunk ${i + 1}:`, error);
        // Continue with other chunks
      }
    }

    // Merge results
    const merged = this.mergeMoments(results);
    console.log(`[ChunkedExtractor] Total moments after merging: ${merged.moments.length}`);

    return merged;
  }
}
