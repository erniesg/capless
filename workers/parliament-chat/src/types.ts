/**
 * Type definitions for Parliament Chat Worker
 */

import { z } from 'zod';

/**
 * Cloudflare Worker Environment Bindings
 */
export interface Env {
  R2: R2Bucket;
  VECTORIZE: VectorizeIndex;
  KV: KVNamespace;
  ANTHROPIC_API_KEY?: string;
  OPENAI_API_KEY?: string;
  AI?: Ai; // Cloudflare Workers AI binding (optional)
}

/**
 * Hansard JSON structure from parliament-scraper
 */
export interface HansardSession {
  takesSectionVOList?: Array<{
    title?: string;
    content?: string;
    subsections?: Array<{
      title?: string;
      content?: string;
    }>;
  }>;
  // Raw API response may have other fields
  [key: string]: unknown;
}

/**
 * Zod schema for chat request validation
 */
export const ChatRequestSchema = z.object({
  session_date: z.string().regex(/^\d{2}-\d{2}-\d{4}$/, 'Date must be in DD-MM-YYYY format'),
  question: z.string().min(1, 'Question cannot be empty'),
  max_results: z.number().int().positive().max(10).default(5),
});

export type ChatRequest = z.infer<typeof ChatRequestSchema>;

/**
 * Zod schema for embed session request
 */
export const EmbedSessionRequestSchema = z.object({
  session_date: z.string().regex(/^\d{2}-\d{2}-\d{4}$/, 'Date must be in DD-MM-YYYY format'),
  force: z.boolean().default(false), // Force re-embedding
});

export type EmbedSessionRequest = z.infer<typeof EmbedSessionRequestSchema>;

/**
 * Zod schema for bulk embed request
 */
export const BulkEmbedRequestSchema = z.object({
  start_date: z.string().regex(/^\d{2}-\d{2}-\d{4}$/).optional(),
  end_date: z.string().regex(/^\d{2}-\d{2}-\d{4}$/).optional(),
  limit: z.number().int().positive().max(100).default(10),
});

export type BulkEmbedRequest = z.infer<typeof BulkEmbedRequestSchema>;

/**
 * Citation with source information
 */
export interface Citation {
  text: string;
  speaker?: string;
  timestamp?: string;
  youtube_url?: string;
  confidence: number;
  chunk_index: number;
}

/**
 * Chat response with answer and citations
 */
export interface ChatResponse {
  answer: string;
  citations: Citation[];
  session_date: string;
  model_used?: string;
}

/**
 * Embedded chunk stored in vector database
 */
export interface EmbeddedChunk {
  id: string; // Format: {session_date}_{chunk_index}
  session_date: string;
  speaker?: string;
  text: string;
  embedding: number[];
  metadata: ChunkMetadata;
}

/**
 * Metadata for embedded chunks
 */
export interface ChunkMetadata {
  chunk_index: number;
  section_title?: string;
  start_time?: string;
  youtube_timestamp?: string;
  word_count: number;
}

/**
 * Session embedding status
 */
export interface SessionStatus {
  session_date: string;
  is_embedded: boolean;
  chunk_count?: number;
  embedded_at?: string;
  error?: string;
}

/**
 * Vector search result
 */
export interface VectorSearchResult {
  id: string;
  score: number;
  metadata: ChunkMetadata & {
    text: string;
    speaker?: string;
    session_date: string;
  };
}

/**
 * Chunking configuration
 */
export interface ChunkConfig {
  max_tokens: number;
  overlap_tokens: number;
  min_chunk_size: number;
}

export const DEFAULT_CHUNK_CONFIG: ChunkConfig = {
  max_tokens: 500,
  overlap_tokens: 50,
  min_chunk_size: 100,
};
