import type OpenAI from 'openai';
import type {
  ProcessedTranscript,
  TranscriptSegment,
  ViralMoment,
  AIAnalysis,
  ExtractionCriteria,
  ExtractionResult,
  ExtractionStatistics,
} from './types';
import { AIAnalysisSchema } from './types';
import { ViralityScorer } from './scorer';
import { z } from 'zod';

/**
 * MomentExtractor uses OpenAI to identify viral moments from transcripts
 */
export class MomentExtractor {
  private openai: OpenAI;
  private model: string;
  private scorer: ViralityScorer;

  constructor(openai: OpenAI, model: string = 'gpt-4o') {
    this.openai = openai;
    this.model = model;
    this.scorer = new ViralityScorer();
  }

  /**
   * Generate AI prompt for moment extraction
   */
  generatePrompt(transcript: ProcessedTranscript): string {
    const segmentsText = transcript.segments
      .map((seg, idx) => `[${idx}] ${seg.speaker}: ${seg.text}`)
      .join('\n\n');

    return `You are a content strategist for viral social media analyzing Singapore Parliament proceedings.

Analyze this parliamentary exchange and identify moments with viral potential:

${segmentsText}

For each viral moment, identify:
1. The exact quote (15-40 words optimal, max 300 characters)
2. The speaker
3. Why it's viral-worthy
4. Virality score (0-10, be generous - we want shareable content)
5. Primary topic/theme
6. Emotional tone (e.g., defensive, evasive, bureaucratic, angry, confused)
7. Target demographic (e.g., Gen Z, working class, families, elderly)
8. Whether it contains bureaucratic jargon (true/false)
9. Whether it contains contradictions or illogical reasoning (true/false)
10. Whether it affects everyday Singaporeans (true/false)
11. The segment indices this moment spans (array of numbers from the [idx] markers)

Look for moments that are:
- Bureaucratic doublespeak or dense jargon
- Contradictions or illogical reasoning
- Statements affecting everyday Singaporeans (healthcare, housing, transport, cost of living)
- Memorable soundbites or quotable phrases
- Moments that make people say "What?!" or "Seriously?!"
- Defensive or evasive responses to direct questions
- Out-of-touch statements from officials

Return ONLY a JSON array of moments, sorted by virality score (highest first). Each object should have these exact fields:
- quote (string)
- speaker (string)
- why_viral (string)
- ai_score (number, 0-10)
- topic (string)
- emotional_tone (string)
- target_demographic (string)
- contains_jargon (boolean)
- has_contradiction (boolean)
- affects_everyday_life (boolean)
- segment_indices (array of numbers)

Example:
[
  {
    "quote": "The increase is modest when you factor in the comprehensive coverage enhancement package.",
    "speaker": "Minister Tan",
    "why_viral": "Dense bureaucratic jargon obscures what should be a simple answer about premium increases",
    "ai_score": 8.5,
    "topic": "Healthcare",
    "emotional_tone": "defensive",
    "target_demographic": "working class",
    "contains_jargon": true,
    "has_contradiction": false,
    "affects_everyday_life": true,
    "segment_indices": [3]
  }
]`;
  }

  /**
   * Extract context from surrounding segments
   */
  extractContext(
    segments: TranscriptSegment[],
    targetIndex: number,
    contextWindow: number = 1
  ): { before: string; after: string } {
    const beforeSegments = segments.slice(
      Math.max(0, targetIndex - contextWindow),
      targetIndex
    );

    const afterSegments = segments.slice(
      targetIndex + 1,
      Math.min(segments.length, targetIndex + 1 + contextWindow)
    );

    const before = beforeSegments
      .map(seg => `${seg.speaker}: ${seg.text}`)
      .join(' ');

    const after = afterSegments
      .map(seg => `${seg.speaker}: ${seg.text}`)
      .join(' ');

    return { before, after };
  }

  /**
   * Generate embedding for a moment using OpenAI
   */
  async generateEmbedding(text: string): Promise<number[]> {
    const response = await this.openai.embeddings.create({
      model: 'text-embedding-3-small',
      input: text,
    });

    return response.data[0]?.embedding ?? [];
  }

