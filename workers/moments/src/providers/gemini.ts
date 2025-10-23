import type {
  ProcessedTranscript,
  TranscriptSegment,
  ExtractionCriteria,
  ExtractionResult,
  ViralMoment,
  ExtractionStatistics,
} from '../types';

/**
 * Gemini-specific analysis result with full_exchange and summary
 */
interface GeminiAnalysis {
  quote: string;
  speaker: string;
  why_viral: string;
  ai_score: number;
  topic: string;
  emotional_tone: string;
  target_demographic: string;
  contains_jargon: boolean;
  has_contradiction: boolean;
  affects_everyday_life: boolean;
  segment_indices: number[];
  full_exchange: string; // Complete conversation context
  summary: string; // Brief summary of what's happening
}

/**
 * GeminiProvider handles large transcripts (up to 1M tokens) using Gemini 2.5 Flash
 */
export class GeminiProvider {
  private apiKey: string;
  private model: string = 'gemini-2.5-flash';

  constructor(apiKey: string) {
    this.apiKey = apiKey;
  }

  /**
   * Generate enhanced prompt with instructions for full_exchange and summary
   */
  private generatePrompt(transcript: ProcessedTranscript): string {
    const segmentsText = transcript.segments
      .map((seg, idx) => `[${idx}] ${seg.speaker}: ${seg.text}`)
      .join('\n\n');

    return `You are a content strategist for viral social media analyzing Singapore Parliament proceedings.

Analyze this parliamentary exchange and identify moments with viral potential - BOTH problematic AND wholesome/positive moments:

${segmentsText}

For each viral moment, you MUST identify:
1. The exact quote (15-40 words optimal, max 300 characters)
2. The speaker
3. Why it's viral-worthy
4. Virality score (0-10, be generous - we want shareable content)
5. Primary topic/theme
6. Emotional tone (e.g., defensive, evasive, bureaucratic, compassionate, inspiring, pragmatic)
7. Target demographic (e.g., Gen Z, working class, families, elderly)
8. Whether it contains bureaucratic jargon (true/false)
9. Whether it contains contradictions or illogical reasoning (true/false)
10. Whether it affects everyday Singaporeans (true/false)
11. The segment indices this moment spans (array of numbers from the [idx] markers)
12. **full_exchange**: The COMPLETE exchange including question + answer + follow-ups (minimum 3-5 segments before and after the key quote)
13. **summary**: A 2-3 sentence summary explaining what's happening, who's asking what, and why it matters

Look for moments that are PROBLEMATIC:
- Bureaucratic doublespeak or dense jargon
- Contradictions or illogical reasoning
- Defensive or evasive responses to direct questions
- Out-of-touch statements from officials
- Moments that make people say "What?!" or "Seriously?!"

Look for moments that are WHOLESOME/POSITIVE:
- Compassionate responses showing empathy for citizens
- Bold policy commitments with clear timelines
- Ministers acknowledging mistakes and taking responsibility
- Pragmatic solutions to real problems
- Inspiring statements about Singapore's future
- Cross-party collaboration and respectful debate
- Direct, honest answers without corporate speak
- Promises of concrete help for struggling Singaporeans

CRITICAL: For each moment, you MUST include the full_exchange and summary fields:
- full_exchange: Extract the complete conversational context (typically 5-10 segments) that includes the setup, question, answer, and any follow-up
- summary: Explain in plain language what's being discussed, why the minister is being questioned, and what makes this moment significant

Return a JSON array of moments, sorted by virality score (highest first).`;
  }

