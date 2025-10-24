/**
 * Embedding Service
 *
 * Generates vector embeddings for text using:
 * - Cloudflare Workers AI (@cf/baai/bge-base-en-v1.5) - primary, free
 * - OpenAI (text-embedding-3-small) - fallback
 */

import type { Env, EmbeddedChunk, ChunkMetadata } from './types';
import type { TranscriptSegment } from './transcript-loader';

/**
 * Embedding provider configuration
 */
export interface EmbeddingProvider {
  name: string;
  dimensions: number;
  maxBatchSize: number;
}

export const CLOUDFLARE_PROVIDER: EmbeddingProvider = {
  name: 'cloudflare',
  dimensions: 768, // BGE-base-en-v1.5 dimension
  maxBatchSize: 100,
};

export const OPENAI_PROVIDER: EmbeddingProvider = {
  name: 'openai',
  dimensions: 1536, // text-embedding-3-small dimension
  maxBatchSize: 100,
};

/**
 * Generate embeddings for text chunks using Cloudflare Workers AI
 */
export async function generateEmbeddingsWithCloudflare(
  ai: Ai,
  texts: string[]
): Promise<number[][]> {
  console.log(`[Embedding] Generating ${texts.length} embeddings with Cloudflare Workers AI`);

  const embeddings: number[][] = [];

  // Process in batches
  const batchSize = CLOUDFLARE_PROVIDER.maxBatchSize;

  for (let i = 0; i < texts.length; i += batchSize) {
    const batch = texts.slice(i, i + batchSize);

    try {
      // Cloudflare Workers AI embedding model
      const result = await ai.run('@cf/baai/bge-base-en-v1.5', {
        text: batch,
      }) as { data: number[][] };

      embeddings.push(...result.data);
    } catch (error) {
      console.error(`[Embedding] Cloudflare AI error for batch ${i}:`, error);
      throw new Error(`Cloudflare Workers AI embedding failed: ${error}`);
    }
  }

  console.log(`[Embedding] Generated ${embeddings.length} embeddings (768-dim)`);
  return embeddings;
}

/**
 * Generate embeddings using OpenAI API (fallback)
 */
export async function generateEmbeddingsWithOpenAI(
  apiKey: string,
  texts: string[]
): Promise<number[][]> {
  console.log(`[Embedding] Generating ${texts.length} embeddings with OpenAI`);

  const embeddings: number[][] = [];

  // Process in batches
  const batchSize = OPENAI_PROVIDER.maxBatchSize;

  for (let i = 0; i < texts.length; i += batchSize) {
    const batch = texts.slice(i, i + batchSize);

    try {
      const response = await fetch('https://api.openai.com/v1/embeddings', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          input: batch,
          model: 'text-embedding-3-small',
          dimensions: 1536,
        }),
      });

      if (!response.ok) {
        const error = await response.text();
        throw new Error(`OpenAI API error: ${response.status} ${error}`);
      }

      const data = await response.json() as {
        data: Array<{ embedding: number[] }>;
      };

      embeddings.push(...data.data.map(item => item.embedding));
    } catch (error) {
      console.error(`[Embedding] OpenAI error for batch ${i}:`, error);
      throw new Error(`OpenAI embedding failed: ${error}`);
    }
  }

  console.log(`[Embedding] Generated ${embeddings.length} embeddings (1536-dim)`);
  return embeddings;
}

/**
 * Generate embeddings with automatic provider selection
 */
export async function generateEmbeddings(
  env: Env,
  texts: string[]
): Promise<{ embeddings: number[][]; provider: EmbeddingProvider }> {
  // Try Cloudflare Workers AI first (free, serverless)
  if (env.AI) {
    try {
      const embeddings = await generateEmbeddingsWithCloudflare(env.AI, texts);
      return { embeddings, provider: CLOUDFLARE_PROVIDER };
    } catch (error) {
      console.warn('[Embedding] Cloudflare AI failed, falling back to OpenAI:', error);
    }
  }

  // Fallback to OpenAI
  if (env.OPENAI_API_KEY) {
    const embeddings = await generateEmbeddingsWithOpenAI(env.OPENAI_API_KEY, texts);
    return { embeddings, provider: OPENAI_PROVIDER };
  }

  throw new Error('No embedding provider available. Set AI binding or OPENAI_API_KEY.');
}

/**
 * Embed a single transcript chunk
 */