  /**
   * Parse and validate AI response
   */
  private parseAIResponse(content: string): AIAnalysis[] {
    try {
      const parsed = JSON.parse(content);
      const analyses = Array.isArray(parsed) ? parsed : [parsed];

      // Validate each analysis
      return analyses
        .map(item => {
          try {
            return AIAnalysisSchema.parse(item);
          } catch (error) {
            console.error('Invalid AI analysis item:', error);
            return null;
          }
        })
        .filter((item): item is AIAnalysis => item !== null);
    } catch (error) {
      console.error('Failed to parse AI response:', error);
      return [];
    }
  }

  /**
   * Convert AI analysis to ViralMoment
   */
  private async convertToMoment(
    analysis: AIAnalysis,
    transcript: ProcessedTranscript
  ): Promise<ViralMoment> {
    // Calculate final virality score
    const viralityScore = this.scorer.calculateFinalScore(analysis);

    // Get the main segment index
    const mainSegmentIdx = analysis.segment_indices[0] ?? 0;

    // Extract context
    const context = this.extractContext(transcript.segments, mainSegmentIdx, 1);

    // Get segment IDs
    const segmentIds = analysis.segment_indices
      .map(idx => transcript.segments[idx]?.segment_id)
      .filter((id): id is string => id !== undefined);

    // Generate embedding
    const embedding = await this.generateEmbedding(analysis.quote);

    const moment: ViralMoment = {
      moment_id: `moment-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      quote: analysis.quote,
      speaker: analysis.speaker,
      timestamp_start: transcript.segments[mainSegmentIdx]?.timestamp_start,
      timestamp_end: transcript.segments[mainSegmentIdx]?.timestamp_end,
      context_before: context.before,
      context_after: context.after,
      virality_score: viralityScore,
      why_viral: analysis.why_viral,
      topic: analysis.topic,
      emotional_tone: analysis.emotional_tone,
      target_demographic: analysis.target_demographic,
      embedding,
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
   * Extract viral moments from a transcript
   */
  async extractMoments(
    transcript: ProcessedTranscript,
    criteria?: ExtractionCriteria
  ): Promise<ExtractionResult> {
    const minScore = criteria?.min_score ?? 5.0;
    const maxResults = criteria?.max_results ?? 20;

    // Generate prompt
    const prompt = this.generatePrompt(transcript);

    // Call OpenAI
    const response = await this.openai.chat.completions.create({
      model: this.model,
      messages: [
        {
          role: 'system',
          content: 'You are an expert at identifying viral-worthy moments in political discourse. Return only valid JSON.',
        },
        {
          role: 'user',
          content: prompt,
        },
      ],
      temperature: 0.7,
      max_tokens: 2000,
    });

    const content = response.choices[0]?.message?.content;
    if (!content) {
      throw new Error('No response from OpenAI');
    }

    // Parse AI response
    const analyses = this.parseAIResponse(content);

    // Convert to moments with embeddings
    const allMoments = await Promise.all(
      analyses.map(analysis => this.convertToMoment(analysis, transcript))
    );

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

  /**
   * Analyze a single moment for virality
   */
  async analyzeMoment(text: string, context?: string, speaker?: string): Promise<{
    virality_score: number;
    topics: string[];
    emotions: string[];
    controversy_level: number;
  }> {
    const prompt = `Analyze this quote from Singapore Parliament for viral potential:

Quote: "${text}"
${context ? `Context: ${context}` : ''}
${speaker ? `Speaker: ${speaker}` : ''}

Return JSON with:
- virality_score (0-10)
- topics (array of strings)
- emotions (array of strings like "defensive", "evasive", etc.)
- controversy_level (0-10)`;

    const response = await this.openai.chat.completions.create({
      model: this.model,
      messages: [
        {
          role: 'system',
          content: 'You are an expert at analyzing political discourse. Return only valid JSON.',
        },
        {
          role: 'user',
          content: prompt,
        },
      ],
      temperature: 0.7,
      max_tokens: 500,
    });

    const content = response.choices[0]?.message?.content;
    if (!content) {
      throw new Error('No response from OpenAI');
    }

    return JSON.parse(content);
  }
}