  /**
   * Define Gemini's structured output schema
   */
  private getResponseSchema() {
    return {
      type: 'ARRAY',
      items: {
        type: 'OBJECT',
        properties: {
          quote: { type: 'STRING', description: 'The exact viral quote (15-300 chars)' },
          speaker: { type: 'STRING', description: 'Name of the speaker' },
          why_viral: { type: 'STRING', description: 'Why this moment is viral-worthy' },
          ai_score: { type: 'NUMBER', description: 'Virality score 0-10' },
          topic: { type: 'STRING', description: 'Primary topic (e.g., Housing, Healthcare)' },
          emotional_tone: {
            type: 'STRING',
            description: 'Emotional tone (e.g., defensive, evasive, compassionate)',
          },
          target_demographic: {
            type: 'STRING',
            description: 'Target demographic (e.g., Gen Z, working class)',
          },
          contains_jargon: { type: 'BOOLEAN', description: 'Contains bureaucratic jargon' },
          has_contradiction: {
            type: 'BOOLEAN',
            description: 'Contains contradictions or illogical reasoning',
          },
          affects_everyday_life: {
            type: 'BOOLEAN',
            description: 'Affects everyday Singaporeans',
          },
          segment_indices: {
            type: 'ARRAY',
            items: { type: 'INTEGER' },
            description: 'Segment indices this moment spans',
          },
          full_exchange: {
            type: 'STRING',
            description: 'Complete conversational exchange with context (5-10 segments)',
          },
          summary: {
            type: 'STRING',
            description: '2-3 sentence summary of what is happening and why it matters',
          },
        },
        required: [
          'quote',
          'speaker',
          'why_viral',
          'ai_score',
          'topic',
          'emotional_tone',
          'target_demographic',
          'contains_jargon',
          'has_contradiction',
          'affects_everyday_life',
          'segment_indices',
          'full_exchange',
          'summary',
        ],
      },
    };
  }

  /**
   * Extract timestamps from segment indices
   */
  private getTimestamps(
    segments: TranscriptSegment[],
    indices: number[]
  ): { start: string; end: string } {
    if (indices.length === 0) {
      return { start: '00:00:00', end: '00:00:00' };
    }

    const firstIdx = Math.min(...indices);
    const lastIdx = Math.max(...indices);

    return {
      start: segments[firstIdx]?.timestamp_start || '00:00:00',
      end: segments[lastIdx]?.timestamp_end || '00:00:00',
    };
  }

  /**
   * Calculate final virality score using weighted criteria
   */
  private calculateViralityScore(analysis: GeminiAnalysis): number {
    let score = analysis.ai_score;

    // Boost for jargon (makes it shareable)
    if (analysis.contains_jargon) score += 1;

    // Boost for contradictions (controversy drives engagement)
    if (analysis.has_contradiction) score += 1.5;

    // Boost for everyday impact (relatable content)
    if (analysis.affects_everyday_life) score += 1;

    // Cap at 10
    return Math.min(score, 10);
  }