export async function embedChunk(
  env: Env,
  sessionDate: string,
  chunk: TranscriptSegment & { chunk_index: number }
): Promise<EmbeddedChunk> {
  const texts = [chunk.text];
  const { embeddings, provider } = await generateEmbeddings(env, texts);

  const metadata: ChunkMetadata = {
    chunk_index: chunk.chunk_index,
    section_title: chunk.section_title,
    subsection_title: chunk.subsection_title,
    word_count: chunk.text.split(/\s+/).length,
  };

  const embeddedChunk: EmbeddedChunk = {
    id: `${sessionDate}_${chunk.chunk_index}`,
    session_date: sessionDate,
    speaker: chunk.speaker,
    text: chunk.text,
    embedding: embeddings[0],
    metadata,
  };

  console.log(
    `[Embedding] Created chunk ${embeddedChunk.id} (${provider.name}, ${provider.dimensions}-dim)`
  );

  return embeddedChunk;
}

/**
 * Embed multiple chunks in batch
 */
export async function embedChunks(
  env: Env,
  sessionDate: string,
  chunks: Array<TranscriptSegment & { chunk_index: number }>
): Promise<EmbeddedChunk[]> {
  console.log(`[Embedding] Embedding ${chunks.length} chunks for session ${sessionDate}`);

  const texts = chunks.map(chunk => chunk.text);
  const { embeddings, provider } = await generateEmbeddings(env, texts);

  const embeddedChunks: EmbeddedChunk[] = chunks.map((chunk, index) => {
    const metadata: ChunkMetadata = {
      chunk_index: chunk.chunk_index,
      section_title: chunk.section_title,
      subsection_title: chunk.subsection_title,
      word_count: chunk.text.split(/\s+/).length,
    };

    return {
      id: `${sessionDate}_${chunk.chunk_index}`,
      session_date: sessionDate,
      speaker: chunk.speaker,
      text: chunk.text,
      embedding: embeddings[index],
      metadata,
    };
  });

  console.log(
    `[Embedding] Embedded ${embeddedChunks.length} chunks (${provider.name}, ${provider.dimensions}-dim)`
  );

  return embeddedChunks;
}

/**
 * Store embedded chunks in Vectorize
 */
export async function storeEmbeddings(
  vectorize: VectorizeIndex,
  chunks: EmbeddedChunk[]
): Promise<void> {
  console.log(`[Embedding] Storing ${chunks.length} embeddings in Vectorize`);

  // Convert to Vectorize format
  const vectors = chunks.map(chunk => ({
    id: chunk.id,
    values: chunk.embedding,
    metadata: {
      session_date: chunk.session_date,
      speaker: chunk.speaker || '',
      text: chunk.text,
      chunk_index: chunk.metadata.chunk_index,
      section_title: chunk.metadata.section_title || '',
      subsection_title: chunk.metadata.subsection_title || '',
      word_count: chunk.metadata.word_count,
    },
  }));

  // Upsert in batches (Vectorize limit: 1000 vectors per upsert)
  const batchSize = 1000;
  for (let i = 0; i < vectors.length; i += batchSize) {
    const batch = vectors.slice(i, i + batchSize);
    await vectorize.upsert(batch);
    console.log(`[Embedding] Stored batch ${i / batchSize + 1} (${batch.length} vectors)`);
  }

  console.log(`[Embedding] Successfully stored ${chunks.length} embeddings`);
}

/**
 * Mark session as embedded in KV
 */
export async function markSessionEmbedded(
  kv: KVNamespace,
  sessionDate: string,
  chunkCount: number
): Promise<void> {
  const key = `embedded:${sessionDate}`;
  const value = JSON.stringify({
    chunk_count: chunkCount,
    embedded_at: new Date().toISOString(),
  });

  await kv.put(key, value);
  console.log(`[Embedding] Marked session ${sessionDate} as embedded (${chunkCount} chunks)`);
}

/**
 * Check if session is already embedded
 */
export async function isSessionEmbedded(
  kv: KVNamespace,
  sessionDate: string
): Promise<{ embedded: boolean; chunk_count?: number; embedded_at?: string }> {
  const key = `embedded:${sessionDate}`;
  const value = await kv.get(key, 'json');

  if (!value) {
    return { embedded: false };
  }

  return {
    embedded: true,
    chunk_count: (value as { chunk_count: number }).chunk_count,
    embedded_at: (value as { embedded_at: string }).embedded_at,
  };
}
