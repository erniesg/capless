import { z } from 'zod';

/**
 * Transcript segment from Hansard
 */
export const TranscriptSegmentSchema = z.object({
  segment_id: z.string(),
  speaker: z.string(),
  text: z.string(),
  timestamp_start: z.string().optional(),
  timestamp_end: z.string().optional(),
  section_title: z.string().optional(),
  order: z.number(),
});

export type TranscriptSegment = z.infer<typeof TranscriptSegmentSchema>;

/**
 * Processed transcript structure
 */
export const ProcessedTranscriptSchema = z.object({
  transcript_id: z.string(),
  session_id: z.string(),
  date: z.string(),
  title: z.string().optional(),
  segments: z.array(TranscriptSegmentSchema),
  metadata: z.object({
    speakers: z.array(z.string()),
    topics: z.array(z.string()).optional(),
    total_segments: z.number(),
  }),
});

export type ProcessedTranscript = z.infer<typeof ProcessedTranscriptSchema>;

/**
 * Viral moment extracted from transcript
 */
export const ViralMomentSchema = z.object({
  moment_id: z.string(),
  quote: z.string().min(15).max(300), // Quotable length
  speaker: z.string(),
  timestamp_start: z.string().optional(),
  timestamp_end: z.string().optional(),

  // Context for understanding
  context_before: z.string(),
  context_after: z.string(),

  // Analysis metadata
  virality_score: z.number().min(0).max(10),
  why_viral: z.string(),
  topic: z.string(),
  emotional_tone: z.string(),
  target_demographic: z.string(),

  // Technical metadata
  embedding: z.array(z.number()).optional(),
  section_title: z.string().optional(),
  transcript_id: z.string(),
  segment_ids: z.array(z.string()), // IDs of segments in this moment

  // Timestamps
  created_at: z.string(),
});

export type ViralMoment = z.infer<typeof ViralMomentSchema>;

/**
 * AI-generated moment analysis from OpenAI
 */
export const AIAnalysisSchema = z.object({
  quote: z.string(),
  speaker: z.string(),
  why_viral: z.string(),
  ai_score: z.number().min(0).max(10),
  topic: z.string(),
  emotional_tone: z.string(),
  target_demographic: z.string(),
  contains_jargon: z.boolean(),
  has_contradiction: z.boolean(),
  affects_everyday_life: z.boolean(),
  segment_indices: z.array(z.number()), // Which segments this moment spans
});

export type AIAnalysis = z.infer<typeof AIAnalysisSchema>;

/**
 * Extraction criteria for filtering moments
 */
export const ExtractionCriteriaSchema = z.object({
  min_score: z.number().min(0).max(10).default(5.0),
  max_results: z.number().positive().max(50).default(20),
  topics: z.array(z.string()).optional(),
  speakers: z.array(z.string()).optional(),
  require_jargon: z.boolean().optional(),
  require_contradiction: z.boolean().optional(),
});

export type ExtractionCriteria = z.infer<typeof ExtractionCriteriaSchema>;

/**
 * Statistics about extraction results
 */
export const ExtractionStatisticsSchema = z.object({
  total_segments_analyzed: z.number(),
  moments_found: z.number(),
  avg_virality_score: z.number(),
  topics: z.record(z.string(), z.number()),
  speakers: z.record(z.string(), z.number()),
  emotional_tones: z.record(z.string(), z.number()),
});

export type ExtractionStatistics = z.infer<typeof ExtractionStatisticsSchema>;

/**
 * Complete extraction result
 */
export const ExtractionResultSchema = z.object({
  transcript_id: z.string(),
  moments: z.array(ViralMomentSchema),
  top_moment: ViralMomentSchema.optional(),
  statistics: ExtractionStatisticsSchema,
  processed_at: z.string(),
  model_used: z.string(),
});

export type ExtractionResult = z.infer<typeof ExtractionResultSchema>;

/**
 * Request schemas for API endpoints
 */
export const ExtractMomentsRequestSchema = z.object({
  transcript_id: z.string(),
  criteria: ExtractionCriteriaSchema.optional(),
});

export type ExtractMomentsRequest = z.infer<typeof ExtractMomentsRequestSchema>;

export const AnalyzeMomentRequestSchema = z.object({
  moment_text: z.string(),
  context: z.string().optional(),
  speaker: z.string().optional(),
});

export type AnalyzeMomentRequest = z.infer<typeof AnalyzeMomentRequestSchema>;

export const BatchExtractRequestSchema = z.object({
  transcript_ids: z.array(z.string()).min(1).max(10),
  criteria: ExtractionCriteriaSchema.optional(),
});

export type BatchExtractRequest = z.infer<typeof BatchExtractRequestSchema>;

/**
 * Environment bindings for Cloudflare Worker
 */
export interface Env {
  // Secrets
  ANTHROPIC_API_KEY?: string;
  OPENAI_API_KEY?: string;
  UPSTASH_REDIS_REST_URL?: string;
  UPSTASH_REDIS_REST_TOKEN?: string;

  // Bindings
  R2: R2Bucket;
  VECTORIZE: VectorizeIndex;

  // Environment variables
  ENVIRONMENT: string;
  OPENAI_MODEL: string;
  OPENAI_EMBEDDING_MODEL: string;
  MAX_MOMENTS_PER_TRANSCRIPT: string;
  MIN_VIRALITY_SCORE: string;
}

/**
 * Error response schema
 */
export const ErrorResponseSchema = z.object({
  error: z.string(),
  message: z.string(),
  details: z.any().optional(),
});

export type ErrorResponse = z.infer<typeof ErrorResponseSchema>;