  /**
   * Convert Gemini analysis to ViralMoment
   */
  private convertToMoment(
    analysis: GeminiAnalysis,
    transcript: ProcessedTranscript
  ): ViralMoment {
    const viralityScore = this.calculateViralityScore(analysis);
    const timestamps = this.getTimestamps(transcript.segments, analysis.segment_indices);

    const segmentIds = analysis.segment_indices
      .map(idx => transcript.segments[idx]?.segment_id)
      .filter((id): id is string => id !== undefined);

    const mainSegmentIdx = analysis.segment_indices[0] ?? 0;

    const moment: ViralMoment = {
      moment_id: `moment-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      quote: analysis.quote,
      speaker: analysis.speaker,
      timestamp_start: timestamps.start,
      timestamp_end: timestamps.end,
      context_before: analysis.full_exchange, // Store full exchange in context_before
      context_after: analysis.summary, // Store summary in context_after
      virality_score: viralityScore,
      why_viral: analysis.why_viral,
      topic: analysis.topic,
      emotional_tone: analysis.emotional_tone,
      target_demographic: analysis.target_demographic,
      embedding: [], // Skip embeddings for now
      section_title: transcript.segments[mainSegmentIdx]?.section_title,
      transcript_id: transcript.transcript_id,
      segment_ids: segmentIds,
      created_at: new Date().toISOString(),
    };

    return moment;
  }

  /**
   * Calculate extraction statistics
   */
  private calculateStatistics(
    moments: ViralMoment[],
    totalSegments: number
  ): ExtractionStatistics {
    const topics: Record<string, number> = {};
    const speakers: Record<string, number> = {};
    const emotionalTones: Record<string, number> = {};

    moments.forEach(moment => {
      topics[moment.topic] = (topics[moment.topic] ?? 0) + 1;
      speakers[moment.speaker] = (speakers[moment.speaker] ?? 0) + 1;
      emotionalTones[moment.emotional_tone] = (emotionalTones[moment.emotional_tone] ?? 0) + 1;
    });

    const avgScore =
      moments.length > 0
        ? moments.reduce((sum, m) => sum + m.virality_score, 0) / moments.length
        : 0;

    return {
      total_segments_analyzed: totalSegments,
      moments_found: moments.length,
      avg_virality_score: avgScore,
      topics,
      speakers,
      emotional_tones: emotionalTones,
    };
  }

  /**
   * Extract viral moments using Gemini 2.5 Flash with structured output
   */
  async extractMoments(
    transcript: ProcessedTranscript,
    criteria?: ExtractionCriteria
  ): Promise<ExtractionResult> {
    const minScore = criteria?.min_score ?? 5.0;
    const maxResults = criteria?.max_results ?? 20;

    console.log(
      `[Gemini] Processing ${transcript.segments.length} segments (estimated ${Math.floor(JSON.stringify(transcript).length / 4)} tokens)`
    );

    // Generate prompt
    const prompt = this.generatePrompt(transcript);

    // Call Gemini API with structured output
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${this.model}:generateContent?key=${this.apiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [
            {
              parts: [{ text: prompt }],
            },
          ],
          generationConfig: {
            temperature: 0.7,
            maxOutputTokens: 8192,
            responseMimeType: 'application/json', // Force JSON output
            responseSchema: this.getResponseSchema(),
          },
        }),
      }
    );

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Gemini API error: ${response.status} ${error}`);
    }

    const data = await response.json();
    const content = data.candidates?.[0]?.content?.parts?.[0]?.text;

    if (!content) {
      throw new Error('No response from Gemini');
    }

    // Parse the structured JSON response
    let analyses: GeminiAnalysis[];
    try {
      analyses = JSON.parse(content);
      if (!Array.isArray(analyses)) {
        throw new Error('Response is not an array');
      }
    } catch (error) {
      console.error('Failed to parse Gemini response:', error);
      console.error('Response content:', content);
      throw new Error(`Invalid JSON from Gemini: ${error}`);
    }

    console.log(`[Gemini] Extracted ${analyses.length} moments from AI`);

    // Convert to moments
    const allMoments = analyses.map(analysis => this.convertToMoment(analysis, transcript));

    // Filter by criteria
    let filteredMoments = allMoments.filter(moment => {
      if (moment.virality_score < minScore) return false;
      if (criteria?.topics && !criteria.topics.includes(moment.topic)) return false;
      if (criteria?.speakers && !criteria.speakers.includes(moment.speaker)) return false;
      return true;
    });

    // Sort by virality score (highest first)
    filteredMoments.sort((a, b) => b.virality_score - a.virality_score);

    // Limit results
    if (filteredMoments.length > maxResults) {
      filteredMoments = filteredMoments.slice(0, maxResults);
    }

    console.log(`[Gemini] Returning ${filteredMoments.length} moments after filtering`);

    // Calculate statistics
    const statistics = this.calculateStatistics(filteredMoments, transcript.segments.length);

    return {
      transcript_id: transcript.transcript_id,
      moments: filteredMoments,
      top_moment: filteredMoments[0],
      statistics,
      processed_at: new Date().toISOString(),
      model_used: this.model,
    };
  }
}
